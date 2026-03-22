import { vi } from "vitest";

import { detectModified, removeBundle, scanInstalled } from "@/core/index.js";
import type { InstalledBundle, InstallTarget } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { selectInstalledBundles, selectTarget, showInfo, showSuccess, warnModified } from "@/ui/prompts.js";

import { executeDelete } from "../delete.js";

vi.mock("@/core/index.js", () => ({
    scanInstalled: vi.fn(),
    detectModified: vi.fn(),
    removeBundle: vi.fn(),
}));

vi.mock("@/types/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/types/index.js")>();
    return { ...actual, resolveTarget: vi.fn() };
});

vi.mock("@/ui/prompts.js", () => ({
    selectTarget: vi.fn(),
    selectInstalledBundles: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(true),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    warnModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockScanInstalled = vi.mocked(scanInstalled);
const mockDetectModified = vi.mocked(detectModified);
const mockRemoveBundle = vi.mocked(removeBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockSelectTarget = vi.mocked(selectTarget);
const mockSelectInstalledBundles = vi.mocked(selectInstalledBundles);
const mockShowInfo = vi.mocked(showInfo);
const mockShowSuccess = vi.mocked(showSuccess);
const mockWarnModified = vi.mocked(warnModified);

const testTarget: InstallTarget = {
    type: "project",
    rootDir: "/project/.github",
};

const testBundle: InstalledBundle = {
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

beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTarget.mockReturnValue(testTarget);
    mockSelectTarget.mockResolvedValue(testTarget);
    mockScanInstalled.mockResolvedValue([testBundle]);
    mockSelectInstalledBundles.mockResolvedValue([testBundle]);
    mockDetectModified.mockResolvedValue([{ targetPath: "agents/rdpi-approve.agent.md", state: "unmodified" }]);
    mockRemoveBundle.mockResolvedValue({ removed: ["agents/rdpi-approve.agent.md"], skipped: [] });
});

describe("executeDelete", () => {
    it("deletes the explicitly selected bundle", async () => {
        await executeDelete({ bundle: "rdpi", target: "project" });

        expect(mockSelectInstalledBundles).not.toHaveBeenCalled();
        expect(mockRemoveBundle).toHaveBeenCalledWith(testBundle, "/project/.github", false);
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("Deleted 1 file"));
    });

    it("shows info when no managed files are installed", async () => {
        mockScanInstalled.mockResolvedValue([]);

        await executeDelete({ target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockRemoveBundle).not.toHaveBeenCalled();
    });

    it("warns and skips modified files without force", async () => {
        mockDetectModified.mockResolvedValue([{ targetPath: "agents/rdpi-approve.agent.md", state: "modified" }]);
        mockRemoveBundle.mockResolvedValue({
            removed: [],
            skipped: [{ targetPath: "agents/rdpi-approve.agent.md", state: "modified" }],
        });

        await executeDelete({ bundle: "rdpi", target: "project" });

        expect(mockWarnModified).toHaveBeenCalled();
        expect(mockShowInfo).toHaveBeenCalledWith("No files deleted, skipped 1 modified file.");
    });

    it("deletes modified files with force", async () => {
        mockDetectModified.mockResolvedValue([{ targetPath: "agents/rdpi-approve.agent.md", state: "modified" }]);

        await executeDelete({ bundle: "rdpi", force: true, target: "project" });

        expect(mockWarnModified).not.toHaveBeenCalled();
        expect(mockRemoveBundle).toHaveBeenCalledWith(testBundle, "/project/.github", true);
    });

    it("throws when bundle is not installed", async () => {
        await expect(executeDelete({ bundle: "base", target: "project" })).rejects.toThrow(
            "Installed bundle 'base' not found",
        );
    });
});