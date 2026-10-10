import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type {
    Bundle,
    BundleUpdate,
    FileStatus,
    InstalledBundle,
    InstalledFileMetadata,
    InstalledUnit,
    Manifest,
    UpdateReport,
} from "@/types/index.js";

import { blockHash, frontmatterHash, parseInstalledBlocks } from "./blocks.js";
import { computeHash, extractAstpMetadata, stripAstpFields } from "./frontmatter.js";
import type { Lock, LockUnit } from "./lock.js";
import { readLock } from "./lock.js";
import { computeSkillTreeHash } from "./skill-tree.js";
import { groupTemplateItems } from "./units.js";

interface TaggedMarkdown {
    filePath: string;
    relativePath: string;
    content: string;
    metadata: InstalledFileMetadata;
}

export async function loadInstalled(rootDir: string): Promise<{ lock: Lock; bundles: InstalledBundle[] }> {
    const lock = await readLock(rootDir);
    const bundles = new Map<string, InstalledBundle>();

    for (const [bundleName, bundle] of Object.entries(lock.bundles)) {
        const units = await Promise.all(
            Object.entries(bundle.units).map(async ([relativePath, unit]): Promise<InstalledUnit> => {
                const { state, blocks } = await getLockUnitState(rootDir, relativePath, unit);
                return {
                    kind: unit.kind,
                    relativePath,
                    version: unit.version,
                    origin: "lock",
                    state,
                    ...(blocks ? { blocks } : {}),
                };
            }),
        );
        bundles.set(bundleName, {
            bundleName,
            version: chooseBundleVersion(units),
            units,
            declined: bundle.declined,
        });
    }

    const legacyByBundle = await scanLegacy(rootDir, lock);
    for (const [bundleName, legacyUnits] of legacyByBundle) {
        const bundle = bundles.get(bundleName);
        if (bundle) {
            bundle.units.push(...legacyUnits);
            bundle.version = chooseBundleVersion(bundle.units);
        } else {
            bundles.set(bundleName, {
                bundleName,
                version: chooseBundleVersion(legacyUnits),
                units: legacyUnits,
                declined: [],
            });
        }
    }

    return { lock, bundles: [...bundles.values()] };
}

export function compareVersions(installed: InstalledBundle[], manifest: Manifest): UpdateReport {
    const updates: BundleUpdate[] = [];
    const upToDate: InstalledBundle[] = [];
    const notInManifest: InstalledBundle[] = [];
    const legacySkills: UpdateReport["legacySkills"] = [];

    for (const bundle of installed) {
        const manifestBundle = manifest.bundles[bundle.bundleName];
        const manifestUnits = manifestBundle ? groupTemplateItems(manifestBundle.items) : [];
        const manifestPaths = new Map(manifestUnits.map((unit) => [unit.relativePath, unit.kind]));

        for (const unit of bundle.units.filter((candidate) => candidate.origin === "legacy")) {
            legacySkills.push({
                bundleName: bundle.bundleName,
                targetPath: unit.relativePath,
                kind: unit.kind,
                clean: unit.state === "unmodified",
                inManifest: manifestPaths.get(unit.relativePath) === unit.kind,
            });
        }

        if (!manifestBundle) {
            notInManifest.push(bundle);
            continue;
        }

        const units = classifyUnits(bundle, manifestBundle);
        const cmp = compareSemver(bundle.version, manifestBundle.version);
        const diverged =
            units.some((unit) => ["missing", "new", "removed"].includes(unit.state)) ||
            bundle.units.some((unit) => unit.blocks?.missing);
        const cleanLegacy = bundle.units.some(
            (unit) =>
                unit.origin === "legacy" &&
                unit.state === "unmodified" &&
                manifestPaths.get(unit.relativePath) === unit.kind,
        );
        if (cmp < 0 || (cmp === 0 && (diverged || cleanLegacy))) {
            updates.push({
                bundleName: bundle.bundleName,
                installedVersion: bundle.version,
                availableVersion: manifestBundle.version,
                units,
            });
        } else {
            upToDate.push(bundle);
        }
    }

    return { updates, upToDate, notInManifest, legacySkills };
}

