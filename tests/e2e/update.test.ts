import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";
import { downloadBundle, extractAstpMetadata, fetchManifest } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { confirmInstall, selectTarget, warnModified } from "@/ui/prompts.js";

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
    selectTarget: vi.fn(),
    selectBundles: vi.fn(),
    confirmInstall: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showCheckReport: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockWarnModified = vi.mocked(warnModified);
const mockSelectTarget = vi.mocked(selectTarget);

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

    async function installRdpi(): Promise<void> {
        mockFetchManifest.mockResolvedValue(manifestV1);
        const tplDir = await setupTemplateDir(manifestV1, "rdpi");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "rdpi", target: "project" });
    }

    async function setupV2Mocks(): Promise<Manifest> {
        const manifestV2 = createFixtureManifest("1.1.0");
        const tplDir2 = await setupTemplateDir(manifestV2, "rdpi");
        templateDirs.push(tplDir2);

        vi.clearAllMocks();
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));
        mockFetchManifest.mockResolvedValue(manifestV2);
        mockDownloadBundle.mockResolvedValue(tplDir2);

        return manifestV2;
    }

    // T35: Update to new version
    it("T35: updates files to v1.1.0", async () => {
        await installRdpi();
        const manifestV2 = await setupV2Mocks();

        await executeUpdate({ target: "project" });

        const githubDir = path.join(projectDir, ".github");
        for (const item of manifestV2.bundles.rdpi.items) {
            const filePath = path.join(githubDir, item.target);
            const content = await fs.readFile(filePath, "utf8");
            const metadata = extractAstpMetadata(content);

            expect(metadata).not.toBeNull();
            expect(metadata!.version).toBe("1.1.0");
        }
    });

    // T36: Update skips modified files
    it("T36: skips modified files with warning", async () => {
        await installRdpi();

        // Modify one file
        const githubDir = path.join(projectDir, ".github");
        const modifiedFile = path.join(githubDir, "agents", "rdpi-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, original + "\n<!-- user edit -->", "utf8");

        await setupV2Mocks();
        await executeUpdate({ target: "project" });

        // Verify modified file was skipped
        expect(mockWarnModified).toHaveBeenCalled();
        const warnedFiles = mockWarnModified.mock.calls[0][0];
        expect(warnedFiles.some((f: { targetPath: string }) => f.targetPath.includes("rdpi-approve"))).toBe(true);

        // Modified file retains v1.0.0
        const content = await fs.readFile(modifiedFile, "utf8");
        const metadata = extractAstpMetadata(content);
        expect(metadata!.version).toBe("1.0.0");

        // Unmodified files updated to v1.1.0
        const otherFile = path.join(githubDir, "agents", "RDPI-Orchestrator.agent.md");
        const otherContent = await fs.readFile(otherFile, "utf8");
        const otherMeta = extractAstpMetadata(otherContent);
        expect(otherMeta!.version).toBe("1.1.0");
    });

    // T37: Force update overwrites modified files
    it("T37: force updates all files including modified", async () => {
        await installRdpi();

        // Modify one file
        const githubDir = path.join(projectDir, ".github");
        const modifiedFile = path.join(githubDir, "agents", "rdpi-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, original + "\n<!-- user edit -->", "utf8");

        await setupV2Mocks();
        await executeUpdate({ force: true, target: "project" });

        // Modified file overwritten with v1.1.0
        const content = await fs.readFile(modifiedFile, "utf8");
        const metadata = extractAstpMetadata(content);
        expect(metadata!.version).toBe("1.1.0");
        expect(content).not.toContain("<!-- user edit -->");
    });

    // T39: Non-TTY graceful handling
    it("T39: handles non-TTY gracefully when no target provided", async () => {
        mockSelectTarget.mockRejectedValue(new Error("Non-TTY: cannot prompt"));

        await expect(executeUpdate({})).rejects.toThrow();
    });
});
