import {
    downloadBundle,
    fetchManifest,
    groupTemplateItems,
    installFile,
    installSkill,
    resolveBundle,
} from "@/core/index.js";
import type { Bundle, InstallTarget, InstallTargetType, Platform } from "@/types/index.js";
import { bundleSupportsPlatform, getBundlePlatforms, resolveTarget } from "@/types/index.js";
import { describeUnitCounts } from "@/ui/format.js";
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
                `Bundle '${bundle.name}' does not support platform '${platform}'. Supported: ${getBundlePlatforms(bundle).join(", ")}`,
            );
        }
        selectedBundles = [bundle];
    } else {
        selectedBundles = await selectBundles(manifest, platform);
    }

    const confirmed = await confirmInstall(selectedBundles, target);
    if (!confirmed) return;

    let fileCount = 0;
    let skillCount = 0;
    for (const bundle of selectedBundles) {
        s.start(`Downloading ${bundle.name}...`);
        const tempDir = await downloadBundle(manifest.repository, bundle.name);
        s.stop(`Downloaded ${bundle.name}.`);

        s.start(`Installing ${bundle.name}...`);
        for (const unit of groupTemplateItems(bundle.items)) {
            const metadata = {
                source: manifest.repository,
                bundle: bundle.name,
                version: bundle.version,
            };
            if (unit.kind === "skill") {
                await installSkill(tempDir, unit, target, metadata);
                skillCount++;
            } else {
                await installFile(tempDir, unit.item, target, metadata);
                fileCount++;
            }
        }
        s.stop(`Installed ${bundle.name}.`);
    }

    showSuccess(`Installed ${describeUnitCounts(fileCount, skillCount)} to ${target.rootDir}`);
}
