import type { Bundle, Manifest } from "@/types/index.js";
import { bundleSupportsPlatform, filterBundlesByPlatform, getBundlePlatforms } from "@/types/index.js";

const claudeBundle: Bundle = {
    name: "docs",
    version: "1.0.0",
    description: "Claude Code bundle",
    default: false,
    platforms: ["claude-code"],
    items: [],
};

const unrestrictedBundle: Bundle = {
    // No platforms field — supports every platform.
    name: "legacy",
    version: "1.0.0",
    description: "Legacy",
    default: false,
    items: [],
};

describe("getBundlePlatforms", () => {
    it("returns declared platforms", () => {
        expect(getBundlePlatforms(claudeBundle)).toEqual(["claude-code"]);
    });

    it("defaults to all platforms when platforms field is missing", () => {
        expect(getBundlePlatforms(unrestrictedBundle)).toEqual(["claude-code"]);
    });

    it("defaults to all platforms when platforms is an empty array", () => {
        const bundle: Bundle = { ...claudeBundle, platforms: [] };
        expect(getBundlePlatforms(bundle)).toEqual(["claude-code"]);
    });
});

describe("bundleSupportsPlatform", () => {
    it("returns true for declared platform", () => {
        expect(bundleSupportsPlatform(claudeBundle, "claude-code")).toBe(true);
    });

    it("treats a bundle without platforms as supporting every platform", () => {
        expect(bundleSupportsPlatform(unrestrictedBundle, "claude-code")).toBe(true);
    });
});

describe("filterBundlesByPlatform", () => {
    const manifest: Manifest = {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            docs: claudeBundle,
            legacy: unrestrictedBundle,
        },
    };

    it("includes platform-compatible bundles", () => {
        const claude = filterBundlesByPlatform(manifest, "claude-code");
        expect(claude.map((b) => b.name).sort()).toEqual(["docs", "legacy"]);
    });
});
