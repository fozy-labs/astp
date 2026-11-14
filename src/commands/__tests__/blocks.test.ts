import { selectInstallBlocks, selectUpdateBlocks } from "@/commands/blocks.js";
import type { UnitBlockFile } from "@/core/index.js";

const TARGET = "rules/project.md";

function nestedFiles(): Map<string, UnitBlockFile> {
    return new Map([
        [
            TARGET,
            {
                target: TARGET,
                content: "",
                frontmatter: "",
                blocks: [
                    { name: "parent", description: null, optional: true, required: false, content: "" },
                    {
                        name: "child",
                        parent: "parent",
                        description: null,
                        optional: true,
                        required: false,
                        content: "",
                    },
                    {
                        name: "grandchild",
                        parent: "child",
                        description: null,
                        optional: true,
                        required: false,
                        content: "",
                    },
                ],
            },
        ],
    ]);
}

function selectedNames(selections: ReturnType<typeof selectInstallBlocks>): string[] {
    return [...selections.get(TARGET)!.selected].sort();
}

describe("nested block selection", () => {
    it("selects all ancestors of an explicitly requested child", () => {
        const selections = selectInstallBlocks(nestedFiles(), undefined, {
            additive: false,
            requested: new Set([`${TARGET}#grandchild`]),
        });
        expect(selectedNames(selections)).toEqual(["child", "grandchild", "parent"]);
    });

    it("selects ancestors when only a child is chosen interactively", () => {
        const selections = selectInstallBlocks(nestedFiles(), undefined, {
            additive: false,
            chosen: new Set([`${TARGET}#child`]),
        });
        expect(selectedNames(selections)).toEqual(["child", "parent"]);
        expect(selections.get(TARGET)!.declined).toEqual(new Set(["grandchild"]));
    });

    it("selects ancestors of required descendants", () => {
        const files = nestedFiles();
        files.get(TARGET)!.blocks[2]!.required = true;
        const selections = selectInstallBlocks(files, undefined, { additive: false });
        expect(selectedNames(selections)).toEqual(["child", "grandchild", "parent"]);
    });

    it("keeps ancestors when an update selects a new nested block", async () => {
        const selections = await selectUpdateBlocks("project", nestedFiles(), {
            kind: "file",
            version: "1.0.0",
            hash: "hash",
            blocks: { [`${TARGET}#parent`]: "hash" },
            declinedBlocks: [`${TARGET}#child`, `${TARGET}#grandchild`],
        });
        expect(selectedNames(selections)).toEqual(["parent"]);

        const withNewChild = nestedFiles();
        withNewChild.get(TARGET)!.blocks[1]!.optional = false;
        const selectionsWithChild = await selectUpdateBlocks("project", withNewChild, {
            kind: "file",
            version: "1.0.0",
            hash: "hash",
            blocks: { [`${TARGET}#parent`]: "hash" },
            declinedBlocks: [`${TARGET}#grandchild`],
        });
        expect(selectedNames(selectionsWithChild)).toEqual(["child", "parent"]);
    });
});
