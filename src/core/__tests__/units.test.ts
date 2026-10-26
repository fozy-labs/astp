import { groupTemplateItems, resolveUnitPaths } from "../units.js";

describe("groupTemplateItems", () => {
    it("groups skill assets under the outermost SKILL.md and leaves non-skill items as files", () => {
        const units = groupTemplateItems([
            {
                source: "bundle/skills/alpha/references/guide.md",
                target: "skills/alpha/references/guide.md",
                category: "skill",
            },
            { source: "bundle/agents/agent.md", target: "agents/agent.md", category: "agent" },
            {
                source: "bundle/skills/alpha/examples/sub/SKILL.md",
                target: "skills/alpha/examples/sub/SKILL.md",
                category: "skill",
            },
            { source: "bundle/skills/alpha/SKILL.md", target: "skills/alpha/SKILL.md", category: "skill" },
            {
                source: "bundle/skills/alpha/references/nested/data.bin",
                target: "skills/alpha/references/nested/data.bin",
                category: "skill",
            },
        ]);

        expect(units).toEqual([
            {
                kind: "skill",
                relativePath: "skills/alpha",
                items: [
                    {
                        source: "bundle/skills/alpha/references/guide.md",
                        target: "skills/alpha/references/guide.md",
                        category: "skill",
                    },
                    {
                        source: "bundle/skills/alpha/examples/sub/SKILL.md",
                        target: "skills/alpha/examples/sub/SKILL.md",
                        category: "skill",
                    },
                    { source: "bundle/skills/alpha/SKILL.md", target: "skills/alpha/SKILL.md", category: "skill" },
                    {
                        source: "bundle/skills/alpha/references/nested/data.bin",
                        target: "skills/alpha/references/nested/data.bin",
                        category: "skill",
                    },
                ],
            },
            {
                kind: "file",
                relativePath: "agents/agent.md",
                item: { source: "bundle/agents/agent.md", target: "agents/agent.md", category: "agent" },
            },
        ]);
    });

    it("throws a clear error for a skill item without an owning SKILL.md", () => {
        expect(() =>
            groupTemplateItems([
                {
                    source: "bundle/skills/alpha/references/guide.md",
                    target: "skills/alpha/references/guide.md",
                    category: "skill",
                },
            ]),
        ).toThrow("Skill item 'skills/alpha/references/guide.md' has no owning SKILL.md");
    });

    it("copies unit metadata from file items and root SKILL.md items", () => {
        const units = groupTemplateItems([
            {
                source: "bundle/skills/alpha/references/guide.md",
                target: "skills/alpha/references/guide.md",
                category: "skill",
            },
            {
                source: "bundle/skills/alpha/SKILL.md",
                target: "skills/alpha/SKILL.md",
                category: "skill",
                optional: true,
                labels: ["experimental"],
                platforms: ["!claude-code"],
            },
            {
                source: "bundle/rules/r.md",
                target: "rules/r.md",
                category: "rule",
                optional: false,
                labels: ["deprecated"],
            },
        ]);
        expect(units[0]).toMatchObject({
            kind: "skill",
            relativePath: "skills/alpha",
            optional: true,
            labels: ["experimental"],
            platforms: ["!claude-code"],
        });
        expect(units[1]).toMatchObject({
            kind: "file",
            relativePath: "rules/r.md",
            optional: false,
            labels: ["deprecated"],
        });
    });

    it("filters whole skills by their root SKILL.md and file units by their own platforms", () => {
        const items = [
            {
                source: "bundle/skills/alpha/SKILL.md",
                target: "skills/alpha/SKILL.md",
                category: "skill" as const,
                platforms: ["!claude-code" as const],
            },
            {
                source: "bundle/skills/alpha/references/guide.md",
                target: "skills/alpha/references/guide.md",
                category: "skill" as const,
            },
            {
                source: "bundle/rules/r.md",
                target: "rules/r.md",
                category: "rule" as const,
                platforms: ["claude-code" as const],
            },
        ];

        expect(groupTemplateItems(items, "claude-code").map((unit) => unit.relativePath)).toEqual(["rules/r.md"]);
        expect(groupTemplateItems(items).map((unit) => unit.relativePath)).toEqual(["skills/alpha", "rules/r.md"]);
    });

    it("rejects unit metadata on a non-root skill item", () => {
        for (const metadata of [
            { optional: true },
            { labels: ["experimental"] },
            { platforms: ["claude-code" as const] },
        ]) {
            expect(() =>
                groupTemplateItems([
                    { source: "bundle/skills/alpha/SKILL.md", target: "skills/alpha/SKILL.md", category: "skill" },
                    {
                        source: "bundle/skills/alpha/references/guide.md",
                        target: "skills/alpha/references/guide.md",
                        category: "skill",
                        ...metadata,
                    },
                ]),
            ).toThrow("Skill item 'skills/alpha/references/guide.md' cannot set 'optional', 'labels' or 'platforms'");
        }
    });
});

describe("resolveUnitPaths", () => {
    const units = [{ relativePath: "skills/alpha" }, { relativePath: "skills/group/alpha" }];

    it("matches names and full paths", () => {
        expect(resolveUnitPaths(["skills/alpha"], units, "core")).toEqual(new Set(["skills/alpha"]));
    });

    it("rejects ambiguous final path segments and unknown names", () => {
        expect(() => resolveUnitPaths(["alpha"], units, "core")).toThrow(
            "Unit 'alpha' is ambiguous in bundle 'core'. Use the full path:",
        );
        expect(() => resolveUnitPaths(["missing"], units, "core")).toThrow(
            "Unknown unit 'missing' in bundle 'core'. Available: alpha",
        );
    });
});
