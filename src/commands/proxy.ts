import fs from "node:fs/promises";

import {
    assertBundleBlocks,
    assertBundleSources,
    checkManifestVersion,
    closeSource,
    compareProxyBundle,
    DEFAULT_SOURCE,
    deleteProxyUnits,
    downloadProxyBundle,
    fetchManifest,
    formatSourceAt,
    groupTemplateItems,
    loadProxyState,
    proxyUnitPath,
    readUnitDescription,
    resolveBundle,
    resolveProxyOutput,
    resolveSource,
    resolveUnitPaths,
    stripBundlePrefix,
    syncProxyBundle,
} from "@/core/index.js";
import type { ManifestSource, ProxyComparison, ProxyState } from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type { Bundle, FileStatus } from "@/types/index.js";
import { describeUnitCounts, shellArg } from "@/ui/format.js";
import {
    confirmProxyAction,
    isInteractive,
    requireTerminal,
    selectBundleItems,
    selectNewUnits,
    selectProxyBundles,
    showInfo,
    showProxyCheckReport,
    showSuccess,
    spinner,
    warnKeptRemoved,
    warnModified,
    warnNewerManifest,
    warnProxyForeign,
} from "@/ui/prompts.js";

import type { OpenedSource } from "./sources.js";

export interface ProxyOptions {
    output?: string;
}

export interface ProxyInstallOptions extends ProxyOptions {
    bundle?: string;
    source?: string;
    skills?: string[];
    force?: boolean;
}

export interface ProxyDeleteOptions extends ProxyOptions {
    bundle?: string;
    skills?: string[];
    force?: boolean;
}

interface ProxyCandidate {
    bundle: Bundle;
    source: OpenedSource;
    units: TemplateUnit[];
    tempDir: string;
}

interface ProxyPlan extends ProxyCandidate {
    selected: Set<string>;
    replaceBundle: boolean;
}

