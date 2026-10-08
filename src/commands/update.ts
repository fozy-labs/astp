import {
    compareVersions,
    detectModified,
    downloadBundle,
    fetchManifest,
    groupTemplateItems,
    installFile,
    installSkill,
    scanInstalled,
} from "@/core/index.js";
import type { TemplateUnit } from "@/core/units.js";
import type { InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import {
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    showUpdateReport,
    spinner,
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
    const migratableLegacy: typeof legacySkills = [];
    const unavailableLegacy: typeof legacySkills = [];
    for (const legacySkill of legacySkills) {
        const bundle = manifest.bundles[legacySkill.bundleName];
        const units = bundle ? groupTemplateItems(bundle.items) : [];
        const isAvailable = units.some((unit) => unit.kind === "skill" && unit.relativePath === legacySkill.targetPath);
        (isAvailable ? migratableLegacy : unavailableLegacy).push(legacySkill);
    }

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

    const plan: Array<{ bundleName: string; units: TemplateUnit[] }> = [];
    for (const update of report.updates) {
        const bundleName = update.bundleName;
        const installedBundle = installed.find((bundle) => bundle.bundleName === bundleName);
        const manifestBundle = manifest.bundles[bundleName];
        if (!manifestBundle) continue;

        const statuses = installedBundle ? await detectModified(installedBundle, target.rootDir) : [];
        const modified = statuses.filter((status) => status.state === "modified");
        if (!options.force && modified.length > 0) {
            warnModified(modified);
            skippedFiles += modified.filter((status) => status.kind === "file").length;
            skippedSkills += modified.filter((status) => status.kind === "skill").length;
        }

        const legacyPaths = legacyPathsByBundle.get(bundleName) ?? new Set<string>();
        if (!options.force) skippedSkills += legacyPaths.size;

        const skippedPaths = new Set([
            ...(options.force ? [] : modified.map((status) => status.targetPath)),
            ...(options.force ? [] : legacyPaths),
        ]);
        const units = groupTemplateItems(manifestBundle.items).filter(
            (unit) => options.force || !skippedPaths.has(unit.relativePath),
        );
        plan.push({ bundleName, units });
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
            if (units.length > 0) plan.push({ bundleName, units });
        }
    }

    if (report.updates.length > 0) showUpdateReport(report);

    let updatedFiles = 0;
    let updatedSkills = 0;
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
        s.stop(`Installed ${bundleName}.`);
    }

    const updatedCounts = describeUnitCounts(updatedFiles, updatedSkills);
    const skippedCounts = describeUnitCounts(skippedFiles, skippedSkills);
    showSuccess(`Updated ${updatedCounts}${skippedFiles + skippedSkills > 0 ? `, skipped ${skippedCounts}` : ""}`);
}
