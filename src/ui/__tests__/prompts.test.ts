import { PassThrough } from "node:stream";

import * as p from "@clack/prompts";

import type { Bundle, InstallTarget, UpdateReport } from "@/types/index.js";
import { ALL_PLATFORMS } from "@/types/index.js";

import type { BundleEntry } from "../prompts.js";
import {
    BundleTreePrompt,
    confirmInstall,
    selectPlatform,
    showCheckReport,
    showUpdateReport,
    warnForeign,
    warnLegacyModified,
    warnModified,
} from "../prompts.js";

vi.mock("@clack/prompts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@clack/prompts")>()),
    intro: vi.fn(),
    outro: vi.fn(),
    spinner: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
    confirm: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn() },
    isCancel: vi.fn(() => false),
    cancel: vi.fn(),
}));

const mockSelect = vi.mocked(p.select);

const UP = "\x1b[A";
const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const ENTER = "\r";
const SPACE = " ";

function treeEntry(
    name: string,
    unitPaths: string[],
    {
        defaults = unitPaths,
        preselected = false,
        blocks = {},
        optionalBlocks = [],
        blockDefaults = [],
    }: {
        defaults?: string[];
        preselected?: boolean;
        /** Unit path → block names, all in the unit's own file. */
        blocks?: Record<string, string[]>;
        optionalBlocks?: string[];
        blockDefaults?: string[];
    } = {},
): BundleEntry {
    return {
        bundle: { name, version: "1.0.0", description: `${name} bundle`, default: preselected, items: [] },
        units: unitPaths.map((unitPath) => ({
            kind: "file" as const,
            relativePath: unitPath,
            item: { source: `x/${unitPath}`, target: unitPath, category: "agent" as const },
        })),
        defaults,
        preselected,
        blocks: new Map(
            Object.entries(blocks).map(([unitPath, names]) => [
                unitPath,
                names.map((name) => ({
                    key: `${unitPath}#${name}`,
                    name,
                    file: unitPath,
                    optional: optionalBlocks.includes(name),
                })),
            ]),
        ),
        blockDefaults,
    };
}

function drivePrompt(entries: BundleEntry[], keys: string[] = []) {
    const input = new PassThrough();
    const prompt = new BundleTreePrompt({
        entries,
        input,
        output: new PassThrough(),
        validate: (value) => (!value || value.size === 0 ? "Please select at least one option." : undefined),
        render: () => "",
    });
    const result = prompt.prompt();
    for (const key of keys) input.write(key);
    return { prompt, input, result };
}

