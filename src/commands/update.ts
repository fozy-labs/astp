import fs from "node:fs/promises";

import {
    assertBundleBlocks,
    assertBundleSources,
    compareVersions,
    downloadBundle,
    groupTemplateItems,
    loadInstalled,
    readUnitBlockFiles,
    syncBundle,
    validateUnitTargets,
    writeLock,
} from "@/core/index.js";
import type { BlockSelections } from "@/core/index.js";
import type { FileStatus, InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import {
    isInteractive,
    selectNewUnits,
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    showUpdateReport,
    spinner,
    warnBlockConflicts,
    warnForeign,
    warnKeptBlocks,
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
    warnReleased,
} from "@/ui/prompts.js";

import { selectUpdateBlocks } from "./blocks.js";
import { mergeReports, Sources } from "./sources.js";

export interface UpdateOptions {
    force?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeUpdate(options: UpdateOptions): Promise<void> {
    const platform: Platform = options.platform ?? (await selectPlatform());
    const target: InstallTarget = options.target
        ? resolveTarget(platform, options.target)
        : await selectTarget(platform);
    const installedState = await loadInstalled(target.rootDir);
    if (installedState.bundles.length === 0) {
        showInfo("No astp-managed files found.");
        return;
    }

    const s = spinner();
    const sources = new Sources(target);
    try {
        s.start("Fetching manifests...");
        const opened = await sources.openInstalled(installedState.bundles, installedState.lock);
        s.stop("Manifests fetched.");
        const report = mergeReports(
            [...new Set(opened.values())].map((entry) =>
                compareVersions(
                    installedState.bundles.filter((bundle) => opened.get(bundle.bundleName) === entry),
                    entry.manifest,
                ),
            ),
        );
        const bundleNames = new Set(report.updates.map((update) => update.bundleName));
        if (options.force) {
            for (const bundle of installedState.bundles) {
                if (
                    bundle.units.some((unit) => unit.state === "modified") &&
                    opened.get(bundle.bundleName)!.manifest.bundles[bundle.bundleName]
                ) {
                    bundleNames.add(bundle.bundleName);
                }
            }
        }
        if (report.updates.length > 0 || report.notInManifest.length > 0) showUpdateReport(report);
        if (bundleNames.size === 0) {
            if (report.notInManifest.length === 0) showInfo("All bundles up to date.");
            if (!options.force) {
                const modifiedLockUnits: FileStatus[] = [];
                const modifiedLegacyUnits: FileStatus[] = [];
                for (const bundle of installedState.bundles) {
                    for (const unit of bundle.units) {
                        if (unit.state !== "modified") continue;
                        const status: FileStatus = {
                            targetPath: unit.relativePath,
                            kind: unit.kind,
                            state: unit.origin === "legacy" ? "legacy" : unit.state,
                        };
                        (unit.origin === "legacy" ? modifiedLegacyUnits : modifiedLockUnits).push(status);
                    }
                }
                if (modifiedLockUnits.length > 0)
                    warnModified(modifiedLockUnits, `astp update --force --target ${target.type}`);
                if (modifiedLegacyUnits.length > 0) warnLegacyModified(modifiedLegacyUnits, target.type);
            }
            return;
        }

        const totals = {
            installed: [] as FileStatus[],
            removed: [] as FileStatus[],
            skipped: [] as FileStatus[],
            kept: [] as FileStatus[],
        };
        for (const bundleName of bundleNames) {
            const { source, spec, manifest } = opened.get(bundleName)!;
            const bundle = manifest.bundles[bundleName];
            if (!bundle) continue;
            const installed = installedState.bundles.find((entry) => entry.bundleName === bundleName);
            const units = groupTemplateItems(bundle.items);
            const manifestPaths = new Set(units.map((unit) => unit.relativePath));
            const tracked = new Set(
                installed?.units
                    .filter((unit) => manifestPaths.has(unit.relativePath))
                    .map((unit) => unit.relativePath) ?? [],
            );
            const oldDeclined = new Set(installed?.declined.filter((unitPath) => manifestPaths.has(unitPath)) ?? []);
            const newUnits = units.filter(
                (unit) => !tracked.has(unit.relativePath) && !oldDeclined.has(unit.relativePath),
            );
            const checked =
                isInteractive() && newUnits.length > 0
                    ? new Set(await selectNewUnits(bundleName, newUnits))
                    : new Set(newUnits.map((unit) => unit.relativePath));
            const selected = new Set([...tracked, ...checked]);
            const declined = new Set([
                ...oldDeclined,
                ...newUnits.filter((unit) => !checked.has(unit.relativePath)).map((unit) => unit.relativePath),
            ]);

            validateUnitTargets(target.rootDir, units);
            s.start(`Downloading ${bundleName}...`);
            const tempDir = await downloadBundle(source, bundle);
            try {
                s.stop(`Downloaded ${bundleName}.`);
                await assertBundleSources(tempDir, bundleName, units);
                await assertBundleBlocks(tempDir, bundleName, units);

                const blockSelections: BlockSelections = new Map();
                for (const unit of units) {
                    if (!selected.has(unit.relativePath)) continue;
                    const blockFiles = await readUnitBlockFiles(tempDir, unit);
                    if (blockFiles.size === 0) continue;
                    const lockUnit = installedState.lock.bundles[bundleName]?.units[unit.relativePath];
                    const selections = await selectUpdateBlocks(unit.relativePath, blockFiles, lockUnit);
                    for (const [fileTarget, selection] of selections) blockSelections.set(fileTarget, selection);
                }

                s.start(`Updating ${bundleName}...`);
                const result = await syncBundle({
                    target,
                    source: spec,
                    bundle,
                    installed,
                    lock: installedState.lock,
                    tempDir,
                    selected,
                    declined,
                    blockSelections,
                    force: options.force ?? false,
                });
                await writeLock(target.rootDir, installedState.lock);
                totals.installed.push(...result.installed);
                totals.removed.push(...result.removed);
                totals.skipped.push(...result.skipped, ...result.foreign);
                totals.kept.push(...result.kept, ...result.released);
                const legacy = result.skipped.filter((status) => status.state === "legacy");
                const modified = result.skipped.filter((status) => status.state !== "legacy");
                if (modified.length > 0) warnModified(modified, `astp update --force --target ${target.type}`);
                if (legacy.length > 0) warnLegacyModified(legacy, target.type);
                if (result.kept.length > 0) warnKeptRemoved(result.kept);
                if (result.keptBlocks.length > 0) warnKeptBlocks(result.keptBlocks);
                if (result.released.length > 0 || result.releasedBlocks.length > 0) {
                    warnReleased(result.released, result.releasedBlocks);
                }
                if (result.foreign.length > 0 || result.foreignBlocks.length > 0) {
                    warnForeign(bundleName, result.foreign, result.foreignBlocks, target.type);
                }
                if (result.conflictBlocks.length > 0) warnBlockConflicts(result.conflictBlocks);
                s.stop(`Updated ${bundleName}.`);
            } finally {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        }

        showSuccess(
            `Updated ${countStatuses(totals.installed)}${totals.skipped.length ? `, skipped ${countStatuses(totals.skipped)}` : ""}${
                totals.removed.length ? `, removed ${countStatuses(totals.removed)}` : ""
            }${totals.kept.length ? `, kept ${countStatuses(totals.kept)}` : ""}`,
        );
    } finally {
        await sources.close();
    }
}

function countStatuses(statuses: FileStatus[]): string {
    return describeUnitCounts(
        statuses.filter((status) => status.kind === "file").length,
        statuses.filter((status) => status.kind === "skill").length,
    );
}
