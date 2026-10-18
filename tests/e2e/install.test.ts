import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeInstall } from "@/commands/install.js";
import { downloadBundle, fetchManifest, groupTemplateItems } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    CancelledError,
    confirmInstall,
    isInteractive,
    selectBundleItems,
    selectNewUnits,
    warnForeign,
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
    warnUnavailable,
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

vi.mock("@/ui/prompts.js", async (importOriginal) => ({
    CancelledError: (await importOriginal<typeof import("@/ui/prompts.js")>()).CancelledError,
    isInteractive: vi.fn(() => false),
    requireTerminal: vi.fn(),
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundleItems: vi.fn(),
    cancelNoBundles: vi.fn(),
    selectBlocks: vi.fn(),
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
    warnUnavailable: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockWarnModified = vi.mocked(warnModified);
const mockWarnForeign = vi.mocked(warnForeign);
const mockIsInteractive = vi.mocked(isInteractive);
const mockSelectBundleItems = vi.mocked(selectBundleItems);
const mockSelectNewUnits = vi.mocked(selectNewUnits);
const mockWarnUnavailable = vi.mocked(warnUnavailable);

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
        mockIsInteractive.mockReturnValue(false);
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
            "astp install skillpack --skill skills/sample --force --target project",
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
            "astp install skillpack --skill skills/sample --force --target project",
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
            "project",
            undefined,
        );

        await installBundle("core", true);
        await expect(fs.access(userFile)).rejects.toThrow();
    });

    it("rejects an unsafe item target before downloading the bundle", async () => {
        manifest.bundles.pipeline.items[0]!.target = "agents/..\\..\\..\\x.md";

        await expect(
            executeInstall({ bundle: "pipeline", platform: "claude-code", target: "project" }),
        ).rejects.toThrow("safe relative path");

        expect(mockDownloadBundle).not.toHaveBeenCalled();
        await expect(fs.access(path.join(projectDir, ".claude"))).rejects.toThrow();
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
            "astp install pipeline --skill agents/pipeline-approve.agent.md --force --target project",
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
            "project",
            undefined,
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
        mockIsInteractive.mockReturnValue(true);
        mockSelectBundleItems.mockImplementation(
            async (entries) =>
                new Map(
                    entries
                        .filter((entry) => ["core", "pipeline"].includes(entry.bundle.name))
                        .map((entry) => [
                            entry.bundle.name,
                            { units: entry.units.map((unit) => unit.relativePath), blocks: entry.blockDefaults },
                        ]),
                ),
        );
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

    it("removes every downloaded temp dir and installs nothing when the confirm is cancelled", async () => {
        mockIsInteractive.mockReturnValue(true);
        mockSelectBundleItems.mockImplementation(
            async (entries) =>
                new Map(
                    entries.map((entry) => [
                        entry.bundle.name,
                        { units: entry.units.map((unit) => unit.relativePath), blocks: entry.blockDefaults },
                    ]),
                ),
        );
        mockConfirmInstall.mockRejectedValue(new CancelledError());
        const downloadedDirs: string[] = [];
        mockDownloadBundle.mockImplementation(async (_source, { name }) => {
            const dir = await setupTemplateDir(manifest, name);
            templateDirs.push(dir);
            downloadedDirs.push(dir);
            return dir;
        });

        await expect(executeInstall({ platform: "claude-code", target: "project" })).rejects.toBeInstanceOf(
            CancelledError,
        );

        expect(downloadedDirs).toHaveLength(3);
        for (const dir of downloadedDirs) {
            await expect(fs.stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
        }
        await expect(fs.access(path.join(projectDir, ".claude"))).rejects.toThrow();
    });

    it("warns about a bundle whose download fails and offers the others", async () => {
        mockIsInteractive.mockReturnValue(true);
        mockDownloadBundle.mockImplementation(async (_source, { name }) => {
            if (name === "skillpack") throw new Error("fetch failed");
            const dir = await setupTemplateDir(manifest, name);
            templateDirs.push(dir);
            return dir;
        });
        mockSelectBundleItems.mockImplementation(
            async (entries) =>
                new Map(
                    entries
                        .filter((entry) => entry.bundle.name === "core")
                        .map((entry) => [
                            entry.bundle.name,
                            { units: entry.units.map((unit) => unit.relativePath), blocks: entry.blockDefaults },
                        ]),
                ),
        );

        await executeInstall({ platform: "claude-code", target: "project" });

        expect(mockWarnUnavailable).toHaveBeenCalledWith(
            [expect.objectContaining({ bundle: "skillpack", message: "fetch failed" })],
            "project",
        );
        const entries = mockSelectBundleItems.mock.calls[0]![0];
        expect(entries.map((entry) => entry.bundle.name)).toEqual(["core", "pipeline"]);
        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(Object.keys(lock.bundles)).toEqual(["core"]);
    });

    it("warns about a bundle whose lock source cannot be read and offers the others", async () => {
        const tplDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "core", source: "gh:other/repo", platform: "claude-code", target: "project" });

        mockIsInteractive.mockReturnValue(true);
        mockFetchManifest.mockImplementation(async (source) => {
            if (source.spec === "gh:other/repo") throw new Error("offline");
            return manifest;
        });
        mockDownloadBundle.mockImplementation(async (_source, { name }) => {
            const dir = await setupTemplateDir(manifest, name);
            templateDirs.push(dir);
            return dir;
        });
        mockSelectBundleItems.mockImplementation(
            async (entries) =>
                new Map(
                    entries
                        .filter((entry) => entry.bundle.name === "pipeline")
                        .map((entry) => [
                            entry.bundle.name,
                            { units: entry.units.map((unit) => unit.relativePath), blocks: entry.blockDefaults },
                        ]),
                ),
        );

        await executeInstall({ platform: "claude-code", target: "project" });

        expect(mockWarnUnavailable).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    bundle: "core",
                    message: expect.stringContaining("Cannot read source 'gh:other/repo'"),
                }),
            ],
            "project",
        );
        const entries = mockSelectBundleItems.mock.calls[0]![0];
        expect(entries.map((entry) => entry.bundle.name)).toEqual(["skillpack", "pipeline"]);
        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(lock.bundles.pipeline).toBeDefined();
    });

    it("reads an unreachable lock source only once for the bundles sharing it", async () => {
        const coreTplDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(coreTplDir);
        mockDownloadBundle.mockResolvedValue(coreTplDir);
        await executeInstall({ bundle: "core", source: "gh:other/repo", platform: "claude-code", target: "project" });
        const skillTplDir = await setupTemplateDir(manifest, "skillpack");
        templateDirs.push(skillTplDir);
        mockDownloadBundle.mockResolvedValue(skillTplDir);
        await executeInstall({
            bundle: "skillpack",
            source: "gh:other/repo",
            platform: "claude-code",
            target: "project",
        });

        mockFetchManifest.mockClear();
        mockIsInteractive.mockReturnValue(true);
        mockFetchManifest.mockImplementation(async (source) => {
            if (source.spec === "gh:other/repo") throw new Error("offline");
            return manifest;
        });
        mockDownloadBundle.mockImplementation(async (_source, { name }) => {
            const dir = await setupTemplateDir(manifest, name);
            templateDirs.push(dir);
            return dir;
        });
        mockSelectBundleItems.mockImplementation(
            async (entries) =>
                new Map(
                    entries.map((entry) => [
                        entry.bundle.name,
                        { units: entry.units.map((unit) => unit.relativePath), blocks: entry.blockDefaults },
                    ]),
                ),
        );

        await executeInstall({ platform: "claude-code", target: "project" });

        const otherCalls = mockFetchManifest.mock.calls.filter(([source]) => source.spec === "gh:other/repo");
        expect(otherCalls).toHaveLength(1);
        expect(mockWarnUnavailable).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    bundle: "core",
                    message: expect.stringContaining("Cannot read source 'gh:other/repo'"),
                }),
                expect.objectContaining({
                    bundle: "skillpack",
                    message: expect.stringContaining("Cannot read source 'gh:other/repo'"),
                }),
            ],
            "project",
        );
        const entries = mockSelectBundleItems.mock.calls[0]![0];
        expect(entries.map((entry) => entry.bundle.name)).toEqual(["pipeline"]);
        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(lock.bundles.pipeline).toBeDefined();
    });

    it("rejects when no bundle can be read", async () => {
        mockIsInteractive.mockReturnValue(true);
        mockDownloadBundle.mockRejectedValue(new Error("offline"));

        await expect(executeInstall({ platform: "claude-code", target: "project" })).rejects.toThrow(
            /No bundle could be read/,
        );
    });

    it("declines optional units on non-TTY install unless already installed or requested via --skill", async () => {
        const optTarget = "agents/optional.agent.md";
        manifest.bundles.core.items.push({
            source: `core/${optTarget}`,
            target: optTarget,
            category: "agent",
            optional: true,
            labels: ["experimental"],
        });

        await installBundle("core");
        const rootDir = path.join(projectDir, ".claude");
        let lock = await readLockFixture(rootDir);
        expect(Object.keys(lock.bundles.core.units)).toEqual(["skills/orchestrate"]);
        expect(lock.bundles.core.declined).toEqual([optTarget]);
        await expect(fs.access(path.join(rootDir, optTarget))).rejects.toThrow();

        // Install the optional unit explicitly with --skill.
        const tplDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({
            bundle: "core",
            skills: ["optional.agent.md"],
            platform: "claude-code",
            target: "project",
        });
        lock = await readLockFixture(rootDir);
        expect(Object.keys(lock.bundles.core.units)).toEqual([optTarget, "skills/orchestrate"]);
        expect(lock.bundles.core.declined).toEqual([]);
        await expect(fs.access(path.join(rootDir, optTarget))).resolves.toBeUndefined();

        // Subsequent plain non-TTY install keeps the already-installed optional unit.
        await installBundle("core");
        lock = await readLockFixture(rootDir);
        expect(Object.keys(lock.bundles.core.units)).toEqual([optTarget, "skills/orchestrate"]);
    });

    it("excludes optional units from interactive tree defaults unless already installed", async () => {
        const optTarget = "agents/optional.agent.md";
        manifest.bundles.core.items.push({
            source: `core/${optTarget}`,
            target: optTarget,
            category: "agent",
            optional: true,
        });
        mockIsInteractive.mockReturnValue(true);
        mockSelectBundleItems.mockImplementation(
            async (entries) =>
                new Map(
                    entries.map((entry) => [
                        entry.bundle.name,
                        { units: entry.defaults, blocks: entry.blockDefaults },
                    ]),
                ),
        );

        await installBundle("core");
        const firstDefaults = mockSelectBundleItems.mock.calls[0]![0][0]!.defaults;
        expect(firstDefaults).toEqual(["skills/orchestrate"]);

        // Now install optional unit via --skill, then re-open interactive tree: optional unit is in defaults.
        mockIsInteractive.mockReturnValue(false);
        const tplDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({
            bundle: "core",
            skills: ["optional.agent.md"],
            platform: "claude-code",
            target: "project",
        });

        mockSelectBundleItems.mockClear();
        mockIsInteractive.mockReturnValue(true);
        await installBundle("core");
        const secondDefaults = mockSelectBundleItems.mock.calls[0]![0][0]!.defaults;
        expect(secondDefaults).toEqual(["skills/orchestrate", optTarget]);
    });
});
