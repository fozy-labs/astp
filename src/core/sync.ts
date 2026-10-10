import fs from "node:fs/promises";
import path from "node:path";

import type { Bundle, FileStatus, InstalledBundle, InstalledUnit, InstallTarget } from "@/types/index.js";

import type { InstalledBlocks } from "./blocks.js";
import { mergeBlockFile, parseInstalledBlocks } from "./blocks.js";
import { computeHash } from "./frontmatter.js";
import { installFile, installSkill } from "./installer.js";
import type { Lock, LockBundle, LockUnit } from "./lock.js";
import { assertInsideRoot, nullPrototype } from "./path-safety.js";
import { computeSkillTreeHash, computeTemplateUnitHash } from "./skill-tree.js";
import type { UnitBlockFile } from "./unit-blocks.js";
import { readUnitBlockFiles } from "./unit-blocks.js";
import { groupTemplateItems } from "./units.js";

export interface SyncResult {
    installed: FileStatus[];
    removed: FileStatus[];
    skipped: FileStatus[];
    kept: FileStatus[];
    /** Units removed upstream but modified locally: left on disk, dropped from the lock. */
    released: FileStatus[];
    /** Unit paths already on disk with other content: left untouched, recorded as declined. */
    foreign: FileStatus[];
    /** Block keys kept because they changed locally while deselected. */
    keptBlocks: string[];
    /** Block keys removed upstream but changed locally: text left in the file, dropped from the lock. */
    releasedBlocks: string[];
    /** Block keys whose region already exists with other content: left untouched, declined. */
    foreignBlocks: string[];
    /** Block keys changed both locally and upstream — the new version was added as a FILL_INSTRUCTION. */
    conflictBlocks: string[];
}

/** Per-file block selection: block names (without the `file#` prefix). */
export type BlockSelections = Map<string, { selected: Set<string>; declined: Set<string> }>;

