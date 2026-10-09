import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeInstall } from "@/commands/install.js";
import { downloadBundle, fetchManifest, groupTemplateItems } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    confirmInstall,
    isInteractive,
    selectBundles,
    selectNewUnits,
    selectUnits,
    warnForeign,
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
} from "@/ui/prompts.js";

import {
    cleanupDir,
    createFixtureManifest,
    createTempProject,
    makeProjectTarget,
    readLockFixture,
    setupTemplateDir,
} from "./helpers.js";

// Partial mock: keep real installFile, resolveBundle, etc.
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
    selectBlocks: vi.fn(),
    selectUnits: vi.fn(),
    selectNewUnits: vi.fn(),
    confirmInstall: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showCheckReport: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    warnLegacyModified: vi.fn(),
    warnBlockConflicts: vi.fn(),
    warnKeptBlocks: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnReleased: vi.fn(),
    warnForeign: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockWarnModified = vi.mocked(warnModified);
const mockWarnForeign = vi.mocked(warnForeign);
const mockIsInteractive = vi.mocked(isInteractive);
const mockSelectBundles = vi.mocked(selectBundles);
const mockSelectUnits = vi.mocked(selectUnits);
const mockSelectNewUnits = vi.mocked(selectNewUnits);

describe("E2E: install", () => {
    let projectDir: string;
    let cleanup: () => Promise<void>;
    let manifest: Manifest;
    let templateDirs: string[];

    beforeEach(async () => {
        vi.clearAllMocks();
        const project = await createTempProject();
        projectDir = project.dir;
        cleanup = project.cleanup;
        manifest = createFixtureManifest("1.0.0");
        templateDirs = [];

        mockFetchManifest.mockResolvedValue(manifest);
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));
        mockConfirmInstall.mockResolvedValue(true);
    });

    afterEach(async () => {
        await cleanup();
        for (const dir of templateDirs) {
            await cleanupDir(dir);
        }
    });

    async function installBundle(bundleName: string, force = false): Promise<void> {
        const templateDir = await setupTemplateDir(manifest, bundleName);
        templateDirs.push(templateDir);
        mockDownloadBundle.mockResolvedValue(templateDir);
        await executeInstall({ bundle: bundleName, force, platform: "claude-code", target: "project" });
    }

    it("installs every pipeline unit byte-identically and records lock hashes", async () => {
        const tplDir = await setupTemplateDir(manifest, "pipeline");
        templateDirs.push(tplDir);
        const expectedFiles = await Promise.all(
            manifest.bundles.pipeline.items.map(
                async (item) => [item.target, await fs.readFile(path.join(tplDir, item.target))] as const,
            ),
        );
        mockDownloadBundle.mockResolvedValue(tplDir);

        await executeInstall({ bundle: "pipeline", platform: "claude-code", target: "project" });

        const rootDir = path.join(projectDir, ".claude");
        const lock = await readLockFixture(rootDir);
        const units = groupTemplateItems(manifest.bundles.pipeline.items);
        expect(manifest.bundles.pipeline.items).toHaveLength(22);
        expect(Object.keys(lock.bundles.pipeline.units)).toEqual(units.map((unit) => unit.relativePath).sort());
        expect(lock.bundles.pipeline.declined).toEqual([]);
        for (const [target, templateContent] of expectedFiles) {
            expect(Buffer.compare(templateContent, await fs.readFile(path.join(rootDir, target)))).toBe(0);
        }
    });

    it("T32: installs core bundle — 1 skill at skills/orchestrate/", async () => {
        const tplDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);

        await executeInstall({ bundle: "core", platform: "claude-code", target: "project" });

        const rootDir = path.join(projectDir, ".claude");
        const skillPath = path.join(rootDir, "skills", "orchestrate", "SKILL.md");
        expect(await fs.readFile(skillPath, "utf8")).not.toContain("astp-source");
        const lock = await readLockFixture(rootDir);
        expect(lock.bundles.core.units["skills/orchestrate"]).toMatchObject({ kind: "skill", version: "1.0.0" });
    });

    // T38: astp install nonexistent --target project
    it("T38: rejects nonexistent bundle with error", async () => {
        await expect(
            executeInstall({ bundle: "nonexistent", platform: "claude-code", target: "project" }),
        ).rejects.toThrow(/not found/i);
    });

    it("preserves modified skill roots unless --force is passed", async () => {
        await installBundle("skillpack");
        const skillPath = path.join(projectDir, ".claude", "skills", "sample", "SKILL.md");
        const original = await fs.readFile(skillPath, "utf8");
        const edited = `${original}\nUSER EDIT`;
        await fs.writeFile(skillPath, edited);

        await installBundle("skillpack");

        expect(await fs.readFile(skillPath, "utf8")).toBe(edited);
        expect(mockWarnModified).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ targetPath: "skills/sample", kind: "skill" })]),
            "astp install skillpack --force",
        );

        await installBundle("skillpack", true);
        expect(await fs.readFile(skillPath, "utf8")).not.toBe(edited);
    });

    it("preserves user-added skill files unless --force is passed", async () => {
        await installBundle("skillpack");
        const extraPath = path.join(projectDir, ".claude", "skills", "sample", "user-added.txt");
        await fs.writeFile(extraPath, "keep me");

        await installBundle("skillpack");

        expect(await fs.readFile(extraPath, "utf8")).toBe("keep me");
        expect(mockWarnModified).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ targetPath: "skills/sample", kind: "skill" })]),
            "astp install skillpack --force",
        );

        await installBundle("skillpack", true);
        await expect(fs.access(extraPath)).rejects.toThrow();
    });

    it("preserves an unmanaged directory at a skill path unless --force is passed", async () => {
        const root = path.join(projectDir, ".claude", "skills", "orchestrate");
        await fs.mkdir(root, { recursive: true });
        const userFile = path.join(root, "user.txt");
        await fs.writeFile(userFile, "unmanaged");

        await installBundle("core");

        expect(await fs.readFile(userFile, "utf8")).toBe("unmanaged");
        expect(mockWarnForeign).toHaveBeenCalledWith(
            "core",
            expect.arrayContaining([expect.objectContaining({ targetPath: "skills/orchestrate", kind: "skill" })]),
            [],
        );

        await installBundle("core", true);
        await expect(fs.access(userFile)).rejects.toThrow();
    });

    it("preserves modified file units unless --force is passed", async () => {
        await installBundle("pipeline");
        const agentPath = path.join(projectDir, ".claude", "agents", "pipeline-approve.agent.md");
        const edited = `${await fs.readFile(agentPath, "utf8")}\nUSER EDIT`;
        await fs.writeFile(agentPath, edited);

        await installBundle("pipeline");

        expect(await fs.readFile(agentPath, "utf8")).toBe(edited);
        expect(mockWarnModified).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ targetPath: "agents/pipeline-approve.agent.md", kind: "file" }),
            ]),
            "astp install pipeline --force",
        );

        await installBundle("pipeline", true);
        expect(await fs.readFile(agentPath, "utf8")).not.toBe(edited);
    });

    it("preserves a non-directory at a skill unit path unless --force is passed", async () => {
        const skillPath = path.join(projectDir, ".claude", "skills", "orchestrate");
        await fs.mkdir(path.dirname(skillPath), { recursive: true });
        await fs.writeFile(skillPath, "unmanaged file");

        await installBundle("core");

        expect(await fs.readFile(skillPath, "utf8")).toBe("unmanaged file");
        expect(mockWarnForeign).toHaveBeenCalledWith(
            "core",
            expect.arrayContaining([expect.objectContaining({ targetPath: "skills/orchestrate", kind: "skill" })]),
            [],
        );

        await installBundle("core", true);
        expect((await fs.stat(skillPath)).isDirectory()).toBe(true);
    });

    it("preserves a directory at a file unit path unless --force is passed", async () => {
        const agentPath = path.join(projectDir, ".claude", "agents", "pipeline-approve.agent.md");
        await fs.mkdir(path.join(agentPath, "user-data"), { recursive: true });
        await fs.writeFile(path.join(agentPath, "user-data", "keep.txt"), "unmanaged");

        await installBundle("pipeline");

        expect(await fs.readFile(path.join(agentPath, "user-data", "keep.txt"), "utf8")).toBe("unmanaged");
        await installBundle("pipeline", true);
        expect((await fs.stat(agentPath)).isFile()).toBe(true);
    });

    it("installs all bundles selected in the interactive wizard", async () => {
        const pipeline = manifest.bundles.pipeline;
        mockIsInteractive.mockReturnValue(true);
        mockSelectBundles.mockResolvedValue([manifest.bundles.core!, pipeline]);
        mockSelectUnits.mockImplementation(async (_bundle, units) => units.map((unit) => unit.relativePath));
        mockDownloadBundle.mockImplementation(async (_source, { name: bundleName }) => {
            const dir = await setupTemplateDir(manifest, bundleName);
            templateDirs.push(dir);
            return dir;
        });

        await executeInstall({ platform: "claude-code", target: "project" });

        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(Object.keys(lock.bundles)).toEqual(["core", "pipeline"]);
        expect(mockSelectNewUnits).not.toHaveBeenCalled();
    });
});
