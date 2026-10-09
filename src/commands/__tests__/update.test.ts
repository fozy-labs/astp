import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, vi } from "vitest";

import {
    assertBundleSources,
    compareVersions,
    downloadBundle,
    fetchManifest,
    loadInstalled,
    syncBundle,
    writeLock,
} from "@/core/index.js";
import type { Bundle, InstalledBundle, InstallTarget, Manifest, TemplateItem, UpdateReport } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    isInteractive,
    selectNewUnits,
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    showUpdateReport,
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
} from "@/ui/prompts.js";

import { executeUpdate } from "../update.js";

vi.mock("@/core/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/core/index.js")>()),
    assertBundleBlocks: vi.fn(),
    assertBundleSources: vi.fn(),
    compareVersions: vi.fn(),
    downloadBundle: vi.fn(),
    fetchManifest: vi.fn(),
    loadInstalled: vi.fn(),
    readUnitBlockFiles: vi.fn(async () => new Map()),
    syncBundle: vi.fn(),
    writeLock: vi.fn(),
}));

vi.mock("@/types/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/types/index.js")>()),
    resolveTarget: vi.fn(),
}));

vi.mock("@/ui/prompts.js", () => ({
    isInteractive: vi.fn(),
    selectNewUnits: vi.fn(),
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showUpdateReport: vi.fn(),
    warnBlockConflicts: vi.fn(),
    warnKeptBlocks: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnReleased: vi.fn(),
    warnForeign: vi.fn(),
    warnLegacyModified: vi.fn(),
    warnModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockAssertBundleSources = vi.mocked(assertBundleSources);
const mockCompareVersions = vi.mocked(compareVersions);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockFetchManifest = vi.mocked(fetchManifest);
const mockLoadInstalled = vi.mocked(loadInstalled);
const mockSyncBundle = vi.mocked(syncBundle);
const mockWriteLock = vi.mocked(writeLock);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockIsInteractive = vi.mocked(isInteractive);
const mockSelectNewUnits = vi.mocked(selectNewUnits);
const mockSelectPlatform = vi.mocked(selectPlatform);
const mockSelectTarget = vi.mocked(selectTarget);
const mockShowInfo = vi.mocked(showInfo);
const mockShowSuccess = vi.mocked(showSuccess);
const mockShowUpdateReport = vi.mocked(showUpdateReport);
const mockWarnKeptRemoved = vi.mocked(warnKeptRemoved);
const mockWarnLegacyModified = vi.mocked(warnLegacyModified);
const mockWarnModified = vi.mocked(warnModified);

const testTarget: InstallTarget = {
    platform: "claude-code",
    type: "project",
    rootDir: "/project/.claude",
};

const testItem: TemplateItem = {
    source: "pipeline/agents/pipeline-approve.agent.md",
    target: "agents/pipeline-approve.agent.md",
    category: "agent",
};

const testBundle: Bundle = {
    name: "pipeline",
    version: "1.1.0",
    description: "Pipeline",
    default: false,
    platforms: ["claude-code"],
    items: [testItem],
};

const testManifest: Manifest = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: { pipeline: testBundle },
};

function createInstalledUnit(
    state: "unmodified" | "modified" | "missing" = "unmodified",
    relativePath = testItem.target,
    origin: "lock" | "legacy" = "lock",
    kind: "file" | "skill" = "file",
) {
    return { kind, relativePath, version: "1.0.0", origin, state };
}

function createInstalledBundle(
    units: InstalledBundle["units"] = [createInstalledUnit()],
    version = "1.0.0",
): InstalledBundle {
    return { bundleName: "pipeline", version, units, declined: [] };
}

const createState = (bundles: InstalledBundle[] = [createInstalledBundle()]) => ({
    bundles,
    lock: { schemaVersion: 1 as const, bundles: {} },
});

const updateReport = (
    units: UpdateReport["updates"][number]["units"] = [
        { targetPath: testItem.target, kind: "file", state: "unmodified" },
    ],
): UpdateReport => ({
    updates: [{ bundleName: "pipeline", installedVersion: "1.0.0", availableVersion: "1.1.0", units }],
    upToDate: [],
    notInManifest: [],
    legacySkills: [],
});

let tempDir: string;

beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-update-test-"));
    mockResolveTarget.mockReturnValue(testTarget);
    mockFetchManifest.mockResolvedValue(testManifest);
    mockLoadInstalled.mockResolvedValue(createState());
    mockCompareVersions.mockReturnValue(updateReport());
    mockDownloadBundle.mockResolvedValue(tempDir);
    mockAssertBundleSources.mockResolvedValue(undefined);
    mockSyncBundle.mockResolvedValue({
        installed: [],
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
    mockIsInteractive.mockReturnValue(false);
    mockSelectNewUnits.mockImplementation(async (_name, units) => units.map((unit) => unit.relativePath));
    mockSelectPlatform.mockResolvedValue("claude-code");
    mockSelectTarget.mockResolvedValue(testTarget);
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("executeUpdate", () => {
    it("passes --force to the shared sync flow", async () => {
        const modified = createInstalledBundle([createInstalledUnit("modified")]);
        mockLoadInstalled.mockResolvedValue(createState([modified]));
        mockSyncBundle.mockResolvedValue({
            installed: [{ targetPath: testItem.target, kind: "file", state: "unmodified" }],
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

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });

        expect(mockSyncBundle).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
        expect(mockWarnModified).not.toHaveBeenCalled();
    });

    it("shows info when no installed files are found", async () => {
        mockLoadInstalled.mockResolvedValue(createState([]));

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockFetchManifest).not.toHaveBeenCalled();
    });

    it("shows info when all bundles are up to date", async () => {
        mockCompareVersions.mockReturnValue({
            updates: [],
            upToDate: [createInstalledBundle()],
            notInManifest: [],
            legacySkills: [],
        });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("All bundles up to date.");
        expect(mockDownloadBundle).not.toHaveBeenCalled();
    });

    it("warns about modified lock and legacy units when versions match", async () => {
        const lockUnit = createInstalledUnit("modified");
        const legacyUnit = createInstalledUnit("modified", "skills/old", "legacy", "skill");
        const installed = createInstalledBundle([lockUnit, legacyUnit], "1.1.0");
        mockLoadInstalled.mockResolvedValue(createState([installed]));
        mockCompareVersions.mockReturnValue({
            updates: [],
            upToDate: [installed],
            notInManifest: [],
            legacySkills: [],
        });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockWarnModified).toHaveBeenCalledWith(
            [{ targetPath: testItem.target, kind: "file", state: "modified" }],
            "astp update --force",
        );
        expect(mockWarnLegacyModified).toHaveBeenCalledWith([
            { targetPath: "skills/old", kind: "skill", state: "legacy" },
        ]);
        expect(mockShowInfo).toHaveBeenCalledWith("All bundles up to date.");
        expect(mockDownloadBundle).not.toHaveBeenCalled();
    });

    it("downloads and verifies an empty manifest bundle before removing its orphans", async () => {
        const emptyBundle = { ...testBundle, items: [] };
        mockFetchManifest.mockResolvedValue({ ...testManifest, bundles: { pipeline: emptyBundle } });
        mockSyncBundle.mockResolvedValue({
            installed: [],
            removed: [{ targetPath: testItem.target, kind: "file", state: "unmodified" }],
            skipped: [],
            kept: [],
            keptBlocks: [],
            released: [],
            foreign: [],
            releasedBlocks: [],
            foreignBlocks: [],
            conflictBlocks: [],
        });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockDownloadBundle).toHaveBeenCalledWith(
            expect.objectContaining({ spec: "gh:fozy-labs/astp" }),
            expect.objectContaining({ name: "pipeline" }),
        );
        expect(mockSyncBundle).toHaveBeenCalledWith(expect.objectContaining({ bundle: emptyBundle }));
        expect(mockWriteLock).toHaveBeenCalled();
    });

    it("does not sync dropped units when downloading the replacement fails", async () => {
        mockDownloadBundle.mockRejectedValue(new Error("network down"));

        await expect(executeUpdate({ platform: "claude-code", target: "project" })).rejects.toThrow("network down");

        expect(mockSyncBundle).not.toHaveBeenCalled();
    });

    it("does not sync dropped units when the downloaded bundle is missing a source", async () => {
        mockAssertBundleSources.mockRejectedValue(new Error("missing files listed in the manifest"));

        await expect(executeUpdate({ platform: "claude-code", target: "project" })).rejects.toThrow(
            /missing files listed in the manifest/,
        );

        expect(mockSyncBundle).not.toHaveBeenCalled();
        expect(mockWriteLock).not.toHaveBeenCalled();
    });

    it("does not download or sync dropped units when a manifest target is invalid", async () => {
        const invalidBundle: Bundle = {
            ...testBundle,
            items: [{ ...testItem, target: "skills/../../evil/SKILL.md" }],
        };
        mockFetchManifest.mockResolvedValue({ ...testManifest, bundles: { pipeline: invalidBundle } });

        await expect(executeUpdate({ platform: "claude-code", target: "project" })).rejects.toThrow(
            /Invalid target path/,
        );

        expect(mockDownloadBundle).not.toHaveBeenCalled();
        expect(mockSyncBundle).not.toHaveBeenCalled();
    });

    it("removes orphans and reports modified units skipped by sync", async () => {
        const modifiedUnit = createInstalledUnit("modified");
        const orphanUnit = createInstalledUnit("unmodified", "agents/old.agent.md");
        const keptUnit = createInstalledUnit("modified", "agents/kept.agent.md");
        mockLoadInstalled.mockResolvedValue(createState([createInstalledBundle([modifiedUnit, orphanUnit, keptUnit])]));
        mockSyncBundle.mockResolvedValue({
            installed: [],
            removed: [{ targetPath: "agents/old.agent.md", kind: "file", state: "unmodified" }],
            skipped: [{ targetPath: testItem.target, kind: "file", state: "modified" }],
            kept: [{ targetPath: keptUnit.relativePath, kind: "file", state: "modified" }],
            keptBlocks: [],
            released: [],
            foreign: [],
            releasedBlocks: [],
            foreignBlocks: [],
            conflictBlocks: [],
        });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockSyncBundle).toHaveBeenCalled();
        expect(mockWarnModified).toHaveBeenCalledWith(
            [{ targetPath: testItem.target, kind: "file", state: "modified" }],
            "astp update --force",
        );
        expect(mockWarnKeptRemoved).toHaveBeenCalledWith([
            { targetPath: keptUnit.relativePath, kind: "file", state: "modified" },
        ]);
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("removed 1 file"));
    });

    it("migrates only matching clean legacy units when the bundle version is current", async () => {
        const legacyBundle = createInstalledBundle([
            createInstalledUnit("unmodified", "skills/sample", "legacy", "skill"),
            createInstalledUnit("modified", "skills/old", "legacy", "skill"),
        ]);
        const manifestBundle: Bundle = {
            ...testBundle,
            version: "1.0.0",
            items: [{ source: "pipeline/skills/sample/SKILL.md", target: "skills/sample/SKILL.md", category: "skill" }],
        };
        mockLoadInstalled.mockResolvedValue(createState([legacyBundle]));
        mockFetchManifest.mockResolvedValue({ ...testManifest, bundles: { pipeline: manifestBundle } });
        mockCompareVersions.mockReturnValue(
            updateReport([{ targetPath: "skills/sample", kind: "skill", state: "legacy" }]),
        );

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                installed: legacyBundle,
                bundle: manifestBundle,
                selected: new Set(["skills/sample"]),
            }),
        );
        expect(mockWarnLegacyModified).not.toHaveBeenCalled();
    });

    it("reports legacy units absent from the manifest", async () => {
        const report = updateReport();
        report.legacySkills = [
            { bundleName: "pipeline", targetPath: "skills/removed", kind: "skill", clean: true, inManifest: false },
        ];
        mockCompareVersions.mockReturnValue(report);

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockShowUpdateReport).toHaveBeenCalledWith(report);
    });

    it("skips modified files without --force", async () => {
        const modified = createInstalledBundle([createInstalledUnit("modified")]);
        mockLoadInstalled.mockResolvedValue(createState([modified]));
        mockSyncBundle.mockResolvedValue({
            installed: [],
            removed: [],
            skipped: [{ targetPath: testItem.target, kind: "file", state: "modified" }],
            kept: [],
            keptBlocks: [],
            released: [],
            foreign: [],
            releasedBlocks: [],
            foreignBlocks: [],
            conflictBlocks: [],
        });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockWarnModified).toHaveBeenCalledWith(
            [{ targetPath: testItem.target, kind: "file", state: "modified" }],
            "astp update --force",
        );
        expect(mockSyncBundle).toHaveBeenCalledWith(expect.objectContaining({ force: false }));
    });

    it("overwrites modified files with --force", async () => {
        const modified = createInstalledBundle([createInstalledUnit("modified")]);
        mockLoadInstalled.mockResolvedValue(createState([modified]));
        mockCompareVersions.mockReturnValue({
            updates: [],
            upToDate: [modified],
            notInManifest: [],
            legacySkills: [],
        });

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });

        expect(mockSyncBundle).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
        expect(mockWarnModified).not.toHaveBeenCalled();
    });

    it("prompts for platform and target when not provided", async () => {
        await executeUpdate({});

        expect(mockSelectPlatform).toHaveBeenCalled();
        expect(mockSelectTarget).toHaveBeenCalledWith("claude-code");
    });

    it("selects new units when an interactive update offers them", async () => {
        const manifestBundle: Bundle = {
            ...testBundle,
            items: [testItem, { source: "pipeline/agents/new.md", target: "agents/new.md", category: "agent" }],
        };
        mockFetchManifest.mockResolvedValue({ ...testManifest, bundles: { pipeline: manifestBundle } });
        mockIsInteractive.mockReturnValue(true);
        mockSelectNewUnits.mockResolvedValue([]);

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockSelectNewUnits).toHaveBeenCalledWith("pipeline", [
            { kind: "file", relativePath: "agents/new.md", item: manifestBundle.items[1] },
        ]);
        expect(mockSyncBundle).toHaveBeenCalledWith(
            expect.objectContaining({
                selected: new Set([testItem.target]),
                declined: new Set(["agents/new.md"]),
            }),
        );
    });
});
