import { detectModified, removeBundle, scanInstalled } from "@/core/index.js";
import type { InstallTarget, InstallTargetType } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    confirmDelete,
    selectInstalledBundles,
    selectTarget,
    showInfo,
    showSuccess,
    spinner,
    warnModified,
} from "@/ui/prompts.js";

export interface DeleteOptions {
    bundle?: string;
    force?: boolean;
    target?: InstallTargetType;
}

export async function executeDelete(options: DeleteOptions): Promise<void> {
    const target: InstallTarget = options.target ? resolveTarget(options.target) : await selectTarget();

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

    let removedCount = 0;
    let skippedCount = 0;

    for (const bundle of selectedBundles) {
        const modifiedFiles = await detectModified(bundle, target.rootDir);
        const modified = modifiedFiles.filter((file) => file.state === "modified");

        if (modified.length > 0 && !options.force) {
            warnModified(modified);
        }

        s.start(`Deleting ${bundle.bundleName}...`);
        const result = await removeBundle(bundle, target.rootDir, options.force ?? false);
        s.stop(`Deleted ${bundle.bundleName}.`);

        removedCount += result.removed.length;
        skippedCount += result.skipped.length;
    }

    if (removedCount === 0 && skippedCount > 0) {
        showInfo(`No files deleted, skipped ${skippedCount} modified file${skippedCount === 1 ? "" : "s"}.`);
        return;
    }

    showSuccess(
        `Deleted ${removedCount} file${removedCount === 1 ? "" : "s"}${skippedCount > 0 ? `, skipped ${skippedCount} modified` : ""}`,
    );
}

function resolveInstalledBundle(installed: Awaited<ReturnType<typeof scanInstalled>>, bundleName: string) {
    const bundle = installed.find((entry) => entry.bundleName === bundleName);
    if (!bundle) {
        const available = installed.map((entry) => entry.bundleName).join(", ");
        throw new Error(`Installed bundle '${bundleName}' not found. Available: ${available}`);
    }

    return bundle;
}