describe("BundleTreePrompt", () => {
    it("starts collapsed: down moves bundle to bundle, enter returns preselected defaults", async () => {
        const { prompt, result } = drivePrompt(
            [
                treeEntry("one", ["agents/a.md"], { preselected: true }),
                treeEntry("two", ["agents/b.md"]),
                treeEntry("three", ["agents/c.md"]),
            ],
            [DOWN, ENTER],
        );

        await expect(result).resolves.toEqual(new Map([["one", { units: ["agents/a.md"], blocks: [] }]]));
        expect(prompt.cursor).toBe(1);
    });

    it("expands with right, toggles items, and shows the partial count under the collapsed bundle", async () => {
        const entry = treeEntry("one", ["agents/a.md", "agents/b.md"], { preselected: true });
        const two = treeEntry("two", ["agents/c.md"]);
        const { prompt, input, result } = drivePrompt([entry, two], [RIGHT, DOWN, SPACE]);

        await vi.waitFor(() => expect(prompt.chosen.get("one")?.size).toBe(1));
        expect(prompt.renderRow({ entry }, false)).not.toContain("└");
        for (const key of [LEFT, ENTER]) input.write(key);
        await expect(result).resolves.toEqual(new Map([["one", { units: ["agents/b.md"], blocks: [] }]]));
        expect(prompt.renderRow({ entry }, false)).toContain("└ 1/2* agents");
        expect(prompt.renderRow({ entry: two }, false)).toContain("└ 1 agent");
    });

    it("left on an item collapses and puts the cursor on the bundle row", async () => {
        const entry = treeEntry("one", ["agents/a.md"], { preselected: true });
        const { prompt, input, result } = drivePrompt([entry, treeEntry("two", ["agents/b.md"])], [RIGHT, DOWN]);

        await vi.waitFor(() => expect(prompt.cursor).toBe(1));
        for (const key of [LEFT, SPACE]) input.write(key);

        await vi.waitFor(() => expect(prompt.expanded.has("one")).toBe(false));
        expect(prompt.cursor).toBe(0);
        // The collapsed bundle is now toggled off; a second Space re-selects its defaults.
        expect(prompt.chosen.get("one")?.size).toBe(0);
        for (const key of [SPACE, ENTER]) input.write(key);
        await expect(result).resolves.toEqual(new Map([["one", { units: ["agents/a.md"], blocks: [] }]]));
    });

    it("space on an unselected bundle chooses its defaults, not declined units", async () => {
        const { prompt, input, result } = drivePrompt(
            [treeEntry("one", ["agents/a.md", "agents/b.md"], { defaults: ["agents/a.md"] })],
            [SPACE],
        );

        await vi.waitFor(() => expect(prompt.chosen.get("one")?.size).toBe(1));
        expect(prompt.chosen.get("one")).toEqual(new Set(["agents/a.md"]));
        input.write(SPACE);
        await vi.waitFor(() => expect(prompt.chosen.get("one")?.size).toBe(0));
        expect(prompt.value).toEqual(new Map());
        result.catch(() => {});
    });

    it("enter with nothing chosen shows the required error and stays open", async () => {
        const { prompt, input, result } = drivePrompt(
            [treeEntry("one", ["agents/a.md"]), treeEntry("two", ["agents/b.md"], { preselected: true })],
            [ENTER],
        );

        await expect(result).resolves.toEqual(new Map([["two", { units: ["agents/b.md"], blocks: [] }]]));
        expect(prompt.state).toBe("submit");

        const empty = drivePrompt([treeEntry("three", ["agents/c.md"])], [ENTER]);
        await vi.waitFor(() => expect(empty.prompt.state).toBe("error"));
        for (const key of [SPACE, ENTER]) empty.input.write(key);
        await expect(empty.result).resolves.toEqual(new Map([["three", { units: ["agents/c.md"], blocks: [] }]]));
    });

    it("up from the first row wraps to the last visible row", async () => {
        const { prompt, input, result } = drivePrompt(
            [treeEntry("one", ["agents/a.md"]), treeEntry("two", ["agents/b.md"]), treeEntry("three", ["agents/c.md"])],
            [UP],
        );

        await vi.waitFor(() => expect(prompt.cursor).toBe(2));
        for (const key of [SPACE, ENTER]) input.write(key);
        await expect(result).resolves.toEqual(new Map([["three", { units: ["agents/c.md"], blocks: [] }]]));
    });
});

