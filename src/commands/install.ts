import { downloadBundle, fetchManifest, installFile, resolveBundle } from "@/core/index.js";
import type { Bundle, InstallTarget, InstallTargetType } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { confirmInstall, selectBundles, selectTarget, showSuccess, spinner } from "@/ui/prompts.js";

export interface InstallOptions {
    bundle?: string;
    target?: InstallTargetType;
}

export async function executeInstall(options: InstallOptions): Promise<void> {
    const target: InstallTarget = options.target ? resolveTarget(options.target) : await selectTarget();

    const s = spinner();
    s.start("Fetching manifest...");
    const manifest = await fetchManifest();
    s.stop("Manifest fetched.");

    let selectedBundles: Bundle[];
    if (options.bundle) {
        selectedBundles = [resolveBundle(manifest, options.bundle)];
    } else {
        selectedBundles = await selectBundles(manifest);
    }

    const confirmed = await confirmInstall(selectedBundles, target);
    if (!confirmed) return;

    let installedCount = 0;
    for (const bundle of selectedBundles) {
        s.start(`Downloading ${bundle.name}...`);
        const tempDir = await downloadBundle(manifest.repository, bundle.name);
        s.stop(`Downloaded ${bundle.name}.`);

        s.start(`Installing ${bundle.name}...`);
        for (const item of bundle.items) {
            await installFile(tempDir, item, target, {
                source: manifest.repository,
                bundle: bundle.name,
                version: bundle.version,
            });
            installedCount++;
        }
        s.stop(`Installed ${bundle.name}.`);
    }

    showSuccess(`Installed ${installedCount} file${installedCount === 1 ? "" : "s"} to ${target.rootDir}`);
}
