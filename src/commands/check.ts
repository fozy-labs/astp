import { compareVersions, groupTemplateItems, loadInstalled } from "@/core/index.js";
import type { InstallTargetType, Platform } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { selectPlatform, selectTarget, showCheckReport, showInfo, spinner } from "@/ui/prompts.js";

import { mergeReports, Sources } from "./sources.js";

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

    const sources = new Sources(target);
    try {
        s.start("Fetching manifests...");
        const opened = await sources.openInstalled(installed.bundles, installed.lock);
        s.stop("Manifests fetched.");
        sources.warnIfNewer();

        const reports = [...new Set(opened.values())].map((entry) =>
            compareVersions(
                installed.bundles.filter((bundle) => opened.get(bundle.bundleName) === entry),
                entry.manifest,
                platform,
            ),
        );
        const changed = installed.bundles.flatMap((bundle) => {
            const manifestBundle = opened.get(bundle.bundleName)!.manifest.bundles[bundle.bundleName];
            const manifestUnits = manifestBundle ? groupTemplateItems(manifestBundle, platform) : [];
            return bundle.units
                .filter((unit) => unit.origin === "lock" && (unit.state === "modified" || unit.blocks?.dirty))
                .map((unit) => {
                    const inManifest = manifestUnits.some(
                        (candidate) => candidate.relativePath === unit.relativePath && candidate.kind === unit.kind,
                    );
                    const force: "replace" | "delete" | null = !manifestBundle
                        ? null
                        : inManifest
                          ? unit.state === "modified"
                              ? "replace"
                              : null
                          : "delete";
                    return { path: unit.relativePath, modified: unit.state === "modified", force };
                });
        });
        showCheckReport(mergeReports(reports), target.type, changed);
    } finally {
        await sources.close();
    }
}
