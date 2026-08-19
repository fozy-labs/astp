import fs from "node:fs/promises";
import path from "node:path";

import type { Manifest } from "@/types/index.js";

import {
    buildMarketplace,
    collectSkillLocations,
    collectSkillNames,
    MARKETPLACE_PATH,
    normalizeLineEndings,
    parseManifest,
    parseSkillFrontmatter,
    selectBundles,
    serializeMarketplace,
    TEMPLATES_DIR,
    validateManifestSources,
    validateSkillFile,
} from "../../scripts/skills-marketplace.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

// ── Fixtures ─────────────────────────────────────────────────────────

function skillItem(bundle: string, target: string) {
    return { source: `${bundle}/${target}`, target, category: "skill" as const };
}

function createManifest(): Manifest {
    return {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            // VS Code only — excluded even though it ships a skill.
            base: {
                name: "base",
                version: "1.0.1",
                description: "Base bundle",
                default: true,
                platforms: ["vscode"],
                items: [skillItem("base", "skills/orchestrate/SKILL.md")],
            },
            // Claude Code, but agents only — nothing for the skills CLI to install.
            agentsOnly: {
                name: "agentsOnly",
                version: "1.0.0",
                description: "Agents only",
                default: false,
                platforms: ["claude-code"],
                items: [{ source: "agentsOnly/agents/a.agent.md", target: "agents/a.agent.md", category: "agent" }],
            },
            docs: {
                name: "docs",
                version: "1.1.0",
                description: "Docs bundle",
                default: false,
                platforms: ["vscode", "claude-code"],
                items: [
                    skillItem("docs", "skills/markdown-craft/SKILL.md"),
                    skillItem("docs", "skills/markdown-craft/references/mermaid-craft.md"),
                ],
            },
            // Predates platform support — treated as VS Code only.
            legacy: {
                name: "legacy",
                version: "0.1.0",
                description: "Legacy bundle",
                default: false,
                items: [skillItem("legacy", "skills/legacy-skill/SKILL.md")],
            },
        },
    };
}

// ── Bundle Selection ─────────────────────────────────────────────────

describe("selectBundles", () => {
    it("keeps only Claude Code bundles that ship at least one skill", () => {
        expect(selectBundles(createManifest()).map((bundle) => bundle.name)).toEqual(["docs"]);
    });

    it("treats a bundle without platforms as VS Code only", () => {
        const manifest = createManifest();
        expect(selectBundles(manifest).some((bundle) => bundle.name === "legacy")).toBe(false);
    });

    it("sorts bundles by name for a deterministic output", () => {
        const manifest = createManifest();
        manifest.bundles.alpha = {
            name: "alpha",
            version: "1.0.0",
            description: "Alpha bundle",
            default: false,
            platforms: ["claude-code"],
            items: [skillItem("alpha", "skills/alpha-skill/SKILL.md")],
        };
        expect(selectBundles(manifest).map((bundle) => bundle.name)).toEqual(["alpha", "docs"]);
    });
});

describe("collectSkillNames", () => {
    it("derives one entry per skill directory, ignoring reference files", () => {
        const manifest = createManifest();
        expect(collectSkillNames(manifest.bundles.docs)).toEqual(["markdown-craft"]);
    });

    it("ignores non-skill items and malformed targets", () => {
        const bundle = createManifest().bundles.docs;
        bundle.items.push(
            { source: "docs/agents/x.agent.md", target: "agents/x.agent.md", category: "agent" },
            { source: "docs/skills/SKILL.md", target: "skills/SKILL.md", category: "skill" },
        );
        expect(collectSkillNames(bundle)).toEqual(["markdown-craft"]);
    });
});

describe("collectSkillLocations", () => {
    it("maps every published skill to its repository-relative directory", () => {
        expect(collectSkillLocations(createManifest())).toEqual([
            {
                pluginName: "docs",
                skillName: "markdown-craft",
                dir: `${TEMPLATES_DIR}/docs/skills/markdown-craft`,
            },
        ]);
    });
});

// ── Marketplace Construction ─────────────────────────────────────────

