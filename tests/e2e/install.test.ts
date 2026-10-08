import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { downloadBundle, extractAstpMetadata, fetchManifest, scanInstalled } from "@/core/index.js";
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

    it("installs a bundle mixing SKILL.md and a .sh script, tracks both, deletes both", async () => {
        manifest.bundles.matt = {
            name: "matt",
            version: "1.0.0",
            description: "Matt bundle",
            default: false,
            platforms: ["claude-code"],
            items: [
                {
                    source: "matt/skills/wizard/SKILL.md",
                    target: "skills/wizard/SKILL.md",
                    category: "skill",
                },
                {
                    source: "matt/skills/wizard/scripts/run.sh",
                    target: "skills/wizard/scripts/run.sh",
                    category: "skill",
                },
            ],
        };

        const tplDir = await setupTemplateDir(manifest, "matt");
        templateDirs.push(tplDir);
        // The fixture generator writes Markdown-shaped content; give the script a real shebang body.
        await fs.writeFile(
            path.join(tplDir, "skills", "wizard", "scripts", "run.sh"),
            "#!/usr/bin/env bash\nset -euo pipefail\necho run\n",
            "utf8",
        );
        mockDownloadBundle.mockResolvedValue(tplDir);

        await executeInstall({ bundle: "matt", platform: "claude-code", target: "project" });

        const rootDir = path.join(projectDir, ".claude");
        const shPath = path.join(rootDir, "skills", "wizard", "scripts", "run.sh");
        const mdPath = path.join(rootDir, "skills", "wizard", "SKILL.md");

        const sh = await fs.readFile(shPath, "utf8");
        expect(sh.split("\n")[0]).toBe("#!/usr/bin/env bash");
        expect(sh).toContain("# astp-bundle: matt");

        const installed = await scanInstalled(rootDir);
        expect(installed).toHaveLength(1);
        expect(installed[0].bundleName).toBe("matt");
        expect(installed[0].files).toHaveLength(2);

        await executeDelete({ bundle: "matt", platform: "claude-code", target: "project" });
        await expect(fs.access(shPath)).rejects.toThrow();
        await expect(fs.access(mdPath)).rejects.toThrow();
    });

    // T38: astp install nonexistent --target project
    it("T38: rejects nonexistent bundle with error", async () => {
        await expect(executeInstall({ bundle: "nonexistent", platform: "claude-code", target: "project" })).rejects.toThrow(
            /not found/i,
        );
    });
});
