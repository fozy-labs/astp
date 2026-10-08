import {
    blockHash,
    frontmatterHash,
    hasBlocks,
    mergeBlockFile,
    parseInstalledBlocks,
    parseTemplateBlocks,
} from "../blocks.js";
import type { TemplateBlock } from "../blocks.js";
import { computeHash } from "../frontmatter.js";

const TEMPLATE = `---
description: Project map and code style
---

<astp-block name="project_map">
## Project Map

<FILL_INSTRUCTION>
Describe the project file structure. If the map depth is not obvious, ask the user.
</FILL_INSTRUCTION>
</astp-block>

<astp-block name="code_style" optional>
## Code Style

Ready-made text.
</astp-block>
`;

const EXPECTED_ISSUE_RENDER = `---
description: Project map and code style
---

<SETUP_REQUIRED>
Replace every <FILL_INSTRUCTION> in this file with the content it describes, then remove this block.
</SETUP_REQUIRED>

<project_map>
## Project Map

<FILL_INSTRUCTION>
Describe the project file structure. If the map depth is not obvious, ask the user.
</FILL_INSTRUCTION>
</project_map>
`;

const SETUP = `<SETUP_REQUIRED>
Replace every <FILL_INSTRUCTION> in this file with the content it describes, then remove this block.
</SETUP_REQUIRED>
`;

function tpl(content: string) {
    const parsed = parseTemplateBlocks(content);
    expect(parsed.errors).toEqual([]);
    return { frontmatter: parsed.frontmatter, blocks: parsed.blocks };
}

function merge(args: {
    templateContent: string;
    installed?: string | null;
    lockHashes?: Record<string, string>;
    declined?: string[];
    selected: string[];
    force?: boolean;
}) {
    const { frontmatter, blocks, errors } = parseTemplateBlocks(args.templateContent);
    expect(errors).toEqual([]);
    const lockHashes = args.lockHashes ?? {};
    const installed =
        args.installed === undefined || args.installed === null
            ? null
            : parseInstalledBlocks(args.installed, Object.keys(lockHashes));
    return mergeBlockFile({
        template: { frontmatter, blocks },
        installed,
        lockHashes,
        declined: new Set(args.declined ?? []),
        selected: new Set(args.selected),
        force: args.force ?? false,
    });
}

function block(content: string, name = "a"): TemplateBlock {
    return { name, optional: false, required: false, content };
}

describe("parseTemplateBlocks", () => {
    it("parses frontmatter and blocks with attributes", () => {
        const { frontmatter, blocks, errors } = parseTemplateBlocks(TEMPLATE);
        expect(errors).toEqual([]);
        expect(frontmatter).toBe("---\ndescription: Project map and code style\n---\n");
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ name: "project_map", optional: false, required: false });
        expect(blocks[0]!.content).toContain("## Project Map");
        expect(blocks[0]!.content.endsWith("\n")).toBe(true);
        expect(blocks[1]).toMatchObject({ name: "code_style", optional: true });
    });

    it.each([
        ["missing name", "<astp-block>\nx\n</astp-block>\n", /name/i],
        ["invalid name", '<astp-block name="Bad_Name">\nx\n</astp-block>\n', /invalid block name/i],
        ["unknown attribute", '<astp-block name="a" foo>\nx\n</astp-block>\n', /unknown attribute 'foo'/i],
        [
            "optional with required",
            '<astp-block name="a" optional required>\nx\n</astp-block>\n',
            /cannot be combined/i,
        ],
        [
            "duplicate name",
            '<astp-block name="a">\nx\n</astp-block>\n\n<astp-block name="a">\ny\n</astp-block>\n',
            /duplicate block name 'a'/i,
        ],
        ["nested block", '<astp-block name="a">\n<astp-block name="b">\nx\n</astp-block>\n</astp-block>\n', /nested/i],
        ["unclosed block", '<astp-block name="a">\nx\n', /unclosed/i],
        ["stray closing tag", "<//ignored>\n</astp-block>\n", /stray/i],
        [
            "SETUP_REQUIRED in template",
            '<astp-block name="a">\nx\n</astp-block>\n\n<SETUP_REQUIRED>\ny\n',
            /SETUP_REQUIRED/,
        ],
        [
            "FILL_INSTRUCTION outside blocks",
            '<astp-block name="a">\nx\n</astp-block>\n\n<FILL_INSTRUCTION>\ny\n</FILL_INSTRUCTION>\n',
            /FILL_INSTRUCTION/,
        ],
        ["text outside blocks", '<astp-block name="a">\nx\n</astp-block>\n\nsome prose\n', /outside <astp-block>/i],
    ])("reports error: %s", (_label, content, pattern) => {
        const { errors } = parseTemplateBlocks(content);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => pattern.test(error))).toBe(true);
        expect(errors.every((error) => /^line \d+:/.test(error))).toBe(true);
    });

    it("flags FILL_INSTRUCTION outside blocks even without any block", () => {
        const { errors } = parseTemplateBlocks("# Doc\n\n<FILL_INSTRUCTION>\nx\n</FILL_INSTRUCTION>\n");
        expect(errors.some((e) => /FILL_INSTRUCTION/.test(e))).toBe(true);
    });

    it("allows free text when the file has no blocks", () => {
        const { errors } = parseTemplateBlocks("# Doc\n\nfree text\n");
        expect(errors).toEqual([]);
    });

    it("ignores tags inside code fences", () => {
        const content = `<astp-block name="a">
\`\`\`md
<astp-block name="b">
</SETUP_REQUIRED>
\`\`\`
</astp-block>
`;
        const { blocks, errors } = parseTemplateBlocks(content);
        expect(errors).toEqual([]);
        expect(blocks[0]!.content).toContain("</SETUP_REQUIRED>");
    });

    it("handles tilde and longer fences", () => {
        const content = `<astp-block name="a">
~~~~
</astp-block>
~~~~
</astp-block>
`;
        const { errors, blocks } = parseTemplateBlocks(content);
        expect(errors).toEqual([]);
        expect(blocks).toHaveLength(1);
    });
});

