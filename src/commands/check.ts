import { compareVersions, fetchManifest, loadInstalled } from "@/core/index.js";
import type { InstallTargetType, Platform } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { selectPlatform, selectTarget, showCheckReport, showInfo, spinner } from "@/ui/prompts.js";

export interface CheckOptions {
    platform?: Platform;
    target?: InstallTargetType;
}

export async function executeCheck(options: CheckOptions): Promise<void> {
    const platform: Platform = options.platform ?? (await selectPlatform());
    const target = options.target ? resolveTarget(platform, options.target) : await selectTarget(platform);

    const s = spinner();
    s.start("Scanning installed files...");
    const installed = await loadInstalled(target.rootDir);
    s.stop("Scan complete.");

    if (installed.bundles.length === 0) {
        showInfo("No astp-managed files found.");
        return;
    }

    s.start("Fetching remote manifest...");
    const manifest = await fetchManifest();
    s.stop("Manifest fetched.");

    const report = compareVersions(installed.bundles, manifest);
    showCheckReport(report);
}
