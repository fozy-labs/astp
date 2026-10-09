import fs from "node:fs/promises";
import path from "node:path";

import {
    assertBundleSources,
    downloadBundle,
    fetchManifest,
    groupTemplateItems,
    loadInstalled,
    readDescription,
    readUnitBlockFiles,
    resolveBundle,
    validateUnitTargets,
} from "@/core/index.js";
import type { InstallTargetType, Platform } from "@/types/index.js";
import { filterBundlesByPlatform, resolveTarget } from "@/types/index.js";
import { selectPlatform, selectTarget, spinner } from "@/ui/prompts.js";

export interface ListOptions {
    bundle?: string;
    json?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeList(options: ListOptions): Promise<void> {
    if (options.json && !options.target) throw new Error("--json requires --target");

    const platform: Platform = options.platform ?? (await selectPlatform());
    const target = options.target ? resolveTarget(platform, options.target) : await selectTarget(platform);
    const installedState = await loadInstalled(target.rootDir);
    const s = spinner();
    if (!options.json) s.start("Fetching manifest...");
    const manifest = await fetchManifest();
    if (!options.json) s.stop("Manifest fetched.");

    if (!options.bundle) {
        const available = filterBundlesByPlatform(manifest, platform);
        const names = new Set([
            ...available.map((bundle) => bundle.name),
            ...installedState.bundles.map((bundle) => bundle.bundleName),
        ]);
        const bundles = [...names].sort().map((name) => {
            const bundle = manifest.bundles[name];
            const installed = installedState.bundles.find((entry) => entry.bundleName === name);
            const total = bundle ? groupTemplateItems(bundle.items).length : (installed?.units.length ?? 0);
            return {
                name,
                description: bundle?.description ?? null,
                version: bundle?.version ?? null,
                installedVersion: installed?.version || null,
                units: { installed: installed?.units.length ?? 0, total },
            };
        });
        if (options.json) {
            process.stdout.write(`${JSON.stringify({ target: target.rootDir, bundles }, null, 2)}\n`);
        } else {
            const lines = ["Name            Available   Installed   Units       Description"];
            for (const bundle of bundles) {
                lines.push(
                    `${bundle.name.padEnd(16)}${(bundle.version ?? "—").padEnd(12)}${(
                        bundle.installedVersion ?? "—"
                    ).padEnd(12)}${`${bundle.units.installed}/${bundle.units.total}`.padEnd(12)}${
                        bundle.description ?? ""
                    }`,
                );
            }
            process.stdout.write(`${lines.join("\n")}\n`);
        }
        return;
    }

    const installed = installedState.bundles.find((entry) => entry.bundleName === options.bundle);
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
            version: null,
            installedVersion: installed!.version || null,
            units: listed,
        };
        if (options.json) {
            process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        } else {
            const lines = ["Name                    Status       Description"];
            for (const unit of listed) {
                lines.push(`${unit.name.padEnd(24)}${unit.status.padEnd(13)}`.slice(0, 80));
            }
            process.stdout.write(`${lines.join("\n")}\n`);
        }
        return;
    }

    const bundle = manifestBundle;
    const units = groupTemplateItems(bundle.items);
    validateUnitTargets(target.rootDir, units);
    if (!options.json) s.start(`Downloading ${bundle.name}...`);
    const tempDir = await downloadBundle(manifest.repository, bundle.name);
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
                const descriptionItem =
                    unit.kind === "file"
                        ? unit.item
                        : unit.items.find((item) => item.target === path.posix.join(unit.relativePath, "SKILL.md"))!;
                const description = readDescription(
                    await fs.readFile(path.join(tempDir, descriptionItem.target), "utf8"),
                );
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
                const blocks = [...(await readUnitBlockFiles(tempDir, unit))].flatMap(([fileTarget, file]) =>
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
                            optional: block.optional,
                            required: block.required,
                        };
                    }),
                );
                return {
                    name: path.posix.basename(unit.relativePath),
                    path: unit.relativePath,
                    kind: unit.kind,
                    status,
                    description,
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
            version: bundle.version ?? null,
            installedVersion: installed?.version || null,
            units: listed,
        };
        if (options.json) {
            process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        } else {
            const lines = ["Name                    Status       Description"];
            for (const unit of listed) {
                const description = unit.description ?? "";
                lines.push(`${unit.name.padEnd(24)}${unit.status.padEnd(13)}${description}`.slice(0, 80));
            }
            process.stdout.write(`${lines.join("\n")}\n`);
        }
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}