export async function executeProxyInstall(options: ProxyInstallOptions): Promise<void> {
    if (options.skills?.length && !options.bundle) throw new Error("--skill requires a bundle name");
    if (!options.bundle) requireTerminal("proxy install needs a bundle name without a terminal");
    const rootDir = resolveProxyOutput(options.output);
    const state = await loadProxyState(rootDir);
    const sources = new ProxySources(rootDir);
    const tempDirs: string[] = [];
    const s = spinner();
    try {
        const openFor = (bundleName: string): Promise<OpenedSource> =>
            options.source !== undefined
                ? sources.open(options.source, "cli")
                : sources.open(state.lock.bundles[bundleName]?.source ?? DEFAULT_SOURCE, "lock");
        s.start("Fetching manifest...");
        const primary = options.bundle
            ? await openFor(options.bundle)
            : await sources.open(options.source ?? DEFAULT_SOURCE, options.source !== undefined ? "cli" : "lock");
        const names = options.bundle ? [options.bundle] : Object.keys(primary.manifest.bundles);
        s.stop("Manifest fetched.");
        const candidates: ProxyCandidate[] = [];
        for (const name of names) {
            const opened = options.bundle ? primary : await openFor(name);
            const bundle = resolveBundle(opened.manifest, name);
            const replaceBundle = Boolean(state.manifest.bundles[name] && !state.lock.bundles[name]);
            if (replaceBundle && !options.force) {
                if (options.bundle) {
                    throw new Error(`Bundle '${name}' in ${rootDir} is organization-owned; use --force to replace it`);
                }
                continue;
            }
            s.start(`Downloading ${name}...`);
            const downloaded = await downloadProxyBundle(opened.source, bundle);
            tempDirs.push(downloaded.tempDir);
            await assertBundleSources(downloaded.tempDir, name, downloaded.units);
            await assertBundleBlocks(downloaded.tempDir, name, downloaded.units);
            for (const unit of downloaded.units) {
                const description = await readUnitDescription(downloaded.tempDir, unit);
                if (description) unit.description = description;
            }
            const byPath = new Map(
                [...downloaded.units, ...downloaded.remoteRefs].map((unit) => [unit.relativePath, unit]),
            );
            candidates.push({
                bundle,
                source: opened,
                units: groupTemplateItems(bundle).map((unit) => byPath.get(unit.relativePath)!),
                tempDir: downloaded.tempDir,
            });
            s.stop(`Downloaded ${name}.`);
        }
        if (candidates.length === 0) {
            showInfo("No bundles available to proxy.");
            return;
        }
        sources.warnIfNewer();

        const additive = Boolean(options.skills?.length);
        let chosen: Map<string, { units: string[] }> | undefined;
        if (isInteractive() && !additive) {
            chosen = await selectBundleItems(
                candidates.map((candidate) => ({
                    bundle: candidate.bundle,
                    units: candidate.units,
                    defaults: proxyDefaults(candidate.bundle.name, candidate.units, state),
                    preselected:
                        options.bundle !== undefined ||
                        primary.manifest.bundles[candidate.bundle.name]?.default === true,
                    blocks: new Map(),
                    blockDefaults: [],
                })),
            );
        }
        const plans: ProxyPlan[] = [];
        for (const candidate of candidates) {
            const { bundle } = candidate;
            const tracked = trackedTargets(bundle.name, state);
            const oldDeclined = new Set(
                (state.lock.bundles[bundle.name]?.declined ?? []).map((unitPath) =>
                    stripBundlePrefix(bundle.name, unitPath),
                ),
            );
            let selected: Set<string>;
            if (chosen) {
                const choice = chosen.get(bundle.name);
                if (!choice) continue;
                selected = new Set(choice.units);
            } else if (additive) {
                const matched = resolveUnitPaths(options.skills ?? [], candidate.units, bundle.name);
                const previous = tracked.size > 0 || oldDeclined.size > 0;
                selected = previous ? new Set([...tracked, ...matched]) : matched;
            } else {
                selected = new Set(
                    candidate.units
                        .filter((unit) => tracked.has(unit.relativePath) || !unit.optional)
                        .map((unit) => unit.relativePath),
                );
            }
            plans.push({
                ...candidate,
                selected,
                replaceBundle: Boolean(state.manifest.bundles[bundle.name] && !state.lock.bundles[bundle.name]),
            });
        }
        const selectedUnits = plans.flatMap((plan) =>
            plan.units.filter((unit) => plan.selected.has(unit.relativePath)),
        );
        if (
            isInteractive() &&
            !(await confirmProxyAction(
                `Proxy ${plans.length} bundle${plans.length === 1 ? "" : "s"} (${countUnits(selectedUnits)}) to ${rootDir}?`,
            ))
        ) {
            return;
        }

        const installed: FileStatus[] = [];
        const skipped: FileStatus[] = [];
        const kept: FileStatus[] = [];
        for (const plan of plans) {
            s.start(`Proxying ${plan.bundle.name}...`);
            const result = await syncProxyBundle({
                rootDir,
                source: plan.source.spec,
                bundle: plan.bundle,
                tempDir: plan.tempDir,
                units: plan.units,
                selected: plan.selected,
                force: options.force ?? false,
                replaceBundle: plan.replaceBundle,
                state,
            });
            installed.push(...result.installed);
            skipped.push(...result.skipped, ...result.foreign);
            kept.push(...result.kept);
            if (result.skipped.length > 0) {
                const flags = result.skipped.map(
                    (unit) => `--skill ${stripBundlePrefix(plan.bundle.name, unit.targetPath)}`,
                );
                warnModified(
                    result.skipped,
                    `astp proxy install ${plan.bundle.name} ${flags.join(" ")} --force${outputSuffix(options.output)}`,
                );
            }
            if (result.foreign.length > 0) {
                warnProxyForeign(
                    result.foreign,
                    `astp proxy install ${plan.bundle.name} --force${outputSuffix(options.output)}`,
                );
            }
            if (result.kept.length > 0) warnKeptRemoved(result.kept);
            s.stop(`Proxied ${plan.bundle.name}.`);
        }
        showSuccess(
            `Proxied ${describeUnitCounts(installed.map((unit) => ({ kind: unit.kind, path: unit.targetPath })))} to ${rootDir}${
                skipped.length
                    ? `, skipped ${describeUnitCounts(skipped.map((unit) => ({ kind: unit.kind, path: unit.targetPath })))}`
                    : ""
            }`,
        );
    } finally {
        for (const tempDir of tempDirs) await fs.rm(tempDir, { recursive: true, force: true });
        await sources.close();
    }
}

