import { detectModified, removeBundle, scanInstalled } from "@/core/index.js";
import type { InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
import {
    confirmDelete,
    selectInstalledBundles,
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    spinner,
    warnLegacySkills,
    warnModified,
} from "@/ui/prompts.js";

export interface DeleteOptions {
    bundle?: string;
    force?: boolean;
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeDelete(options: DeleteOptions): Promise<void> {
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

    const selectedBundles = options.bundle
        ? [resolveInstalledBundle(installed, options.bundle)]
        : await selectInstalledBundles(installed);

    const confirmed = await confirmDelete(selectedBundles, target, options.force ?? false);
    if (!confirmed) {
        return;
    }

    let removedFiles = 0;
    let removedSkills = 0;
    let skippedFiles = 0;
    let skippedSkills = 0;

    for (const bundle of selectedBundles) {
        const modifiedFiles = await detectModified(bundle, target.rootDir);
        const modified = modifiedFiles.filter((file) => file.state === "modified");
        const legacy = modifiedFiles
            .filter((file) => file.state === "legacy")
            .map((file) => ({ bundleName: bundle.bundleName, targetPath: file.targetPath }));

        if (modified.length > 0 && !options.force) {
            warnModified(modified);
        }
        if (legacy.length > 0 && !options.force) warnLegacySkills(legacy);

        s.start(`Deleting ${bundle.bundleName}...`);
        const result = await removeBundle(bundle, target.rootDir, options.force ?? false);
        s.stop(`Deleted ${bundle.bundleName}.`);

        const unitKinds = new Map(bundle.units.map((unit) => [unit.relativePath, unit.kind]));
        removedSkills += result.removed.filter((relativePath) => unitKinds.get(relativePath) === "skill").length;
        removedFiles += result.removed.filter((relativePath) => unitKinds.get(relativePath) === "file").length;
        skippedSkills += result.skipped.filter((status) => status.kind === "skill").length;
        skippedFiles += result.skipped.filter((status) => status.kind === "file").length;
    }

    if (removedFiles + removedSkills === 0 && skippedFiles + skippedSkills > 0) {
        const skipped = describeUnitCounts(skippedFiles, skippedSkills);
        showInfo(`No files or skills deleted, skipped ${skipped}.`);
        return;
    }

    const removed = describeUnitCounts(removedFiles, removedSkills);
    const skipped = describeUnitCounts(skippedFiles, skippedSkills);
    showSuccess(`Deleted ${removed}${skippedFiles + skippedSkills > 0 ? `, skipped ${skipped}` : ""}`);
}

function resolveInstalledBundle(installed: Awaited<ReturnType<typeof scanInstalled>>, bundleName: string) {
    const bundle = installed.find((entry) => entry.bundleName === bundleName);
    if (!bundle) {
        const available = installed.map((entry) => entry.bundleName).join(", ");
        throw new Error(`Installed bundle '${bundleName}' not found. Available: ${available}`);
    }

    return bundle;
}
