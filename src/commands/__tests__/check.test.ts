import { vi } from "vitest";

import { compareVersions, fetchManifest, scanInstalled } from "@/core/index.js";
import type { InstalledBundle, InstallTarget, Manifest, UpdateReport } from "@/types/index.js";
import { selectTarget, showCheckReport, showInfo } from "@/ui/prompts.js";

import { executeCheck } from "../check.js";

// Mock core modules
vi.mock("@/core/index.js", () => ({
    fetchManifest: vi.fn(),
    scanInstalled: vi.fn(),
    compareVersions: vi.fn(),
}));

// Mock prompts
vi.mock("@/ui/prompts.js", () => ({
    selectTarget: vi.fn(),
    showCheckReport: vi.fn(),
    showInfo: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockScanInstalled = vi.mocked(scanInstalled);
const mockCompareVersions = vi.mocked(compareVersions);
const mockSelectTarget = vi.mocked(selectTarget);
const mockShowCheckReport = vi.mocked(showCheckReport);
const mockShowInfo = vi.mocked(showInfo);

const testTarget: InstallTarget = {
    type: "project",
    rootDir: "/project/.github",
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

const testManifest: Manifest = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: {
        rdpi: {
            name: "rdpi",
            version: "1.2.0",
            description: "RDPI pipeline",
            default: false,
            items: [
                {
                    source: "rdpi/agents/rdpi-approve.agent.md",
                    target: "agents/rdpi-approve.agent.md",
                    category: "agent",
                },
            ],
        },
    },
};

const mixedReport: UpdateReport = {
    updates: [
        {
            bundleName: "rdpi",
            installedVersion: "1.0.0",
            availableVersion: "1.2.0",
            files: [{ targetPath: "agents/rdpi-approve.agent.md", state: "unmodified" }],
        },
    ],
    upToDate: [],
    notInManifest: [],
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("executeCheck", () => {
    it("shows info when no installed files found", async () => {
        mockScanInstalled.mockResolvedValue([]);

        await executeCheck({ target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockFetchManifest).not.toHaveBeenCalled();
        expect(mockShowCheckReport).not.toHaveBeenCalled();
    });

    it("fetches manifest and displays report when files are installed", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(mixedReport);

        await executeCheck({ target: "project" });

        expect(mockFetchManifest).toHaveBeenCalled();
        expect(mockCompareVersions).toHaveBeenCalledWith([testInstalledBundle], testManifest);
        expect(mockShowCheckReport).toHaveBeenCalledWith(mixedReport);
    });

    it("displays mixed states correctly", async () => {
        const upToDateBundle: InstalledBundle = {
            bundleName: "base",
            version: "1.0.0",
            files: [],
        };

        const report: UpdateReport = {
            updates: [
                {
                    bundleName: "rdpi",
                    installedVersion: "1.0.0",
                    availableVersion: "1.2.0",
                    files: [],
                },
            ],
            upToDate: [upToDateBundle],
            notInManifest: [],
        };

        mockScanInstalled.mockResolvedValue([testInstalledBundle, upToDateBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(report);

        await executeCheck({ target: "project" });

        expect(mockShowCheckReport).toHaveBeenCalledWith(report);
    });

    it("prompts for target when not provided", async () => {
        mockSelectTarget.mockResolvedValue(testTarget);
        mockScanInstalled.mockResolvedValue([]);

        await executeCheck({});

        expect(mockSelectTarget).toHaveBeenCalled();
    });
});
