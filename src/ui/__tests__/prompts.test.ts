import { PassThrough } from "node:stream";

import * as p from "@clack/prompts";

import type { Bundle, InstallTarget, UpdateReport } from "@/types/index.js";
import { ALL_PLATFORMS } from "@/types/index.js";

import type { BundleEntry } from "../prompts.js";
import {
    BundleTreePrompt,
    CancelledError,
    confirmInstall,
    selectBlocks,
    selectNewUnits,
    selectPlatform,
    showCheckReport,
    showUpdateReport,
    warnForeign,
    warnLegacyModified,
    warnModified,
    warnNewerManifest,
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
const projectTarget: InstallTarget = { platform: "claude-code", type: "project", rootDir: "/project/.claude" };
const userTarget: InstallTarget = { platform: "kimi-code", type: "user", rootDir: "/home/user/.kimi-code" };

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

    it("renders block description in the block row label when present and omits bundle use-when", async () => {
        const entry = withBlocks({ preselected: true });
        entry.bundle["use-when"] = "Only when the agent needs it";
        entry.blocks.get(RULE)![0]!.description = "First block description";
        const { prompt, input, result } = drivePrompt([entry], [DOWN, RIGHT]);

        await vi.waitFor(() => expect(prompt.rows).toHaveLength(5));
        expect(prompt.renderRow(prompt.rows[0]!, false)).toContain("one — one bundle");
        expect(prompt.renderRow(prompt.rows[0]!, false)).not.toContain("Only when the agent needs it");
        expect(prompt.renderRow(prompt.rows[2]!, false)).toContain("x — First block description");
        expect(prompt.renderRow(prompt.rows[3]!, false)).not.toContain("—");
        input.write(ENTER);
        await result;
    });

    it("selectBlocks includes description in the option label when present", async () => {
        vi.mocked(p.multiselect).mockResolvedValueOnce([`${RULE}#x`] as never);
        await selectBlocks(
            RULE,
            [
                {
                    key: `${RULE}#x`,
                    name: "x",
                    description: "First block",
                    labels: ["experimental"],
                    file: RULE,
                    optional: false,
                },
                { key: `${RULE}#y`, name: "y", description: null, labels: ["deprecated"], file: RULE, optional: true },
            ],
            [`${RULE}#x`],
        );
        expect(p.multiselect).toHaveBeenCalledWith(
            expect.objectContaining({
                options: [
                    { value: `${RULE}#x`, label: "x [experimental] — First block", hint: RULE },
                    { value: `${RULE}#y`, label: "y [deprecated]", hint: RULE },
                ],
            }),
        );
    });

    it("renders unit and block labels and tracks optional unit customization in bundle counts", async () => {
        const entry = treeEntry("one", ["agents/a.md", "agents/opt.md"], {
            defaults: ["agents/a.md"],
            preselected: true,
            blocks: { "agents/a.md": ["x"] },
            blockDefaults: ["agents/a.md#x"],
        });
        entry.units[0]!.labels = ["experimental"];
        entry.units[1]!.optional = true;
        entry.units[1]!.labels = ["deprecated"];
        entry.blocks.get("agents/a.md")![0]!.labels = ["beta"];

        const { prompt, input, result } = drivePrompt([entry], []);
        await vi.waitFor(() => expect(prompt.rows).toHaveLength(3));
        expect(prompt.renderRow(prompt.rows[1]!, false)).toContain("a.md [experimental]");
        expect(prompt.renderRow(prompt.rows[2]!, false)).toContain("opt.md [deprecated]");

        // Collapsed with default selection (a.md selected, opt.md optional and unchecked): not marked customized (*).
        input.write(LEFT);
        await vi.waitFor(() => expect(prompt.expanded.has("one")).toBe(false));
        expect(prompt.renderRow({ entry }, false)).toContain("└ 1/2 agents");
        expect(prompt.renderRow({ entry }, false)).not.toContain("*");

        // Check the optional unit: now customized (*).
        for (const key of [RIGHT, DOWN, DOWN, SPACE, LEFT]) input.write(key);
        await vi.waitFor(() => expect(prompt.expanded.has("one")).toBe(false));
        expect(prompt.renderRow({ entry }, false)).toContain("└ 2* agents");

        // Expand block row to check its label.
        for (const key of [RIGHT, DOWN, RIGHT]) input.write(key);
        await vi.waitFor(() => expect(prompt.rows).toHaveLength(4));
        expect(prompt.renderRow(prompt.rows[2]!, false)).toContain("x [beta]");

        input.write(ENTER);
        await result;
    });

    it("space on an optional-only bundle expands it without selecting optional units", async () => {
        const optOnly = treeEntry("opt", ["agents/opt1.md", "agents/opt2.md"], { defaults: [] });
        optOnly.units[0]!.optional = true;
        optOnly.units[1]!.optional = true;
        const other = treeEntry("other", ["agents/a.md"]);

        const { prompt, input, result } = drivePrompt([optOnly, other], [SPACE]);
        await vi.waitFor(() => expect(prompt.expanded.has("opt")).toBe(true));
        expect(prompt.chosen.get("opt")?.size).toBe(0);

        for (const key of [DOWN, SPACE, ENTER]) input.write(key);
        await expect(result).resolves.toEqual(new Map([["opt", { units: ["agents/opt1.md"], blocks: [] }]]));
    });

    it("selectNewUnits pre-checks only non-optional units and renders unit labels", async () => {
        vi.mocked(p.multiselect).mockResolvedValueOnce(["agents/a.md"] as never);
        await selectNewUnits("core", [
            {
                kind: "file",
                relativePath: "agents/a.md",
                item: { source: "core/agents/a.md", target: "agents/a.md", category: "agent" },
                labels: ["experimental"],
            },
            {
                kind: "file",
                relativePath: "agents/opt.md",
                item: {
                    source: "core/agents/opt.md",
                    target: "agents/opt.md",
                    category: "agent",
                    optional: true,
                    labels: ["deprecated"],
                },
                optional: true,
                labels: ["deprecated"],
            },
        ]);
        expect(p.multiselect).toHaveBeenCalledWith(
            expect.objectContaining({
                options: [
                    { value: "agents/a.md", label: "a.md [experimental]", hint: "agents/a.md" },
                    { value: "agents/opt.md", label: "opt.md [deprecated]", hint: "agents/opt.md" },
                ],
                initialValues: ["agents/a.md"],
            }),
        );
    });

    it("renders frontmatter descriptions in the install tree and new-unit prompt", async () => {
        const entry = treeEntry("one", ["rules/working.md"]);
        entry.units[0]!.description = "Working agreement";
        const { prompt, result } = drivePrompt([entry]);
        expect(prompt.renderRow(prompt.rows[1]!, false)).toContain("working.md — Working agreement");
        result.catch(() => {});

        vi.mocked(p.multiselect).mockResolvedValueOnce([] as never);
        await selectNewUnits("one", entry.units);
        expect(p.multiselect).toHaveBeenCalledWith(
            expect.objectContaining({
                options: [
                    {
                        value: "rules/working.md",
                        label: "working.md — Working agreement",
                        hint: "rules/working.md",
                    },
                ],
            }),
        );
    });
});

