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
    it("T33: reports 'Up to date' after installing rdpi", async () => {
        // Install rdpi first
        const tplDir = await setupTemplateDir(manifest, "rdpi");
        templateDirs.push(tplDir);
        mockDownloadBundle.mockResolvedValue(tplDir);
        await executeInstall({ bundle: "rdpi", target: "project" });

        // Reset mocks for the check call
        vi.clearAllMocks();
        mockFetchManifest.mockResolvedValue(manifest);
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));

        await executeCheck({ target: "project" });

        expect(mockShowCheckReport).toHaveBeenCalledTimes(1);
        const report: UpdateReport = mockShowCheckReport.mock.calls[0][0];
        expect(report.upToDate).toHaveLength(1);
        expect(report.upToDate[0].bundleName).toBe("rdpi");
        expect(report.updates).toHaveLength(0);
    });

    // T34: Check with no installed files
    it("T34: reports 'No astp-managed files found' for empty project", async () => {
        await executeCheck({ target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockShowCheckReport).not.toHaveBeenCalled();
    });
});
