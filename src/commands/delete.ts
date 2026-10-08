import fs from "node:fs/promises";
import path from "node:path";

import {
    assertInsideRoot,
    extractAstpMetadata,
    loadInstalled,
    removeEmptyDirectories,
    resolveUnitPaths,
    writeLock,
} from "@/core/index.js";
import type {
    FileStatus,
    InstalledBundle,
    InstalledUnit,
    InstallTarget,
    InstallTargetType,
    Platform,
} from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import {
    confirmDelete,
    isInteractive,
    selectInstalledBundles,
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    spinner,
    warnKeptRemoved,
} from "@/ui/prompts.js";

export interface DeleteOptions {
    bundle?: string;
    skills?: string[];
    force?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeDelete(options: DeleteOptions): Promise<void> {
    if (options.skills?.length && !options.bundle) throw new Error("--skill requires a bundle name");
    const platform: Platform = options.platform ?? (await selectPlatform());
    const target: InstallTarget = options.target
        ? resolveTarget(platform, options.target)
        : await selectTarget(platform);
    const installedState = await loadInstalled(target.rootDir);
    if (installedState.bundles.length === 0) {
        showInfo("No astp-managed files found.");
        return;
    }

    const selectedBundles = options.bundle
        ? [resolveInstalledBundle(installedState.bundles, options.bundle)]
        : await selectInstalledBundles(installedState.bundles);
    const targets = selectedBundles.map((bundle) => {
        if (!options.skills?.length) return bundle;
        const paths = resolveUnitPaths(options.skills, bundle.units, bundle.bundleName);
        return { ...bundle, units: bundle.units.filter((unit) => paths.has(unit.relativePath)) };
    });
    if (isInteractive() && !(await confirmDelete(targets, target, options.force ?? false))) return;

    const removed: FileStatus[] = [];
    const kept: FileStatus[] = [];
    const s = spinner();
    for (const bundle of targets) {
        s.start(`Deleting ${bundle.bundleName}...`);
        const installedBundle = installedState.bundles.find((entry) => entry.bundleName === bundle.bundleName);
        const removedPaths = new Set<string>();
        let lockBundle = installedState.lock.bundles[bundle.bundleName];
        if (!lockBundle) {
            lockBundle = {
                source: await readLegacySource(target.rootDir, bundle.units),
                declined: [],
                units: {},
            };
            installedState.lock.bundles[bundle.bundleName] = lockBundle;
        }
        for (const unit of bundle.units) {
            if (unit.state === "modified" && !options.force) {
                kept.push(toStatus(unit));
                continue;
            }
            const unitPath = path.join(target.rootDir, unit.relativePath);
            await assertInsideRoot(target.rootDir, unit.relativePath);
            await fs.rm(unitPath, { recursive: true, force: true });
            await removeEmptyDirectories(path.dirname(unitPath), target.rootDir);
            delete lockBundle.units[unit.relativePath];
            lockBundle.declined.push(unit.relativePath);
            removedPaths.add(`${unit.kind}\0${unit.relativePath}`);
            removed.push(toStatus(unit));
        }
        lockBundle.declined = [...new Set(lockBundle.declined)].sort();
        const legacyRemaining = (installedBundle?.units ?? []).some(
            (unit) => unit.origin === "legacy" && !removedPaths.has(`${unit.kind}\0${unit.relativePath}`),
        );
        if (Object.keys(lockBundle.units).length === 0 && !legacyRemaining) {
            delete installedState.lock.bundles[bundle.bundleName];
        }
        await writeLock(target.rootDir, installedState.lock);
        s.stop(`Deleted ${bundle.bundleName}.`);
    }
    if (kept.length > 0) warnKeptRemoved(kept);
    if (removed.length === 0 && kept.length > 0) {
        showInfo(`No files or skills deleted, kept ${countStatuses(kept)}.`);
        return;
    }
    showSuccess(`Deleted ${countStatuses(removed)}${kept.length ? `, kept ${countStatuses(kept)}` : ""}`);
}

function resolveInstalledBundle(installed: InstalledBundle[], bundleName: string): InstalledBundle {
    const bundle = installed.find((entry) => entry.bundleName === bundleName);
    if (!bundle) {
        throw new Error(
            `Installed bundle '${bundleName}' not found. Available: ${installed.map((entry) => entry.bundleName).join(", ")}`,
        );
    }
    return bundle;
}

async function readLegacySource(rootDir: string, units: InstalledUnit[]): Promise<string> {
    const legacy = units.find((unit) => unit.origin === "legacy");
    if (!legacy) return "";
    const metadataPath =
        legacy.kind === "skill"
            ? path.join(rootDir, legacy.relativePath, "SKILL.md")
            : path.join(rootDir, legacy.relativePath);
    try {
        return extractAstpMetadata(await fs.readFile(metadataPath, "utf8"))?.source ?? "";
    } catch {
        return "";
    }
}

function toStatus(unit: InstalledUnit): FileStatus {
    return {
        targetPath: unit.relativePath,
        kind: unit.kind,
        state: unit.origin === "legacy" ? "legacy" : unit.state,
    };
}

function countStatuses(statuses: FileStatus[]): string {
    return describeUnitCounts(
        statuses.filter((status) => status.kind === "file").length,
        statuses.filter((status) => status.kind === "skill").length,
    );
}
