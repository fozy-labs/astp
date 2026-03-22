import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeDelete } from "@/commands/delete.js";
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
    selectInstalledBundles: vi.fn(),
    confirmInstall: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(true),
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

    async function installRdpi(): Promise<void> {
        const tplDir = await setupTemplateDir(manifest, "rdpi");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "rdpi", target: "project" });
    }

    it("deletes installed bundle files and prunes empty directories", async () => {
        await installRdpi();

        await executeDelete({ bundle: "rdpi", target: "project" });

        const deletedPath = path.join(projectDir, ".github", "agents", "rdpi-approve.agent.md");
        await expect(fs.access(deletedPath)).rejects.toThrow();

        const skillPath = path.join(projectDir, ".github", "skills", "rdpi-01-research", "SKILL.md");
        await expect(fs.access(skillPath)).rejects.toThrow();
    });

    it("keeps modified files without force", async () => {
        await installRdpi();

        const modifiedFile = path.join(projectDir, ".github", "agents", "rdpi-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, `${original}\n<!-- user edit -->`, "utf8");

        await executeDelete({ bundle: "rdpi", target: "project" });

        const content = await fs.readFile(modifiedFile, "utf8");
        const metadata = extractAstpMetadata(content);
        expect(content).toContain("<!-- user edit -->");
        expect(metadata).not.toBeNull();
    });

    it("removes modified files with force", async () => {
        await installRdpi();

        const modifiedFile = path.join(projectDir, ".github", "agents", "rdpi-approve.agent.md");
        const original = await fs.readFile(modifiedFile, "utf8");
        await fs.writeFile(modifiedFile, `${original}\n<!-- user edit -->`, "utf8");

        await executeDelete({ bundle: "rdpi", force: true, target: "project" });

        await expect(fs.access(modifiedFile)).rejects.toThrow();
    });
});