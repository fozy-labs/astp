import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { assertInsideRoot, downloadBundle, fetchManifest } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { confirmInstall } from "@/ui/prompts.js";

import {
    cleanupDir,
    createFixtureManifest,
    createTempProject,
    makeProjectTarget,
    readLockFixture,
    setupTemplateDir,
} from "./helpers.js";

vi.mock("@/core/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/core/index.js")>();
    return {
        ...actual,
        fetchManifest: vi.fn(),
        downloadBundle: vi.fn(),
        assertInsideRoot: vi.fn(actual.assertInsideRoot),
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
    selectBundleItems: vi.fn(),
    cancelNoBundles: vi.fn(),
    selectInstalledBundles: vi.fn(),
    selectBlocks: vi.fn(),
    selectNewUnits: vi.fn(),
    confirmInstall: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(true),
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
const mockAssertInsideRoot = vi.mocked(assertInsideRoot);

describe("E2E: delete", () => {
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

    async function installPipeline(): Promise<void> {
        const tplDir = await setupTemplateDir(manifest, "pipeline");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "pipeline", platform: "claude-code", target: "project" });
    }

    it("deletes installed bundle files and prunes empty directories", async () => {
        await installPipeline();

        await executeDelete({ bundle: "pipeline", platform: "claude-code", target: "project" });

        const deletedPath = path.join(projectDir, ".claude", "agents", "pipeline-approve.agent.md");
        await expect(fs.access(deletedPath)).rejects.toThrow();

        const skillPath = path.join(projectDir, ".claude", "skills", "pipeline-01-research", "SKILL.md");
        await expect(fs.access(skillPath)).rejects.toThrow();
    });

    it("keeps modified files without force", async () => {
        await installPipeline();

        const modifiedFile = path.join(projectDir, ".claude", "agents", "pipeline-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, `${original}\n<!-- user edit -->`, "utf8");

        await executeDelete({ bundle: "pipeline", platform: "claude-code", target: "project" });

        const content = await fs.readFile(modifiedFile, "utf8");
        expect(content).toContain("<!-- user edit -->");
        expect(content).not.toContain("astp-source");
        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(lock.bundles.pipeline.units["agents/pipeline-approve.agent.md"]).toBeDefined();
    });

    it("keeps the lock in step with the disk when a removal fails", async () => {
        manifest = {
            schemaVersion: 1,
            repository: "fixture/repo",
            bundles: {
                core: {
                    name: "core",
                    version: "1.0.0",
                    description: "core",
                    default: false,
                    platforms: ["claude-code"],
                    items: [
                        { source: "core/agents/first.md", target: "agents/first.md", category: "agent" },
                        { source: "core/agents/second.md", target: "agents/second.md", category: "agent" },
                    ],
                },
            },
        };
        mockFetchManifest.mockResolvedValue(manifest);
        const tplDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "core", platform: "claude-code", target: "project" });

        const passThrough = mockAssertInsideRoot.getMockImplementation()!;
        mockAssertInsideRoot.mockImplementation(async (rootDir, relativePath) => {
            if (relativePath === "agents/second.md") throw new Error("boom");
            return passThrough(rootDir, relativePath);
        });
        try {
            await expect(executeDelete({ bundle: "core", platform: "claude-code", target: "project" })).rejects.toThrow(
                "boom",
            );
        } finally {
            mockAssertInsideRoot.mockImplementation(passThrough);
        }

        const rootDir = path.join(projectDir, ".claude");
        const lock = await readLockFixture(rootDir);
        expect(lock.bundles.core.units["agents/first.md"]).toBeUndefined();
        expect(lock.bundles.core.declined).toEqual(["agents/first.md"]);
        expect(lock.bundles.core.units["agents/second.md"]).toBeDefined();
        await expect(fs.access(path.join(rootDir, "agents/first.md"))).rejects.toMatchObject({ code: "ENOENT" });
        expect(await fs.readFile(path.join(rootDir, "agents/second.md"), "utf8")).toContain("second");
    });

    it("removes modified files with force", async () => {
        await installPipeline();

        const modifiedFile = path.join(projectDir, ".claude", "agents", "pipeline-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, `${original}\n<!-- user edit -->`, "utf8");

        await executeDelete({ bundle: "pipeline", force: true, platform: "claude-code", target: "project" });

        await expect(fs.access(modifiedFile)).rejects.toThrow();
        await expect(fs.access(path.join(projectDir, ".claude", "astp.lock"))).rejects.toThrow();
    });
});
