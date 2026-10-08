import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, vi } from "vitest";

import {
    assertBundleSources,
    downloadBundle,
    fetchManifest,
    loadInstalled,
    resolveBundle,
    syncBundle,
    writeLock,
} from "@/core/index.js";
import type { Bundle, InstallTarget, Manifest, Platform, TemplateItem } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    confirmInstall,
    isInteractive,
    selectBundles,
    selectPlatform,
    selectTarget,
    selectUnits,
    showSuccess,
} from "@/ui/prompts.js";

import { executeInstall } from "../install.js";

// Mock core modules
vi.mock("@/core/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/core/index.js")>();
    return {
        ...actual,
        fetchManifest: vi.fn(),
        resolveBundle: vi.fn(),
        downloadBundle: vi.fn(),
        loadInstalled: vi.fn(),
        syncBundle: vi.fn(),
        writeLock: vi.fn(),
        assertBundleSources: vi.fn(),
    };
});

vi.mock("@/ui/prompts.js", () => ({
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundles: vi.fn(),
    confirmInstall: vi.fn(),
    isInteractive: vi.fn(),
    selectUnits: vi.fn(),
    showSuccess: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock("@/types/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/types/index.js")>()),
    resolveTarget: vi.fn(),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockResolveBundle = vi.mocked(resolveBundle);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockLoadInstalled = vi.mocked(loadInstalled);
const mockSyncBundle = vi.mocked(syncBundle);
const mockWriteLock = vi.mocked(writeLock);
const mockSelectPlatform = vi.mocked(selectPlatform);
const mockSelectTarget = vi.mocked(selectTarget);
const mockSelectBundles = vi.mocked(selectBundles);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockShowSuccess = vi.mocked(showSuccess);
const mockIsInteractive = vi.mocked(isInteractive);
const mockSelectUnits = vi.mocked(selectUnits);
const mockResolveTarget = vi.mocked(resolveTarget);

const temporaryRoots: string[] = [];
let tempBundleDir: string;

const testItem: TemplateItem = {
    source: "core/skills/orchestrate/SKILL.md",
    target: "skills/orchestrate/SKILL.md",
    category: "skill",
};

const testBundle: Bundle = {
    name: "core",
    version: "1.0.0",
    description: "Core skill",
    default: true,
    platforms: ["claude-code"],
    items: [testItem],
};

const fozyLabsBundle: Bundle = {
    name: "fozy-labs",
    version: "1.0.0",
    description: "Fozy Labs stack skills",
    default: false,
    platforms: ["claude-code"],
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
    bundles: { core: testBundle, "fozy-labs": fozyLabsBundle },
};

const testTarget: InstallTarget = {
    platform: "claude-code",
    type: "project",
    rootDir: "/project/.claude",
};

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((rootDir) => fs.rm(rootDir, { recursive: true, force: true })));
});

beforeEach(async () => {
    vi.clearAllMocks();
    tempBundleDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-install-bundle-"));
    temporaryRoots.push(tempBundleDir);
    mockFetchManifest.mockResolvedValue(testManifest);
    mockDownloadBundle.mockResolvedValue(tempBundleDir);
    mockLoadInstalled.mockResolvedValue({ lock: { schemaVersion: 1, bundles: {} }, bundles: [] });
    mockSyncBundle.mockResolvedValue({
        installed: [{ targetPath: "skills/orchestrate", kind: "skill", state: "unmodified" }],
        removed: [],
        skipped: [],
        kept: [],
    });
    mockWriteLock.mockResolvedValue(undefined);
    mockConfirmInstall.mockResolvedValue(true);
    mockIsInteractive.mockReturnValue(false);
    mockResolveTarget.mockReturnValue(testTarget);
});

describe("executeInstall", () => {
    it("uses provided bundle, platform, and target without prompts", async () => {
        mockResolveBundle.mockReturnValue(testBundle);

        await executeInstall({ bundle: "core", platform: "claude-code", target: "project" });

        expect(mockSelectPlatform).not.toHaveBeenCalled();
        expect(mockSelectTarget).not.toHaveBeenCalled();
        expect(mockSelectBundles).not.toHaveBeenCalled();
        expect(mockResolveBundle).toHaveBeenCalledWith(testManifest, "core");
        expect(mockDownloadBundle).toHaveBeenCalledWith("fozy-labs/astp", "core");
        expect(mockSyncBundle).toHaveBeenCalledTimes(1);
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                target: testTarget,
                manifest: testManifest,
                bundle: testBundle,
                selected: new Set(["skills/orchestrate"]),
                declined: new Set(),
                force: false,
            }),
        );
    });

    it("removes the downloaded temp directory after a successful install", async () => {
        mockResolveBundle.mockReturnValue(testBundle);

        await executeInstall({ bundle: "core", platform: "claude-code", target: "project" });

        await expect(fs.stat(tempBundleDir)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("prompts for platform, target, and bundles when no arguments provided", async () => {
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);

        await executeInstall({});

        expect(mockSelectPlatform).toHaveBeenCalled();
        expect(mockSelectTarget).toHaveBeenCalledWith("claude-code");
        expect(mockSelectBundles).toHaveBeenCalledWith(testManifest, "claude-code");
        expect(mockConfirmInstall).toHaveBeenCalledWith([testBundle], testTarget, [
            { kind: "skill", relativePath: "skills/orchestrate", items: [testItem] },
        ]);
    });

    it("rejects bundle that does not support requested platform", async () => {
        const legacyBundle: Bundle = { ...testBundle, platforms: ["vscode" as Platform] };
        mockResolveBundle.mockReturnValue(legacyBundle);

        await expect(executeInstall({ bundle: "core", platform: "claude-code", target: "project" })).rejects.toThrow(
            /does not support platform 'claude-code'/,
        );
        expect(mockDownloadBundle).not.toHaveBeenCalled();
    });

    it("accepts bundle supporting claude-code", async () => {
        mockResolveBundle.mockReturnValue(fozyLabsBundle);

        await executeInstall({ bundle: "fozy-labs", platform: "claude-code", target: "project" });

        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({ bundle: fozyLabsBundle, selected: new Set(["skills/fozy-labs-di"]) }),
        );
    });

    it("aborts when user declines confirmation", async () => {
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);
        mockConfirmInstall.mockResolvedValue(false);

        await executeInstall({});

        expect(mockDownloadBundle).not.toHaveBeenCalled();
        expect(mockSyncBundle).not.toHaveBeenCalled();
    });

    it("propagates error for unknown bundle", async () => {
        mockResolveBundle.mockImplementation(() => {
            throw new Error("Bundle 'foo' not found. Available: core");
        });

        await expect(executeInstall({ bundle: "foo", platform: "claude-code", target: "project" })).rejects.toThrow(
            "Bundle 'foo' not found",
        );
    });

    it("shows success with correct file count", async () => {
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);

        await executeInstall({});

        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("1 skill"));
    });

    it("prompts for unit selection in an interactive install", async () => {
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundles.mockResolvedValue([testBundle]);
        mockIsInteractive.mockReturnValue(true);
        mockSelectUnits.mockResolvedValue([]);

        await executeInstall({});

        expect(mockSelectUnits).toHaveBeenCalledWith(
            testBundle,
            [{ kind: "skill", relativePath: "skills/orchestrate", items: [testItem] }],
            ["skills/orchestrate"],
        );
        expect(mockConfirmInstall).toHaveBeenCalledWith([testBundle], testTarget, []);
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({ selected: new Set(), declined: new Set(["skills/orchestrate"]) }),
        );
    });
});
