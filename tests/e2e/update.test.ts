import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";
import { compareVersions, downloadBundle, fetchManifest, loadInstalled } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { confirmInstall, selectPlatform, selectTarget, warnModified } from "@/ui/prompts.js";

import {
    cleanupDir,
    createFixtureManifest,
    createTempProject,
    makeProjectTarget,
    setupTemplateDir,
} from "./helpers.js";

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
    warnBlockConflicts: vi.fn(),
    warnKeptBlocks: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnReleased: vi.fn(),
    warnForeign: vi.fn(),
    warnLegacyModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockWarnModified = vi.mocked(warnModified);
const mockSelectTarget = vi.mocked(selectTarget);
const mockSelectPlatform = vi.mocked(selectPlatform);

describe("E2E: update", () => {
    let projectDir: string;
    let cleanup: () => Promise<void>;
    let manifestV1: Manifest;
    let templateDirs: string[];

    beforeEach(async () => {
        vi.clearAllMocks();
        const project = await createTempProject();
        projectDir = project.dir;
        cleanup = project.cleanup;
        manifestV1 = createFixtureManifest("1.0.0");
        templateDirs = [];

        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));
        mockConfirmInstall.mockResolvedValue(true);
    });

    afterEach(async () => {
        await cleanup();
        for (const dir of templateDirs) {
            await cleanupDir(dir);
        }
    });

    async function installPipeline(manifestToInstall = manifestV1): Promise<void> {
        mockFetchManifest.mockResolvedValue(manifestToInstall);
        const tplDir = await setupTemplateDir(manifestToInstall, "pipeline");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "pipeline", platform: "claude-code", target: "project" });
    }

    async function setupV2Mocks(manifestV2 = createFixtureManifest("1.1.0")): Promise<Manifest> {
        const tplDir2 = await setupTemplateDir(manifestV2, "pipeline");
        templateDirs.push(tplDir2);

        vi.clearAllMocks();
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));
        mockFetchManifest.mockResolvedValue(manifestV2);
        mockDownloadBundle.mockResolvedValue(tplDir2);

        return manifestV2;
    }

    function manifestWithAgentFiles(version: string, targets: string[]): Manifest {
        const manifest = createFixtureManifest(version);
        manifest.bundles.pipeline.items = targets.map((target) => ({
            source: `pipeline/${target}`,
            target,
            category: "agent",
        }));
        return manifest;
    }

    it("does not report an update after updating around a modified file unit", async () => {
        const targets = ["agents/0.md", "agents/a.md", "agents/m.md", "agents/q.md", "agents/z.md"];
        await installPipeline(manifestWithAgentFiles("1.0.0", targets));

        const modifiedFile = path.join(projectDir, ".claude", targets[0]);
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, `${original}\nUSER EDIT`, "utf8");

        const manifestV2 = await setupV2Mocks(manifestWithAgentFiles("1.1.0", targets));
        await executeUpdate({ platform: "claude-code", target: "project" });

        const installed = await loadInstalled(path.join(projectDir, ".claude"));
        expect(compareVersions(installed.bundles, manifestV2).updates).toHaveLength(0);
    });

    // T35: Update to new version
    it("T35: updates files to v1.1.0", async () => {
        await installPipeline();
        const manifestV2 = await setupV2Mocks();
        const templateDir = await setupTemplateDir(manifestV2, "pipeline");
        templateDirs.push(templateDir);
        const expectedFiles = await Promise.all(
            manifestV2.bundles.pipeline.items.map(
                async (item) => [item.target, await fs.readFile(path.join(templateDir, item.target))] as const,
            ),
        );
        mockDownloadBundle.mockResolvedValue(templateDir);

        await executeUpdate({ platform: "claude-code", target: "project" });

        const claudeDir = path.join(projectDir, ".claude");
        for (const [target, expected] of expectedFiles) {
            const filePath = path.join(claudeDir, target);
            expect(await fs.readFile(filePath)).toEqual(expected);
        }
    });

    // T36: Update skips modified files
    it("T36: skips modified files with warning", async () => {
        await installPipeline();

        // Modify one file
        const claudeDir = path.join(projectDir, ".claude");
        const modifiedFile = path.join(claudeDir, "agents", "pipeline-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, original + "\n<!-- user edit -->", "utf8");

        await setupV2Mocks();
        await executeUpdate({ platform: "claude-code", target: "project" });

        // Verify modified file was skipped
        expect(mockWarnModified).toHaveBeenCalledWith(expect.any(Array), "astp update --force --target project");
        const warnedFiles = mockWarnModified.mock.calls[0][0];
        expect(warnedFiles.some((f: { targetPath: string }) => f.targetPath.includes("pipeline-approve"))).toBe(true);

        // Modified file retains v1.0.0
        const lock = JSON.parse(await fs.readFile(path.join(claudeDir, "astp.lock"), "utf8"));
        expect(lock.bundles.pipeline.units["agents/pipeline-approve.agent.md"].version).toBe("1.0.0");

        // Unmodified files updated to v1.1.0
        expect(lock.bundles.pipeline.units["agents/pipeline-orchestrator.agent.md"].version).toBe("1.1.0");
    });

    // T37: Force update overwrites modified files
    it("T37: force updates all files including modified", async () => {
        await installPipeline();

        // Modify one file
        const claudeDir = path.join(projectDir, ".claude");
        const modifiedFile = path.join(claudeDir, "agents", "pipeline-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, original + "\n<!-- user edit -->", "utf8");

        await setupV2Mocks();
        await executeUpdate({ force: true, platform: "claude-code", target: "project" });

        // Modified file overwritten with v1.1.0
        const content = await fs.readFile(modifiedFile, "utf8");
        const lock = JSON.parse(await fs.readFile(path.join(claudeDir, "astp.lock"), "utf8"));
        expect(lock.bundles.pipeline.units["agents/pipeline-approve.agent.md"].version).toBe("1.1.0");
        expect(content).not.toContain("<!-- user edit -->");
    });

    // T39: Non-TTY graceful handling
    it("T39: handles non-TTY gracefully when no target provided", async () => {
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockRejectedValue(new Error("Non-TTY: cannot prompt"));

        await expect(executeUpdate({})).rejects.toThrow();
    });
});
