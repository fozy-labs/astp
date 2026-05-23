import type { Manifest } from "@/types/index.js";

import { fetchManifest, resolveBundle, validateManifest } from "../manifest.js";

const validManifestData = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: {
        base: {
            name: "base",
            version: "1.0.0",
            description: "Base bundle",
            default: true,
            items: [
                {
                    source: "base/skills/orchestrate/SKILL.md",
                    target: "skills/orchestrate/SKILL.md",
                    category: "skill",
                },
            ],
        },
        rdpi: {
            name: "rdpi",
            version: "1.0.0",
            description: "RDPI bundle",
            default: false,
            items: [
                {
                    source: "rdpi/agents/rdpi-approve.agent.md",
                    target: "agents/rdpi-approve.agent.md",
                    category: "agent",
                },
            ],
        },
    },
};

describe("validateManifest", () => {
    // T12: Valid manifest
    it("T12: parses valid manifest correctly", () => {
        const result = validateManifest(validManifestData);
        expect(result.schemaVersion).toBe(1);
        expect(result.repository).toBe("fozy-labs/astp");
        expect(Object.keys(result.bundles)).toEqual(["base", "rdpi"]);
        expect(result.bundles.base.items).toHaveLength(1);
    });

    // T13: Missing required fields
    it("T13: throws on missing schemaVersion", () => {
        expect(() => validateManifest({})).toThrow("schemaVersion");
    });

    it("T13: throws on missing repository", () => {
        expect(() => validateManifest({ schemaVersion: 1 })).toThrow("repository");
    });

    it("T13: throws on missing bundles", () => {
        expect(() => validateManifest({ schemaVersion: 1, repository: "r" })).toThrow("bundles");
    });

    it("T13: throws on empty bundles", () => {
        expect(() => validateManifest({ schemaVersion: 1, repository: "r", bundles: {} })).toThrow("empty");
    });

    // T14: Unsupported schema version
    it("T14: throws on unsupported schema version", () => {
        expect(() => validateManifest({ ...validManifestData, schemaVersion: 99 })).toThrow(
            "Unsupported manifest schema version 99. Update astp CLI.",
        );
    });

    // T15: Non-object input
    it("T15: throws on non-object input (null)", () => {
        expect(() => validateManifest(null)).toThrow("expected an object");
    });

    it("T15: throws on non-object input (string)", () => {
        expect(() => validateManifest("string")).toThrow("expected an object");
    });
});

describe("platform validation", () => {
    it("accepts bundle with valid platforms array", () => {
        const data = {
            ...validManifestData,
            bundles: {
                ...validManifestData.bundles,
                "fozy-labs": {
                    name: "fozy-labs",
                    version: "1.0.0",
                    description: "Cross-platform",
                    default: false,
                    platforms: ["vscode", "claude-code"],
                    items: [
                        {
                            source: "fozy-labs/skills/x/SKILL.md",
                            target: "skills/x/SKILL.md",
                            category: "skill",
                        },
                    ],
                },
            },
        };
        const result = validateManifest(data);
        expect(result.bundles["fozy-labs"].platforms).toEqual(["vscode", "claude-code"]);
    });

    it("accepts bundle without platforms (legacy default vscode)", () => {
        const data = {
            ...validManifestData,
            bundles: {
                legacy: {
                    name: "legacy",
                    version: "1.0.0",
                    description: "Legacy bundle",
                    default: false,
                    items: [{ source: "x", target: "x", category: "skill" }],
                },
            },
        };
        const result = validateManifest(data);
        expect(result.bundles.legacy.platforms).toBeUndefined();
    });

    it("rejects bundle with empty platforms array", () => {
        const data = {
            ...validManifestData,
            bundles: {
                broken: {
                    name: "broken",
                    version: "1.0.0",
                    description: "x",
                    default: false,
                    platforms: [],
                    items: [{ source: "x", target: "x", category: "skill" }],
                },
            },
        };
        expect(() => validateManifest(data)).toThrow(/platforms must be a non-empty array/);
    });

    it("rejects bundle with unknown platform", () => {
        const data = {
            ...validManifestData,
            bundles: {
                broken: {
                    name: "broken",
                    version: "1.0.0",
                    description: "x",
                    default: false,
                    platforms: ["jetbrains"],
                    items: [{ source: "x", target: "x", category: "skill" }],
                },
            },
        };
        expect(() => validateManifest(data)).toThrow(/unknown platform 'jetbrains'/);
    });
});

describe("resolveBundle", () => {
    const manifest = validateManifest(validManifestData) as Manifest;

    // T18: Resolve existing bundle
    it("T18: resolves existing bundle by name", () => {
        const bundle = resolveBundle(manifest, "rdpi");
        expect(bundle.name).toBe("rdpi");
        expect(bundle.version).toBe("1.0.0");
        expect(bundle.items).toHaveLength(1);
    });

    // T19: Unknown bundle
    it("T19: throws for unknown bundle with available names", () => {
        expect(() => resolveBundle(manifest, "nonexistent")).toThrow(
            "Bundle 'nonexistent' not found. Available: base, rdpi",
        );
    });
});

describe("fetchManifest", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // T28: Successful fetch
    it("T28: parses manifest from mocked successful fetch", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(validManifestData),
            }),
        );

        const result = await fetchManifest();
        expect(result.schemaVersion).toBe(1);
        expect(result.bundles.base).toBeDefined();
    });

    // T29: Network error
    it("T29: throws user-friendly error on network error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

        await expect(fetchManifest()).rejects.toThrow("network error");
    });

    // T30: 404 response
    it("T30: throws manifest not found on 404", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
            }),
        );

        await expect(fetchManifest()).rejects.toThrow("Manifest not found at ref main");
    });
});