describe("hasBlocks", () => {
    it("detects an opening tag at column 0", () => {
        expect(hasBlocks(TEMPLATE)).toBe(true);
        expect(hasBlocks("# plain\n")).toBe(false);
        expect(hasBlocks('  <astp-block name="a">\n')).toBe(false);
        expect(hasBlocks('```\n<astp-block name="a">\n```\n')).toBe(false);
    });

    it("detects an orphan closing tag outside fences", () => {
        expect(hasBlocks("# Doc\n\n</astp-block>\n")).toBe(true);
        expect(hasBlocks("```\n</astp-block>\n```\n")).toBe(false);
    });
});

describe("hashes", () => {
    it("blockHash is the first 8 hex chars of SHA-256 with CRLF normalized", () => {
        expect(blockHash("abc\n")).toBe(blockHash("abc\r\n"));
        expect(blockHash("abc\n")).toMatch(/^[0-9a-f]{8}$/);
    });

    it("frontmatterHash equals computeHash of the raw frontmatter", () => {
        expect(frontmatterHash(TEMPLATE)).toBe(computeHash("---\ndescription: Project map and code style\n---\n"));
        expect(frontmatterHash("no frontmatter\n")).toBe(computeHash(""));
    });
});

describe("parseInstalledBlocks", () => {
    const installed = `${EXPECTED_ISSUE_RENDER}`;

    it("parses blocks, setup and outside text", () => {
        const parsed = parseInstalledBlocks(installed, ["project_map"])!;
        expect(parsed).not.toBeNull();
        expect(parsed.frontmatter).toBe("---\ndescription: Project map and code style\n---\n");
        expect(parsed.blocks.get("project_map")!.content).toContain("## Project Map");
        expect(parsed.setup).not.toBeNull();
        expect(parsed.outsideText.trim()).toBe("");
    });

    it("collects consumer text as outsideText", () => {
        const content = `${installed}\nuser prose\n`;
        const parsed = parseInstalledBlocks(content, ["project_map"])!;
        expect(parsed.outsideText).toContain("user prose");
        expect(parsed.outsideText).not.toContain("Project Map");
    });

    it.each([
        ["recorded name opens twice", `${installed}<project_map>\nx\n</project_map>\n`, ["project_map"]],
        ["unclosed recorded block", "<a>\nx\n", ["a"]],
        ["recorded block inside another", "<a>\n<b>\nx\n</b>\n</a>\n", ["a", "b"]],
        ["recorded block inside SETUP_REQUIRED", "<SETUP_REQUIRED>\n<a>\nx\n</a>\n</SETUP_REQUIRED>\n", ["a"]],
        ["stray recorded closing", "</a>\n", ["a"]],
        ["stray SETUP_REQUIRED closing", "</SETUP_REQUIRED>\n", []],
        ["SETUP_REQUIRED twice", `${SETUP}\n${SETUP}`, []],
        ["SETUP_REQUIRED unclosed", "<SETUP_REQUIRED>\nx\n", []],
    ])("returns null: %s", (_label, content, names) => {
        expect(parseInstalledBlocks(content, names)).toBeNull();
    });

    it("ignores tags inside fences", () => {
        const content = `<a>\n\`\`\`\n</a>\n\`\`\`\n</a>\n`;
        const parsed = parseInstalledBlocks(content, ["a"]);
        expect(parsed).not.toBeNull();
        expect(parsed!.blocks.get("a")!.content).toContain("</a>");
    });
});

