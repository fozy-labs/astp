import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeInstall } from "@/commands/install.js";
import { downloadBundle, extractAstpMetadata, fetchManifest } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { confirmInstall } from "@/ui/prompts.js";

import {
    cleanupDir,
    createFixtureManifest,
    createTempProject,
    makeProjectTarget,
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
    selectPlatform: vi.fn(),
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

    // T31: astp install pipeline --target project
    it("T31: installs pipeline bundle — 22 files with astp frontmatter", async () => {
        const tplDir = await setupTemplateDir(manifest, "pipeline");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);

        await executeInstall({ bundle: "pipeline", platform: "claude-code", target: "project" });

        const githubDir = path.join(projectDir, ".claude");
        const pipelineBundle = manifest.bundles.pipeline;
        expect(pipelineBundle.items).toHaveLength(22);

        for (const item of pipelineBundle.items) {
            const filePath = path.join(githubDir, item.target);
            const content = await fs.readFile(filePath, "utf8");
            const metadata = extractAstpMetadata(content);

            expect(metadata).not.toBeNull();
            expect(metadata!.source).toBe("fozy-labs/astp");
            expect(metadata!.bundle).toBe("pipeline");
            expect(metadata!.version).toBe("1.0.0");
            expect(metadata!.hash).toBeTruthy();
        }
    });

    // T32: astp install core --target project
    it("T32: installs core bundle — 1 file at skills/orchestrate/SKILL.md", async () => {
        const tplDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);

        await executeInstall({ bundle: "core", platform: "claude-code", target: "project" });

        const skillPath = path.join(projectDir, ".claude", "skills", "orchestrate", "SKILL.md");
        const content = await fs.readFile(skillPath, "utf8");
        const metadata = extractAstpMetadata(content);

        expect(metadata).not.toBeNull();
        expect(metadata!.source).toBe("fozy-labs/astp");
        expect(metadata!.bundle).toBe("core");
        expect(metadata!.version).toBe("1.0.0");
    });

    // T38: astp install nonexistent --target project
    it("T38: rejects nonexistent bundle with error", async () => {
        await expect(executeInstall({ bundle: "nonexistent", platform: "claude-code", target: "project" })).rejects.toThrow(
            /not found/i,
        );
    });
});
