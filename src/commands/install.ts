import fs from "node:fs/promises";

import {
    assertBundleBlocks,
    assertBundleSources,
    downloadBundle,
    fetchManifest,
    groupTemplateItems,
    loadInstalled,
    readUnitBlockFiles,
    resolveBundle,
    resolveUnitPaths,
    syncBundle,
    validateUnitTargets,
    writeLock,
} from "@/core/index.js";
import type { BlockSelections } from "@/core/index.js";
import type { Bundle, FileStatus, InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { bundleSupportsPlatform, getBundlePlatforms, resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import {
    confirmInstall,
    isInteractive,
    selectBundles,
    selectPlatform,
    selectTarget,
    selectUnits,
    showSuccess,
    spinner,
    warnBlockConflicts,
    warnKeptBlocks,
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
} from "@/ui/prompts.js";

import { selectInstallBlocks } from "./blocks.js";

export interface InstallOptions {
    bundle?: string;
    skills?: string[];
    force?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

interface BundlePlan {
    bundle: Bundle;
    selected: Set<string>;
    declined: Set<string>;
    tempDir?: string;
    blockSelections: BlockSelections;
}

export async function executeInstall(options: InstallOptions): Promise<void> {
    if (options.skills?.length && !options.bundle) throw new Error("--skill requires a bundle name");
    const platform: Platform = options.platform ?? (await selectPlatform());
    const target: InstallTarget = options.target
        ? resolveTarget(platform, options.target)
        : await selectTarget(platform);
    const installedState = await loadInstalled(target.rootDir);

    const s = spinner();
    s.start("Fetching manifest...");
    const manifest = await fetchManifest();
    s.stop("Manifest fetched.");

    let selectedBundles: Bundle[];
    if (options.bundle) {
        const bundle = resolveBundle(manifest, options.bundle);
        if (!bundleSupportsPlatform(bundle, platform)) {
            throw new Error(
                `Bundle '${bundle.name}' does not support platform '${platform}'. Supported: ${getBundlePlatforms(bundle).join(", ")}`,
            );
        }
        selectedBundles = [bundle];
    } else {
        selectedBundles = await selectBundles(manifest, platform);
    }

    const plans: BundlePlan[] = [];
    for (const bundle of selectedBundles) {
        const units = groupTemplateItems(bundle.items);
        const paths = new Set(units.map((unit) => unit.relativePath));
        const installed = installedState.bundles.find((entry) => entry.bundleName === bundle.name);
        const tracked = new Set(
            installed?.units.filter((unit) => paths.has(unit.relativePath)).map((unit) => unit.relativePath) ?? [],
        );
        const oldDeclined = new Set(installed?.declined.filter((unitPath) => paths.has(unitPath)) ?? []);
        let selected: Set<string>;
        let declined: Set<string>;

        if (options.skills?.length) {
            const matched = resolveUnitPaths(options.skills, units, bundle.name);
            selected = new Set([...tracked, ...matched]);
            const previouslyTracked = tracked.size > 0 || oldDeclined.size > 0;
            declined = previouslyTracked
                ? new Set([...oldDeclined].filter((unitPath) => !matched.has(unitPath)))
                : new Set([...paths].filter((unitPath) => !matched.has(unitPath)));
        } else if (isInteractive()) {
            const initial = installed ? [...paths].filter((unitPath) => !oldDeclined.has(unitPath)) : [...paths];
            selected = new Set(await selectUnits(bundle, units, initial));
            declined = new Set([...paths].filter((unitPath) => !selected.has(unitPath)));
        } else {
            selected = paths;
            declined = new Set();
        }
        plans.push({ bundle, selected, declined, blockSelections: new Map() });
    }

    try {
        // Block choices need the template content, so every bundle is downloaded
        // before the block prompts and the confirmation.
        for (const plan of plans) {
            s.start(`Downloading ${plan.bundle.name}...`);
            plan.tempDir = await downloadBundle(manifest.repository, plan.bundle.name);
            s.stop(`Downloaded ${plan.bundle.name}.`);
            const units = groupTemplateItems(plan.bundle.items);
            validateUnitTargets(target.rootDir, units);
            await assertBundleSources(plan.tempDir, plan.bundle.name, units);
            await assertBundleBlocks(plan.tempDir, plan.bundle.name, units);

            const lockBundle = installedState.lock.bundles[plan.bundle.name];
            for (const unit of units) {
                if (!plan.selected.has(unit.relativePath)) continue;
                const blockFiles = await readUnitBlockFiles(plan.tempDir, unit);
                if (blockFiles.size === 0) continue;
                const selections = await selectInstallBlocks(
                    unit.relativePath,
                    blockFiles,
                    lockBundle?.units[unit.relativePath],
                );
                for (const [target, selection] of selections) plan.blockSelections.set(target, selection);
            }
        }

        const selectedUnits = plans.flatMap((plan) =>
            groupTemplateItems(plan.bundle.items).filter((unit) => plan.selected.has(unit.relativePath)),
        );
        if (isInteractive() && !(await confirmInstall(selectedBundles, target, selectedUnits))) return;

        const totals = { installed: [] as FileStatus[], skipped: [] as FileStatus[], kept: [] as FileStatus[] };
        for (const plan of plans) {
            s.start(`Installing ${plan.bundle.name}...`);
            const result = await syncBundle({
                target,
                manifest,
                bundle: plan.bundle,
                installed: installedState.bundles.find((entry) => entry.bundleName === plan.bundle.name),
                lock: installedState.lock,
                tempDir: plan.tempDir!,
                selected: plan.selected,
                declined: plan.declined,
                blockSelections: plan.blockSelections,
                force: options.force ?? false,
            });
            await writeLock(target.rootDir, installedState.lock);
            totals.installed.push(...result.installed);
            totals.skipped.push(...result.skipped);
            totals.kept.push(...result.kept);
            const legacy = result.skipped.filter((status) => status.state === "legacy");
            const modified = result.skipped.filter((status) => status.state !== "legacy");
            if (modified.length > 0) warnModified(modified);
            if (legacy.length > 0) warnLegacyModified(legacy);
            if (result.kept.length > 0) warnKeptRemoved(result.kept);
            if (result.keptBlocks.length > 0) warnKeptBlocks(result.keptBlocks);
            if (result.conflictBlocks.length > 0) warnBlockConflicts(result.conflictBlocks);
            s.stop(`Installed ${plan.bundle.name}.`);
        }

        const installedCounts = countStatuses(totals.installed);
        const skippedCounts = countStatuses(totals.skipped);
        const keptCounts = countStatuses(totals.kept);
        showSuccess(
            `Installed ${installedCounts} to ${target.rootDir}${totals.skipped.length ? `, skipped ${skippedCounts}` : ""}${
                totals.kept.length ? `, kept ${keptCounts}` : ""
            }`,
        );
    } finally {
        for (const plan of plans) {
            if (plan.tempDir) await fs.rm(plan.tempDir, { recursive: true, force: true });
        }
    }
}

function countStatuses(statuses: FileStatus[]): string {
    return describeUnitCounts(
        statuses.filter((status) => status.kind === "file").length,
        statuses.filter((status) => status.kind === "skill").length,
    );
}
