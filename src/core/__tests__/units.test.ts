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
