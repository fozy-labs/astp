import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeCheck } from "@/commands/check.js";
import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";
import { downloadBundle, fetchManifest } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    isInteractive,
    selectBlocks,
    selectUnits,
    showCheckReport,
    warnKeptBlocks,
    warnKeptRemoved,
} from "@/ui/prompts.js";

import { cleanupDir, createTempProject, makeProjectTarget, readLockFixture } from "./helpers.js";
import { setupTemplateDir } from "./helpers.js";

vi.mock("@/core/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/core/index.js")>();
    return {
        ...actual,
        fetchManifest: vi.fn(),
        downloadBundle: vi.fn(),
    };
});

vi.mock("@/types/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/types/index.js")>();
    return { ...actual, resolveTarget: vi.fn() };
});

vi.mock("@/ui/prompts.js", () => ({
    isInteractive: vi.fn(() => false),
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundles: vi.fn(),
    selectInstalledBundles: vi.fn(),
    selectUnits: vi.fn(),
    selectNewUnits: vi.fn(),
    selectBlocks: vi.fn(),
    confirmInstall: vi.fn().mockResolvedValue(true),
    confirmDelete: vi.fn().mockResolvedValue(true),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showCheckReport: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    warnLegacyModified: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnKeptBlocks: vi.fn(),
    warnBlockConflicts: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockIsInteractive = vi.mocked(isInteractive);
const mockSelectBlocks = vi.mocked(selectBlocks);
const mockSelectUnits = vi.mocked(selectUnits);
const mockShowCheckReport = vi.mocked(showCheckReport);
const mockWarnKeptBlocks = vi.mocked(warnKeptBlocks);
const mockWarnKeptRemoved = vi.mocked(warnKeptRemoved);

const FM = "---\ndescription: Project map and code style\n---\n";

function tplV1() {
    return `${FM}
<astp-block name="project_map" required>
## Project Map

<FILL_INSTRUCTION>
Describe the project file structure.
</FILL_INSTRUCTION>
</astp-block>

<astp-block name="extra">
## Extra

Extra ready-made text.
</astp-block>

<astp-block name="code_style" optional>
## Code Style

Ready-made text.
</astp-block>
`;
}

const RULES_FILE = "rules/claude-md.md";

function createBlocksManifest(version: string): Manifest {
    return {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            blocks: {
                name: "blocks",
                version,
                description: "Blocks fixture",
                default: true,
                platforms: ["claude-code"],
                items: [{ source: `blocks/${RULES_FILE}`, target: RULES_FILE, category: "rule" }],
            },
        },
    };
}

function createSkillManifest(version: string): Manifest {
    return {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            blockskill: {
                name: "blockskill",
                version,
                description: "Skill with a block file",
                default: true,
                platforms: ["claude-code"],
                items: [
                    {
                        source: "blockskill/skills/fillable/SKILL.md",
                        target: "skills/fillable/SKILL.md",
                        category: "skill",
                    },
                    {
                        source: "blockskill/skills/fillable/references/ref.md",
                        target: "skills/fillable/references/ref.md",
                        category: "skill",
                    },
                ],
            },
        },
    };
}

const SKILL_TPL = `---
name: fillable
description: Fillable skill
---

<astp-block name="intro">
## Intro

<FILL_INSTRUCTION>
Describe the skill.
</FILL_INSTRUCTION>
</astp-block>
`;

describe("E2E: blocks", () => {
    let projectDir: string;
    let cleanup: () => Promise<void>;
    let templateDirs: string[];
    let manifest: Manifest;
    let contents: Record<string, string>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const project = await createTempProject();
        projectDir = project.dir;
        cleanup = project.cleanup;
        templateDirs = [];
        manifest = createBlocksManifest("1.0.0");
        contents = { [RULES_FILE]: tplV1() };

        mockFetchManifest.mockImplementation(async () => manifest);
        mockIsInteractive.mockReturnValue(false);
        mockSelectBlocks.mockReset();
        mockSelectUnits.mockImplementation(async (_bundle, units) => units.map((unit) => unit.relativePath));
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));
        mockDownloadBundle.mockImplementation(async (_repository, bundleName) => {
            const dir = await setupTemplateDir(manifest, bundleName, contents);
            templateDirs.push(dir);
            return dir;
        });
    });

    afterEach(async () => {
        await cleanup();
        for (const dir of templateDirs) await cleanupDir(dir);
    });

    function rootDir(): string {
        return path.join(projectDir, ".claude");
    }

    function filePath(target = RULES_FILE): string {
        return path.join(rootDir(), target);
    }

    async function install(force = false): Promise<void> {
        await executeInstall({ bundle: "blocks", force, platform: "claude-code", target: "project" });
    }

    async function update(force = false): Promise<void> {
        await executeUpdate({ force, platform: "claude-code", target: "project" });
    }

    /** Simulates the consumer's agent filling every FILL_INSTRUCTION and removing SETUP_REQUIRED. */
    async function fillFile(target = RULES_FILE, fill = "Filled by the agent.\n"): Promise<void> {
        const file = filePath(target);
        let content = await fs.readFile(file, "utf8");
        content = content.replace(/<SETUP_REQUIRED>\n[\s\S]*?<\/SETUP_REQUIRED>\n\n?/, "");
        content = content.replace(/<FILL_INSTRUCTION>\n[\s\S]*?<\/FILL_INSTRUCTION>\n/, fill);
        await fs.writeFile(file, content);
    }

    it("non-TTY install renders blocks, SETUP_REQUIRED and lock state", async () => {
        await install();

        const content = await fs.readFile(filePath(), "utf8");
        expect(content).toContain("<project_map>");
        expect(content).toContain("<extra>");
        expect(content).not.toContain("<code_style>");
        expect(content).not.toContain("<astp-block");
        expect(content).toContain("<SETUP_REQUIRED>");
        expect(content).toContain("<FILL_INSTRUCTION>");

        const lock = await readLockFixture(rootDir());
        const unit = lock.bundles.blocks.units[RULES_FILE]!;
        expect(Object.keys(unit.blocks!)).toEqual([`${RULES_FILE}#extra`, `${RULES_FILE}#project_map`]);
        expect(unit.blocks![`${RULES_FILE}#project_map`]).toMatch(/^[0-9a-f]{8}$/);
        expect(unit.declinedBlocks).toEqual([`${RULES_FILE}#code_style`]);
    });

    it("rejects an invalid block template", async () => {
        contents[RULES_FILE] = `${FM}\n<astp-block name="a">\nunclosed\n`;
        await expect(install()).rejects.toThrow(/invalid blocks/);
    });

    it("chain: fill → update adds wrapper + SETUP_REQUIRED → next update replaces it → resolve → quiet", async () => {
        await install();
        await fillFile();

        // Template change + version bump: block changed on both sides → wrapper.
        manifest = createBlocksManifest("1.1.0");
        contents[RULES_FILE] = tplV1().replace("Describe the project file structure.", "Describe it briefly.");
        await update();

        let content = await fs.readFile(filePath(), "utf8");
        expect(content).toContain("Filled by the agent.");
        expect(content).toContain("The astp template of this block changed");
        expect(content).toContain("Describe it briefly.");
        expect(content).toContain("<SETUP_REQUIRED>");

        // Second template change: the wrapper is replaced, not duplicated.
        manifest = createBlocksManifest("1.2.0");
        contents[RULES_FILE] = contents[RULES_FILE]!.replace("Describe it briefly.", "Describe it in detail.");
        await update();

        content = await fs.readFile(filePath(), "utf8");
        expect(content.match(/The astp template of this block changed/g)).toHaveLength(1);
        expect(content).toContain("Describe it in detail.");
        expect(content).not.toContain("Describe it briefly.");

        // Agent resolves the wrapper; a no-change update does nothing.
        content = content.replace(/<FILL_INSTRUCTION>\n[\s\S]*?<\/FILL_INSTRUCTION>\n/, "");
        content = content.replace(/<SETUP_REQUIRED>\n[\s\S]*?<\/SETUP_REQUIRED>\n\n?/, "");
        await fs.writeFile(filePath(), content);
        manifest = createBlocksManifest("1.2.0");
        await update();
        expect(await fs.readFile(filePath(), "utf8")).toBe(content);
    });

    it("update replaces an unchanged block and keeps lock hashes fresh", async () => {
        await install();
        manifest = createBlocksManifest("1.1.0");
        contents[RULES_FILE] = tplV1().replace("Extra ready-made text.", "New extra text.");
        await update();

        const content = await fs.readFile(filePath(), "utf8");
        expect(content).toContain("New extra text.");
        const lock = await readLockFixture(rootDir());
        expect(lock.bundles.blocks.units[RULES_FILE]!.version).toBe("1.1.0");
    });

    it("deselected filled block: kept with a hint, removed with --force", async () => {
        await install();
        const file = filePath();
        let content = await fs.readFile(file, "utf8");
        content = content.replace("Extra ready-made text.", "My own extra.");
        await fs.writeFile(file, content);

        // Re-install interactively, deselecting the filled block.
        mockIsInteractive.mockReturnValue(true);
        mockSelectBlocks.mockResolvedValue([`${RULES_FILE}#project_map`]);
        await install();

        expect(mockWarnKeptBlocks).toHaveBeenCalledWith([`${RULES_FILE}#extra`]);
        content = await fs.readFile(file, "utf8");
        expect(content).toContain("My own extra.");

        await install(true);
        content = await fs.readFile(file, "utf8");
        expect(content).not.toContain("<extra>");
        const lock = await readLockFixture(rootDir());
        expect(lock.bundles.blocks.units[RULES_FILE]!.declinedBlocks).toContain(`${RULES_FILE}#extra`);
    });

    it("a block deleted by hand reports Out of sync and update restores it", async () => {
        await install();
        const file = filePath();
        let content = await fs.readFile(file, "utf8");
        content = content.replace(/<extra>\n[\s\S]*?<\/extra>\n\n?/, "");
        await fs.writeFile(file, content);

        await executeCheck({ platform: "claude-code", target: "project" });
        const report = mockShowCheckReport.mock.calls[0]![0]!;
        expect(report.updates).toHaveLength(1);
        expect(report.updates[0]!.installedVersion).toBe(report.updates[0]!.availableVersion);

        await update();
        content = await fs.readFile(file, "utf8");
        expect(content).toContain("<extra>");
    });

    it("non-TTY install brings back a declined non-optional block, keeps a declined optional one", async () => {
        // Interactive install selecting only project_map; extra and code_style declined.
        mockIsInteractive.mockReturnValue(true);
        mockSelectBlocks.mockResolvedValue([`${RULES_FILE}#project_map`]);
        await install();
        let content = await fs.readFile(filePath(), "utf8");
        expect(content).not.toContain("<extra>");
        let lock = await readLockFixture(rootDir());
        expect(lock.bundles.blocks.units[RULES_FILE]!.declinedBlocks).toEqual([
            `${RULES_FILE}#code_style`,
            `${RULES_FILE}#extra`,
        ]);

        // Non-TTY install: non-optional come back, optional stays declined.
        mockIsInteractive.mockReturnValue(false);
        await install();
        content = await fs.readFile(filePath(), "utf8");
        expect(content).toContain("<extra>");
        expect(content).not.toContain("<code_style>");
        lock = await readLockFixture(rootDir());
        expect(lock.bundles.blocks.units[RULES_FILE]!.declinedBlocks).toEqual([`${RULES_FILE}#code_style`]);
    });

    it("required blocks install without a prompt and are never shown", async () => {
        mockIsInteractive.mockReturnValue(true);
        mockSelectBlocks.mockResolvedValue([]);
        await install();
        // project_map is required: installed even though nothing was selected.
        const content = await fs.readFile(filePath(), "utf8");
        expect(content).toContain("<project_map>");
        const options = mockSelectBlocks.mock.calls[0]![1]!;
        expect(options.map((option) => option.name)).not.toContain("project_map");
    });

    it("update adds a new template block; new optional block is declined non-TTY", async () => {
        await install();
        manifest = createBlocksManifest("1.1.0");
        contents[RULES_FILE] =
            `${tplV1()}\n<astp-block name="added">\n## Added\n\nNew block.\n</astp-block>\n` +
            `<astp-block name="added_opt" optional>\n## Opt\n\nOpt block.\n</astp-block>\n`;
        await update();
        const content = await fs.readFile(filePath(), "utf8");
        expect(content).toContain("<added>");
        expect(content).not.toContain("<added_opt>");
    });

    it("skill with a block file: update keeps filled content, other files update", async () => {
        manifest = createSkillManifest("1.0.0");
        contents = { "skills/fillable/SKILL.md": SKILL_TPL };
        await executeInstall({ bundle: "blockskill", platform: "claude-code", target: "project" });
        const skillFile = filePath("skills/fillable/SKILL.md");
        expect(await fs.readFile(skillFile, "utf8")).toContain("<intro>");
        await fillFile("skills/fillable/SKILL.md", "Custom intro.\n");

        manifest = createSkillManifest("1.1.0");
        await update();
        const content = await fs.readFile(skillFile, "utf8");
        expect(content).toContain("Custom intro.");
        const ref = await fs.readFile(filePath("skills/fillable/references/ref.md"), "utf8");
        expect(ref).toContain("v1.1.0");
        const lock = await readLockFixture(rootDir());
        expect(lock.bundles.blockskill.units["skills/fillable"]!.blocks).toEqual({
            "skills/fillable/SKILL.md#intro": expect.any(String),
        });
    });

    it("deselecting a unit with a filled block keeps the file; --force removes it", async () => {
        await install();
        await fillFile();

        mockIsInteractive.mockReturnValue(true);
        mockSelectUnits.mockResolvedValue([]);
        await install();
        expect(await fs.readFile(filePath(), "utf8")).toContain("Filled by the agent.");
        expect(mockWarnKeptRemoved).toHaveBeenCalled();

        await install(true);
        await expect(fs.access(filePath())).rejects.toThrow();
    });

    it("deselecting a clean block unit still removes the file", async () => {
        await install();
        mockIsInteractive.mockReturnValue(true);
        mockSelectUnits.mockResolvedValue([]);
        await install();
        await expect(fs.access(filePath())).rejects.toThrow();
    });

    it("a unit leaving the bundle keeps a filled file on update; --force removes it", async () => {
        await install();
        await fillFile();

        manifest = createBlocksManifest("1.1.0");
        manifest.bundles.blocks.items = [];
        await update();
        expect(await fs.readFile(filePath(), "utf8")).toContain("Filled by the agent.");
        expect(mockWarnKeptRemoved).toHaveBeenCalled();

        await update(true);
        await expect(fs.access(filePath())).rejects.toThrow();
    });

    it("a unit leaving the bundle still removes a clean block file", async () => {
        await install();
        manifest = createBlocksManifest("1.1.0");
        manifest.bundles.blocks.items = [];
        await update();
        await expect(fs.access(filePath())).rejects.toThrow();
    });

    it("adopts an untracked block skill whose files equal the fresh render", async () => {
        manifest = createSkillManifest("1.0.0");
        contents = { "skills/fillable/SKILL.md": SKILL_TPL };
        await executeInstall({ bundle: "blockskill", platform: "claude-code", target: "project" });
        await fs.rm(path.join(rootDir(), "astp.lock"));

        await executeInstall({ bundle: "blockskill", platform: "claude-code", target: "project" });
        const lock = await readLockFixture(rootDir());
        expect(lock.bundles.blockskill.units["skills/fillable"]!.blocks).toEqual({
            "skills/fillable/SKILL.md#intro": expect.any(String),
        });
    });

    it("edited frontmatter skips the unit; --force resets the frontmatter and keeps filled content", async () => {
        await install();
        await fillFile();
        const file = filePath();
        let content = await fs.readFile(file, "utf8");
        await fs.writeFile(file, content.replace("description: Project map and code style", "description: local"));

        await update();
        content = await fs.readFile(file, "utf8");
        expect(content).toContain("description: local");

        manifest = createBlocksManifest("1.1.0");
        contents[RULES_FILE] = tplV1();
        await update(true);
        content = await fs.readFile(file, "utf8");
        expect(content).toContain("description: Project map and code style");
        expect(content).toContain("Filled by the agent.");
    });

    it("delete keeps a filled or consumer-edited block file; --force removes", async () => {
        await install();
        await fillFile();

        await executeDelete({ bundle: "blocks", platform: "claude-code", target: "project" });
        expect(await fs.readFile(filePath(), "utf8")).toContain("Filled by the agent.");

        await executeDelete({ bundle: "blocks", force: true, platform: "claude-code", target: "project" });
        await expect(fs.access(filePath())).rejects.toThrow();
    });

    it("delete removes a clean block file", async () => {
        await install();
        await executeDelete({ bundle: "blocks", platform: "claude-code", target: "project" });
        await expect(fs.access(filePath())).rejects.toThrow();
        const lockPath = path.join(rootDir(), "astp.lock");
        await expect(fs.access(lockPath)).rejects.toThrow();
    });
});
