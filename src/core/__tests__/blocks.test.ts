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
    force?: boolean | ReadonlySet<string>;
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
    return { name, description: null, optional: false, required: false, content };
}

const NESTED = `<astp-block name="parent">
Before.
<astp-block name="child" optional>
Child.
<astp-block name="grandchild" optional>
Grandchild.
</astp-block>
After child.
</astp-block>
After.
</astp-block>
`;

describe("parseTemplateBlocks", () => {
    it("parses frontmatter and blocks with attributes", () => {
        const { frontmatter, blocks, errors } = parseTemplateBlocks(TEMPLATE);
        expect(errors).toEqual([]);
        expect(frontmatter).toBe("---\ndescription: Project map and code style\n---\n");
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({
            name: "project_map",
            description: null,
            optional: false,
            required: false,
        });
        expect(blocks[0]!.content).toContain("## Project Map");
        expect(blocks[0]!.content.endsWith("\n")).toBe(true);
        expect(blocks[1]).toMatchObject({ name: "code_style", description: null, optional: true });
    });

    it("parses description attribute with spaces and '>' characters", () => {
        const content = '<astp-block name="a" description="First -> second block" optional>\nx\n</astp-block>\n';
        const { blocks, errors } = parseTemplateBlocks(content);
        expect(errors).toEqual([]);
        expect(blocks).toEqual([
            {
                name: "a",
                description: "First -> second block",
                optional: true,
                required: false,
                content: "x\n",
            },
        ]);
    });

    it("parses labels attribute on blocks", () => {
        const content =
            '<astp-block name="a" labels="experimental, deprecated" description="Desc" optional>\nx\n</astp-block>\n';
        const { blocks, errors } = parseTemplateBlocks(content);
        expect(errors).toEqual([]);
        expect(blocks).toEqual([
            {
                name: "a",
                description: "Desc",
                labels: ["experimental", "deprecated"],
                optional: true,
                required: false,
                content: "x\n",
            },
        ]);
    });

    it("parses use-when attribute on blocks", () => {
        const content =
            '<astp-block name="a" description="Desc" use-when="When the project needs custom overrides" optional>\nx\n</astp-block>\n';
        const { blocks, errors } = parseTemplateBlocks(content);
        expect(errors).toEqual([]);
        expect(blocks).toEqual([
            {
                name: "a",
                description: "Desc",
                useWhen: "When the project needs custom overrides",
                optional: true,
                required: false,
                content: "x\n",
            },
        ]);
    });

    it("parses positive and negated platforms on blocks", () => {
        const content = '<astp-block name="a" platforms="claude-code, !claude-code">\nx\n</astp-block>\n';
        const { blocks, errors } = parseTemplateBlocks(content);
        expect(errors).toEqual([]);
        expect(blocks[0]!.platforms).toEqual(["claude-code", "!claude-code"]);
    });

    it.each([
        ["missing name", "<astp-block>\nx\n</astp-block>\n", /name/i],
        ["invalid name", '<astp-block name="Bad_Name">\nx\n</astp-block>\n', /invalid block name/i],
        ["unknown attribute", '<astp-block name="a" foo>\nx\n</astp-block>\n', /unknown attribute 'foo'/i],
        ["empty description", '<astp-block name="a" description="  ">\nx\n</astp-block>\n', /empty 'description'/i],
        [
            "duplicate description",
            '<astp-block name="a" description="one" description="two">\nx\n</astp-block>\n',
            /duplicate 'description'/i,
        ],
        ["empty use-when", '<astp-block name="a" use-when="  ">\nx\n</astp-block>\n', /empty 'use-when'/i],
        [
            "duplicate use-when",
            '<astp-block name="a" use-when="one" use-when="two">\nx\n</astp-block>\n',
            /duplicate 'use-when'/i,
        ],
        ["empty labels", '<astp-block name="a" labels="  ">\nx\n</astp-block>\n', /empty 'labels'/i],
        [
            "duplicate labels attribute",
            '<astp-block name="a" labels="one" labels="two">\nx\n</astp-block>\n',
            /duplicate 'labels'/i,
        ],
        ["invalid label", '<astp-block name="a" labels="Bad">\nx\n</astp-block>\n', /invalid block label 'Bad'/i],
        [
            "trailing comma in labels",
            '<astp-block name="a" labels="ok,">\nx\n</astp-block>\n',
            /invalid block label ''/i,
        ],
        [
            "duplicate label value",
            '<astp-block name="a" labels="experimental, experimental">\nx\n</astp-block>\n',
            /duplicate block label 'experimental'/i,
        ],
        ["empty platforms", '<astp-block name="a" platforms="  ">\nx\n</astp-block>\n', /empty 'platforms'/i],
        [
            "duplicate platforms attribute",
            '<astp-block name="a" platforms="claude-code" platforms="claude-code">\nx\n</astp-block>\n',
            /duplicate 'platforms'/i,
        ],
        [
            "unknown platform",
            '<astp-block name="a" platforms="!jetbrains">\nx\n</astp-block>\n',
            /unknown block platform '!jetbrains'/i,
        ],
        [
            "duplicate platform",
            '<astp-block name="a" platforms="claude-code, claude-code">\nx\n</astp-block>\n',
            /duplicate block platform/i,
        ],
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
        [
            "malformed tag with trailing text",
            '<astp-block name="a">\nx\n</astp-block>\n\n<astp-block name="b"> oops\ny\n',
            /malformed <astp-block> tag/,
        ],
        ["malformed inline tag", '<astp-block name="x">text</astp-block>\n', /malformed <astp-block> tag/],
        ["malformed tag as the only marker", '<astp-block name="x"> oops\n', /malformed <astp-block> tag/],
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

    it("rejects a line inside a block equal to any block's installed tag", () => {
        const { errors } = parseTemplateBlocks(
            '<astp-block name="a">\n<a>\n<c>\n</astp-block>\n\n<astp-block name="b">\nx\n</astp-block>\n\n<astp-block name="c">\ny\n</astp-block>\n',
        );
        expect(errors).toEqual([
            "line 2: '<a>' matches the installed tag of block 'a'",
            "line 3: '<c>' matches the installed tag of block 'c'",
        ]);
    });

    it("parses nested blocks in preorder with their parents", () => {
        const { blocks, errors } = parseTemplateBlocks(NESTED);
        expect(errors).toEqual([]);
        expect(blocks.map((block) => [block.name, block.parent])).toEqual([
            ["parent", undefined],
            ["child", "parent"],
            ["grandchild", "child"],
        ]);
        expect(blocks[0]!.content).toContain('<astp-block name="child"');
        expect(blocks[1]!.content).toContain("After child.");
    });

    it("normalizes CRLF before parsing", () => {
        const { frontmatter, blocks, errors } = parseTemplateBlocks(TEMPLATE.replace(/\n/g, "\r\n"));
        expect(errors).toEqual([]);
        expect(frontmatter).toBe("---\ndescription: Project map and code style\n---\n");
        expect(blocks[0]!.content).not.toContain("\r");
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

    it("parses recorded blocks nested inside other recorded blocks", () => {
        const parsed = parseInstalledBlocks("<a>\nA\n<b>\nB\n<c>\nC\n</c>\n</b>\n</a>\n", ["a", "b", "c"]);
        expect(parsed).not.toBeNull();
        expect(parsed!.blocks.get("a")!.parent).toBeUndefined();
        expect(parsed!.blocks.get("b")!.parent).toBe("a");
        expect(parsed!.blocks.get("c")!.parent).toBe("b");
        expect(parsed!.blocks.get("a")!.content).toContain("<b>");
    });

    it.each([
        ["recorded name opens twice", `${installed}<project_map>\nx\n</project_map>\n`, ["project_map"]],
        ["unclosed recorded block", "<a>\nx\n", ["a"]],
        ["recorded block inside SETUP_REQUIRED", "<SETUP_REQUIRED>\n<a>\nx\n</a>\n</SETUP_REQUIRED>\n", ["a"]],
        ["stray recorded closing", "</a>\n", ["a"]],
        ["stray SETUP_REQUIRED closing", "</SETUP_REQUIRED>\n", []],
        ["SETUP_REQUIRED twice", `${SETUP}\n${SETUP}`, []],
        ["SETUP_REQUIRED unclosed", "<SETUP_REQUIRED>\nx\n", []],
        ["unclosed fence at EOF", "<a>\nx\n</a>\n\n```\ndangling\n", ["a"]],
    ])("returns null: %s", (_label, content, names) => {
        expect(parseInstalledBlocks(content, names)).toBeNull();
    });

    it("ignores </SETUP_REQUIRED> inside a recorded block", () => {
        const parsed = parseInstalledBlocks("<a>\nx\n</SETUP_REQUIRED>\n</a>\n", ["a"]);
        expect(parsed).not.toBeNull();
        expect(parsed!.blocks.get("a")!.content).toContain("</SETUP_REQUIRED>");
    });

    it("marks the SETUP_REQUIRED region edited when its text changed", () => {
        const clean = parseInstalledBlocks(installed, ["project_map"])!;
        expect(clean.setup).toMatchObject({ edited: false });
        const edited = parseInstalledBlocks(installed.replace("Replace every", "Note:"), ["project_map"])!;
        expect(edited.setup).toMatchObject({ edited: true });
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

    it("a set of names forces only those blocks", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map", "code_style"] });
        const filled = installed.content
            .replace("Describe the project file structure. If the map depth is not obvious, ask the user.", "Our map.")
            .replace("Ready-made text.", "Our own style.");
        const changedTemplate = TEMPLATE.replace(
            "Describe the project file structure. If the map depth is not obvious, ask the user.",
            "List top-level dirs.",
        ).replace("Ready-made text.", "New ready-made text.");

        const result = merge({
            templateContent: changedTemplate,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["project_map", "code_style"],
            force: new Set(["code_style"]),
        });
        expect(result.conflicts).toEqual(["project_map"]);
        expect(result.content).toContain("Our map.");
        expect(result.content).toContain("New ready-made text.");
        expect(result.content).not.toContain("Our own style.");
        expect(result.content).toContain("The astp template of this block changed");
    });

    it("--force restores an edited block when the template is unchanged, unless it holds a FILL_INSTRUCTION", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map", "code_style"] });
        const filled = installed.content
            .replace("Describe the project file structure. If the map depth is not obvious, ask the user.", "Our map.")
            .replace("Ready-made text.", "Our own style.");

        const result = merge({
            templateContent: TEMPLATE,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["project_map", "code_style"],
            force: true,
        });
        expect(result.content).toContain("Ready-made text.");
        expect(result.content).not.toContain("Our own style.");
        expect(result.content).toContain("Our map.");
        expect(result.conflicts).toEqual([]);
    });

    it("--force on an edited FILL_INSTRUCTION block conflicts like an unforced merge", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const filled = installed.content.replace(
            "Describe the project file structure. If the map depth is not obvious, ask the user.",
            "Our map.",
        );
        const changedTemplate = TEMPLATE.replace(
            "Describe the project file structure. If the map depth is not obvious, ask the user.",
            "List top-level dirs.",
        );

        const result = merge({
            templateContent: changedTemplate,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["project_map"],
            force: true,
        });
        expect(result.conflicts).toEqual(["project_map"]);
        expect(result.content).toContain("Our map.");
        expect(result.content).toContain("The astp template of this block changed");
        expect(result.content).toContain("List top-level dirs.");
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
        const released = merge({
            templateContent: smaller,
            installed: filled,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["project_map"],
        });
        expect(released.released).toEqual(["code_style"]);
        expect(released.kept).toEqual([]);
        expect(released.content).toContain("Our own style.");
        expect(released.blocks).not.toHaveProperty("code_style");
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

    it("replaces the note on a second conflict even when the template holds a FILL_INSTRUCTION", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const filled = installed.content.replace(
            "Describe the project file structure. If the map depth is not obvious, ask the user.",
            "Our map.",
        );
        const t1 = TEMPLATE.replace(
            "Describe the project file structure. If the map depth is not obvious, ask the user.",
            "List top-level dirs.",
        );
        const first = merge({
            templateContent: t1,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["project_map"],
        });
        const t2 = TEMPLATE.replace(
            "Describe the project file structure. If the map depth is not obvious, ask the user.",
            "List top-level dirs, then recurse.",
        );
        const second = merge({
            templateContent: t2,
            installed: first.content,
            lockHashes: first.blocks,
            selected: ["project_map"],
        });
        expect(second.content.match(/The astp template of this block changed/g)).toHaveLength(1);
        expect(second.content.match(/<\/FILL_INSTRUCTION>/g)).toHaveLength(3);
        expect(parseInstalledBlocks(second.content, ["project_map"])).not.toBeNull();
        expect(second.content).toContain("<SETUP_REQUIRED>");
    });

    it("lengthens the wrapper fence for indented backtick runs in the template", () => {
        const withIndented = TEMPLATE.replace(
            "Ready-made text.",
            "Ready-made text.\n\n  ````\n  indented fence\n  ````",
        );
        const installed = merge({ templateContent: TEMPLATE, selected: ["code_style"] });
        const filled = installed.content.replace("Ready-made text.", "Our own style.");
        const result = merge({
            templateContent: withIndented,
            installed: filled,
            lockHashes: installed.blocks,
            selected: ["code_style"],
        });
        const parsed = parseInstalledBlocks(result.content, ["code_style"]);
        expect(parsed).not.toBeNull();
        expect(parsed!.blocks.get("code_style")!.content).toContain("</FILL_INSTRUCTION>");
    });

    it("keeps an edited SETUP_REQUIRED region in place without re-adding it", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const edited = installed.content.replace(
            "Replace every <FILL_INSTRUCTION> in this file with the content it describes, then remove this block.",
            "Fill in the blocks below.",
        );
        const result = merge({
            templateContent: TEMPLATE,
            installed: edited,
            lockHashes: installed.blocks,
            selected: ["project_map"],
        });
        expect(result.content).toContain("<SETUP_REQUIRED>\nFill in the blocks below.\n</SETUP_REQUIRED>");
        expect(result.content.match(/<SETUP_REQUIRED>/g)).toHaveLength(1);
    });

    it("renders a CRLF template with LF line endings", () => {
        const result = merge({ templateContent: TEMPLATE.replace(/\n/g, "\r\n"), selected: ["project_map"] });
        expect(result.content).toBe(EXPECTED_ISSUE_RENDER);
    });

    it("merges a CRLF installed file to LF output", () => {
        const installed = merge({ templateContent: TEMPLATE, selected: ["project_map"] });
        const result = merge({
            templateContent: TEMPLATE,
            installed: installed.content.replace(/\n/g, "\r\n"),
            lockHashes: installed.blocks,
            selected: ["project_map"],
        });
        expect(result.content).not.toContain("\r");
        expect(result.content).toBe(installed.content);
        expect(result.blocks).toEqual(installed.blocks);
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

    it("renders nested selected blocks without template tags", () => {
        const result = merge({ templateContent: NESTED, selected: ["parent", "child", "grandchild"] });
        expect(result.content).toBe(`<parent>
Before.
<child>
Child.
<grandchild>
Grandchild.
</grandchild>
After child.
</child>
After.
</parent>
`);
        expect(Object.keys(result.blocks)).toEqual(["parent", "child", "grandchild"]);
    });

    it("renders a parent without declined descendants", () => {
        const result = merge({ templateContent: NESTED, selected: ["parent"] });
        expect(result.content).toContain("<parent>\nBefore.\nAfter.\n</parent>");
        expect(result.content).not.toContain("<child>");
        expect(result.declinedBlocks).toEqual(["child", "grandchild"]);
    });

    it("updates a nested child without changing its parent's hash", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent", "child", "grandchild"] });
        const updated = merge({
            templateContent: NESTED.replace("Grandchild.", "New grandchild."),
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child", "grandchild"],
        });
        expect(updated.content).toContain("New grandchild.");
        expect(updated.blocks.parent).toBe(installed.blocks.parent);
        expect(updated.blocks.child).toBe(installed.blocks.child);
        expect(updated.blocks.grandchild).not.toBe(installed.blocks.grandchild);
        expect(updated.conflicts).toEqual([]);
    });

    it("inserts and removes nested blocks inside their parent", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent"] });
        const inserted = merge({
            templateContent: NESTED,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(inserted.content).toContain("Before.\n<child>\nChild.\nAfter child.\n</child>\nAfter.");
        expect(inserted.content).not.toContain("<grandchild>");

        const removed = merge({
            templateContent: NESTED,
            installed: inserted.content,
            lockHashes: inserted.blocks,
            declined: inserted.declinedBlocks,
            selected: ["parent"],
        });
        expect(removed.content).toBe(installed.content);
        expect(removed.declinedBlocks).toEqual(["child", "grandchild"]);
    });

    it("merges parent and child conflicts independently", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent", "child"] });
        const edited = installed.content.replace("Before.", "Our before.").replace("Child.", "Our child.");
        const updated = merge({
            templateContent: NESTED.replace("Before.", "New before.").replace("Child.", "New child."),
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(updated.conflicts).toEqual(["child", "parent"]);
        expect(updated.content.match(/Our before\./g)).toHaveLength(1);
        expect(updated.content.match(/Our child\./g)).toHaveLength(1);
        expect(updated.content).toContain("New before.");
        expect(updated.content).toContain("New child.");
        expect(updated.content.match(/<child>/g)).toHaveLength(1);
        expect(parseInstalledBlocks(updated.content, ["parent", "child"])).not.toBeNull();
    });

    it("keeps an edited nested subtree when its parent is deselected unless forced", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent", "child"] });
        const edited = installed.content.replace("Child.", "Our child.");
        const kept = merge({
            templateContent: NESTED,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: [],
        });
        expect(kept.content).toBe(edited);
        expect(kept.kept).toEqual(["child", "parent"]);
        expect(kept.blocks).toEqual(installed.blocks);

        const forced = merge({
            templateContent: NESTED,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: [],
            force: true,
        });
        expect(forced.content).toBe("");
        expect(forced.blocks).toEqual({});
    });

    it("keeps the parent of an edited child when the subtree leaves the template", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent", "child"] });
        const edited = installed.content.replace("Child.", "Our child.");
        const result = merge({
            templateContent: "",
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: [],
        });
        expect(result.content).toBe(edited);
        expect(result.released).toEqual(["child", "parent"]);
        expect(result.blocks).toEqual({});
    });

    it("preserves a released edited child when replacing its parent", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent", "child"] });
        const edited = installed.content.replace("Child.", "Our child.");
        const withoutChild = `<astp-block name="parent">\nBefore.\nAfter.\n</astp-block>\n`;
        const result = merge({
            templateContent: withoutChild,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent"],
        });
        expect(result.released).toEqual(["child"]);
        expect(result.content).toContain("Our child.");
        expect(result.content.match(/<child>/g)).toHaveLength(1);
    });

    it("moves existing blocks between root and nested positions without duplication or loss", () => {
        const flat = `<astp-block name="parent">\nParent.\n</astp-block>\n<astp-block name="child">\nChild.\n</astp-block>\n`;
        const nested = `<astp-block name="parent">\nParent.\n<astp-block name="child">\nChild.\n</astp-block>\n</astp-block>\n`;
        const installed = merge({ templateContent: flat, selected: ["parent", "child"] });
        const inward = merge({
            templateContent: nested,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(inward.content.match(/<child>/g)).toHaveLength(1);
        expect(inward.content).toContain("<parent>\nParent.\n<child>");
        expect(parseInstalledBlocks(inward.content, ["parent", "child"])).not.toBeNull();

        const outward = merge({
            templateContent: flat,
            installed: inward.content,
            lockHashes: inward.blocks,
            declined: inward.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(outward.content).toBe(installed.content);
    });

    it("moves an edited existing child into a newly inserted parent", () => {
        const flat = `<astp-block name="child">\nChild.\n</astp-block>\n`;
        const nested = `<astp-block name="parent">\nParent.\n<astp-block name="child">\nChild.\n</astp-block>\n</astp-block>\n`;
        const installed = merge({ templateContent: flat, selected: ["child"] });
        const edited = installed.content.replace("Child.", "Our child.");
        const result = merge({
            templateContent: nested,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(result.content).toBe("<parent>\nParent.\n<child>\nOur child.\n</child>\n</parent>\n");
    });

    it("leaves a foreign parent and its descendants untouched", () => {
        const template = tpl(NESTED);
        const content = "<parent>\nForeign.\n</parent>\n";
        const result = mergeBlockFile({
            template,
            installed: parseInstalledBlocks(content, ["parent", "child", "grandchild"]),
            lockHashes: {},
            declined: new Set(),
            selected: new Set(["parent", "child", "grandchild"]),
            force: false,
        });
        expect(result.content).toBe(content);
        expect(result.foreign).toEqual(["parent"]);
        expect(result.declinedBlocks).toEqual(["child", "grandchild", "parent"]);
        expect(result.blocks).toEqual({});
    });

    it("inserts a new child at its template position inside an edited parent", () => {
        const flat = `<astp-block name="parent">\nBefore.\nAfter.\n</astp-block>\n`;
        const installed = merge({ templateContent: flat, selected: ["parent"] });
        const edited = installed.content.replace("Before.", "Our before.");
        const nested = `<astp-block name="parent">\nBefore.\n<astp-block name="child">\nChild.\n</astp-block>\nAfter.\n</astp-block>\n`;
        const result = merge({
            templateContent: nested,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(result.content).toContain("Our before.\n<child>\nChild.\n</child>\nAfter.");
    });

    it("preserves a moved edited child when its new parent conflicts", () => {
        const flat = `<astp-block name="parent">\nBefore.\n</astp-block>\n<astp-block name="child">\nChild.\n</astp-block>\n`;
        const nested = `<astp-block name="parent">\nNew before.\n<astp-block name="child">\nChild.\n</astp-block>\n</astp-block>\n`;
        const installed = merge({ templateContent: flat, selected: ["parent", "child"] });
        const edited = installed.content.replace("Before.", "Our before.").replace("Child.", "Our child.");
        const result = merge({
            templateContent: nested,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(result.conflicts).toEqual(["parent"]);
        expect(result.content.match(/<child>/g)).toHaveLength(1);
        expect(result.content).toContain("Our child.");
        expect(parseInstalledBlocks(result.content, ["parent", "child"])).not.toBeNull();
    });

    it("does not use text inside code fences as a child insertion anchor", () => {
        const flat = `<astp-block name="parent">\nBefore.\nAfter.\n</astp-block>\n`;
        const nested = `<astp-block name="parent">\nBefore.\n<astp-block name="child">\nChild.\n</astp-block>\nAfter.\n</astp-block>\n`;
        const installed = merge({ templateContent: flat, selected: ["parent"] });
        const edited = "<parent>\n~~~\nAfter.\n~~~\nOur before.\nAfter.\n</parent>\n";
        const result = merge({
            templateContent: nested,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(result.content).toContain("Our before.\n<child>\nChild.\n</child>\nAfter.");
        const parsed = parseInstalledBlocks(result.content, ["parent", "child"]);
        expect(parsed!.blocks.get("child")!.content).toBe("Child.\n");
    });

    it("removes an unchanged obsolete parent after its child moves to root", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent", "child"] });
        const rootChild = `<astp-block name="child">\nChild.\nAfter child.\n</astp-block>\n`;
        const result = merge({
            templateContent: rootChild,
            installed: installed.content,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["child"],
        });
        expect(result.content).toBe("<child>\nChild.\nAfter child.\n</child>\n");
        expect(result.content).not.toContain("<parent>");
        expect(result.released).toEqual([]);
        expect(Object.keys(result.blocks)).toEqual(["child"]);
    });

    it("preserves dollar sequences in nested content during parent conflicts", () => {
        const installed = merge({ templateContent: NESTED, selected: ["parent", "child"] });
        const childText = "const value = $'\\n'; $$ $& $`;\n";
        const edited = installed.content.replace("Before.", "Our before.").replace("Child.\n", () => childText);
        const result = merge({
            templateContent: NESTED.replace("Before.", "New Before."),
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(result.conflicts).toEqual(["parent"]);
        expect(result.content).toContain(`<child>\n${childText}After child.\n</child>`);
    });

    it("does not anchor a moved child to matching text inside a sibling", () => {
        const flat = `<astp-block name="parent">
Before.
<astp-block name="sibling">
After.
</astp-block>
After.
</astp-block>
<astp-block name="child">
Child.
</astp-block>
`;
        const nested = `<astp-block name="parent">
New before.
<astp-block name="sibling">
After.
</astp-block>
<astp-block name="child">
Child.
</astp-block>
After.
</astp-block>
`;
        const installed = merge({ templateContent: flat, selected: ["parent", "sibling", "child"] });
        const edited = installed.content.replace("Before.", "Our before.").replace("Child.", "Our child.");
        const result = merge({
            templateContent: nested,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "sibling", "child"],
        });
        const parsed = parseInstalledBlocks(result.content, ["parent", "sibling", "child"]);
        expect(parsed!.blocks.get("child")!.parent).toBe("parent");
        expect(parsed!.blocks.get("child")!.content).toBe("Our child.\n");
    });

    it("uses an anchor that starts outside and contains a code fence", () => {
        const flat = `<astp-block name="parent">\nBefore.\nAfter.\n</astp-block>\n`;
        const nested = `<astp-block name="parent">
Before.
<astp-block name="child">
Child.
</astp-block>
\`\`\`sh
npm i
\`\`\`
</astp-block>
`;
        const installed = merge({ templateContent: flat, selected: ["parent"] });
        const edited = installed.content.replace("Before.", "Our before.").replace("After.\n", "```sh\nnpm i\n```\n");
        const result = merge({
            templateContent: nested,
            installed: edited,
            lockHashes: installed.blocks,
            declined: installed.declinedBlocks,
            selected: ["parent", "child"],
        });
        expect(result.content).toContain("<child>\nChild.\n</child>\n```sh\nnpm i\n```");
        expect(parseInstalledBlocks(result.content, ["parent", "child"])!.blocks.get("child")!.parent).toBe("parent");
    });
});
