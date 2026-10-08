import {
    compareVersions,
    downloadBundle,
    fetchManifest,
    findBlockedUnits,
    groupTemplateItems,
    installFile,
    installSkill,
    removeUnits,
    scanInstalled,
} from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type { InstallTarget, InstallTargetType, InstalledUnit, Platform } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import {
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    showUpdateReport,
    spinner,
    warnKeptRemoved,
    warnLegacySkills,
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

    const s = spinner();
    s.start("Scanning installed files...");
    const installed = await scanInstalled(target.rootDir);
    s.stop("Scan complete.");

    if (installed.length === 0) {
        showInfo("No astp-managed files found.");
        return;
    }

    s.start("Fetching manifest...");
    const manifest = await fetchManifest();
    s.stop("Manifest fetched.");

    const report = compareVersions(installed, manifest);
    const legacySkills = report.legacySkills;
    const migratableLegacy = legacySkills.filter((skill) => skill.inManifest);
    const unavailableLegacy = legacySkills.filter((skill) => !skill.inManifest);

    if (!options.force && migratableLegacy.length > 0) {
        warnLegacySkills(migratableLegacy);
    }
    if (unavailableLegacy.length > 0) warnLegacySkills(unavailableLegacy, false);

    if (report.updates.length === 0 && (!options.force || migratableLegacy.length === 0)) {
        if (legacySkills.length === 0) showInfo("All bundles up to date.");
        return;
    }

    let skippedFiles = 0;
    let skippedSkills = 0;
    const legacyPathsByBundle = new Map<string, Set<string>>();
    const migratablePathsByBundle = new Map<string, Set<string>>();
    for (const skill of legacySkills) {
        const paths = legacyPathsByBundle.get(skill.bundleName) ?? new Set<string>();
        paths.add(skill.targetPath);
        legacyPathsByBundle.set(skill.bundleName, paths);
    }
    for (const skill of migratableLegacy) {
        const paths = migratablePathsByBundle.get(skill.bundleName) ?? new Set<string>();
        paths.add(skill.targetPath);
        migratablePathsByBundle.set(skill.bundleName, paths);
    }

    const plan: Array<{ bundleName: string; units: TemplateUnit[]; orphans: InstalledUnit[] }> = [];
    for (const update of report.updates) {
        const bundleName = update.bundleName;
        const installedBundle = installed.find((bundle) => bundle.bundleName === bundleName);
        const manifestBundle = manifest.bundles[bundleName];
        if (!manifestBundle) continue;

        const legacyPaths = legacyPathsByBundle.get(bundleName) ?? new Set<string>();
        const units = groupTemplateItems(manifestBundle.items);
        const statuses = await findBlockedUnits(target.rootDir, bundleName, units);
        const modified = statuses.filter(
            (status) => status.state === "modified" && !legacyPaths.has(status.targetPath),
        );
        if (!options.force && modified.length > 0) {
            warnModified(modified);
            skippedFiles += modified.filter((status) => status.kind === "file").length;
            skippedSkills += modified.filter((status) => status.kind === "skill").length;
        }

        if (!options.force) skippedSkills += legacyPaths.size;

        const skippedPaths = new Set([
            ...(options.force ? [] : modified.map((status) => status.targetPath)),
            ...(options.force ? [] : legacyPaths),
        ]);
        const installUnits = units.filter(
            (unit) => options.force || !skippedPaths.has(unit.relativePath),
        );
        const manifestPaths = new Set(units.map((unit) => `${unit.kind}\0${unit.relativePath}`));
        const orphans =
            installedBundle?.units.filter((unit) => !manifestPaths.has(`${unit.kind}\0${unit.relativePath}`)) ?? [];
        plan.push({ bundleName, units: installUnits, orphans });
    }

    if (options.force) {
        const versionUpdates = new Set(report.updates.map((update) => update.bundleName));
        for (const [bundleName, legacyPaths] of migratablePathsByBundle) {
            if (versionUpdates.has(bundleName)) continue;
            const bundle = manifest.bundles[bundleName];
            if (!bundle) continue;
            const units = groupTemplateItems(bundle.items).filter(
                (unit) => unit.kind === "skill" && legacyPaths.has(unit.relativePath),
            );
            if (units.length > 0) plan.push({ bundleName, units, orphans: [] });
        }
    }

    if (report.updates.length > 0) showUpdateReport(report);

    let updatedFiles = 0;
    let updatedSkills = 0;
    let removedFiles = 0;
    let removedSkills = 0;
    for (const plannedBundle of plan) {
        const bundleName = plannedBundle.bundleName;
        const manifestBundle = manifest.bundles[bundleName];
        if (!manifestBundle) continue;

        s.start(`Downloading ${bundleName}...`);
        const tempDir = await downloadBundle(manifest.repository, bundleName);
        s.stop(`Downloaded ${bundleName}.`);
        s.start(`Installing ${bundleName}...`);
        for (const unit of plannedBundle.units) {
            const metadata = { source: manifest.repository, bundle: bundleName, version: manifestBundle.version };
            if (unit.kind === "skill") {
                await installSkill(tempDir, unit, target, metadata);
                updatedSkills++;
            } else {
                await installFile(tempDir, unit.item, target, metadata);
                updatedFiles++;
            }
        }
        if (plannedBundle.orphans.length > 0) {
            const result = await removeUnits(plannedBundle.orphans, target.rootDir, options.force);
            if (result.skipped.length > 0) warnKeptRemoved(result.skipped);
            removedFiles += result.removed.filter((status) => status.kind === "file").length;
            removedSkills += result.removed.filter((status) => status.kind === "skill").length;
            skippedFiles += result.skipped.filter((status) => status.kind === "file").length;
            skippedSkills += result.skipped.filter((status) => status.kind === "skill").length;
        }
        s.stop(`Installed ${bundleName}.`);
    }

    const updatedCounts = describeUnitCounts(updatedFiles, updatedSkills);
    const skippedCounts = describeUnitCounts(skippedFiles, skippedSkills);
    const removedCounts = describeUnitCounts(removedFiles, removedSkills);
    showSuccess(
        `Updated ${updatedCounts}${skippedFiles + skippedSkills > 0 ? `, skipped ${skippedCounts}` : ""}${
            removedFiles + removedSkills > 0 ? `, removed ${removedCounts}` : ""
        }`,
    );
}
