import fs from "node:fs/promises";
import path from "node:path";

import type {
    Bundle,
    BundleUpdate,
    FileState,
    FileStatus,
    InstalledBundle,
    InstalledFileUnit,
    InstalledSkillUnit,
    InstalledUnit,
    Manifest,
    UpdateReport,
} from "@/types/index.js";

import { computeHash, extractAstpMetadata, stripAstpFields } from "./frontmatter.js";
import { computeSkillTreeHash } from "./skill-tree.js";
import { groupTemplateItems } from "./units.js";

interface TaggedMarkdown {
    filePath: string;
    relativePath: string;
    content: string;
    metadata: NonNullable<ReturnType<typeof extractAstpMetadata>>;
}

export async function scanInstalled(installRoot: string): Promise<InstalledBundle[]> {
    const markdownPaths = await findMdFiles(installRoot);
    const tagged: TaggedMarkdown[] = [];

    for (const filePath of markdownPaths) {
        const content = await fs.readFile(filePath, "utf8");
        const metadata = extractAstpMetadata(content);
        if (!metadata) continue;
        tagged.push({
            filePath,
            relativePath: path.relative(installRoot, filePath).split(path.sep).join("/"),
            content,
            metadata,
        });
    }

    const taggedSkills = tagged.filter((file) => path.posix.basename(file.relativePath) === "SKILL.md");
    const skillUnits = new Map<string, InstalledSkillUnit>();
    const rootSkills = taggedSkills.filter(
        (file) =>
            !taggedSkills.some(
                (candidate) =>
                    candidate.relativePath !== file.relativePath &&
                    file.relativePath.startsWith(`${path.posix.dirname(candidate.relativePath)}/`),
            ),
    );
    for (const file of rootSkills) {
        const relativePath = path.posix.dirname(file.relativePath);
        const oldHash = computeHash(stripAstpFields(file.content));
        skillUnits.set(file.relativePath, {
            kind: "skill",
            dirPath: path.dirname(file.filePath),
            skillFilePath: file.filePath,
            relativePath,
            metadata: file.metadata,
            legacy: file.metadata.hash === oldHash,
        });
    }
    for (const file of taggedSkills) {
        if (skillUnits.has(file.relativePath)) continue;
        const owner = findOwningSkill(file.relativePath, skillUnits);
        if (owner) owner.legacy = true;
    }

    const bundleUnits = new Map<string, InstalledUnit[]>();
    for (const file of tagged) {
        const units = bundleUnits.get(file.metadata.bundle) ?? [];
        const skill = skillUnits.get(file.relativePath);
        if (skill) {
            units.push(skill);
        } else {
            const owner = findOwningSkill(file.relativePath, skillUnits);
            if (owner) {
                owner.legacy = true;
            } else {
                const fileUnit: InstalledFileUnit = {
                    kind: "file",
                    filePath: file.filePath,
                    relativePath: file.relativePath,
                    metadata: file.metadata,
                };
                units.push(fileUnit);
            }
        }
        if (units.length > 0) bundleUnits.set(file.metadata.bundle, units);
    }

    return Array.from(bundleUnits.entries()).map(([bundleName, units]) => ({
        bundleName,
        version: units.reduce(
            (newest, unit) =>
                compareSemver(unit.metadata.version, newest) > 0 ? unit.metadata.version : newest,
            units[0]?.metadata.version ?? "",
        ),
        units,
    }));
}

function findOwningSkill(
    relativePath: string,
    skillUnits: Map<string, InstalledSkillUnit>,
): InstalledSkillUnit | undefined {
    const skillRoots = Array.from(skillUnits.entries())
        .filter(([skillFilePath]) => relativePath.startsWith(`${path.posix.dirname(skillFilePath)}/`))
        .sort(([a], [b]) => {
            const rootA = path.posix.dirname(a);
            const rootB = path.posix.dirname(b);
            return rootA.length < rootB.length ? -1 : rootA.length > rootB.length ? 1 : 0;
        });
    return skillRoots[0]?.[1];
}

async function findMdFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...(await findMdFiles(fullPath)));
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
            results.push(fullPath);
        }
    }

    return results;
}

export function compareVersions(installed: InstalledBundle[], manifest: Manifest): UpdateReport {
    const updates: BundleUpdate[] = [];
    const upToDate: InstalledBundle[] = [];
    const notInManifest: InstalledBundle[] = [];
    const legacySkills: UpdateReport["legacySkills"] = [];

    for (const bundle of installed) {
        const manifestBundle = manifest.bundles[bundle.bundleName];
        const manifestSkillPaths = new Set(
            manifestBundle
                ? groupTemplateItems(manifestBundle.items)
                      .filter((unit) => unit.kind === "skill")
                      .map((unit) => unit.relativePath)
                : [],
        );
        for (const unit of bundle.units) {
            if (unit.kind === "skill" && unit.legacy) {
                legacySkills.push({
                    bundleName: bundle.bundleName,
                    targetPath: unit.relativePath,
                    inManifest: manifestSkillPaths.has(unit.relativePath),
                });
            }
        }

        if (!manifestBundle) {
            notInManifest.push(bundle);
            continue;
        }

        const cmp = compareSemver(bundle.version, manifestBundle.version);
        if (cmp < 0) {
            updates.push({
                bundleName: bundle.bundleName,
                installedVersion: bundle.version,
                availableVersion: manifestBundle.version,
                units: classifyUnits(bundle, manifestBundle),
            });
        } else {
            upToDate.push(bundle);
        }
    }

    return { updates, upToDate, notInManifest, legacySkills };
}

