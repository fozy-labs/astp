import fs from "node:fs/promises";
import path from "node:path";

import {
    assertBundleBlocks,
    assertBundleSources,
    blockHash,
    computeTemplateUnitHash,
    downloadBundle,
    groupTemplateItems,
    loadInstalled,
    ownTemplateContent,
    readUnitBlockFiles,
    syncBundle,
    validateUnitTargets,
} from "@/core/index.js";
import type { BlockSelections, LockBundle, LockUnit, RevisionOptions, UnitBlockFile } from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type { Bundle, FileStatus, InstalledBundle, InstallTargetType, Platform } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import {
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    spinner,
    warnForeign,
    warnMixedVersion,
    warnModified,
} from "@/ui/prompts.js";

import type { OpenedSource } from "./sources.js";
import { lockedRefRevisions, Sources } from "./sources.js";

export interface SyncOptions {
    force?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeSync(options: SyncOptions): Promise<void> {
    const platform = options.platform ?? (await selectPlatform());
    const target = options.target ? resolveTarget(platform, options.target) : await selectTarget(platform);
    const installedState = await loadInstalled(target.rootDir);
    const bundles = installedState.bundles.filter((bundle) => installedState.lock.bundles[bundle.bundleName]);
    if (bundles.length === 0) {
        showInfo("No astp-managed files found.");
        return;
    }

    const s = spinner();
    const sources = new Sources(target);
    const tempDirs: string[] = [];
    try {
        s.start("Fetching locked sources...");
        const opened = await sources.openInstalled(bundles, installedState.lock, { locked: true });
        s.stop("Locked sources fetched.");
        sources.warnIfNewer();

        const plans: Array<{
            bundleName: string;
            installed: InstalledBundle;
            source: OpenedSource;
            bundle: Bundle;
            tempDir: string;
            units: TemplateUnit[];
            selected: Set<string>;
            declined: Set<string>;
            blockSelections: BlockSelections;
        }> = [];
        const mixedVersion: Array<{ bundle: string; unit: string; version: string; sourceVersion: string }> = [];
        for (const installed of bundles) {
            const bundleName = installed.bundleName;
            const lockBundle = installedState.lock.bundles[bundleName]!;
            const source = opened.get(bundleName)!;
            const bundle = source.manifest.bundles[bundleName];
            if (!bundle) throw new Error(`Bundle '${bundleName}' is missing from its locked source '${source.spec}'`);
            const units = groupTemplateItems(bundle, platform);
            validateUnitTargets(target.rootDir, units);
            const selected = new Set(Object.keys(lockBundle.units));
            const lockedVersions = new Set(Object.values(lockBundle.units).map((unit) => unit.version));
            for (const unitPath of selected) {
                const lockUnit = lockBundle.units[unitPath]!;
                if (lockedVersions.size > 1 && lockUnit.version !== bundle.version) {
                    mixedVersion.push({
                        bundle: bundleName,
                        unit: unitPath,
                        version: lockUnit.version,
                        sourceVersion: bundle.version,
                    });
                    selected.delete(unitPath);
                }
            }
            for (const unitPath of selected) {
                if (!units.some((unit) => unit.relativePath === unitPath)) {
                    throw new Error(`Locked unit '${bundleName}/${unitPath}' is missing from its locked manifest`);
                }
            }

            const downloadUnits = units.filter((unit) => selected.has(unit.relativePath));
            s.start(`Downloading ${bundleName}...`);
            const tempDir = await downloadBundle(
                source.source,
                bundle,
                downloadUnits,
                platform,
                syncRefRevisions(lockBundle, downloadUnits),
            );
            tempDirs.push(tempDir);
            await assertBundleSources(tempDir, bundleName, downloadUnits);
            await assertBundleBlocks(tempDir, bundleName, downloadUnits);
            s.stop(`Downloaded ${bundleName}.`);

            const blockSelections: BlockSelections = new Map();
            for (const unit of downloadUnits) {
                const lockUnit = lockBundle.units[unit.relativePath]!;
                const blockFiles = await readUnitBlockFiles(tempDir, unit, platform);
                const blockTargets = new Set(blockFiles.keys());
                const hash = await computeTemplateUnitHash(tempDir, unit, {
                    blockFiles:
                        unit.kind === "skill"
                            ? new Set([...blockTargets].map((target) => path.posix.relative(unit.relativePath, target)))
                            : blockTargets,
                });
                if (
                    lockUnit.version !== bundle.version ||
                    hash !== lockUnit.hash ||
                    !lockedBlocksMatch(lockUnit, blockFiles)
                ) {
                    throw new Error(
                        `Locked unit '${bundleName}/${unit.relativePath}' does not match its source; run astp update before sync`,
                    );
                }
                for (const [fileTarget] of blockFiles) {
                    blockSelections.set(fileTarget, {
                        selected: blockNames(lockUnit.blocks, fileTarget),
                        declined: new Set(
                            (lockUnit.declinedBlocks ?? [])
                                .filter((key) => key.startsWith(`${fileTarget}#`))
                                .map((key) => key.slice(fileTarget.length + 1)),
                        ),
                    });
                }
            }
            plans.push({
                bundleName,
                installed: {
                    ...installed,
                    units: installed.units.filter((unit) => unit.origin === "lock" && selected.has(unit.relativePath)),
                },
                source,
                bundle,
                tempDir,
                units,
                selected,
                declined: new Set(lockBundle.declined),
                blockSelections,
            });
        }
        if (mixedVersion.length > 0) warnMixedVersion(mixedVersion);

        const installedStatuses: FileStatus[] = [];
        const skipped: FileStatus[] = [];
        const foreign: Parameters<typeof warnForeign>[1] = [];
        for (const plan of plans) {
            s.start(`Syncing ${plan.bundleName}...`);
            const result = await syncBundle({
                target,
                source: plan.source.spec,
                resolvedCommit: plan.source.resolvedCommit,
                writeLock: false,
                bundle: plan.bundle,
                installed: plan.installed,
                lock: installedState.lock,
                tempDir: plan.tempDir,
                units: plan.units,
                selected: plan.selected,
                declined: plan.declined,
                blockSelections: plan.blockSelections,
                force: options.force ?? false,
            });
            installedStatuses.push(...result.installed);
            skipped.push(...result.skipped);
            foreign.push(...result.foreign);
            if (result.foreign.length > 0 || result.foreignBlocks.length > 0) {
                warnForeign(plan.bundleName, result.foreign, result.foreignBlocks, target);
            }
            s.stop(`Synced ${plan.bundleName}.`);
        }
        if (skipped.length > 0) {
            warnModified(skipped, `astp sync --force --platform ${target.platform} --target ${target.type}`);
        }
        showSuccess(
            `Synced ${describeUnitCounts(installedStatuses.map((status) => ({ kind: status.kind, path: status.targetPath })))} to ${target.rootDir}${skipped.length ? `, skipped ${describeUnitCounts(skipped.map((status) => ({ kind: status.kind, path: status.targetPath })))}` : ""}${foreign.length ? `, declined ${foreign.length}` : ""}`,
        );
    } finally {
        for (const tempDir of tempDirs) await fs.rm(tempDir, { recursive: true, force: true });
        await sources.close();
    }
}

function syncRefRevisions(lockBundle: LockBundle, units: TemplateUnit[]): ReadonlyMap<string, RevisionOptions> {
    const revisions = new Map(lockedRefRevisions(lockBundle, true));
    for (const unit of units) {
        if (unit.kind === "skill" && unit.ref && !revisions.has(unit.relativePath)) {
            revisions.set(unit.relativePath, { requireLocked: true });
        }
    }
    return revisions;
}

function lockedBlocksMatch(lockUnit: LockUnit, blockFiles: Map<string, UnitBlockFile>): boolean {
    const selected = new Set(Object.keys(lockUnit.blocks ?? {}));
    const kept = new Set(lockUnit.keptBlocks ?? []);
    for (const [key, hash] of Object.entries(lockUnit.blocks ?? {})) {
        const separator = key.lastIndexOf("#");
        const file = blockFiles.get(key.slice(0, separator));
        const block = file?.blocks.find((candidate) => candidate.name === key.slice(separator + 1));
        if (!block || (!kept.has(key) && blockHash(ownTemplateContent(block)) !== hash)) return false;
    }
    for (const [fileTarget, file] of blockFiles) {
        for (const block of file.blocks) {
            const key = `${fileTarget}#${block.name}`;
            const parentKey = block.parent ? `${fileTarget}#${block.parent}` : undefined;
            if (selected.has(key) && parentKey && !selected.has(parentKey)) return false;
            if (block.required && (!parentKey || selected.has(parentKey)) && !selected.has(key)) return false;
        }
    }
    return true;
}

function blockNames(blocks: Record<string, string> | undefined, fileTarget: string): Set<string> {
    return new Set(
        Object.keys(blocks ?? {})
            .filter((key) => key.startsWith(`${fileTarget}#`))
            .map((key) => key.slice(fileTarget.length + 1)),
    );
}
