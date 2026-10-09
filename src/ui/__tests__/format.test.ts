import { describeUnitCounts } from "../format.js";

describe("describeUnitCounts", () => {
    it("labels units by kind and top-level install dir", () => {
        expect(
            describeUnitCounts([
                { kind: "skill", path: "skills/alpha" },
                { kind: "file", path: "agents/guide.md" },
                { kind: "file", path: "agents/review.md" },
                { kind: "file", path: "rules/style.md" },
                { kind: "file", path: "instructions/main.md" },
            ]),
        ).toBe("1 skill, 2 agents, 1 rule, 1 file");
    });

    it("omits empty groups and pluralizes", () => {
        expect(
            describeUnitCounts([
                { kind: "skill", path: "skills/a" },
                { kind: "skill", path: "skills/b" },
                { kind: "file", path: "rules/r.md" },
            ]),
        ).toBe("2 skills, 1 rule");
    });

    it("counts nested rules/agents paths by their top dir", () => {
        expect(describeUnitCounts([{ kind: "file", path: "rules/nested/deep.md" }])).toBe("1 rule");
    });

    it("returns '0 files' for an empty list", () => {
        expect(describeUnitCounts([])).toBe("0 files");
    });
});