describe("BundleTreePrompt blocks", () => {
    const RULE = "rules/r.md";
    const withBlocks = (options: { preselected?: boolean; blockDefaults?: string[] } = {}) =>
        treeEntry("one", [RULE, "agents/a.md"], {
            blocks: { [RULE]: ["x", "y"] },
            blockDefaults: [`${RULE}#x`, `${RULE}#y`],
            ...options,
        });

    it("a single bundle starts expanded; right on an item shows its blocks, left returns to the item", async () => {
        const { prompt, input, result } = drivePrompt([withBlocks({ preselected: true })], [DOWN, RIGHT]);

        await vi.waitFor(() => expect(prompt.rows).toHaveLength(5));
        expect(prompt.rows.map((row) => row.block?.name ?? row.unit?.relativePath ?? row.entry.bundle.name)).toEqual([
            "one",
            RULE,
            "x",
            "y",
            "agents/a.md",
        ]);
        for (const key of [DOWN, DOWN, SPACE, LEFT]) input.write(key);
        await vi.waitFor(() => expect(prompt.rows).toHaveLength(3));
        expect(prompt.cursor).toBe(1);
        expect(prompt.renderRow(prompt.rows[1]!, false)).toContain("└ 1/2* blocks");
        input.write(ENTER);
        await expect(result).resolves.toEqual(
            new Map([["one", { units: [RULE, "agents/a.md"], blocks: [`${RULE}#x`] }]]),
        );
    });

    it("marks blocks that differ from the template's defaults with *", async () => {
        const entry = treeEntry("one", [RULE], {
            preselected: true,
            blocks: { [RULE]: ["x", "y"] },
            optionalBlocks: ["y"],
            blockDefaults: [`${RULE}#x`],
        });
        const { prompt, input, result } = drivePrompt([entry], []);

        const itemRow = () => prompt.renderRow(prompt.rows[1]!, false);
        await vi.waitFor(() => expect(prompt.rows).toHaveLength(2));
        expect(itemRow()).toContain("└ 1/2 blocks");
        expect(prompt.renderRow({ entry }, false)).not.toContain("└");
        for (const key of [DOWN, RIGHT, DOWN, DOWN, SPACE, LEFT]) input.write(key);
        await vi.waitFor(() => expect(itemRow()).toContain("└ 2* blocks"));
        input.write(LEFT);
        await vi.waitFor(() => expect(prompt.renderRow({ entry }, false)).toContain("└ 1* rule"));
        input.write(ENTER);
        await expect(result).resolves.toEqual(
            new Map([["one", { units: [RULE], blocks: [`${RULE}#x`, `${RULE}#y`] }]]),
        );
    });

    it("right on an item without blocks does nothing", async () => {
        const { prompt, input, result } = drivePrompt([withBlocks({ preselected: true })], [DOWN, DOWN, RIGHT]);

        await vi.waitFor(() => expect(prompt.cursor).toBe(2));
        expect(prompt.rows).toHaveLength(3);
        input.write(ENTER);
        await expect(result).resolves.toEqual(
            new Map([["one", { units: [RULE, "agents/a.md"], blocks: [`${RULE}#x`, `${RULE}#y`] }]]),
        );
    });

    it("space on a block of an unchecked item checks the item and that block", async () => {
        const { prompt, input, result } = drivePrompt(
            [withBlocks({ blockDefaults: [`${RULE}#x`] }), treeEntry("two", ["agents/b.md"])],
            [RIGHT, DOWN, RIGHT, DOWN, DOWN],
        );

        await vi.waitFor(() => expect(prompt.cursor).toBe(3));
        expect(prompt.rows[3]!.block?.name).toBe("y");
        for (const key of [SPACE, ENTER]) input.write(key);
        await expect(result).resolves.toEqual(
            new Map([["one", { units: [RULE], blocks: [`${RULE}#x`, `${RULE}#y`] }]]),
        );
    });

    it("an unchecked item drops its blocks from the result", async () => {
        const { result } = drivePrompt([withBlocks({ preselected: true })], [DOWN, SPACE, ENTER]);

        await expect(result).resolves.toEqual(new Map([["one", { units: ["agents/a.md"], blocks: [] }]]));
    });
});

describe("selectPlatform", () => {
    it("skips the prompt when only one platform is supported", async () => {
        expect(ALL_PLATFORMS).toHaveLength(1);

        await expect(selectPlatform()).resolves.toBe(ALL_PLATFORMS[0]);

        expect(mockSelect).not.toHaveBeenCalled();
    });
});