describe("mergeBlockFile", () => {
    it("renders the issue example byte-for-byte", () => {
        const result = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        expect(result.content).toBe(EXPECTED_ISSUE_RENDER);
        expect(Object.keys(result.blocks)).toEqual(["project_map"]);
        expect(result.declinedBlocks).toEqual(["code_style"]);
    });

    it("renders without SETUP_REQUIRED when no FILL_INSTRUCTION is selected", () => {
        const result = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        expect(result.content).toBe(
            `---\ndescription: Project map and code style\n---\n\n<code_style>\n## Code Style\n\nReady-made text.\n</code_style>\n`,
        );
        expect(result.content).not.toContain("SETUP_REQUIRED");
    });

    it("C == L replaces the block content with the template", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const updated = merge({
            templateContent: TEMPLATE.replace("Describe the project file structure", "List top-level dirs"),
            installed: installed.content,
            lockHashes: installed.blocks,
            selected: ["project_map"],
        });
        expect(updated.content).toContain("List top-level dirs");
        expect(updated.content).not.toContain("Describe the project file structure");
    });

    it("C != L and T != L appends the wrapper; --force resets instead", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const filled = installed.content.replace("Ready-made text.", "Our own style.");
        const changedTemplate = TEMPLATE.replace("Ready-made text.", "New ready-made text.");

        const conflicted = merge({
            templateContent: changedTemplate,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["code_style"],
        });
        expect(conflicted.conflicts).toEqual(["code_style"]);
        expect(conflicted.content).toContain("Our own style.");
        expect(conflicted.content).toContain("The astp template of this block changed");
        expect(conflicted.content).toContain("New ready-made text.");
        expect(conflicted.content).toContain("<SETUP_REQUIRED>");

        const forced = merge({
            templateContent: changedTemplate,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["code_style"],
            force: true,
        });
        expect(forced.conflicts).toEqual([]);
        expect(forced.content).toContain("New ready-made text.");
        expect(forced.content).not.toContain("Our own style.");
    });

    it("C != L and T == L keeps the block as is", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const filled = installed.content.replace("Ready-made text.", "Our own style.");
        const result = merge({
            templateContent: TEMPLATE,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["code_style"],
        });
        expect(result.content).toContain("Our own style.");
        expect(result.conflicts).toEqual([]);
    });

    it("replaces an existing wrapper instead of adding a second", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const filled = installed.content.replace("Ready-made text.", "Our own style.");
        const t1 = TEMPLATE.replace("Ready-made text.", "Version two.");
        const t2 = TEMPLATE.replace("Ready-made text.", "Version three.");

        const first = merge({
            templateContent: t1,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["code_style"],
        });
        const second = merge({
            templateContent: t2,
            installed: first.content,
            lockHashes: first.blocks,
            selected: ["code_style"],
        });
        expect(second.content.match(/The astp template of this block changed/g)).toHaveLength(1);
        expect(second.content).toContain("Version three.");
        expect(second.content).not.toContain("Version two.");
        expect(second.conflicts).toEqual(["code_style"]);
    });

    it("lengthens the wrapper fence when the new content starts a line with backticks", () => {
        const withFence = TEMPLATE.replace("Ready-made text.", "```md\nnested fence\n```");
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const filled = installed.content.replace("Ready-made text.", "Our own style.");
        const result = merge({
            templateContent: withFence,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["code_style"],
        });
        expect(result.content).toContain(
            "````md\n## Code Style\n\n```md\nnested fence\n```\n````\n</FILL_INSTRUCTION>",
        );
    });

    it("inserts a selected block after the nearest preceding template block", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const result = merge({
            templateContent: TEMPLATE,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["project_map", "code_style"],
        });
        const content = result.content;
        expect(content.indexOf("<project_map>")).toBeLessThan(content.indexOf("<code_style>"));
        expect(content).toContain("</project_map>\n\n<code_style>");
        expect(content).toContain("<SETUP_REQUIRED>");
    });

    it("inserts before the nearest following block when no preceding one is present", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        // User removed SETUP + filled: now select code_style (later block absent -> appended at end).
        const result = merge({
            templateContent: TEMPLATE,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["project_map", "code_style"],
        });
        expect(result.content.indexOf("</project_map>")).toBeLessThan(result.content.indexOf("<code_style>"));
    });

    it("removes a deselected unchanged block and declines it", () => {
        const installed = merge({
            templateContent: TEMPLATE,
            selected: ["project_map", "code_style"],
        });
        const result = merge({
            templateContent: TEMPLATE,
            installed: installed.content,
            lockHashes: installed.blocks,
            selected: ["project_map"],
        });
        expect(result.content).not.toContain("<code_style>");
        expect(result.declinedBlocks).toEqual(["code_style"]);
        expect(result.blocks["code_style"]).toBeUndefined();
    });

    it("keeps a deselected block that changed locally, unless forced", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const filled = installed.content.replace("Ready-made text.", "Our own style.");
        const kept = merge({
            templateContent: TEMPLATE,
            installed: filled,
            lockHashes: installed.blocks,
            selected: [],
        });
        expect(kept.kept).toEqual(["code_style"]);
        expect(kept.declinedBlocks).toEqual(["project_map"]);
        expect(kept.content).toContain("Our own style.");

        const forced = merge({
            templateContent: TEMPLATE,
            installed: filled,
            lockHashes: installed.blocks,
            selected: [],
            force: true,
        });
        expect(forced.content).not.toContain("<code_style>");
        expect(forced.declinedBlocks).toEqual(["code_style", "project_map"]);
    });

    it("drops lock entries for blocks removed upstream, keeping locally changed ones", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map", "code_style"] });
        const smaller = TEMPLATE.replace(/<astp-block name="code_style"[\s\S]*?<\/astp-block>\n?/, "").trimEnd() + "\n";
        const result = merge({
            templateContent: smaller,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["project_map"],
        });
        expect(result.content).not.toContain("<code_style>");
        expect(Object.keys(result.blocks)).toEqual(["project_map"]);

        const filled = installed.content.replace("Ready-made text.", "Our own style.");
        const kept = merge({
            templateContent: smaller,
            installed: filled,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["project_map"],
        });
        expect(kept.kept).toEqual(["code_style"]);
        expect(kept.content).toContain("Our own style.");
        expect(kept.blocks["code_style"]).toBe(installed.blocks["code_style"]);
    });

    it("never touches text outside blocks", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const withText = `${installed.content}\nMy own section.\n`;
        const result = merge({
            templateContent: TEMPLATE.replace("Project map and code style", "New description"),
            installed: withText,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["project_map"],
        });
        expect(result.content).toContain("\nMy own section.\n");
        expect(result.content).toContain("description: New description");
    });

    it("removes SETUP_REQUIRED once no FILL_INSTRUCTION remains", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const filled = installed.content.replace(
            /<FILL_INSTRUCTION>\n[\s\S]*?<\/FILL_INSTRUCTION>\n/,
            "Filled content.\n",
        );
        const result = merge({
            templateContent: TEMPLATE,
            installed: filled,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["project_map"],
        });
        expect(result.content).not.toContain("SETUP_REQUIRED");
        expect(result.content).toContain("Filled content.");
    });

    it("removes a selected block that is no longer in the lock as an insertion", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const result = merge({
            templateContent: TEMPLATE,
            installed: installed.content,
            lockHashes: {},
            selected: ["project_map", "code_style"],
        });
        expect(result.content).toContain("<code_style>");
    });

    const ABC = `---
description: Anchors
---

<astp-block name="a">
A
</astp-block>

<astp-block name="b">
B
</astp-block>

<astp-block name="c">
C
</astp-block>
`;

    it("inserts a newly selected block whose preceding anchor is being removed", () => {
        const installed = merge({ templateContent: ABC, selected: ["a", "c"] });
        const result = merge({
            templateContent: ABC,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["b", "c"],
        });
        expect(result.content).not.toContain("<a>");
        expect(result.content).toContain("<b>");
        expect(result.content.indexOf("<b>")).toBeLessThan(result.content.indexOf("<c>"));
        expect(Object.keys(result.blocks)).toEqual(["b", "c"]);
    });

    it("inserts a newly selected block whose following anchor is being removed", () => {
        const bca = ABC.replace(
            '<astp-block name="a">\nA\n</astp-block>\n\n<astp-block name="b">\nB\n</astp-block>',
            '<astp-block name="b">\nB\n</astp-block>\n\n<astp-block name="a">\nA\n</astp-block>',
        );
        const installed = merge({ templateContent: bca, selected: ["a", "c"] });
        const result = merge({
            templateContent: bca,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["b", "c"],
        });
        expect(result.content).not.toContain("<a>");
        expect(result.content).toContain("<b>");
        expect(result.content.indexOf("<b>")).toBeLessThan(result.content.indexOf("<c>"));
        expect(Object.keys(result.blocks)).toEqual(["b", "c"]);
    });

    it("C == T is a clean replace, not a conflict", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const applied = installed.content.replace("Ready-made text.", "New ready-made text.");
        const result = merge({
            templateContent: TEMPLATE.replace("Ready-made text.", "New ready-made text."),
            installed: applied,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["code_style"],
        });
        expect(result.conflicts).toEqual([]);
        expect(result.content).not.toContain("FILL_INSTRUCTION");
        expect(result.content).toContain("New ready-made text.");
    });
});