describe("selectPlatform", () => {
    it("requires an explicit platform without a terminal when several are supported", async () => {
        expect(ALL_PLATFORMS).toEqual(["claude-code", "kimi-code"]);

        await expect(selectPlatform()).rejects.toThrow("--platform is required without a terminal");

        expect(mockSelect).not.toHaveBeenCalled();
    });
});

describe("cancel", () => {
    const target: InstallTarget = { platform: "claude-code", type: "project", rootDir: "/project/.claude" };
    let exit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.mocked(p.isCancel).mockReturnValue(true);
        exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    });

    afterEach(() => {
        exit.mockRestore();
        vi.mocked(p.isCancel).mockReturnValue(false);
    });

    it("selectNewUnits rejects with CancelledError instead of exiting", async () => {
        vi.mocked(p.multiselect).mockResolvedValue(Symbol("cancel") as never);

        await expect(selectNewUnits("core", [])).rejects.toBeInstanceOf(CancelledError);
        expect(exit).not.toHaveBeenCalled();
    });

    it("confirmInstall rejects with CancelledError instead of exiting", async () => {
        vi.mocked(p.confirm).mockResolvedValue(Symbol("cancel") as never);

        await expect(confirmInstall([], target)).rejects.toBeInstanceOf(CancelledError);
        expect(exit).not.toHaveBeenCalled();
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
        showCheckReport(report, userTarget, []);

        const reportText = String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0]);
        expect(reportText).toContain("core: legacy skill skills/current");
        expect(reportText).toContain("run `astp update --platform kimi-code --target user` to migrate.");
        expect(reportText).toContain("skills/removed — not in the current manifest, left in place.");
        expect(reportText).not.toContain("skills/removed — run `astp update --force` to migrate.");
    });

    it("lists locally changed units below the table", () => {
        const report: UpdateReport = { updates: [], upToDate: [], notInManifest: [], legacySkills: [] };

        vi.mocked(p.log.info).mockClear();
        showCheckReport(report, projectTarget, [
            { path: "skills/foo", modified: true, force: "replace" },
            { path: "rules/x.md", modified: true, force: "delete" },
            { path: "rules/y.md", modified: false, force: null },
        ]);

        const text = String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0]);
        expect(text).toContain("Changed locally — `astp update` keeps them:");
        expect(text).toContain(
            "  • skills/foo — modified; `astp update --force --platform claude-code --target project` replaces it",
        );
        expect(text).toContain(
            "  • rules/x.md — modified, removed upstream; `astp update --force --platform claude-code --target project` deletes it",
        );
        expect(text).toContain("  • rules/y.md — text edited");
        expect(text).not.toContain("replaces the modified ones");
    });

    it("appends nothing when no units changed locally", () => {
        const report: UpdateReport = { updates: [], upToDate: [], notInManifest: [], legacySkills: [] };

        vi.mocked(p.log.info).mockClear();
        showCheckReport(report, projectTarget, []);

        const text = String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0]);
        expect(text).toContain("Bundle         Installed   Available   Status");
        expect(text).not.toContain("Changed locally");
    });

    it("shows the force-migration hint when modified legacy units are skipped", () => {
        warnLegacyModified(
            [{ targetPath: "skills/example", kind: "skill", state: "legacy" }],
            "astp update --force --platform claude-code --target user",
        );

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("Run `astp update --force --platform claude-code --target user` to replace them."),
        );
    });

    it("prints overwrite commands with the run's target for foreign units", () => {
        vi.mocked(p.log.warn).mockClear();
        warnForeign("core", [{ targetPath: "skills/sample", kind: "skill", state: "modified" }], [], userTarget);

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                "astp install core --skill skills/sample --force --platform kimi-code --target user",
            ),
        );
    });

    it("keeps --source in foreign overwrite commands, quoting values with spaces", () => {
        vi.mocked(p.log.warn).mockClear();
        warnForeign(
            "core",
            [{ targetPath: "skills/sample", kind: "skill", state: "modified" }],
            [],
            userTarget,
            "./my src",
        );

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'astp install core --skill skills/sample --force --source "./my src" --platform kimi-code --target user',
            ),
        );
    });

    it("warns separately for units owned by another bundle, without --force", () => {
        vi.mocked(p.log.warn).mockClear();
        warnForeign(
            "core",
            [
                {
                    targetPath: "rules/r.md",
                    kind: "file",
                    state: "modified",
                    owner: { bundle: "other", path: "rules/r.md" },
                },
                {
                    targetPath: "skills/X/sub",
                    kind: "skill",
                    state: "modified",
                    owner: { bundle: "other", path: "skills/x" },
                },
                { targetPath: "rules/x.md", kind: "file", state: "modified" },
            ],
            [],
            projectTarget,
        );

        const calls = vi.mocked(p.log.warn).mock.calls.map((call) => String(call[0]));
        expect(calls).toHaveLength(2);
        const owned = calls.find((text) => text.includes("(other"))!;
        expect(owned).toContain("rules/r.md (other)");
        expect(owned).toContain("skills/X/sub (other: skills/x)");
        expect(owned).toContain("astp delete other --skill rules/r.md --platform claude-code --target project");
        expect(owned).toContain("astp delete other --skill skills/x --platform claude-code --target project");
        expect(owned).not.toContain("astp delete other --skill skills/X/sub");
        expect(owned).toContain("astp install core --skill skills/X/sub --platform claude-code --target project");
        expect(owned).not.toContain("--force");
        const plain = calls.find((text) => !text.includes("(other"))!;
        expect(plain).toContain("rules/x.md");
        expect(plain).toContain("astp install core --skill rules/x.md --force --platform claude-code --target project");
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
        showCheckReport(report, projectTarget, []);
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

describe("warnNewerManifest", () => {
    it("formats the warning for the default source and for a custom source", () => {
        vi.mocked(p.log.warn).mockClear();
        warnNewerManifest("1.2", "1.0", "npm install -g @fozy-labs/astp");
        expect(vi.mocked(p.log.warn)).toHaveBeenCalledWith(
            "Manifest uses schema version 1.2, which is newer than supported by this astp CLI (1.0).\n" +
                "Run `npm install -g @fozy-labs/astp` to update astp.",
        );

        vi.mocked(p.log.warn).mockClear();
        warnNewerManifest("1.2", "1.0", "npm install -g @fozy-labs/astp", "../other");
        expect(vi.mocked(p.log.warn)).toHaveBeenCalledWith(
            "Manifest at '../other' uses schema version 1.2, which is newer than supported by this astp CLI (1.0).\n" +
                "Run `npm install -g @fozy-labs/astp` to update astp.",
        );
    });
});