describe("buildMarketplace", () => {
    it("builds plugin entries the skills CLI accepts", () => {
        const marketplace = buildMarketplace(createManifest());

        expect(marketplace.name).toBe("astp");
        expect(marketplace.owner).toEqual({ name: "fozy-labs", url: "https://github.com/fozy-labs" });
        expect(marketplace.plugins).toEqual([
            {
                name: "docs",
                source: "./templates/docs",
                description: "Docs bundle",
                version: "1.1.0",
                skills: ["./skills/markdown-craft"],
            },
        ]);
    });

    it("emits relative paths starting with './' — the CLI rejects anything else", () => {
        const marketplace = buildMarketplace(createManifest());
        for (const plugin of marketplace.plugins) {
            expect(plugin.source.startsWith("./")).toBe(true);
            for (const skill of plugin.skills) expect(skill.startsWith("./")).toBe(true);
        }
    });

    it("rejects a repository that is not owner/repo", () => {
        const manifest = createManifest();
        manifest.repository = "fozy-labs";
        expect(() => buildMarketplace(manifest)).toThrow(/owner\/repo/);
    });
});

describe("serializeMarketplace", () => {
    it("is stable and ends with a newline", () => {
        const marketplace = buildMarketplace(createManifest());
        const content = serializeMarketplace(marketplace);

        expect(content).toBe(serializeMarketplace(buildMarketplace(createManifest())));
        expect(content.endsWith("}\n")).toBe(true);
        expect(content).toContain('\n    "name": "astp"');
    });
});

// ── Manifest Parsing ─────────────────────────────────────────────────

describe("normalizeLineEndings", () => {
    it("turns CRLF into LF so a Windows checkout still compares equal", () => {
        expect(normalizeLineEndings('{\r\n    "a": 1\r\n}\r\n')).toBe('{\n    "a": 1\n}\n');
    });
});

describe("parseManifest", () => {
    it("parses a valid manifest", () => {
        expect(parseManifest(JSON.stringify(createManifest())).repository).toBe("fozy-labs/astp");
    });

    it.each([
        ["not json", "{", /not valid JSON/],
        ["a non-object", "[]", /missing or invalid repository/],
        ["a missing repository", JSON.stringify({ bundles: {} }), /missing or invalid repository/],
        ["missing bundles", JSON.stringify({ repository: "a/b" }), /missing or invalid bundles/],
        [
            "a bundle without items",
            JSON.stringify({ repository: "a/b", bundles: { x: { name: "x", version: "1.0.0" } } }),
            /missing or invalid items/,
        ],
    ])("rejects %s", (_case, raw, expected) => {
        expect(() => parseManifest(raw)).toThrow(expected);
    });
});

// ── Validation ───────────────────────────────────────────────────────

describe("validateManifestSources", () => {
    it("accepts a consistent manifest", () => {
        expect(validateManifestSources(createManifest())).toEqual([]);
    });

    it("reports a bundle whose name does not match its key", () => {
        const manifest = createManifest();
        manifest.bundles.docs.name = "documents";
        expect(validateManifestSources(manifest)).toContainEqual(
            expect.stringContaining("name 'documents' does not match its key"),
        );
    });

    it("reports a source that does not mirror its target", () => {
        const manifest = createManifest();
        manifest.bundles.docs.items[0].source = "docs/skills/markdown-craft/OTHER.md";
        expect(validateManifestSources(manifest)).toContainEqual(expect.stringContaining("must be 'docs/skills"));
    });

    it("reports a skill directory without a SKILL.md item", () => {
        const manifest = createManifest();
        manifest.bundles.docs.items = [skillItem("docs", "skills/markdown-craft/references/mermaid-craft.md")];
        expect(validateManifestSources(manifest)).toContainEqual(
            expect.stringContaining("has no skills/markdown-craft/SKILL.md item"),
        );
    });

    it("reports a malformed skill target", () => {
        const manifest = createManifest();
        manifest.bundles.docs.items.push(skillItem("docs", "instructions/x.md"));
        expect(validateManifestSources(manifest)).toContainEqual(
            expect.stringContaining("must look like skills/<name>/<file>"),
        );
    });

    it("reports a skill name claimed by two published bundles", () => {
        const manifest = createManifest();
        manifest.bundles.other = {
            name: "other",
            version: "1.0.0",
            description: "Other bundle",
            default: false,
            platforms: ["claude-code"],
            items: [skillItem("other", "skills/markdown-craft/SKILL.md")],
        };
        expect(validateManifestSources(manifest)).toContainEqual(
            expect.stringContaining("skill 'markdown-craft' is declared by both"),
        );
    });

    it("ignores unpublished bundles", () => {
        const manifest = createManifest();
        manifest.bundles.base.items[0].source = "wrong/path.md";
        expect(validateManifestSources(manifest)).toEqual([]);
    });
});

