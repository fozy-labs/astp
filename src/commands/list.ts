import fs from "node:fs/promises";
import path from "node:path";

import {
    assertBundleSources,
    DEFAULT_SOURCE,
    downloadBundle,
    groupTemplateItems,
    loadInstalled,
    readUnitBlockFiles,
    readUnitDescription,
    resolveBundle,
    validateUnitTargets,
} from "@/core/index.js";
import type { InstalledBundle, InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { filterBundlesByPlatform, resolveTarget } from "@/types/index.js";
import { selectPlatform, selectTarget, spinner } from "@/ui/prompts.js";

import { Sources } from "./sources.js";

export interface ListOptions {
    bundle?: string;
    source?: string;
    json?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeList(options: ListOptions): Promise<void> {
    if (options.json && !options.target) throw new Error("--json requires --target");

    const platform: Platform = options.platform ?? (await selectPlatform());
    const target = options.target ? resolveTarget(platform, options.target) : await selectTarget(platform);
    const installedState = await loadInstalled(target.rootDir);
    const sources = new Sources(target);
    try {
        await list(options, platform, target, installedState, sources);
    } finally {
        await sources.close();
    }
}

async function list(
    options: ListOptions,
    platform: Platform,
    target: InstallTarget,
    installedState: Awaited<ReturnType<typeof loadInstalled>>,
    sources: Sources,
): Promise<void> {
    const s = spinner();
    const lock = installedState.lock;
    const fromCli = options.source !== undefined;
    const installedOf = (name: string): InstalledBundle | undefined =>
        installedState.bundles.find((entry) => entry.bundleName === name);
    if (!options.json) s.start("Fetching manifest...");
    const listing =
        options.bundle && !fromCli && installedOf(options.bundle)
            ? (await sources.openInstalled([installedOf(options.bundle)!], lock)).get(options.bundle)!
            : await sources.open(options.source ?? DEFAULT_SOURCE, fromCli ? "cli" : "lock");
    const installedSources =
        options.bundle || fromCli ? new Map() : await sources.openInstalled(installedState.bundles, lock);
    if (!options.json) {
        s.stop("Manifest fetched.");
        sources.warnIfNewer();
    }
    const manifest = listing.manifest;

    if (!options.bundle) {
        const available = filterBundlesByPlatform(manifest, platform);
        const names = new Set([
            ...available.map((bundle) => bundle.name),
            ...installedState.bundles.map((bundle) => bundle.bundleName),
        ]);
        const bundles = [...names].sort().map((name) => {
            const entry = installedSources.get(name) ?? listing;
            const bundle = entry.manifest.bundles[name];
            const installed = installedOf(name);
            const total = bundle ? groupTemplateItems(bundle, platform).length : (installed?.units.length ?? 0);
            return {
                name,
                description: bundle?.description ?? null,
                ...(bundle?.["use-when"] ? { "use-when": bundle["use-when"] } : {}),
                version: bundle?.version ?? null,
                installedVersion: installed?.version || null,
                units: { installed: installed?.units.length ?? 0, total },
                source: bundle ? entry.spec : (lock?.bundles[name]?.source ?? entry.spec),
            };
        });
        if (options.json) {
            process.stdout.write(`${JSON.stringify({ target: target.rootDir, bundles }, null, 2)}\n`);
        } else {
            const sourceWidth = Math.max(8, ...bundles.map((bundle) => bundle.source.length + 2));
            const lines = [
                `Name            Available   Installed   Units       ${"Source".padEnd(sourceWidth)}Description`,
            ];
            for (const bundle of bundles) {
                lines.push(
                    `${bundle.name.padEnd(16)}${(bundle.version ?? "—").padEnd(12)}${(
                        bundle.installedVersion ?? "—"
                    ).padEnd(12)}${`${bundle.units.installed}/${bundle.units.total}`.padEnd(12)}${bundle.source.padEnd(
                        sourceWidth,
                    )}${formatListedDescription([], bundle.description, bundle["use-when"])}`,
                );
            }
            process.stdout.write(`${lines.join("\n")}\n`);
        }
        return;
    }

    const installed = installedOf(options.bundle);
    const manifestBundle = manifest.bundles[options.bundle];
    if (!manifestBundle) {
        if (!installed) resolveBundle(manifest, options.bundle);
        const listed = installed!.units.map((unit) => ({
            name: path.posix.basename(unit.relativePath),
            path: unit.relativePath,
            kind: unit.kind,
            status: unit.origin === "legacy" ? "legacy" : "removed",
            description: null,
        }));
        const output = {
            bundle: options.bundle,
            source: listing.spec,
            version: null,
            installedVersion: installed!.version || null,
            units: listed,
        };
        if (options.json) {
            process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        } else {
            const lines = ["Name                    Status       Description"];
            for (const unit of listed) {
                lines.push(`${unit.name.padEnd(24)}${unit.status.padEnd(13)}`);
            }
            process.stdout.write(`${lines.join("\n")}\n`);
        }
        return;
    }

    const bundle = manifestBundle;
    const units = groupTemplateItems(bundle, platform);
    validateUnitTargets(target.rootDir, units);
    if (!options.json) s.start(`Downloading ${bundle.name}...`);
    const tempDir = await downloadBundle(listing.source, bundle, units);
    try {
        await assertBundleSources(tempDir, bundle.name, units);
        if (!options.json) s.stop(`Downloaded ${bundle.name}.`);
        const installedByPath = new Map(
            installed?.units.map((unit) => [`${unit.kind}\0${unit.relativePath}`, unit]) ?? [],
        );
        const declined = new Set(installed?.declined ?? []);
        const listed = await Promise.all(
            units.map(async (unit) => {
                const current = installedByPath.get(`${unit.kind}\0${unit.relativePath}`);
                const description = await readUnitDescription(tempDir, unit);
                const status = !installed
                    ? "available"
                    : current
                      ? current.origin === "legacy"
                          ? "legacy"
                          : current.state === "unmodified"
                            ? "installed"
                            : current.state
                      : declined.has(unit.relativePath)
                        ? "declined"
                        : "new";
                const lockUnit = installedState.lock.bundles[bundle.name]?.units[unit.relativePath];
                const blocks = [...(await readUnitBlockFiles(tempDir, unit, platform))].flatMap(([fileTarget, file]) =>
                    file.blocks.map((block) => {
                        const key = `${fileTarget}#${block.name}`;
                        const blockStatus =
                            lockUnit?.blocks && key in lockUnit.blocks
                                ? "selected"
                                : lockUnit?.declinedBlocks?.includes(key)
                                  ? "declined"
                                  : "new";
                        return {
                            name: block.name,
                            key,
                            status: blockStatus,
                            description: block.description,
                            ...(block.useWhen ? { "use-when": block.useWhen } : {}),
                            optional: block.optional,
                            required: block.required,
                            ...(block.labels ? { labels: block.labels } : {}),
                        };
                    }),
                );
                return {
                    name: path.posix.basename(unit.relativePath),
                    path: unit.relativePath,
                    kind: unit.kind,
                    status,
                    description,
                    ...(unit.optional !== undefined ? { optional: unit.optional } : {}),
                    ...(unit.labels ? { labels: unit.labels } : {}),
                    ...(blocks.length > 0 ? { blocks } : {}),
                };
            }),
        );
        for (const current of installed?.units ?? []) {
            if (units.some((unit) => unit.relativePath === current.relativePath && unit.kind === current.kind))
                continue;
            listed.push({
                name: path.posix.basename(current.relativePath),
                path: current.relativePath,
                kind: current.kind,
                status: "removed",
                description: null,
            });
        }
        const output = {
            bundle: bundle.name,
            source: listing.spec,
            version: bundle.version ?? null,
            installedVersion: installed?.version || null,
            units: listed,
        };
        if (options.json) {
            process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        } else {
            const lines = ["Name                    Status       Description"];
            for (const unit of listed) {
                const unitDesc = formatListedDescription(
                    [...(unit.optional ? ["optional"] : []), ...(unit.labels ?? [])],
                    unit.description,
                );
                lines.push(`${unit.name.padEnd(24)}${unit.status.padEnd(13)}${unitDesc}`);
                for (const block of unit.blocks ?? []) {
                    const blockDesc = formatListedDescription(
                        [
                            ...(block.required ? ["required"] : block.optional ? ["optional"] : []),
                            ...(block.labels ?? []),
                        ],
                        block.description,
                        block["use-when"],
                    );
                    lines.push(`${`  ${block.name}`.padEnd(24)}${block.status.padEnd(13)}${blockDesc}`);
                }
            }
            process.stdout.write(`${lines.join("\n")}\n`);
        }
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

function formatListedDescription(tags: string[], description: string | null, useWhen?: string): string {
    const body = [description, useWhen ? `Use when: ${useWhen}` : null].filter(Boolean).join(" — ");
    if (tags.length === 0) return body;
    return body ? `(${tags.join(", ")}) ${body}` : tags.join(", ");
}
