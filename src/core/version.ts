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

import { computeHash, extractAstpMetadata, stripAstpFields } from "./frontmatter.js";
import type { Lock } from "./lock.js";
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
                const state = await getLockUnitState(rootDir, relativePath, unit.kind, unit.hash);
                return {
                    kind: unit.kind,
                    relativePath,
                    version: unit.version,
                    origin: "lock",
                    state,
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
        const diverged = units.some((unit) => ["missing", "new", "removed"].includes(unit.state));
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
    kind: "file" | "skill",
    expectedHash: string,
): Promise<InstalledUnit["state"]> {
    const unitPath = path.join(rootDir, relativePath);
    let stat;
    try {
        stat = await fs.lstat(unitPath);
    } catch (error) {
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return "missing";
        throw error;
    }
    if ((kind === "file" && !stat.isFile()) || (kind === "skill" && !stat.isDirectory())) return "modified";
    const hash =
        kind === "file" ? computeHash(await fs.readFile(unitPath, "utf8")) : await computeSkillTreeHash(unitPath);
    return hash === expectedHash ? "unmodified" : "modified";
}

async function scanLegacy(rootDir: string, lock: Lock): Promise<Map<string, InstalledUnit[]>> {
    const markdownPaths = await findMdFiles(rootDir);
    const ignoredPaths = Object.values(lock.bundles).flatMap((bundle) => Object.keys(bundle.units));
    const tagged: TaggedMarkdown[] = [];
    for (const filePath of markdownPaths) {
        const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");
        if (
            ignoredPaths.some((lockedPath) => relativePath === lockedPath || relativePath.startsWith(`${lockedPath}/`))
        ) {
            continue;
        }
        const content = await fs.readFile(filePath, "utf8");
        const metadata = extractAstpMetadata(content);
        if (metadata) tagged.push({ filePath, relativePath, content, metadata });
    }

    const skillFiles = tagged.filter((file) => path.posix.basename(file.relativePath) === "SKILL.md");
    const rootSkills = skillFiles.filter(
        (file) =>
            !skillFiles.some(
                (candidate) =>
                    candidate.relativePath !== file.relativePath &&
                    file.relativePath.startsWith(`${path.posix.dirname(candidate.relativePath)}/`),
            ),
    );
    const skillRoots = new Map(rootSkills.map((file) => [path.posix.dirname(file.relativePath), file]));
    const results = new Map<string, InstalledUnit[]>();

    for (const [relativePath, root] of skillRoots) {
        const clean = await isCleanLegacySkill(path.dirname(root.filePath), root);
        addLegacy(results, root.metadata.bundle, {
            kind: "skill",
            relativePath,
            version: root.metadata.version,
            origin: "legacy",
            state: clean ? "unmodified" : "modified",
        });
    }

    for (const file of tagged) {
        if ([...skillRoots.keys()].some((root) => file.relativePath.startsWith(`${root}/`))) continue;
        addLegacy(results, file.metadata.bundle, {
            kind: "file",
            relativePath: file.relativePath,
            version: file.metadata.version,
            origin: "legacy",
            state:
                file.metadata.hash && computeHash(stripAstpFields(file.content)) === file.metadata.hash
                    ? "unmodified"
                    : "modified",
        });
    }
    return results;
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

async function findMdFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return results;
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...(await findMdFiles(fullPath)));
        else if (entry.isFile() && entry.name.endsWith(".md")) results.push(fullPath);
    }
    return results;
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