function classifyUnits(installed: InstalledBundle, manifestBundle: Bundle): FileStatus[] {
    const statuses: FileStatus[] = [];
    const installedByPath = new Map(installed.units.map((unit) => [`${unit.kind}\0${unit.relativePath}`, unit]));
    const manifestUnits = groupTemplateItems(manifestBundle.items);
    const manifestPaths = new Map(manifestUnits.map((unit) => [unit.relativePath, unit.kind]));
    const declined = new Set(installed.declined);

    for (const unit of installed.units) {
        if (manifestPaths.get(unit.relativePath) !== unit.kind) {
            statuses.push({ targetPath: unit.relativePath, kind: unit.kind, state: "removed" });
        } else {
            statuses.push({
                targetPath: unit.relativePath,
                kind: unit.kind,
                state: unit.origin === "legacy" ? "legacy" : unit.state,
            });
        }
    }

    for (const unit of manifestUnits) {
        if (!installedByPath.has(`${unit.kind}\0${unit.relativePath}`) && !declined.has(unit.relativePath)) {
            statuses.push({ targetPath: unit.relativePath, kind: unit.kind, state: "new" });
        }
    }
    return statuses;
}

function chooseBundleVersion(units: InstalledUnit[]): string {
    const clean = units.filter((unit) => unit.state === "unmodified");
    const candidates = clean.length > 0 ? clean : units;
    if (candidates.length === 0) return "";
    return candidates.reduce((selected, unit) => {
        const comparison = compareSemver(unit.version, selected);
        return clean.length > 0 ? (comparison < 0 ? unit.version : selected) : comparison > 0 ? unit.version : selected;
    }, candidates[0]!.version);
}

function compareSemver(a: string, b: string): number {
    const parse = (value: string): number[] | null => {
        const parts = value.split(".").map(Number);
        return parts.some(Number.isNaN) ? null : parts;
    };
    const left = parse(a);
    const right = parse(b);
    if (!left) return -1;
    if (!right) return 0;
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const aPart = left[index] ?? 0;
        const bPart = right[index] ?? 0;
        if (aPart !== bPart) return aPart < bPart ? -1 : 1;
    }
    return 0;
}

async function getLockUnitState(
    rootDir: string,
    relativePath: string,
    unit: LockUnit,
): Promise<{ state: InstalledUnit["state"]; blocks?: InstalledUnit["blocks"] }> {
    const unitPath = path.join(rootDir, relativePath);
    let stat;
    try {
        stat = await fs.lstat(unitPath);
    } catch (error) {
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return { state: "missing" };
        throw error;
    }
    if ((unit.kind === "file" && !stat.isFile()) || (unit.kind === "skill" && !stat.isDirectory())) {
        return { state: "modified" };
    }

    const blockKeys = Object.keys(unit.blocks ?? {}).concat(unit.declinedBlocks ?? []);
    if (blockKeys.length === 0) {
        const hash =
            unit.kind === "file"
                ? computeHash(await fs.readFile(unitPath, "utf8"))
                : await computeSkillTreeHash(unitPath);
        return { state: hash === unit.hash ? "unmodified" : "modified" };
    }

    // Unit with blocks: the hash covers frontmatter only; blocks are verified individually.
    const blockFiles = [...new Set(blockKeys.map((key) => key.slice(0, key.lastIndexOf("#"))))];
    const blockInfo = { missing: false, dirty: false, parseFailed: false };
    let modified = false;

    if (unit.kind === "file") {
        const content = await fs.readFile(unitPath, "utf8");
        modified = frontmatterHash(content) !== unit.hash;
        inspectBlockFile(content, relativePath, unit.blocks ?? {}, blockInfo);
        if (blockInfo.parseFailed) modified = true;
    } else {
        const relativeBlockFiles = new Set(
            blockFiles
                .filter((file) => file.startsWith(`${relativePath}/`))
                .map((file) => file.slice(relativePath.length + 1)),
        );
        modified = (await computeSkillTreeHash(unitPath, { blockFiles: relativeBlockFiles })) !== unit.hash;
        for (const file of relativeBlockFiles) {
            let content: string | null = null;
            try {
                content = await fs.readFile(path.join(unitPath, file), "utf8");
            } catch (error) {
                if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
            }
            if (content === null) {
                modified = true;
                continue;
            }
            const fileTarget = `${relativePath}/${file}`;
            inspectBlockFile(content, fileTarget, unit.blocks ?? {}, blockInfo);
            if (blockInfo.parseFailed) modified = true;
        }
    }

    return {
        state: modified ? "modified" : "unmodified",
        blocks: { missing: blockInfo.missing, dirty: blockInfo.dirty },
    };
}