export async function executeProxyUpdate(options: ProxyOptions & { force?: boolean }): Promise<void> {
    const rootDir = resolveProxyOutput(options.output);
    const state = await loadProxyState(rootDir);
    if (Object.keys(state.lock.bundles).length === 0) {
        showInfo("No proxied bundles found.");
        return;
    }
    const sources = new ProxySources(rootDir);
    const tempDirs: string[] = [];
    const s = spinner();
    try {
        s.start("Fetching manifests...");
        const opened = await sources.openInstalled(state);
        s.stop("Manifests fetched.");
        const reports = proxyComparisons(state, opened);
        showProxyCheckReport(reports);
        const names = new Set(reports.filter((report) => report.outOfSync).map((report) => report.bundleName));
        if (options.force) {
            for (const report of reports) {
                if (report.modifiedUnits.length > 0) names.add(report.bundleName);
            }
        }
        if (names.size === 0) {
            showInfo("All proxied bundles up to date.");
            return;
        }

        const installed: FileStatus[] = [];
        const kept: FileStatus[] = [];
        for (const bundleName of names) {
            const source = opened.get(bundleName)!;
            const upstream = source.manifest.bundles[bundleName];
            if (!upstream) {
                const result = await deleteProxyUnits({ rootDir, bundleName, force: options.force ?? false, state });
                installed.push(...result.removed);
                kept.push(...result.kept);
                continue;
            }
            const downloaded = await downloadProxyBundle(source.source, upstream);
            tempDirs.push(downloaded.tempDir);
            await assertBundleSources(downloaded.tempDir, bundleName, downloaded.units);
            await assertBundleBlocks(downloaded.tempDir, bundleName, downloaded.units);
            const byPath = new Map(
                [...downloaded.units, ...downloaded.remoteRefs].map((unit) => [unit.relativePath, unit]),
            );
            const units = groupTemplateItems(upstream).map((unit) => byPath.get(unit.relativePath)!);
            const tracked = new Set(
                units
                    .filter((unit) => {
                        const sourcePath = proxyUnitPath(bundleName, unit.relativePath);
                        const lock = state.lock.bundles[bundleName]!;
                        return sourcePath in lock.units || sourcePath in (lock.refs ?? {});
                    })
                    .map((unit) => unit.relativePath),
            );
            const declined = new Set(state.lock.bundles[bundleName]!.declined);
            const newUnits = units.filter(
                (unit) =>
                    !tracked.has(unit.relativePath) && !declined.has(proxyUnitPath(bundleName, unit.relativePath)),
            );
            const checked =
                isInteractive() && newUnits.length > 0
                    ? new Set(await selectNewUnits(bundleName, newUnits))
                    : new Set(newUnits.filter((unit) => !unit.optional).map((unit) => unit.relativePath));
            const result = await syncProxyBundle({
                rootDir,
                source: source.spec,
                bundle: upstream,
                tempDir: downloaded.tempDir,
                units,
                selected: new Set([...tracked, ...checked]),
                force: options.force ?? false,
                state,
            });
            installed.push(...result.installed, ...result.removed);
            kept.push(...result.skipped, ...result.kept, ...result.foreign);
            if (result.skipped.length > 0) {
                warnModified(result.skipped, `astp proxy update --force${outputSuffix(options.output)}`);
            }
            if (result.foreign.length > 0) {
                warnProxyForeign(result.foreign, `astp proxy update --force${outputSuffix(options.output)}`);
            }
        }
        if (kept.length > 0) warnKeptRemoved(kept);
        showSuccess(`Updated proxied bundles in ${rootDir}.`);
    } finally {
        for (const tempDir of tempDirs) await fs.rm(tempDir, { recursive: true, force: true });
        await sources.close();
    }
}

export async function executeProxyCheck(options: ProxyOptions): Promise<void> {
    const rootDir = resolveProxyOutput(options.output);
    const state = await loadProxyState(rootDir);
    if (Object.keys(state.lock.bundles).length === 0) {
        showInfo("No proxied bundles found.");
        return;
    }
    const sources = new ProxySources(rootDir);
    try {
        const opened = await sources.openInstalled(state);
        const reports = proxyComparisons(state, opened);
        showProxyCheckReport(reports);
        sources.warnIfNewer();
    } finally {
        await sources.close();
    }
}