describe("legacy migration prompts", () => {
    it("shows different check guidance for legacy units with and without manifest entries", () => {
        const currentSkill = {
            bundleName: "core",
            targetPath: "skills/current",
            kind: "skill" as const,
            clean: true,
            inManifest: true,
        };
        const removedSkill = {
            bundleName: "core",
            targetPath: "skills/removed",
            kind: "skill" as const,
            clean: true,
            inManifest: false,
        };
        const report: UpdateReport = {
            updates: [],
            upToDate: [],
            notInManifest: [],
            legacySkills: [currentSkill, removedSkill],
        };

        vi.mocked(p.log.info).mockClear();
        showCheckReport(report, "user");

        const reportText = String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0]);
        expect(reportText).toContain("core: legacy skill skills/current");
        expect(reportText).toContain("run `astp update --target user` to migrate.");
        expect(reportText).toContain("skills/removed — not in the current manifest, left in place.");
        expect(reportText).not.toContain("skills/removed — run `astp update --force` to migrate.");
    });

    it("shows the force-migration hint when modified legacy units are skipped", () => {
        warnLegacyModified(
            [{ targetPath: "skills/example", kind: "skill", state: "legacy" }],
            "astp update --force --target user",
        );

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("Run `astp update --force --target user` to replace them."),
        );
    });

    it("prints overwrite commands with the run's target for foreign units", () => {
        vi.mocked(p.log.warn).mockClear();
        warnForeign("core", [{ targetPath: "skills/sample", kind: "skill", state: "modified" }], [], "user");

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("astp install core --skill skills/sample --force --target user"),
        );
    });

    it("keeps --source in foreign overwrite commands, quoting values with spaces", () => {
        vi.mocked(p.log.warn).mockClear();
        warnForeign(
            "core",
            [{ targetPath: "skills/sample", kind: "skill", state: "modified" }],
            [],
            "user",
            "./my src",
        );

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'astp install core --skill skills/sample --force --source "./my src" --target user',
            ),
        );
    });

    it("warns separately for units owned by another bundle, without --force", () => {
        vi.mocked(p.log.warn).mockClear();
        warnForeign(
            "core",
            [
                { targetPath: "rules/r.md", kind: "file", state: "modified", owner: "other" },
                { targetPath: "rules/x.md", kind: "file", state: "modified" },
            ],
            [],
            "project",
        );

        const calls = vi.mocked(p.log.warn).mock.calls.map((call) => String(call[0]));
        expect(calls).toHaveLength(2);
        const owned = calls.find((text) => text.includes("(other)"))!;
        expect(owned).toContain("rules/r.md (other)");
        expect(owned).toContain("astp delete other --skill rules/r.md --target project");
        expect(owned).toContain("astp install core --skill rules/r.md --target project");
        expect(owned).not.toContain("--force");
        const plain = calls.find((text) => !text.includes("(other)"))!;
        expect(plain).toContain("rules/x.md");
        expect(plain).toContain("astp install core --skill rules/x.md --force --target project");
    });

    it("shows the force-update command when modified units are skipped", () => {
        vi.mocked(p.log.warn).mockClear();
        warnModified([{ targetPath: "agents/example.md", kind: "file", state: "modified" }], "astp update --force");

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("Run `astp update --force` to overwrite them."),
        );
    });
});

describe("out-of-sync update prompts", () => {
    it("labels same-version divergence out of sync in check and update reports", () => {
        const report: UpdateReport = {
            updates: [
                {
                    bundleName: "core",
                    installedVersion: "1.0.0",
                    availableVersion: "1.0.0",
                    units: [{ targetPath: "agents/a.md", kind: "file", state: "new" }],
                },
            ],
            upToDate: [],
            notInManifest: [],
            legacySkills: [],
        };

        vi.mocked(p.log.info).mockClear();
        showCheckReport(report, "project");
        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain("↻ Out of sync");

        vi.mocked(p.log.info).mockClear();
        showUpdateReport(report);
        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain("core: 1.0.0 out of sync (1 agent)");
    });

    it("reports bundles that are no longer in the current manifest", () => {
        const report: UpdateReport = {
            updates: [],
            upToDate: [],
            notInManifest: [{ bundleName: "removed", version: "1.0.0", units: [], declined: [] }],
            legacySkills: [],
        };

        vi.mocked(p.log.info).mockClear();
        showUpdateReport(report);

        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain(
            "removed: not in the current manifest, left in place.",
        );
    });
});

describe("install confirmation counts", () => {
    it("counts a nested SKILL.md within its outer skill", async () => {
        const bundle: Bundle = {
            name: "sample",
            version: "1.0.0",
            description: "Sample",
            default: false,
            items: [
                { source: "sample/skills/a/SKILL.md", target: "skills/a/SKILL.md", category: "skill" },
                {
                    source: "sample/skills/a/examples/sub/SKILL.md",
                    target: "skills/a/examples/sub/SKILL.md",
                    category: "skill",
                },
            ],
        };
        const target: InstallTarget = { platform: "claude-code", type: "project", rootDir: "/project/.claude" };
        vi.mocked(p.confirm).mockResolvedValue(true);

        await confirmInstall([bundle], target);

        expect(p.confirm).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("(1 skill)") }),
        );
    });
});
