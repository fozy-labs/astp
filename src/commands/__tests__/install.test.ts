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
    selectBundleItems,
    selectPlatform,
    selectTarget,
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
        readUnitBlockFiles: vi.fn(async () => new Map()),
        syncBundle: vi.fn(),
        writeLock: vi.fn(),
        assertBundleBlocks: vi.fn(),
        assertBundleSources: vi.fn(),
    };
});

vi.mock("@/ui/prompts.js", () => ({
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundleItems: vi.fn(),
    cancelNoBundles: vi.fn(),
    confirmInstall: vi.fn(),
    isInteractive: vi.fn(),
    requireTerminal: vi.fn(),
    selectBlocks: vi.fn(),
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
const mockSelectBundleItems = vi.mocked(selectBundleItems);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockShowSuccess = vi.mocked(showSuccess);
const mockIsInteractive = vi.mocked(isInteractive);
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
        keptBlocks: [],
        released: [],
        foreign: [],
        releasedBlocks: [],
        foreignBlocks: [],
        conflictBlocks: [],
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
        expect(mockSelectBundleItems).not.toHaveBeenCalled();
        expect(mockConfirmInstall).not.toHaveBeenCalled();
        expect(mockResolveBundle).toHaveBeenCalledWith(testManifest, "core");
        expect(mockDownloadBundle).toHaveBeenCalledWith(
            expect.objectContaining({ spec: "gh:fozy-labs/astp" }),
            expect.objectContaining({ name: "core" }),
        );
        expect(mockSyncBundle).toHaveBeenCalledTimes(1);
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                target: testTarget,
                source: "gh:fozy-labs/astp",
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
        mockIsInteractive.mockReturnValue(true);
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundleItems.mockResolvedValue(new Map([["core", { units: ["skills/orchestrate"], blocks: [] }]]));
        mockResolveBundle.mockImplementation((manifest, name) => manifest.bundles[name]!);

        await executeInstall({});

        expect(mockSelectPlatform).toHaveBeenCalled();
        expect(mockSelectTarget).toHaveBeenCalledWith("claude-code");
        expect(mockSelectBundleItems).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ bundle: testBundle })]),
        );
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
        mockIsInteractive.mockReturnValue(true);
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundleItems.mockResolvedValue(new Map([["core", { units: ["skills/orchestrate"], blocks: [] }]]));
        mockResolveBundle.mockReturnValue(testBundle);
        mockConfirmInstall.mockResolvedValue(false);

        await executeInstall({});

        expect(mockConfirmInstall).toHaveBeenCalled();
        // Bundles download before the confirmation: block prompts need content.
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
        mockIsInteractive.mockReturnValue(true);
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockSelectBundleItems.mockResolvedValue(new Map([["core", { units: ["skills/orchestrate"], blocks: [] }]]));
        mockResolveBundle.mockImplementation((manifest, name) => manifest.bundles[name]!);

        await executeInstall({});

        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("1 skill"));
    });

    it("shows the tree with only the named bundle, preselected, when installing it interactively", async () => {
        mockIsInteractive.mockReturnValue(true);
        mockSelectBundleItems.mockResolvedValue(new Map([["core", { units: [], blocks: [] }]]));
        mockResolveBundle.mockReturnValue(testBundle);

        await executeInstall({ bundle: "core", platform: "claude-code", target: "project" });

        expect(mockSelectBundleItems).toHaveBeenCalledWith([
            expect.objectContaining({
                bundle: testBundle,
                units: [{ kind: "skill", relativePath: "skills/orchestrate", items: [testItem] }],
                defaults: ["skills/orchestrate"],
                preselected: true,
            }),
        ]);
        expect(mockConfirmInstall).toHaveBeenCalledWith([testBundle], testTarget, []);
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({ selected: new Set(), declined: new Set(["skills/orchestrate"]) }),
        );
    });

    it("installs --skill without the tree in a terminal", async () => {
        mockIsInteractive.mockReturnValue(true);
        mockResolveBundle.mockReturnValue(testBundle);

        await executeInstall({ bundle: "core", skills: ["orchestrate"], platform: "claude-code", target: "project" });

        expect(mockSelectBundleItems).not.toHaveBeenCalled();
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({ selected: new Set(["skills/orchestrate"]) }),
        );
    });
});