export async function executeProxyDelete(options: ProxyDeleteOptions): Promise<void> {
    if (options.skills?.length && !options.bundle) throw new Error("--skill requires a bundle name");
    if (!options.bundle) requireTerminal("proxy delete needs a bundle name without a terminal");
    const rootDir = resolveProxyOutput(options.output);
    const state = await loadProxyState(rootDir);
    const available = Object.keys(state.lock.bundles);
    if (available.length === 0) {
        showInfo("No proxied bundles found.");
        return;
    }
    const names = options.bundle ? [options.bundle] : await selectProxyBundles(available);
    const removed: FileStatus[] = [];
    const kept: FileStatus[] = [];
    for (const bundleName of names) {
        const lock = state.lock.bundles[bundleName];
        const bundle = state.manifest.bundles[bundleName];
        if (!lock || !bundle) throw new Error(`Proxied bundle '${bundleName}' not found in ${rootDir}`);
        let targets: Set<string> | undefined;
        if (options.skills?.length) {
            const managed = groupTemplateItems(bundle).filter((unit) => {
                const sourcePath = proxyUnitPath(bundleName, unit.relativePath);
                return sourcePath in lock.units || sourcePath in (lock.refs ?? {});
            });
            targets = resolveUnitPaths(options.skills, managed, bundleName);
        }
        if (
            isInteractive() &&
            !(await confirmProxyAction(
                `Delete proxied ${bundleName} from ${rootDir}${options.force ? " with --force" : ""}?`,
            ))
        ) {
            continue;
        }
        const result = await deleteProxyUnits({ rootDir, bundleName, targets, force: options.force ?? false, state });
        removed.push(...result.removed);
        kept.push(...result.kept);
    }
    if (kept.length > 0) warnKeptRemoved(kept);
    showSuccess(
        `Deleted ${describeUnitCounts(removed.map((unit) => ({ kind: unit.kind, path: unit.targetPath })))} from ${rootDir}${
            kept.length
                ? `, kept ${describeUnitCounts(kept.map((unit) => ({ kind: unit.kind, path: unit.targetPath })))}`
                : ""
        }`,
    );
}

function proxyComparisons(state: ProxyState, opened: Map<string, OpenedSource>): ProxyComparison[] {
    return Object.keys(state.lock.bundles).map((bundleName) =>
        compareProxyBundle({
            bundleName,
            upstream: opened.get(bundleName)!.manifest.bundles[bundleName],
            lockBundle: state.lock.bundles[bundleName],
            manifestBundle: state.manifest.bundles[bundleName],
            installed: state.bundles.find((entry) => entry.bundleName === bundleName),
        }),
    );
}

function trackedTargets(bundleName: string, state: ProxyState): Set<string> {
    const lock = state.lock.bundles[bundleName];
    return new Set(
        [...Object.keys(lock?.units ?? {}), ...Object.keys(lock?.refs ?? {})].map((unitPath) =>
            stripBundlePrefix(bundleName, unitPath),
        ),
    );
}

function proxyDefaults(bundleName: string, units: TemplateUnit[], state: ProxyState): string[] {
    const tracked = trackedTargets(bundleName, state);
    const declined = new Set(state.lock.bundles[bundleName]?.declined ?? []);
    return units
        .filter(
            (unit) =>
                tracked.has(unit.relativePath) ||
                (!unit.optional && !declined.has(proxyUnitPath(bundleName, unit.relativePath))),
        )
        .map((unit) => unit.relativePath);
}

function countUnits(units: TemplateUnit[]): string {
    return describeUnitCounts(units.map((unit) => ({ kind: unit.kind, path: unit.relativePath })));
}

function outputSuffix(output?: string): string {
    return output === undefined ? "" : ` --output ${shellArg(output)}`;
}

class ProxySources {
    private readonly opened = new Map<string, OpenedSource>();
    private readonly sources: ManifestSource[] = [];

    constructor(private readonly rootDir: string) {}

    async open(spec: string, from: "cli" | "lock"): Promise<OpenedSource> {
        const source = await resolveSource(spec, from === "cli" ? process.cwd() : this.rootDir);
        const key = formatSourceAt(source, this.rootDir);
        const existing = this.opened.get(key);
        if (existing) return existing;
        this.sources.push(source);
        const opened = { source, spec: key, useLockedRevisions: false, manifest: await fetchManifest(source) };
        this.opened.set(key, opened);
        return opened;
    }

    async openInstalled(state: ProxyState): Promise<Map<string, OpenedSource>> {
        const result = new Map<string, OpenedSource>();
        for (const [bundleName, bundle] of Object.entries(state.lock.bundles)) {
            if (!result.has(bundleName)) result.set(bundleName, await this.open(bundle.source, "lock"));
        }
        return result;
    }

    warnIfNewer(): void {
        for (const { spec, manifest } of this.opened.values()) {
            const notice = checkManifestVersion(manifest);
            if (notice) {
                warnNewerManifest(notice.manifestVersion, notice.supportedVersion, notice.updateCommand, spec);
            }
        }
    }

    async close(): Promise<void> {
        for (const source of this.sources) await closeSource(source);
    }
}
