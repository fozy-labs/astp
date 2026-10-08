import fs from "node:fs/promises";

import {
    assertBundleSources,
    compareVersions,
    downloadBundle,
    fetchManifest,
    groupTemplateItems,
    loadInstalled,
    syncBundle,
    validateUnitTargets,
    writeLock,
} from "@/core/index.js";
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
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
} from "@/ui/prompts.js";

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
    s.start("Fetching manifest...");
    const manifest = await fetchManifest();
    s.stop("Manifest fetched.");
    const report = compareVersions(installedState.bundles, manifest);
    const bundleNames = new Set(report.updates.map((update) => update.bundleName));
    if (options.force) {
        for (const bundle of installedState.bundles) {
            if (bundle.units.some((unit) => unit.state === "modified") && manifest.bundles[bundle.bundleName]) {
                bundleNames.add(bundle.bundleName);
            }
        }
    }
    if (report.updates.length > 0 || report.notInManifest.length > 0) showUpdateReport(report);
    if (bundleNames.size === 0) {
        if (report.notInManifest.length === 0) showInfo("All bundles up to date.");
        return;
    }

    const totals = {
        installed: [] as FileStatus[],
        removed: [] as FileStatus[],
        skipped: [] as FileStatus[],
        kept: [] as FileStatus[],
    };
    for (const bundleName of bundleNames) {
        const bundle = manifest.bundles[bundleName];
        if (!bundle) continue;
        const installed = installedState.bundles.find((entry) => entry.bundleName === bundleName);
        const units = groupTemplateItems(bundle.items);
        const manifestPaths = new Set(units.map((unit) => unit.relativePath));
        const tracked = new Set(
            installed?.units.filter((unit) => manifestPaths.has(unit.relativePath)).map((unit) => unit.relativePath) ??
                [],
        );
        const oldDeclined = new Set(installed?.declined.filter((unitPath) => manifestPaths.has(unitPath)) ?? []);
        const newUnits = units.filter((unit) => !tracked.has(unit.relativePath) && !oldDeclined.has(unit.relativePath));
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
        const tempDir = await downloadBundle(manifest.repository, bundleName);
        try {
            s.stop(`Downloaded ${bundleName}.`);
            await assertBundleSources(tempDir, bundleName, units);
            s.start(`Updating ${bundleName}...`);
            const result = await syncBundle({
                target,
                manifest,
                bundle,
                installed,
                lock: installedState.lock,
                tempDir,
                selected,
                declined,
                force: options.force ?? false,
            });
            await writeLock(target.rootDir, installedState.lock);
            totals.installed.push(...result.installed);
            totals.removed.push(...result.removed);
            totals.skipped.push(...result.skipped);
            totals.kept.push(...result.kept);
            const legacy = result.skipped.filter((status) => status.state === "legacy");
            const modified = result.skipped.filter((status) => status.state !== "legacy");
            if (modified.length > 0) warnModified(modified);
            if (legacy.length > 0) warnLegacyModified(legacy);
            if (result.kept.length > 0) warnKeptRemoved(result.kept);
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
}

function countStatuses(statuses: FileStatus[]): string {
    return describeUnitCounts(
        statuses.filter((status) => status.kind === "file").length,
        statuses.filter((status) => status.kind === "skill").length,
    );
}