describe("interactive bundle tree selection", () => {
    const bundleA: Bundle = {
        name: "a",
        version: "1.0.0",
        description: "Bundle A",
        default: true,
        platforms: ["claude-code"],
        items: [
            { source: "a/agents/a1.md", target: "agents/a1.md", category: "agent" },
            { source: "a/rules/r1.md", target: "rules/r1.md", category: "rule" },
        ],
    };
    const bundleB: Bundle = {
        name: "b",
        version: "1.0.0",
        description: "Bundle B",
        default: false,
        platforms: ["claude-code"],
        items: [
            { source: "b/skills/s1/SKILL.md", target: "skills/s1/SKILL.md", category: "skill" },
            { source: "b/skills/s2/SKILL.md", target: "skills/s2/SKILL.md", category: "skill" },
            { source: "b/agents/b1.md", target: "agents/b1.md", category: "agent" },
        ],
    };
    const abManifest: Manifest = {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: { a: bundleA, b: bundleB },
    };

    beforeEach(() => {
        mockIsInteractive.mockReturnValue(true);
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockFetchManifest.mockResolvedValue(abManifest);
        mockResolveBundle.mockImplementation((manifest, name) => manifest.bundles[name]!);
    });

    it("installs the chosen subset per bundle and declines the rest", async () => {
        mockSelectBundleItems.mockResolvedValue(
            new Map([
                ["a", { units: ["agents/a1.md", "rules/r1.md"], blocks: [] }],
                ["b", { units: ["skills/s1"], blocks: [] }],
            ]),
        );

        await executeInstall({});

        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                bundle: bundleA,
                selected: new Set(["agents/a1.md", "rules/r1.md"]),
                declined: new Set(),
            }),
        );
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                bundle: bundleB,
                selected: new Set(["skills/s1"]),
                declined: new Set(["skills/s2", "agents/b1.md"]),
            }),
        );
    });

    it("builds entries from each bundle's lock source and opens it once", async () => {
        const altBundleB: Bundle = {
            ...bundleB,
            items: [
                ...bundleB.items,
                { source: "b/skills/s3/SKILL.md", target: "skills/s3/SKILL.md", category: "skill" },
            ],
        };
        const altManifest: Manifest = { ...abManifest, bundles: { a: bundleA, b: altBundleB } };
        mockFetchManifest.mockResolvedValueOnce(abManifest).mockResolvedValueOnce(altManifest);
        mockLoadInstalled.mockResolvedValue({
            lock: {
                schemaVersion: 1,
                bundles: {
                    b: {
                        source: "gh:other/repo",
                        units: { "skills/s1": { kind: "skill", version: "1.0.0", hash: "h" } },
                        declined: [],
                    },
                },
            },
            bundles: [
                {
                    bundleName: "b",
                    version: "1.0.0",
                    units: [
                        {
                            relativePath: "skills/s1",
                            kind: "skill",
                            version: "1.0.0",
                            origin: "lock",
                            state: "unmodified",
                        },
                    ],
                    declined: [],
                },
            ],
        });
        mockSelectBundleItems.mockResolvedValue(new Map([["b", { units: ["skills/s3"], blocks: [] }]]));

        await executeInstall({});

        // Primary manifest plus b's lock source — b is not opened a second time.
        expect(mockFetchManifest).toHaveBeenCalledTimes(2);
        const entries = mockSelectBundleItems.mock.calls[0]![0];
        const entryB = entries.find((entry) => entry.bundle.name === "b")!;
        expect(entryB.bundle).toBe(altBundleB);
        expect(entryB.units.map((unit) => unit.relativePath)).toEqual([
            "skills/s1",
            "skills/s2",
            "agents/b1.md",
            "skills/s3",
        ]);
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                bundle: altBundleB,
                source: expect.stringContaining("other/repo"),
                selected: new Set(["skills/s3"]),
            }),
        );
    });

    it("passes defaults without lock-declined paths and preselected from the default flag", async () => {
        mockLoadInstalled.mockResolvedValue({
            lock: {
                schemaVersion: 1,
                bundles: {
                    a: {
                        source: "gh:fozy-labs/astp",
                        units: { "agents/a1.md": { kind: "file", version: "1.0.0", hash: "h" } },
                        declined: ["rules/r1.md"],
                    },
                },
            },
            bundles: [
                {
                    bundleName: "a",
                    version: "1.0.0",
                    units: [
                        {
                            relativePath: "agents/a1.md",
                            kind: "file",
                            version: "1.0.0",
                            origin: "lock",
                            state: "unmodified",
                        },
                    ],
                    declined: ["rules/r1.md"],
                },
            ],
        });
        mockSelectBundleItems.mockResolvedValue(
            new Map([["a", { units: ["agents/a1.md", "rules/r1.md"], blocks: [] }]]),
        );

        await executeInstall({});

        const entries = mockSelectBundleItems.mock.calls[0]![0];
        expect(entries).toEqual([
            expect.objectContaining({
                bundle: bundleA,
                defaults: ["agents/a1.md"],
                preselected: true,
            }),
            expect.objectContaining({
                bundle: bundleB,
                defaults: ["skills/s1", "skills/s2", "agents/b1.md"],
                preselected: false,
            }),
        ]);
    });

    it("does not install bundles absent from the prompt result", async () => {
        mockSelectBundleItems.mockResolvedValue(new Map([["a", { units: ["agents/a1.md"], blocks: [] }]]));

        await executeInstall({});

        expect(mockSyncBundle).toHaveBeenCalledTimes(1);
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                bundle: bundleA,
                selected: new Set(["agents/a1.md"]),
                declined: new Set(["rules/r1.md"]),
            }),
        );
    });
});
