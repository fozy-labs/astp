import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeCheck } from "@/commands/check.js";
import { executeInstall } from "@/commands/install.js";
import { downloadBundle, fetchManifest } from "@/core/index.js";
import type { Manifest, UpdateReport } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { confirmInstall, showCheckReport, showInfo } from "@/ui/prompts.js";

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
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockShowCheckReport = vi.mocked(showCheckReport);
const mockShowInfo = vi.mocked(showInfo);

describe("E2E: check", () => {
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

    // T33: Check after install — reports up to date
    it("T33: reports 'Up to date' after installing pipeline", async () => {
        // Install pipeline first
        const tplDir = await setupTemplateDir(manifest, "pipeline");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "pipeline", platform: "claude-code", target: "project" });

        // Reset mocks for the check call
        vi.clearAllMocks();
        mockFetchManifest.mockResolvedValue(manifest);
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));

        await executeCheck({ platform: "claude-code", target: "project" });

        expect(mockShowCheckReport).toHaveBeenCalledTimes(1);
        const report: UpdateReport = mockShowCheckReport.mock.calls[0][0];
        expect(report.upToDate).toHaveLength(1);
        expect(report.upToDate[0].bundleName).toBe("pipeline");
        expect(report.updates).toHaveLength(0);
    });

    // T34: Check with no installed files
    it("T34: reports 'No astp-managed files found' for empty project", async () => {
        await executeCheck({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockShowCheckReport).not.toHaveBeenCalled();
    });

    // T35: Check lists units changed locally — modified files and dirty block files
    it("T35: passes locally changed units to the report", async () => {
        manifest.bundles.pipeline!.items.push({
            source: "pipeline/rules/fillable.rules.md",
            target: "rules/fillable.rules.md",
            category: "rule",
        });
        const tplDir = await setupTemplateDir(manifest, "pipeline", {
            "rules/fillable.rules.md": '---\ndescription: fillable\n---\n\n<astp-block name="a">\nfill me\n</astp-block>\n',
        });
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "pipeline", platform: "claude-code", target: "project" });

        const rootDir = makeProjectTarget(projectDir).rootDir;
        await fs.appendFile(path.join(rootDir, "agents/pipeline-orchestrator.agent.md"), "\nlocal edit\n");
        const blockFile = path.join(rootDir, "rules/fillable.rules.md");
        await fs.writeFile(blockFile, (await fs.readFile(blockFile, "utf8")).replace("fill me", "filled in"));

        vi.clearAllMocks();
        mockFetchManifest.mockResolvedValue(manifest);
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));

        await executeCheck({ platform: "claude-code", target: "project" });

        const changed = mockShowCheckReport.mock.calls[0]?.[2];
        expect(changed).toContainEqual({ path: "agents/pipeline-orchestrator.agent.md", modified: true });
        expect(changed).toContainEqual({ path: "rules/fillable.rules.md", modified: false });
    });
});
