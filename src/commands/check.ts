import { compareVersions, fetchManifest, scanInstalled } from "@/core/index.js";
import type { InstallTargetType } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { selectTarget, showCheckReport, showInfo, spinner } from "@/ui/prompts.js";

export interface CheckOptions {
    target?: InstallTargetType;
}

export async function executeCheck(options: CheckOptions): Promise<void> {
    const target = options.target ? resolveTarget(options.target) : await selectTarget();

    const s = spinner();
    s.start("Scanning installed files...");
    const installed = await scanInstalled(target.rootDir);
    s.stop("Scan complete.");

    if (installed.length === 0) {
        showInfo("No astp-managed files found.");
        return;
    }

    s.start("Fetching remote manifest...");
    const manifest = await fetchManifest();
    s.stop("Manifest fetched.");

    const report = compareVersions(installed, manifest);
    showCheckReport(report);
}
