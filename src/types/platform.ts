import type { Bundle, Manifest, Platform, PlatformFilter, TemplateItem } from "./index.js";

export function supportsPlatform(platforms: readonly PlatformFilter[] | undefined, platform: Platform): boolean {
    if (!platforms || platforms.length === 0) return true;
    const included = platforms.filter((entry) => !entry.startsWith("!"));
    return (included.length === 0 || included.includes(platform)) && !platforms.includes(`!${platform}`);
}

/** Returns the concrete platforms a bundle supports after applying exclusions. */
export function getBundlePlatforms(bundle: Bundle): Platform[] {
    return ALL_PLATFORMS.filter((platform) => bundleSupportsPlatform(bundle, platform));
}

export function bundleSupportsPlatform(bundle: Bundle, platform: Platform): boolean {
    return supportsPlatform(bundle.platforms, platform);
}

export function itemSupportsPlatform(item: TemplateItem, platform: Platform): boolean {
    return supportsPlatform(item.platforms, platform);
}

export function resolveItemTarget(item: TemplateItem, platform: Platform): string {
    return item.targets?.[platform] ?? item.target;
}

export function filterBundlesByPlatform(manifest: Manifest, platform: Platform): Bundle[] {
    return Object.values(manifest.bundles).filter((bundle) => bundleSupportsPlatform(bundle, platform));
}

export const ALL_PLATFORMS = ["claude-code", "kimi-code"] as const satisfies readonly Platform[];
