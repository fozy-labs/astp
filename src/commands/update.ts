import {
    compareVersions,
    detectModified,
    downloadBundle,
    fetchManifest,
    installFile,
    scanInstalled,
} from "@/core/index.js";
import type { InstallTarget, InstallTargetType } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { selectTarget, showInfo, showSuccess, showUpdateReport, spinner, warnModified } from "@/ui/prompts.js";

export interface UpdateOptions {
    force?: boolean;
    target?: InstallTargetType;
}

export async function executeUpdate(options: UpdateOptions): Promise<void> {
    const target: InstallTarget = options.target ? resolveTarget(options.target) : await selectTarget();

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

    if (report.updates.length === 0) {
        showInfo("All bundles up to date.");
        return;
    }

    showUpdateReport(report);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const update of report.updates) {
        const installedBundle = installed.find((b) => b.bundleName === update.bundleName);

        s.start(`Downloading ${update.bundleName}...`);
        const tempDir = await downloadBundle(manifest.repository, update.bundleName);
        s.stop(`Downloaded ${update.bundleName}.`);

        const modifiedFiles = installedBundle ? await detectModified(installedBundle, target.rootDir) : [];
        const modifiedPaths = new Set(modifiedFiles.filter((f) => f.state === "modified").map((f) => f.targetPath));

        if (modifiedPaths.size > 0 && !options.force) {
            warnModified(modifiedFiles.filter((f) => f.state === "modified"));
            skippedCount += modifiedPaths.size;
        }

        const manifestBundle = manifest.bundles[update.bundleName];

        s.start(`Installing ${update.bundleName}...`);
        for (const item of manifestBundle.items) {
            if (modifiedPaths.has(item.target) && !options.force) continue;

            await installFile(tempDir, item, target, {
                source: manifest.repository,
                bundle: update.bundleName,
                version: manifestBundle.version,
            });
            updatedCount++;
        }
        s.stop(`Installed ${update.bundleName}.`);
    }

    showSuccess(
        `Updated ${updatedCount} file${updatedCount === 1 ? "" : "s"}${skippedCount > 0 ? `, skipped ${skippedCount} modified` : ""}`,
    );
}
