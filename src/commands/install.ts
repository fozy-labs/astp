import fs from "node:fs/promises";

import {
    assertBundleBlocks,
    assertBundleSources,
    DEFAULT_SOURCE,
    downloadBundle,
    groupTemplateItems,
    loadInstalled,
    readUnitBlockFiles,
    resolveBundle,
    resolveUnitPaths,
    syncBundle,
    validateUnitTargets,
    writeLock,
} from "@/core/index.js";
import type { BlockSelections, UnitBlockFile } from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type { Bundle, FileStatus, InstalledBundle, InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { bundleSupportsPlatform, filterBundlesByPlatform, getBundlePlatforms, resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import type { BlockOption, BundleChoice } from "@/ui/prompts.js";
import {
    cancelNoBundles,
    confirmInstall,
    isInteractive,
    requireTerminal,
    selectBundleItems,
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    spinner,
    warnBlockConflicts,
    warnForeign,
    warnKeptBlocks,
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
    warnReleased,
} from "@/ui/prompts.js";

import { initialInstallBlocks, installBlockOptions, resolveBlockKeys, selectInstallBlocks } from "./blocks.js";
import type { OpenedSource } from "./sources.js";
import { Sources } from "./sources.js";

export interface InstallOptions {
    bundle?: string;
    source?: string;
    skills?: string[];
    blocks?: string[];
    force?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

interface BundlePlan {
    bundle: Bundle;
    source: OpenedSource;
    selected: Set<string>;
    declined: Set<string>;
    tempDir: string;
    blockSelections: BlockSelections;
}

interface DownloadedBundle {
    bundle: Bundle;
    source: OpenedSource;
    tempDir: string;
    units: TemplateUnit[];
    /** Unit path → its files with blocks. */
    unitBlockFiles: Map<string, Map<string, UnitBlockFile>>;
}

export async function executeInstall(options: InstallOptions): Promise<void> {
    if (options.skills?.length && !options.bundle) throw new Error("--skill requires a bundle name");
    if (options.blocks?.length && !options.bundle) throw new Error("--block requires a bundle name");
    if (!options.bundle) requireTerminal("install needs a bundle name without a terminal");
    const additive = Boolean(options.skills?.length || options.blocks?.length);
    const platform: Platform = options.platform ?? (await selectPlatform());
    const target: InstallTarget = options.target
        ? resolveTarget(platform, options.target)
        : await selectTarget(platform);
    const installedState = await loadInstalled(target.rootDir);

    const s = spinner();
    const sources = new Sources(target);
    const plans: BundlePlan[] = [];
    const tempDirs: string[] = [];
    try {
        const openFor = (bundleName: string): Promise<OpenedSource> => {
            if (options.source !== undefined) return sources.open(options.source, "cli");
            return sources.open(installedState.lock.bundles[bundleName]?.source ?? DEFAULT_SOURCE, "lock");
        };
        s.start("Fetching manifest...");
        const primary = options.bundle
            ? await openFor(options.bundle)
            : await sources.open(options.source ?? DEFAULT_SOURCE, options.source !== undefined ? "cli" : "lock");

        const candidates: Array<{ bundle: Bundle; source: OpenedSource }> = [];
        if (options.bundle) {
            candidates.push({ bundle: resolveBundle(primary.manifest, options.bundle), source: primary });
        } else {
            const manifestBundles = filterBundlesByPlatform(primary.manifest, platform);
            if (manifestBundles.length === 0) cancelNoBundles(platform);
            for (const { name } of manifestBundles) {
                const source = await openFor(name);
                candidates.push({ bundle: resolveBundle(source.manifest, name), source });
            }
        }
        s.stop("Manifest fetched.");
        for (const { bundle } of candidates) {
            if (!bundleSupportsPlatform(bundle, platform)) {
                throw new Error(
                    `Bundle '${bundle.name}' does not support platform '${platform}'. Supported: ${getBundlePlatforms(bundle).join(", ")}`,
                );
            }
        }

        // Block choices need the template content, so every candidate is
        // downloaded before the selection and the confirmation.
        const [only] = candidates;
        s.start(candidates.length === 1 && only ? `Downloading ${only.bundle.name}...` : "Downloading bundles...");
        const downloaded: DownloadedBundle[] = [];
        for (const { bundle, source } of candidates) {
            const tempDir = await downloadBundle(source.source, bundle);
            tempDirs.push(tempDir);
            const units = groupTemplateItems(bundle.items);
            validateUnitTargets(target.rootDir, units);
            await assertBundleSources(tempDir, bundle.name, units);
            await assertBundleBlocks(tempDir, bundle.name, units);
            const unitBlockFiles = new Map<string, Map<string, UnitBlockFile>>();
            for (const unit of units) unitBlockFiles.set(unit.relativePath, await readUnitBlockFiles(tempDir, unit));
            downloaded.push({ bundle, source, tempDir, units, unitBlockFiles });
        }
        s.stop(candidates.length === 1 && only ? `Downloaded ${only.bundle.name}.` : "Downloaded bundles.");

        let chosen: Map<string, BundleChoice> | undefined;
        if (isInteractive() && !additive) {
            chosen = await selectBundleItems(
                downloaded.map(({ bundle, units, unitBlockFiles }) => {
                    const lockBundle = installedState.lock.bundles[bundle.name];
                    const installed = installedState.bundles.find((entry) => entry.bundleName === bundle.name);
                    const blocks = new Map<string, BlockOption[]>();
                    const blockDefaults: string[] = [];
                    for (const [unitPath, blockFiles] of unitBlockFiles) {
                        const blockOptions = installBlockOptions(blockFiles);
                        if (blockOptions.length === 0) continue;
                        blocks.set(unitPath, blockOptions);
                        blockDefaults.push(...initialInstallBlocks(blockFiles, lockBundle?.units[unitPath]));
                    }
                    return {
                        bundle,
                        units,
                        defaults: defaultSelection(units, installed),
                        preselected:
                            options.bundle !== undefined || primary.manifest.bundles[bundle.name]?.default === true,
                        blocks,
                        blockDefaults,
                    };
                }),
            );
        }

        for (const { bundle, source, tempDir, units, unitBlockFiles } of downloaded) {
            const choice = chosen?.get(bundle.name);
            if (chosen && !choice) continue;
            const paths = new Set(units.map((unit) => unit.relativePath));
            const installed = installedState.bundles.find((entry) => entry.bundleName === bundle.name);
            const tracked = new Set(
                installed?.units.filter((unit) => paths.has(unit.relativePath)).map((unit) => unit.relativePath) ?? [],
            );
            const oldDeclined = new Set(installed?.declined.filter((unitPath) => paths.has(unitPath)) ?? []);
            let selected: Set<string>;
            let declined: Set<string>;

            if (additive) {
                const matched = resolveUnitPaths(options.skills ?? [], units, bundle.name);
                selected = new Set([...tracked, ...matched]);
                const previouslyTracked = tracked.size > 0 || oldDeclined.size > 0;
                declined = previouslyTracked
                    ? new Set([...oldDeclined].filter((unitPath) => !matched.has(unitPath)))
                    : new Set([...paths].filter((unitPath) => !matched.has(unitPath)));
            } else if (choice) {
                selected = new Set(choice.units);
                declined = new Set([...paths].filter((unitPath) => !selected.has(unitPath)));
            } else {
                selected = paths;
                declined = new Set();
            }

            const requested = resolveBlockKeys(options.blocks ?? [], unitBlockFiles, bundle.name);
            for (const unitPath of requested.keys()) {
                selected.add(unitPath);
                declined.delete(unitPath);
            }
            const lockBundle = installedState.lock.bundles[bundle.name];
            const chosenBlocks = choice ? new Set(choice.blocks) : undefined;
            const blockSelections: BlockSelections = new Map();
            for (const unit of units) {
                if (!selected.has(unit.relativePath)) continue;
                const blockFiles = unitBlockFiles.get(unit.relativePath)!;
                if (blockFiles.size === 0) continue;
                const selections = selectInstallBlocks(blockFiles, lockBundle?.units[unit.relativePath], {
                    additive,
                    requested: requested.get(unit.relativePath),
                    chosen: chosenBlocks,
                });
                for (const [file, selection] of selections) blockSelections.set(file, selection);
            }
            plans.push({ bundle, source, selected, declined, tempDir, blockSelections });
        }

        const selectedUnits = plans.flatMap((plan) =>
            groupTemplateItems(plan.bundle.items).filter((unit) => plan.selected.has(unit.relativePath)),
        );
        if (
            isInteractive() &&
            !(await confirmInstall(
                plans.map((plan) => plan.bundle),
                target,
                selectedUnits,
            ))
        )
            return;

        const totals = { installed: [] as FileStatus[], skipped: [] as FileStatus[], kept: [] as FileStatus[] };
        for (const plan of plans) {
            const previousSource = installedState.lock.bundles[plan.bundle.name]?.source;
            if (options.source !== undefined && previousSource !== undefined && previousSource !== plan.source.spec) {
                showInfo(`${plan.bundle.name} source: ${previousSource} → ${plan.source.spec}`);
            }
            s.start(`Installing ${plan.bundle.name}...`);
            const result = await syncBundle({
                target,
                source: plan.source.spec,
                bundle: plan.bundle,
                installed: installedState.bundles.find((entry) => entry.bundleName === plan.bundle.name),
                lock: installedState.lock,
                tempDir: plan.tempDir,
                selected: plan.selected,
                declined: plan.declined,
                blockSelections: plan.blockSelections,
                force: options.force ?? false,
            });
            await writeLock(target.rootDir, installedState.lock);
            totals.installed.push(...result.installed);
            totals.skipped.push(...result.skipped, ...result.foreign);
            totals.kept.push(...result.kept);
            const legacy = result.skipped.filter((status) => status.state === "legacy");
            const modified = result.skipped.filter((status) => status.state !== "legacy");
            if (modified.length > 0)
                warnModified(modified, `astp install ${plan.bundle.name} --force --target ${target.type}`);
            if (legacy.length > 0) warnLegacyModified(legacy, target.type);
            if (result.kept.length > 0) warnKeptRemoved(result.kept);
            if (result.keptBlocks.length > 0) warnKeptBlocks(result.keptBlocks);
            if (result.released.length > 0 || result.releasedBlocks.length > 0) {
                warnReleased(result.released, result.releasedBlocks);
            }
            if (result.foreign.length > 0 || result.foreignBlocks.length > 0) {
                warnForeign(plan.bundle.name, result.foreign, result.foreignBlocks, target.type);
            }
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
        for (const tempDir of tempDirs) await fs.rm(tempDir, { recursive: true, force: true });
        await sources.close();
    }
}

/** Units a bundle installs without customization: everything minus the lock's declines. */
function defaultSelection(units: Array<{ relativePath: string }>, installed?: InstalledBundle): string[] {
    const declined = new Set(installed?.declined ?? []);
    return units.map((unit) => unit.relativePath).filter((unitPath) => !declined.has(unitPath));
}

function countStatuses(statuses: FileStatus[]): string {
    return describeUnitCounts(statuses.map((status) => ({ kind: status.kind, path: status.targetPath })));
}
