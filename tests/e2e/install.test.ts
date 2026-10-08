import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeInstall } from "@/commands/install.js";
import { downloadBundle, extractAstpMetadata, fetchManifest } from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { confirmInstall, warnLegacySkills, warnModified } from "@/ui/prompts.js";

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
    warnLegacySkills: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockWarnModified = vi.mocked(warnModified);

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

    // T31: astp install pipeline --target project
    it("T31: installs 22 pipeline files and skills with astp metadata", async () => {
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
    it("T32: installs core bundle — 1 skill at skills/orchestrate/", async () => {
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
        expect(mockWarnModified).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ targetPath: "skills/orchestrate", kind: "skill" })]),
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
        );

        await installBundle("pipeline", true);
        expect(await fs.readFile(agentPath, "utf8")).not.toBe(edited);
    });
});