describe("validateSkillFile", () => {
    const location = { pluginName: "docs", skillName: "markdown-craft", dir: "templates/docs/skills/markdown-craft" };

    it("accepts a SKILL.md with matching name and a description", () => {
        const content = "---\nname: markdown-craft\ndescription: Rules for Markdown\n---\n\n# Markdown craft\n";
        expect(validateSkillFile(location, content)).toEqual([]);
    });

    it.each([
        ["missing frontmatter", "# Markdown craft\n", /missing required frontmatter field 'name'/],
        [
            "a name that differs from the directory",
            "---\nname: markdown\ndescription: Rules\n---\n",
            /must match the directory 'markdown-craft'/,
        ],
        ["a missing description", "---\nname: markdown-craft\n---\n", /missing required frontmatter field 'description'/],
        [
            "an empty description",
            "---\nname: markdown-craft\ndescription:\n---\n",
            /missing required frontmatter field 'description'/,
        ],
    ])("rejects %s", (_case, content, expected) => {
        expect(validateSkillFile(location, content)).toContainEqual(expect.stringMatching(expected));
    });
});

// ── Frontmatter ──────────────────────────────────────────────────────

describe("parseSkillFrontmatter", () => {
    it("reads plain scalars", () => {
        expect(parseSkillFrontmatter("---\nname: my-skill\ndescription: Does a thing\n---\nbody")).toEqual({
            name: "my-skill",
            description: "Does a thing",
        });
    });

    it("strips surrounding quotes", () => {
        expect(parseSkillFrontmatter(`---\nname: "my-skill"\ndescription: 'Does a thing'\n---\n`)).toEqual({
            name: "my-skill",
            description: "Does a thing",
        });
    });

    it("folds a '>' block into one line", () => {
        const content = "---\nname: my-skill\ndescription: >\n  First line\n  second line.\n---\n";
        expect(parseSkillFrontmatter(content).description).toBe("First line second line.");
    });

    it("keeps line breaks in a '|' block", () => {
        const content = "---\nname: my-skill\ndescription: |\n  First line\n  second line.\n---\n";
        expect(parseSkillFrontmatter(content).description).toBe("First line\nsecond line.");
    });

    it("handles CRLF files", () => {
        expect(parseSkillFrontmatter("---\r\nname: my-skill\r\ndescription: Does a thing\r\n---\r\nbody")).toEqual({
            name: "my-skill",
            description: "Does a thing",
        });
    });

    it("ignores nested keys", () => {
        const content = "---\nname: my-skill\ndescription: Does a thing\nmetadata:\n  name: nested\n---\n";
        expect(parseSkillFrontmatter(content).name).toBe("my-skill");
    });

    it("returns nothing without frontmatter", () => {
        expect(parseSkillFrontmatter("# Just a document\n")).toEqual({});
    });
});

// ── Repository State ─────────────────────────────────────────────────

describe("committed marketplace", () => {
    async function readRepoManifest(): Promise<Manifest> {
        return parseManifest(await fs.readFile(path.join(REPO_ROOT, TEMPLATES_DIR, "manifest.json"), "utf8"));
    }

    it("matches what the generator produces — run `npm run generate:skills` after editing the manifest", async () => {
        const expected = serializeMarketplace(buildMarketplace(await readRepoManifest()));
        const committed = await fs.readFile(path.join(REPO_ROOT, MARKETPLACE_PATH), "utf8");
        expect(normalizeLineEndings(committed)).toBe(expected);
    });

    it("publishes the docs and fozy-labs bundles", async () => {
        const marketplace = buildMarketplace(await readRepoManifest());
        expect(marketplace.plugins.map((plugin) => plugin.name)).toEqual(["docs", "fozy-labs"]);
    });

    it("keeps templates/manifest.json internally consistent", async () => {
        expect(validateManifestSources(await readRepoManifest())).toEqual([]);
    });

    it("points at SKILL.md files that satisfy the skills CLI", async () => {
        const locations = collectSkillLocations(await readRepoManifest());
        expect(locations.length).toBeGreaterThan(0);

        for (const location of locations) {
            const content = await fs.readFile(path.join(REPO_ROOT, location.dir, "SKILL.md"), "utf8");
            expect(validateSkillFile(location, content)).toEqual([]);
        }
    });
});
