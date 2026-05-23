import type { Bundle, Manifest, Platform } from "./index.js";

const DEFAULT_PLATFORMS: readonly Platform[] = ["vscode"] as const;

/**
 * Returns the platforms a bundle supports. Bundles authored before platform support
 * omit the field; treat those as VS Code–only to preserve legacy behavior.
 */
export function getBundlePlatforms(bundle: Bundle): Platform[] {
    if (!bundle.platforms || bundle.platforms.length === 0) {
        return [...DEFAULT_PLATFORMS];
    }
    return [...bundle.platforms];
}

export function bundleSupportsPlatform(bundle: Bundle, platform: Platform): boolean {
    return getBundlePlatforms(bundle).includes(platform);
}

export function filterBundlesByPlatform(manifest: Manifest, platform: Platform): Bundle[] {
    return Object.values(manifest.bundles).filter((bundle) => bundleSupportsPlatform(bundle, platform));
}
