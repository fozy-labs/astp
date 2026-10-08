import type { Bundle, Manifest, Platform } from "./index.js";
import { ALL_PLATFORMS } from "./index.js";

/**
 * Returns the platforms a bundle supports. A bundle without the field
 * supports every platform.
 */
export function getBundlePlatforms(bundle: Bundle): Platform[] {
    if (!bundle.platforms || bundle.platforms.length === 0) {
        return [...ALL_PLATFORMS];
    }
    return [...bundle.platforms];
}

export function bundleSupportsPlatform(bundle: Bundle, platform: Platform): boolean {
    return getBundlePlatforms(bundle).includes(platform);
}

export function filterBundlesByPlatform(manifest: Manifest, platform: Platform): Bundle[] {
    return Object.values(manifest.bundles).filter((bundle) => bundleSupportsPlatform(bundle, platform));
}
