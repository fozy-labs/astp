import { vi } from "vitest";

import { downloadBundle, fetchManifest, installFile, resolveBundle } from "@/core/index.js";
import type { Bundle, InstallTarget, Manifest, TemplateItem } from "@/types/index.js";
import { confirmInstall, selectBundles, selectPlatform, selectTarget, showSuccess } from "@/ui/prompts.js";

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
    selectPlatform: vi.fn(),
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
const mockSelectPlatform = vi.mocked(selectPlatform);
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
    platforms: ["vscode"],
    items: [testItem],
};

const fozyLabsBundle: Bundle = {
    name: "fozy-labs",
    version: "1.0.0",
    description: "Fozy Labs stack skills",
    default: false,
    platforms: ["vscode", "claude-code"],
    items: [
        {
            source: "fozy-labs/skills/fozy-labs-di/SKILL.md",
            target: "skills/fozy-labs-di/SKILL.md",
            category: "skill",
        },
    ],
};

const testManifest: Manifest = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: { base: testBundle, "fozy-labs": fozyLabsBundle },
};

const testTarget: InstallTarget = {
    platform: "vscode",
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
    // T40: CLI argument parsing — bundle, platform, and target provided
    it("T40: uses provided bundle, platform, and target without prompts", async () => {
        mockResolveBundle.mockReturnValue(testBundle);

        await executeInstall({ bundle: "base", platform: "vscode", target: "project" });

        expect(mockSelectPlatform).not.toHaveBeenCalled();
        expect(mockSelectTarget).not.toHaveBeenCalled();
        expect(mockSelectBundles).not.toHaveBeenCalled();
        expect(mockResolveBundle).toHaveBeenCalledWith(testManifest, "base");
        expect(mockDownloadBundle).toHaveBeenCalledWith("fozy-labs/astp", "base");
        expect(mockInstallFile).toHaveBeenCalledTimes(1);
        expect(mockInstallFile).toHaveBeenCalledWith(
            "/tmp/astp-base",
            testItem,
            expect.objectContaining({ type: "project", platform: "vscode" }),
            { source: "fozy-labs/astp", bundle: "base", version: "1.0.0" },
        );
    });

    it("prompts for platform, target, and bundles when no arguments provided", async () => {
        mockSelectPlatform.mockResolvedValue("vscode");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);

        await executeInstall({});

        expect(mockSelectPlatform).toHaveBeenCalled();
        expect(mockSelectTarget).toHaveBeenCalledWith("vscode");
        expect(mockSelectBundles).toHaveBeenCalledWith(testManifest, "vscode");
        expect(mockConfirmInstall).toHaveBeenCalledWith([testBundle], testTarget);
    });

    it("rejects bundle that does not support requested platform", async () => {
        mockResolveBundle.mockReturnValue(testBundle);

        await expect(executeInstall({ bundle: "base", platform: "claude-code", target: "project" })).rejects.toThrow(
            /does not support platform 'claude-code'/,
        );
        expect(mockDownloadBundle).not.toHaveBeenCalled();
    });

    it("accepts cross-platform bundle when installing to claude-code", async () => {
        mockResolveBundle.mockReturnValue(fozyLabsBundle);

        await executeInstall({ bundle: "fozy-labs", platform: "claude-code", target: "project" });

        expect(mockInstallFile).toHaveBeenCalledWith(
            expect.any(String),
            fozyLabsBundle.items[0],
            expect.objectContaining({ type: "project", platform: "claude-code" }),
            { source: "fozy-labs/astp", bundle: "fozy-labs", version: "1.0.0" },
        );
    });

    it("aborts when user declines confirmation", async () => {
        mockSelectPlatform.mockResolvedValue("vscode");
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

        await expect(executeInstall({ bundle: "foo", platform: "vscode", target: "project" })).rejects.toThrow(
            "Bundle 'foo' not found",
        );
    });

    it("shows success with correct file count", async () => {
        mockSelectPlatform.mockResolvedValue("vscode");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);

        await executeInstall({});

        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("1 file"));
    });
});
