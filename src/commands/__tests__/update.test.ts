import { vi } from "vitest";

import {
    compareVersions,
    detectModified,
    downloadBundle,
    fetchManifest,
    installFile,
    scanInstalled,
} from "@/core/index.js";
import type { Bundle, InstalledBundle, InstallTarget, Manifest, TemplateItem, UpdateReport } from "@/types/index.js";
import { selectTarget, showInfo, showSuccess, warnModified } from "@/ui/prompts.js";

import { executeUpdate } from "../update.js";

// Mock core modules
vi.mock("@/core/index.js", () => ({
    fetchManifest: vi.fn(),
    scanInstalled: vi.fn(),
    compareVersions: vi.fn(),
    detectModified: vi.fn(),
    downloadBundle: vi.fn(),
    installFile: vi.fn(),
}));

// Mock prompts
vi.mock("@/ui/prompts.js", () => ({
    selectTarget: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockScanInstalled = vi.mocked(scanInstalled);
const mockCompareVersions = vi.mocked(compareVersions);
const mockDetectModified = vi.mocked(detectModified);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockInstallFile = vi.mocked(installFile);
const mockSelectTarget = vi.mocked(selectTarget);
const mockShowInfo = vi.mocked(showInfo);
const mockShowSuccess = vi.mocked(showSuccess);
const mockWarnModified = vi.mocked(warnModified);

const testTarget: InstallTarget = {
    type: "project",
    rootDir: "/project/.github",
};

const testItem: TemplateItem = {
    source: "rdpi/agents/rdpi-approve.agent.md",
    target: "agents/rdpi-approve.agent.md",
    category: "agent",
};

const testBundle: Bundle = {
    name: "rdpi",
    version: "1.1.0",
    description: "RDPI pipeline",
    default: false,
    items: [testItem],
};

const testManifest: Manifest = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: { rdpi: testBundle },
};

const testInstalledBundle: InstalledBundle = {
    bundleName: "rdpi",
    version: "1.0.0",
    files: [
        {
            filePath: "/project/.github/agents/rdpi-approve.agent.md",
            relativePath: "agents/rdpi-approve.agent.md",
            metadata: {
                source: "fozy-labs/astp",
                bundle: "rdpi",
                version: "1.0.0",
                hash: "abc123",
            },
        },
    ],
};

const noUpdatesReport: UpdateReport = {
    updates: [],
    upToDate: [testInstalledBundle],
    notInManifest: [],
};

const updatesReport: UpdateReport = {
    updates: [
        {
            bundleName: "rdpi",
            installedVersion: "1.0.0",
            availableVersion: "1.1.0",
            files: [{ targetPath: "agents/rdpi-approve.agent.md", state: "unmodified" }],
        },
    ],
    upToDate: [],
    notInManifest: [],
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("executeUpdate", () => {
    // T41: CLI argument parsing — --force flag
    it("T41: accepts force option and passes to update flow", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockDetectModified.mockResolvedValue([{ targetPath: "agents/rdpi-approve.agent.md", state: "modified" }]);
        mockDownloadBundle.mockResolvedValue("/tmp/astp-rdpi");
        mockInstallFile.mockResolvedValue(undefined);

        await executeUpdate({ force: true, target: "project" });

        // With --force, modified files should still be installed
        expect(mockInstallFile).toHaveBeenCalledTimes(1);
        expect(mockWarnModified).not.toHaveBeenCalled();
    });

    it("shows info when no installed files found", async () => {
        mockScanInstalled.mockResolvedValue([]);

        await executeUpdate({ target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockFetchManifest).not.toHaveBeenCalled();
    });

    it("shows info when all bundles up to date", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(noUpdatesReport);

        await executeUpdate({ target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("All bundles up to date.");
        expect(mockDownloadBundle).not.toHaveBeenCalled();
    });

    it("skips modified files without --force", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockDetectModified.mockResolvedValue([{ targetPath: "agents/rdpi-approve.agent.md", state: "modified" }]);
        mockDownloadBundle.mockResolvedValue("/tmp/astp-rdpi");

        await executeUpdate({ target: "project" });

        expect(mockWarnModified).toHaveBeenCalled();
        expect(mockInstallFile).not.toHaveBeenCalled();
    });

    it("overwrites modified files with --force", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockDetectModified.mockResolvedValue([{ targetPath: "agents/rdpi-approve.agent.md", state: "modified" }]);
        mockDownloadBundle.mockResolvedValue("/tmp/astp-rdpi");
        mockInstallFile.mockResolvedValue(undefined);

        await executeUpdate({ force: true, target: "project" });

        expect(mockInstallFile).toHaveBeenCalledTimes(1);
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("1 file"));
    });

    it("prompts for target when not provided", async () => {
        mockSelectTarget.mockResolvedValue(testTarget);
        mockScanInstalled.mockResolvedValue([]);

        await executeUpdate({});

        expect(mockSelectTarget).toHaveBeenCalled();
    });
});
