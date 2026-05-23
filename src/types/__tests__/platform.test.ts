import type { Bundle, Manifest } from "@/types/index.js";
import { bundleSupportsPlatform, filterBundlesByPlatform, getBundlePlatforms } from "@/types/index.js";

const vscodeBundle: Bundle = {
    name: "rdpi",
    version: "1.0.0",
    description: "VS Code only",
    default: false,
    platforms: ["vscode"],
    items: [],
};

const crossPlatformBundle: Bundle = {
    name: "fozy-labs",
    version: "1.0.0",
    description: "Both",
    default: false,
    platforms: ["vscode", "claude-code"],
    items: [],
};

const legacyBundle: Bundle = {
    // No platforms field — treated as vscode-only for backwards compatibility.
    name: "legacy",
    version: "1.0.0",
    description: "Legacy",
    default: false,
    items: [],
};

describe("getBundlePlatforms", () => {
    it("returns declared platforms", () => {
        expect(getBundlePlatforms(crossPlatformBundle)).toEqual(["vscode", "claude-code"]);
    });

    it("defaults to vscode when platforms field is missing", () => {
        expect(getBundlePlatforms(legacyBundle)).toEqual(["vscode"]);
    });

    it("defaults to vscode when platforms is an empty array", () => {
        const bundle: Bundle = { ...vscodeBundle, platforms: [] };
        expect(getBundlePlatforms(bundle)).toEqual(["vscode"]);
    });
});

describe("bundleSupportsPlatform", () => {
    it("returns true for declared platform", () => {
        expect(bundleSupportsPlatform(crossPlatformBundle, "claude-code")).toBe(true);
        expect(bundleSupportsPlatform(vscodeBundle, "vscode")).toBe(true);
    });

    it("returns false for non-declared platform", () => {
        expect(bundleSupportsPlatform(vscodeBundle, "claude-code")).toBe(false);
    });

    it("treats legacy bundle as vscode-only", () => {
        expect(bundleSupportsPlatform(legacyBundle, "vscode")).toBe(true);
        expect(bundleSupportsPlatform(legacyBundle, "claude-code")).toBe(false);
    });
});

describe("filterBundlesByPlatform", () => {
    const manifest: Manifest = {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            rdpi: vscodeBundle,
            "fozy-labs": crossPlatformBundle,
            legacy: legacyBundle,
        },
    };

    it("includes only platform-compatible bundles", () => {
        const claude = filterBundlesByPlatform(manifest, "claude-code");
        expect(claude.map((b) => b.name)).toEqual(["fozy-labs"]);

        const vscode = filterBundlesByPlatform(manifest, "vscode");
        expect(vscode.map((b) => b.name).sort()).toEqual(["fozy-labs", "legacy", "rdpi"]);
    });
});
