import fs from "node:fs/promises";
import path from "node:path";

import type { Bundle, FileStatus, InstalledBundle, InstalledUnit, InstallTarget, Manifest } from "@/types/index.js";

import { computeHash } from "./frontmatter.js";
import { installFile, installSkill } from "./installer.js";
import type { Lock, LockBundle, LockUnit } from "./lock.js";
import { assertInsideRoot } from "./path-safety.js";
import { computeSkillTreeHash, computeTemplateUnitHash } from "./skill-tree.js";
import { groupTemplateItems } from "./units.js";

export interface SyncResult {
    installed: FileStatus[];
    removed: FileStatus[];
    skipped: FileStatus[];
    kept: FileStatus[];
}

export async function syncBundle(args: {
    target: InstallTarget;
    manifest: Manifest;
    bundle: Bundle;
    installed?: InstalledBundle;
    lock: Lock;
    tempDir: string;
    selected: Set<string>;
    declined: Set<string>;
    force: boolean;
}): Promise<SyncResult> {
    const result: SyncResult = { installed: [], removed: [], skipped: [], kept: [] };
    const rootDir = args.target.rootDir;
    const units = groupTemplateItems(args.bundle.items);
    const manifestPaths = new Set(units.map((unit) => `${unit.kind}\0${unit.relativePath}`));
    const manifestUnitPaths = new Set(units.map((unit) => unit.relativePath));
    const currentByPath = new Map(args.installed?.units.map((unit) => [unit.relativePath, unit]) ?? []);
    const existingLock = args.lock.bundles[args.bundle.name];
    const lockBundle: LockBundle = existingLock
        ? {
              source: args.manifest.repository,
              declined: [...existingLock.declined],
              units: Object.assign(Object.create(null) as Record<string, LockUnit>, existingLock.units),
          }
        : {
              source: args.manifest.repository,
              declined: [],
              units: Object.create(null) as Record<string, LockUnit>,
          };
    const removedLegacy = new Set<string>();
    const keptPaths = new Set<string>();

    const remove = async (unit: InstalledUnit, declined: boolean): Promise<void> => {
        if (unit.state === "modified" && !args.force) {
            result.kept.push(status(unit));
            if (declined) {
                args.declined.delete(unit.relativePath);
                keptPaths.add(unit.relativePath);
            }
            return;
        }
        await removePath(rootDir, unit.relativePath);
        delete lockBundle.units[unit.relativePath];
        if (unit.origin === "legacy") removedLegacy.add(unit.relativePath);
        if (declined) args.declined.add(unit.relativePath);
        result.removed.push(status(unit));
    };

    for (const unit of args.installed?.units ?? []) {
        if (!manifestPaths.has(`${unit.kind}\0${unit.relativePath}`)) await remove(unit, false);
    }
    for (const unit of units) {
        if (!args.declined.has(unit.relativePath)) continue;
        const current = currentByPath.get(unit.relativePath);
        if (current) await remove(current, true);
        else args.declined.add(unit.relativePath);
    }

    for (const unit of units) {
        if (!args.selected.has(unit.relativePath)) continue;
        const current = currentByPath.get(unit.relativePath);
        if (current?.state === "modified" && !args.force) {
            result.skipped.push(status(current));
            continue;
        }

        if (!current) {
            const diskState = await compareUntracked(rootDir, args.tempDir, unit);
            if (diskState === "equal") {
                lockBundle.units[unit.relativePath] = {
                    kind: unit.kind,
                    version: args.bundle.version,
                    hash: await computeTemplateUnitHash(args.tempDir, unit),
                };
                result.installed.push({ targetPath: unit.relativePath, kind: unit.kind, state: "unmodified" });
                continue;
            }
            if (diskState === "modified" && !args.force) {
                result.skipped.push({ targetPath: unit.relativePath, kind: unit.kind, state: "modified" });
                continue;
            }
        }

        const hash =
            unit.kind === "skill"
                ? await installSkill(args.tempDir, unit, args.target)
                : await installFile(args.tempDir, unit.item, args.target);
        lockBundle.units[unit.relativePath] = { kind: unit.kind, version: args.bundle.version, hash };
        if (current?.origin === "legacy") removedLegacy.add(current.relativePath);
        result.installed.push({ targetPath: unit.relativePath, kind: unit.kind, state: "unmodified" });
    }

    const oldDeclined = new Set(existingLock?.declined ?? []);
    lockBundle.declined = [
        ...new Set([...oldDeclined].filter((unitPath) => !args.selected.has(unitPath)).concat([...args.declined])),
    ]
        .filter((unitPath) => manifestUnitPaths.has(unitPath) && !keptPaths.has(unitPath))
        .sort();
    const legacyRemaining = (args.installed?.units ?? []).some(
        (unit) => unit.origin === "legacy" && !removedLegacy.has(unit.relativePath),
    );
    if (Object.keys(lockBundle.units).length === 0 && !legacyRemaining) {
        delete args.lock.bundles[args.bundle.name];
    } else {
        args.lock.bundles[args.bundle.name] = lockBundle;
    }
    return result;
}

async function compareUntracked(
    rootDir: string,
    tempDir: string,
    unit: ReturnType<typeof groupTemplateItems>[number],
): Promise<"absent" | "equal" | "modified"> {
    const unitPath = path.join(rootDir, unit.relativePath);
    let stat;
    try {
        stat = await fs.lstat(unitPath);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return "absent";
        if (code === "ENOTDIR") return "modified";
        throw error;
    }
    if ((unit.kind === "file" && !stat.isFile()) || (unit.kind === "skill" && !stat.isDirectory())) return "modified";
    const diskHash =
        unit.kind === "file" ? computeHash(await fs.readFile(unitPath, "utf8")) : await computeSkillTreeHash(unitPath);
    return diskHash === (await computeTemplateUnitHash(tempDir, unit)) ? "equal" : "modified";
}

async function removePath(rootDir: string, relativePath: string): Promise<void> {
    const unitPath = path.join(rootDir, relativePath);
    await assertInsideRoot(rootDir, relativePath);
    await fs.rm(unitPath, { recursive: true, force: true });
    await removeEmptyDirectories(path.dirname(unitPath), rootDir);
}

export async function removeEmptyDirectories(startDir: string, rootDir: string): Promise<void> {
    const normalizedRoot = path.resolve(rootDir);
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

function status(unit: InstalledUnit): FileStatus {
    return {
        targetPath: unit.relativePath,
        kind: unit.kind,
        state: unit.origin === "legacy" ? "legacy" : unit.state,
    };
}
