import { vi } from "vitest";

import { detectModified, removeBundle, scanInstalled } from "@/core/index.js";
import type { InstalledBundle, InstallTarget } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    selectInstalledBundles,
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    warnModified,
} from "@/ui/prompts.js";

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
    selectPlatform: vi.fn(),
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
const mockSelectPlatform = vi.mocked(selectPlatform);
const mockSelectTarget = vi.mocked(selectTarget);
const mockSelectInstalledBundles = vi.mocked(selectInstalledBundles);
const mockShowInfo = vi.mocked(showInfo);
const mockShowSuccess = vi.mocked(showSuccess);
const mockWarnModified = vi.mocked(warnModified);

const testTarget: InstallTarget = {
    platform: "claude-code",
    type: "project",
    rootDir: "/project/.claude",
};

const testBundle: InstalledBundle = {
    bundleName: "pipeline",
    version: "1.0.0",
    files: [
        {
            filePath: "/project/.claude/agents/pipeline-approve.agent.md",
            relativePath: "agents/pipeline-approve.agent.md",
            metadata: {
                source: "fozy-labs/astp",
                bundle: "pipeline",
                version: "1.0.0",
                hash: "abc123",
            },
        },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTarget.mockReturnValue(testTarget);
    mockSelectPlatform.mockResolvedValue("claude-code");
    mockSelectTarget.mockResolvedValue(testTarget);
    mockScanInstalled.mockResolvedValue([testBundle]);
    mockSelectInstalledBundles.mockResolvedValue([testBundle]);
    mockDetectModified.mockResolvedValue([{ targetPath: "agents/pipeline-approve.agent.md", state: "unmodified" }]);
    mockRemoveBundle.mockResolvedValue({ removed: ["agents/pipeline-approve.agent.md"], skipped: [] });
});

describe("executeDelete", () => {
    it("deletes the explicitly selected bundle", async () => {
        await executeDelete({ bundle: "pipeline", platform: "claude-code", target: "project" });

        expect(mockSelectInstalledBundles).not.toHaveBeenCalled();
        expect(mockRemoveBundle).toHaveBeenCalledWith(testBundle, "/project/.claude", false);
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("Deleted 1 file"));
    });

    it("shows info when no managed files are installed", async () => {
        mockScanInstalled.mockResolvedValue([]);

        await executeDelete({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockRemoveBundle).not.toHaveBeenCalled();
    });

    it("warns and skips modified files without force", async () => {
        mockDetectModified.mockResolvedValue([{ targetPath: "agents/pipeline-approve.agent.md", state: "modified" }]);
        mockRemoveBundle.mockResolvedValue({
            removed: [],
            skipped: [{ targetPath: "agents/pipeline-approve.agent.md", state: "modified" }],
        });

        await executeDelete({ bundle: "pipeline", platform: "claude-code", target: "project" });

        expect(mockWarnModified).toHaveBeenCalled();
        expect(mockShowInfo).toHaveBeenCalledWith("No files deleted, skipped 1 modified file.");
    });

    it("deletes modified files with force", async () => {
        mockDetectModified.mockResolvedValue([{ targetPath: "agents/pipeline-approve.agent.md", state: "modified" }]);

        await executeDelete({ bundle: "pipeline", force: true, platform: "claude-code", target: "project" });

        expect(mockWarnModified).not.toHaveBeenCalled();
        expect(mockRemoveBundle).toHaveBeenCalledWith(testBundle, "/project/.claude", true);
    });

    it("throws when bundle is not installed", async () => {
        await expect(executeDelete({ bundle: "core", platform: "claude-code", target: "project" })).rejects.toThrow(
            "Installed bundle 'core' not found",
        );
    });
});