function inspectBlockFile(
    content: string,
    fileTarget: string,
    lockBlocks: Record<string, string>,
    info: { missing: boolean; dirty: boolean; parseFailed: boolean },
): void {
    const names = Object.keys(lockBlocks)
        .filter((key) => key.startsWith(`${fileTarget}#`))
        .map((key) => key.slice(fileTarget.length + 1));
    const parsed = parseInstalledBlocks(content, names);
    if (!parsed) {
        info.parseFailed = true;
        info.missing = true;
        return;
    }
    for (const name of names) {
        const region = parsed.blocks.get(name);
        if (!region) {
            info.missing = true;
            continue;
        }
        if (blockHash(region.content) !== lockBlocks[`${fileTarget}#${name}`]) info.dirty = true;
    }
    if (parsed.outsideText.trim() !== "") info.dirty = true;
}

const LEGACY_FILE_DIRS = ["agents", "rules"];

async function scanLegacy(rootDir: string, lock: Lock): Promise<Map<string, InstalledUnit[]>> {
    const lockedPaths = new Set(Object.values(lock.bundles).flatMap((bundle) => Object.keys(bundle.units)));
    const results = new Map<string, InstalledUnit[]>();

    for (const entry of await readdirOrEmpty(path.join(rootDir, "skills"))) {
        if (!entry.isDirectory()) continue;
        const relativePath = `skills/${entry.name}`;
        if (lockedPaths.has(relativePath)) continue;
        const skillDir = path.join(rootDir, "skills", entry.name);
        const skillFile = path.join(skillDir, "SKILL.md");
        let stat;
        try {
            stat = await fs.lstat(skillFile);
        } catch (error) {
            if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
            throw error;
        }
        if (!stat.isFile()) continue;
        const content = await fs.readFile(skillFile, "utf8");
        const metadata = extractAstpMetadata(content);
        if (!metadata) continue;
        const clean = await isCleanLegacySkill(skillDir, {
            filePath: skillFile,
            relativePath: `${relativePath}/SKILL.md`,
            content,
            metadata,
        });
        addLegacy(results, metadata.bundle, {
            kind: "skill",
            relativePath,
            version: metadata.version,
            origin: "legacy",
            state: clean ? "unmodified" : "modified",
        });
    }

    for (const dir of LEGACY_FILE_DIRS) {
        for (const entry of await readdirOrEmpty(path.join(rootDir, dir))) {
            if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
            const relativePath = `${dir}/${entry.name}`;
            if (lockedPaths.has(relativePath)) continue;
            const content = await fs.readFile(path.join(rootDir, dir, entry.name), "utf8");
            const metadata = extractAstpMetadata(content);
            if (!metadata) continue;
            addLegacy(results, metadata.bundle, {
                kind: "file",
                relativePath,
                version: metadata.version,
                origin: "legacy",
                state:
                    metadata.hash && computeHash(stripAstpFields(content)) === metadata.hash
                        ? "unmodified"
                        : "modified",
            });
        }
    }
    return results;
}

async function readdirOrEmpty(dir: string): Promise<Dirent[]> {
    try {
        return await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
        throw error;
    }
}

async function isCleanLegacySkill(skillDir: string, root: TaggedMarkdown): Promise<boolean> {
    if (
        root.metadata.hash &&
        (await computeSkillTreeHash(skillDir, { stripRootAstpFields: true })) === root.metadata.hash
    ) {
        return true;
    }
    const files = await findRegularFiles(skillDir);
    if (files.length === 0 || files.some((file) => !file.endsWith(".md"))) return false;
    for (const filePath of files) {
        const content = await fs.readFile(filePath, "utf8");
        const metadata = extractAstpMetadata(content);
        if (!metadata?.hash || computeHash(stripAstpFields(content)) !== metadata.hash) return false;
    }
    return true;
}

function addLegacy(bundles: Map<string, InstalledUnit[]>, bundleName: string, unit: InstalledUnit): void {
    const units = bundles.get(bundleName) ?? [];
    units.push(unit);
    bundles.set(bundleName, units);
}

async function findRegularFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...(await findRegularFiles(filePath)));
        else if (entry.isFile()) results.push(filePath);
    }
    return results;
}
