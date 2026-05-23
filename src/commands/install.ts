import { downloadBundle, fetchManifest, installFile, resolveBundle } from "@/core/index.js";
import type { Bundle, InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { bundleSupportsPlatform, resolveTarget } from "@/types/index.js";
import { confirmInstall, selectBundles, selectPlatform, selectTarget, showSuccess, spinner } from "@/ui/prompts.js";

export interface InstallOptions {
    bundle?: string;
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeInstall(options: InstallOptions): Promise<void> {
    const platform: Platform = options.platform ?? (await selectPlatform());
    const target: InstallTarget = options.target
        ? resolveTarget(platform, options.target)
        : await selectTarget(platform);

    const s = spinner();
    s.start("Fetching manifest...");
    const manifest = await fetchManifest();
    s.stop("Manifest fetched.");

    let selectedBundles: Bundle[];
    if (options.bundle) {
        const bundle = resolveBundle(manifest, options.bundle);
        if (!bundleSupportsPlatform(bundle, platform)) {
            throw new Error(
                `Bundle '${bundle.name}' does not support platform '${platform}'. Supported: ${(bundle.platforms ?? ["vscode"]).join(", ")}`,
            );
        }
        selectedBundles = [bundle];
    } else {
        selectedBundles = await selectBundles(manifest, platform);
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