function classifyUnits(installed: InstalledBundle, manifestBundle: Bundle): FileStatus[] {
    const statuses: FileStatus[] = [];
    const installedPaths = new Set(installed.units.map((unit) => `${unit.kind}\0${unit.relativePath}`));
    const manifestUnits = groupTemplateItems(manifestBundle.items);
    const manifestPaths = new Set(manifestUnits.map((unit) => `${unit.kind}\0${unit.relativePath}`));

    for (const unit of installed.units) {
        statuses.push({
            targetPath: unit.relativePath,
            kind: unit.kind,
            state: manifestPaths.has(`${unit.kind}\0${unit.relativePath}`) ? "unmodified" : "removed",
        });
    }

    for (const unit of manifestUnits) {
        if (!installedPaths.has(`${unit.kind}\0${unit.relativePath}`)) {
            statuses.push({ targetPath: unit.relativePath, kind: unit.kind, state: "new" });
        }
    }

    return statuses;
}

function compareSemver(a: string, b: string): number {
    const parse = (v: string): number[] | null => {
        const parts = v.split(".").map(Number);
        return parts.some(isNaN) ? null : parts;
    };

    const va = parse(a);
    const vb = parse(b);

    if (!va) return -1;
    if (!vb) return 0;

    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const na = va[i] ?? 0;
        const nb = vb[i] ?? 0;
        if (na < nb) return -1;
        if (na > nb) return 1;
    }

    return 0;
}

export async function detectModified(bundle: InstalledBundle, _installRoot: string): Promise<FileStatus[]> {
    const results: FileStatus[] = [];

    for (const unit of bundle.units) {
        if (unit.kind === "skill") {
            if (unit.legacy) {
                results.push({ targetPath: unit.relativePath, kind: "skill", state: "legacy" });
                continue;
            }
            if (!unit.metadata.hash) {
                results.push({ targetPath: unit.relativePath, kind: "skill", state: "modified" });
                continue;
            }
            const currentHash = await computeSkillTreeHash(unit.dirPath);
            const state: FileState = currentHash === unit.metadata.hash ? "unmodified" : "modified";
            results.push({ targetPath: unit.relativePath, kind: "skill", state });
            continue;
        }

        const content = await fs.readFile(unit.filePath, "utf8");
        if (!unit.metadata.hash) {
            results.push({ targetPath: unit.relativePath, kind: "file", state: "modified" });
            continue;
        }

        const currentHash = computeHash(stripAstpFields(content));
        const state: FileState = currentHash === unit.metadata.hash ? "unmodified" : "modified";
        results.push({ targetPath: unit.relativePath, kind: "file", state });
    }

    return results;
}

export async function removeBundle(
    bundle: InstalledBundle,
    installRoot: string,
    force = false,
): Promise<{ removed: string[]; skipped: FileStatus[] }> {
    const statuses = await detectModified(bundle, installRoot);
    const statusesByPath = new Map(statuses.map((status) => [status.targetPath, status]));
    const skipped = statuses.filter((status) => status.state === "modified" || status.state === "legacy");
    const removed: string[] = [];

    for (const unit of bundle.units) {
        const status = statusesByPath.get(unit.relativePath);
        if ((status?.state === "modified" || status?.state === "legacy") && !force) continue;

        const unitPath = unit.kind === "skill" ? unit.dirPath : unit.filePath;
        await fs.rm(unitPath, { recursive: unit.kind === "skill", force: true });
        await removeEmptyDirectories(
            unit.kind === "skill" ? path.dirname(unit.dirPath) : path.dirname(unit.filePath),
            installRoot,
        );
        removed.push(unit.relativePath);
    }

    return {
        removed,
        skipped: force ? [] : skipped,
    };
}

async function removeEmptyDirectories(startDir: string, installRoot: string): Promise<void> {
    const normalizedRoot = path.resolve(installRoot);
    let currentDir = path.resolve(startDir);

    while (currentDir.startsWith(normalizedRoot) && currentDir !== normalizedRoot) {
        let entries;
        try {
            entries = await fs.readdir(currentDir);
        } catch {
            return;
        }

        if (entries.length > 0) return;

        await fs.rmdir(currentDir);
        currentDir = path.dirname(currentDir);
    }
}