export async function syncBundle(args: {
    target: InstallTarget;
    /** Source string recorded in the lock. */
    source: string;
    bundle: Bundle;
    installed?: InstalledBundle;
    lock: Lock;
    tempDir: string;
    selected: Set<string>;
    declined: Set<string>;
    blockSelections?: BlockSelections;
    force: boolean;
}): Promise<SyncResult> {
    const result: SyncResult = {
        installed: [],
        removed: [],
        skipped: [],
        kept: [],
        released: [],
        foreign: [],
        keptBlocks: [],
        releasedBlocks: [],
        foreignBlocks: [],
        conflictBlocks: [],
    };
    const rootDir = args.target.rootDir;
    const units = groupTemplateItems(args.bundle.items);
    const manifestPaths = new Set(units.map((unit) => `${unit.kind}\0${unit.relativePath}`));
    const manifestUnitPaths = new Set(units.map((unit) => unit.relativePath));
    const currentByPath = new Map(args.installed?.units.map((unit) => [unit.relativePath, unit]) ?? []);
    const existingLock = args.lock.bundles[args.bundle.name];
    const lockBundle: LockBundle = existingLock
        ? {
              source: args.source,
              declined: [...existingLock.declined],
              units: nullPrototype(existingLock.units),
          }
        : { source: args.source, declined: [], units: nullPrototype() };
    const removedLegacy = new Set<string>();
    const keptPaths = new Set<string>();

    const remove = async (unit: InstalledUnit, declined: boolean): Promise<void> => {
        if ((unit.state === "modified" || unit.blocks?.dirty) && !args.force) {
            if (!declined && unit.origin === "lock") {
                delete lockBundle.units[unit.relativePath];
                result.released.push(status(unit));
                return;
            }
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

    const declineForeign = (unit: ReturnType<typeof groupTemplateItems>[number]): void => {
        args.declined.add(unit.relativePath);
        result.foreign.push({ targetPath: unit.relativePath, kind: unit.kind, state: "modified" });
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
        const lockUnit = lockBundle.units[unit.relativePath];
        const blockFiles = await readUnitBlockFiles(args.tempDir, unit);
        const templateHasBlocks = blockFiles.size > 0;
        const lockHasBlocks = Boolean(lockUnit?.blocks || lockUnit?.declinedBlocks);

        if (current?.state === "modified" && !args.force) {
            result.skipped.push(status(current));
            continue;
        }

        if (!templateHasBlocks && lockHasBlocks && current) {
            // The template lost its blocks: install as a plain unit unless the file has local edits.
            if (current.blocks?.dirty && !args.force) {
                result.skipped.push(status(current));
                continue;
            }
            const hash =
                unit.kind === "skill"
                    ? await installSkill(args.tempDir, unit, args.target)
                    : await installFile(args.tempDir, unit.item, args.target);
            lockBundle.units[unit.relativePath] = { kind: unit.kind, version: args.bundle.version, hash };
            if (current.origin === "legacy") removedLegacy.add(current.relativePath);
            result.installed.push({ targetPath: unit.relativePath, kind: unit.kind, state: "unmodified" });
            continue;
        }

        if (!templateHasBlocks) {
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
                    declineForeign(unit);
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
            continue;
        }

        // Unit with blocks: merge each block file, then write. A lock block
        // file that went plain in the template is protected like a whole unit
        // going plain — mergeUnitBlockFiles would not touch it, installSkill would.
        if (current?.blocks?.dirty && !args.force && lockUnit) {
            const lockTargets = new Set(
                [...Object.keys(lockUnit.blocks ?? {}), ...(lockUnit.declinedBlocks ?? [])].map(
                    (key) => splitBlockKey(key)[0],
                ),
            );
            if ([...lockTargets].some((target) => !blockFiles.has(target))) {
                result.skipped.push(status(current));
                continue;
            }
        }
        const merged = await mergeUnitBlockFiles(args, rootDir, unit, blockFiles, lockUnit, result);
        const blockTargets = new Set(blockFiles.keys());
        const hash = await computeTemplateUnitHash(args.tempDir, unit, {
            blockFiles:
                unit.kind === "skill"
                    ? new Set([...blockTargets].map((target) => path.posix.relative(unit.relativePath, target)))
                    : blockTargets,
        });

        if (!current) {
            const diskState = await compareUntrackedBlocks(rootDir, args.tempDir, unit, merged.contents);
            if (diskState === "equal") {
                lockBundle.units[unit.relativePath] = {
                    kind: unit.kind,
                    version: args.bundle.version,
                    hash,
                    blocks: merged.blocks,
                    declinedBlocks: merged.declinedBlocks,
                };
                result.installed.push({ targetPath: unit.relativePath, kind: unit.kind, state: "unmodified" });
                continue;
            }
            if (diskState === "modified" && !args.force) {
                declineForeign(unit);
                continue;
            }
        }

        if (unit.kind === "skill") {
            await installSkill(args.tempDir, unit, args.target, { overrides: merged.contents });
        } else {
            await installFile(args.tempDir, unit.item, args.target, merged.contents.get(unit.item.target));
        }
        lockBundle.units[unit.relativePath] = {
            kind: unit.kind,
            version: args.bundle.version,
            hash,
            blocks: merged.blocks,
            declinedBlocks: merged.declinedBlocks,
        };
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

interface MergedUnit {
    /** Merged content per block file target. */
    contents: Map<string, string>;
    blocks: Record<string, string>;
    declinedBlocks: string[];
}

/** Runs `mergeBlockFile` for every block file of a unit and collects lock entries and warnings. */
async function mergeUnitBlockFiles(
    args: {
        target: InstallTarget;
        tempDir: string;
        blockSelections?: BlockSelections;
        force: boolean;
    },
    rootDir: string,
    unit: ReturnType<typeof groupTemplateItems>[number],
    blockFiles: Map<string, UnitBlockFile>,
    lockUnit: LockUnit | undefined,
    result: SyncResult,
): Promise<MergedUnit> {
    const contents = new Map<string, string>();
    const blocks = nullPrototype<string>();
    const declinedBlocks: string[] = [];

    for (const [target, file] of blockFiles) {
        const lockHashes = nullPrototype<string>();
        const declinedNames = new Set<string>();
        for (const [key, hash] of Object.entries(lockUnit?.blocks ?? {})) {
            const [filePath, name] = splitBlockKey(key);
            if (filePath === target) lockHashes[name] = hash;
        }
        for (const key of lockUnit?.declinedBlocks ?? []) {
            const [filePath, name] = splitBlockKey(key);
            if (filePath === target) declinedNames.add(name);
        }
        const selection = args.blockSelections?.get(target);
        const selected = selection?.selected ?? new Set(file.blocks.map((block) => block.name));
        const declined = selection?.declined ?? declinedNames;

        const lockHasBlocks = Boolean(lockUnit?.blocks || lockUnit?.declinedBlocks);
        let installed: InstalledBlocks | null = null;
        let occupied: Set<string> | undefined;
        if (lockHasBlocks) {
            let installedContent: string | null = null;
            try {
                installedContent = await fs.readFile(path.join(rootDir, target), "utf8");
            } catch (error) {
                if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
            }
            if (installedContent !== null) {
                // Template names outside the lock are parsed too, so an untracked region is
                // adopted or declined instead of getting a duplicate inserted next to it.
                const untracked = file.blocks.map((block) => block.name).filter((name) => !(name in lockHashes));
                installed = parseInstalledBlocks(installedContent, [...Object.keys(lockHashes), ...untracked]);
                if (!installed) {
                    installed = parseInstalledBlocks(installedContent, Object.keys(lockHashes));
                    const tagLines = new Set(installedContent.split(/\r?\n/).map((line) => line.trimEnd()));
                    occupied = new Set(untracked.filter((name) => tagLines.has(`<${name}>`)));
                }
            }
        }

        const merged = mergeBlockFile({
            template: { frontmatter: file.frontmatter, blocks: file.blocks },
            installed,
            lockHashes,
            declined,
            selected,
            occupied,
            force: args.force,
        });
        contents.set(target, merged.content);
        for (const [name, hash] of Object.entries(merged.blocks)) blocks[`${target}#${name}`] = hash;
        for (const name of merged.declinedBlocks) declinedBlocks.push(`${target}#${name}`);
        result.keptBlocks.push(...merged.kept.map((name) => `${target}#${name}`));
        result.releasedBlocks.push(...merged.released.map((name) => `${target}#${name}`));
        result.foreignBlocks.push(...merged.foreign.map((name) => `${target}#${name}`));
        result.conflictBlocks.push(...merged.conflicts.map((name) => `${target}#${name}`));
    }

    return { contents, blocks, declinedBlocks: [...new Set(declinedBlocks)] };
}

function splitBlockKey(key: string): [string, string] {
    const separator = key.lastIndexOf("#");
    return [key.slice(0, separator), key.slice(separator + 1)];
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

/** An untracked path on disk is adoptable when it equals the fresh render for the current selection. */
async function compareUntrackedBlocks(
    rootDir: string,
    tempDir: string,
    unit: ReturnType<typeof groupTemplateItems>[number],
    merged: Map<string, string>,
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
    if (unit.kind === "skill") {
        const onDisk = await listRelativeFiles(unitPath);
        const expectedPaths = new Set(unit.items.map((item) => item.target));
        if (
            onDisk.some((file) => !expectedPaths.has(`${unit.relativePath}/${file}`)) ||
            onDisk.length !== expectedPaths.size
        )
            return "modified";
    }
    for (const item of unit.kind === "skill" ? unit.items : [unit.item]) {
        const expected = merged.get(item.target) ?? (await fs.readFile(path.join(tempDir, item.target), "utf8"));
        let actual: string;
        try {
            actual = await fs.readFile(path.join(rootDir, item.target), "utf8");
        } catch (error) {
            if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return "modified";
            throw error;
        }
        if (actual.replace(/\r\n/g, "\n") !== expected.replace(/\r\n/g, "\n")) return "modified";
    }
    return "equal";
}

async function listRelativeFiles(dir: string, prefix = ""): Promise<string[]> {
    const files: string[] = [];
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return files;
    }
    for (const entry of entries) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await listRelativeFiles(filePath, `${prefix}${entry.name}/`)));
        else if (entry.isFile()) files.push(`${prefix}${entry.name}`);
    }
    return files;
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
