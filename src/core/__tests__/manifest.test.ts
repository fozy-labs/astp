import { readFileSync } from "node:fs";
import path from "node:path";

import type { Manifest } from "@/types/index.js";

import { resolveBundle, validateManifest } from "../manifest.js";

const validManifestData = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: {
        core: {
            name: "core",
            version: "1.0.0",
            description: "Core bundle",
            default: true,
            items: [
                {
                    source: "core/skills/orchestrate/SKILL.md",
                    target: "skills/orchestrate/SKILL.md",
                    category: "skill",
                },
            ],
        },
        pipeline: {
            name: "pipeline",
            version: "1.0.0",
            description: "Pipeline bundle",
            default: false,
            items: [
                {
                    source: "pipeline/agents/pipeline-approve.agent.md",
                    target: "agents/pipeline-approve.agent.md",
                    category: "agent",
                },
            ],
        },
    },
};

function withBundle(name: string, items: unknown[] = [rule(name, "rules/a.md")], key = name) {
    return {
        schemaVersion: 1,
        bundles: { [key]: { name, version: "1.0.0", description: "x", default: false, items } },
    };
}

function rule(bundle: string, target: string) {
    return { source: `${bundle}/${target}`, target, category: "rule" };
}

describe("validateManifest", () => {
    it.each(["../core", "a/b", "a\\b", "..", "", "C:", "a:b", "con", "x.", "x "])("rejects bundle name %j", (name) => {
        expect(() => validateManifest(withBundle(name))).toThrow("must be a safe name");
    });

    it("accepts any other one-segment bundle name", () => {
        for (const name of ["my+tools", "tools@2", "café", "X"]) {
            expect(() => validateManifest(withBundle(name))).not.toThrow();
        }
    });

    it("rejects a bundle whose name differs from its key", () => {
        expect(() => validateManifest(withBundle("core", undefined, "other"))).toThrow(
            "Invalid bundle 'other': name 'core' must equal its key",
        );
    });

    it("rejects bundle keys that differ only in case", () => {
        const data = { schemaVersion: 1, bundles: { ...withBundle("Docs").bundles, ...withBundle("docs").bundles } };
        expect(() => validateManifest(data)).toThrow('bundles "Docs" and "docs" collide');
    });

    it.each(["constructor", "__proto__"])("keeps bundle key %j as plain data", (name) => {
        const manifest = validateManifest(JSON.parse(JSON.stringify(withBundle(name))));
        expect(resolveBundle(manifest, name).name).toBe(name);
        expect(() => resolveBundle(manifest, "toString")).toThrow(`Bundle 'toString' not found. Available: ${name}`);
    });

    it.each([
        "agents/a\\b.md",
        "agents/..\\..\\x.md",
        "agents/./a.md",
        "agents/.",
        "agents//a.md",
        "agents/",
        "/etc/x.md",
        "C:foo.md",
        "C:\\x.md",
        "\\\\host\\share\\x.md",
        "agents/a:b.md",
        "agents/a.md:stream",
        "agents/CON.md",
        "agents/con .md",
        "agents/com¹.md",
        "agents/a.md.",
        "agents/a.md ",
        "agents/a\u0000.md",
        "../x.md",
        "agents/a?.md",
        "agents/\uD800.md",
        "agents/\u009B31m.md",
        "agents/a\u202Edm.md",
        "skills/SKILLS~1/SKILL.md",
        "agents/FOO~12.md",
        `agents/${"é".repeat(128)}`,
    ])("rejects item target %j", (target) => {
        expect(() => validateManifest(withBundle("core", [rule("core", target)]))).toThrow(
            /Invalid bundle 'core': items\[0\]\.target must be a safe relative path/,
        );
    });

    it.each([
        "rules/my rule.md",
        "rules/правило.md",
        "rules/a#1%.md",
        "skills/x/references/y.md",
        "agents/a~b.md",
        "agents/~notes.md",
        `agents/${"a".repeat(255)}`,
    ])("accepts item target %j", (target) => {
        expect(() => validateManifest(withBundle("core", [rule("core", target)]))).not.toThrow();
    });

    it.each([
        ["targets differing in case", "agents/A.md", "agents/a.md", "agents/A.md", "agents/a.md"],
        [
            "targets differing in normalization",
            "rules/\u00e9.md",
            "rules/e\u0301.md",
            "rules/\u00e9.md",
            "rules/e\u0301.md",
        ],
        ["targets differing in ß/SS", "agents/straße.md", "agents/STRASSE.md", "agents/straße.md", "agents/STRASSE.md"],
        ["folders differing in case", "agents/X/a.md", "agents/x/b.md", "agents/X", "agents/x"],
        ["a target and a folder differing in case", "agents/a.md", "agents/A.MD/x.md", "agents/a.md", "agents/A.MD"],
        ["a target that is another's folder", "agents/a/b.md", "agents/a", "agents/a", "agents/a"],
        ["a repeated target", "agents/a.md", "agents/a.md", "agents/a.md", "agents/a.md"],
    ])("rejects %s", (_label, first, second, left, right) => {
        expect(() => validateManifest(withBundle("core", [rule("core", first), rule("core", second)]))).toThrow(
            `Invalid bundle 'core': items ${JSON.stringify(left)} and ${JSON.stringify(right)} collide`,
        );
    });

    it.each([
        ["a non-object item", "x", "items[0] must be an object"],
        ["a missing target", { source: "core/rules/a.md", category: "rule" }, "items[0].target must be a safe"],
        ["a missing category", { source: "core/rules/a.md", target: "rules/a.md" }, "items[0].category must be one"],
        ["an unknown category", { ...rule("core", "rules/a.md"), category: "hook" }, "items[0].category must be one"],
        ["a mismatched source", { ...rule("core", "rules/a.md"), source: "core/rules/b.md" }, "items[0].source must"],
    ])("rejects %s", (_label, item, message) => {
        expect(() => validateManifest(withBundle("core", [item]))).toThrow(`Invalid bundle 'core': ${message}`);
    });

    it("rejects a target ending in an OS clutter file name in any case", () => {
        for (const target of ["skills/x/desktop.ini", "skills/x/Thumbs.DB", "rules/.DS_Store"]) {
            const item = { source: `core/${target}`, target, category: "skill" };
            expect(() => validateManifest(withBundle("core", [item]))).toThrow(
                `Invalid bundle 'core': items[0].target '${target}' is an OS clutter file name`,
            );
        }
    });

    it("accepts the repository's own templates/manifest.json", () => {
        const file = path.resolve(import.meta.dirname, "../../../templates/manifest.json");
        expect(() => validateManifest(JSON.parse(readFileSync(file, "utf8")))).not.toThrow();
    });

    // T12: Valid manifest
    it("T12: parses valid manifest correctly", () => {
        const result = validateManifest(validManifestData);
        expect(result.schemaVersion).toBe(1);
        expect(result.repository).toBe("fozy-labs/astp");
        expect(Object.keys(result.bundles)).toEqual(["core", "pipeline"]);
        expect(result.bundles.core.items).toHaveLength(1);
    });

    // T13: Missing required fields
    it("T13: throws on missing schemaVersion", () => {
        expect(() => validateManifest({})).toThrow("schemaVersion");
    });

    it("accepts a manifest without repository", () => {
        const { repository: _, ...data } = validManifestData;
        expect(validateManifest(data).bundles.core.name).toBe("core");
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
                    platforms: ["claude-code"],
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
        expect(result.bundles["fozy-labs"].platforms).toEqual(["claude-code"]);
    });

    it("accepts bundle without platforms (defaults to all platforms)", () => {
        const data = {
            ...validManifestData,
            bundles: {
                legacy: {
                    name: "legacy",
                    version: "1.0.0",
                    description: "Legacy bundle",
                    default: false,
                    items: [rule("legacy", "rules/x.md")],
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
                    items: [rule("broken", "rules/x.md")],
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
                    items: [rule("broken", "rules/x.md")],
                },
            },
        };
        expect(() => validateManifest(data)).toThrow(/unknown platform 'jetbrains'/);
    });

    it("rejects the removed vscode platform", () => {
        const data = {
            ...validManifestData,
            bundles: {
                broken: {
                    name: "broken",
                    version: "1.0.0",
                    description: "x",
                    default: false,
                    platforms: ["vscode"],
                    items: [rule("broken", "rules/x.md")],
                },
            },
        };
        expect(() => validateManifest(data)).toThrow(/unknown platform 'vscode'/);
    });
});

describe("resolveBundle", () => {
    const manifest = validateManifest(validManifestData) as Manifest;

    // T18: Resolve existing bundle
    it("T18: resolves existing bundle by name", () => {
        const bundle = resolveBundle(manifest, "pipeline");
        expect(bundle.name).toBe("pipeline");
        expect(bundle.version).toBe("1.0.0");
        expect(bundle.items).toHaveLength(1);
    });

    // T19: Unknown bundle
    it("T19: throws for unknown bundle with available names", () => {
        expect(() => resolveBundle(manifest, "nonexistent")).toThrow(
            "Bundle 'nonexistent' not found. Available: core, pipeline",
        );
    });
});
