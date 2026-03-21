import { vi } from "vitest";

import { downloadBundle, fetchManifest, installFile, resolveBundle } from "@/core/index.js";
import type { Bundle, InstallTarget, Manifest, TemplateItem } from "@/types/index.js";
import { confirmInstall, selectBundles, selectTarget, showSuccess } from "@/ui/prompts.js";

import { executeInstall } from "../install.js";

// Mock core modules
vi.mock("@/core/index.js", () => ({
    fetchManifest: vi.fn(),
    resolveBundle: vi.fn(),
    downloadBundle: vi.fn(),
    installFile: vi.fn(),
}));

// Mock prompts
vi.mock("@/ui/prompts.js", () => ({
    selectTarget: vi.fn(),
    selectBundles: vi.fn(),
    confirmInstall: vi.fn(),
    showSuccess: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockResolveBundle = vi.mocked(resolveBundle);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockInstallFile = vi.mocked(installFile);
const mockSelectTarget = vi.mocked(selectTarget);
const mockSelectBundles = vi.mocked(selectBundles);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockShowSuccess = vi.mocked(showSuccess);

const testItem: TemplateItem = {
    source: "base/skills/orchestrate/SKILL.md",
    target: "skills/orchestrate/SKILL.md",
    category: "skill",
};

const testBundle: Bundle = {
    name: "base",
    version: "1.0.0",
    description: "Base skill",
    default: true,
    items: [testItem],
};

const testManifest: Manifest = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: { base: testBundle },
};

const testTarget: InstallTarget = {
    type: "project",
    rootDir: "/project/.github",
};

beforeEach(() => {
    vi.clearAllMocks();
    mockFetchManifest.mockResolvedValue(testManifest);
    mockDownloadBundle.mockResolvedValue("/tmp/astp-base");
    mockInstallFile.mockResolvedValue(undefined);
    mockConfirmInstall.mockResolvedValue(true);
});

describe("executeInstall", () => {
    // T40: CLI argument parsing — bundle and target provided
    it("T40: uses provided bundle and target without prompts", async () => {
        mockResolveBundle.mockReturnValue(testBundle);

        await executeInstall({ bundle: "base", target: "project" });

        expect(mockSelectTarget).not.toHaveBeenCalled();
        expect(mockSelectBundles).not.toHaveBeenCalled();
        expect(mockResolveBundle).toHaveBeenCalledWith(testManifest, "base");
        expect(mockDownloadBundle).toHaveBeenCalledWith("fozy-labs/astp", "base");
        expect(mockInstallFile).toHaveBeenCalledTimes(1);
        expect(mockInstallFile).toHaveBeenCalledWith(
            "/tmp/astp-base",
            testItem,
            expect.objectContaining({ type: "project" }),
            { source: "fozy-labs/astp", bundle: "base", version: "1.0.0" },
        );
    });

    it("prompts for target and bundles when no arguments provided", async () => {
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);

        await executeInstall({});

        expect(mockSelectTarget).toHaveBeenCalled();
        expect(mockSelectBundles).toHaveBeenCalledWith(testManifest);
        expect(mockConfirmInstall).toHaveBeenCalledWith([testBundle], testTarget);
    });

    it("aborts when user declines confirmation", async () => {
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);
        mockConfirmInstall.mockResolvedValue(false);

        await executeInstall({});

        expect(mockDownloadBundle).not.toHaveBeenCalled();
        expect(mockInstallFile).not.toHaveBeenCalled();
    });

    it("propagates error for unknown bundle", async () => {
        mockResolveBundle.mockImplementation(() => {
            throw new Error("Bundle 'foo' not found. Available: base");
        });

        await expect(executeInstall({ bundle: "foo", target: "project" })).rejects.toThrow("Bundle 'foo' not found");
    });

    it("shows success with correct file count", async () => {
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);

        await executeInstall({});

        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("1 file"));
    });
});
