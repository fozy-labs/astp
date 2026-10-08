import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, vi } from "vitest";

import {
    compareVersions,
    computeSkillTreeHash,
    downloadBundle,
    fetchManifest,
    findBlockedUnits,
    installFile,
    installSkill,
    removeUnits,
    scanInstalled,
} from "@/core/index.js";
import type { Bundle, InstalledBundle, InstallTarget, Manifest, TemplateItem, UpdateReport } from "@/types/index.js";
import { selectPlatform, selectTarget, showInfo, showSuccess, warnLegacySkills, warnModified } from "@/ui/prompts.js";

import { executeUpdate } from "../update.js";

// Mock core modules
vi.mock("@/core/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/core/index.js")>();
    return {
        ...actual,
        fetchManifest: vi.fn(),
        scanInstalled: vi.fn(),
        compareVersions: vi.fn(),
        findBlockedUnits: vi.fn(),
        downloadBundle: vi.fn(),
        installFile: vi.fn(),
        installSkill: vi.fn(),
        removeUnits: vi.fn(),
    };
});

// Mock prompts
vi.mock("@/ui/prompts.js", () => ({
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showUpdateReport: vi.fn(),
    warnLegacySkills: vi.fn(),
    warnModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockScanInstalled = vi.mocked(scanInstalled);
const mockCompareVersions = vi.mocked(compareVersions);
const mockFindBlockedUnits = vi.mocked(findBlockedUnits);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockInstallFile = vi.mocked(installFile);
const mockInstallSkill = vi.mocked(installSkill);
const mockRemoveUnits = vi.mocked(removeUnits);
const mockSelectPlatform = vi.mocked(selectPlatform);
const mockSelectTarget = vi.mocked(selectTarget);
const mockShowInfo = vi.mocked(showInfo);
const mockShowSuccess = vi.mocked(showSuccess);
const mockWarnLegacySkills = vi.mocked(warnLegacySkills);
const mockWarnModified = vi.mocked(warnModified);

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((rootDir) => fs.rm(rootDir, { recursive: true, force: true })));
});

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

const testInstalledBundle: InstalledBundle = {
    bundleName: "pipeline",
    version: "1.0.0",
    units: [
        {
            kind: "file",
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

const legacyBundle: InstalledBundle = {
    ...testInstalledBundle,
    version: "1.0.0",
    units: [
        ...testInstalledBundle.units,
        {
            kind: "skill",
            dirPath: "/project/.claude/skills/sample",
            skillFilePath: "/project/.claude/skills/sample/SKILL.md",
            relativePath: "skills/sample",
            metadata: {
                source: "fozy-labs/astp",
                bundle: "pipeline",
                version: "1.0.0",
                hash: "legacy-hash",
            },
            legacy: true,
        },
    ],
};

const legacyBundleWithRemovedSkill: InstalledBundle = {
    ...legacyBundle,
    units: [
        ...legacyBundle.units,
        {
            kind: "skill",
            dirPath: "/project/.claude/skills/removed",
            skillFilePath: "/project/.claude/skills/removed/SKILL.md",
            relativePath: "skills/removed",
            metadata: {
                source: "fozy-labs/astp",
                bundle: "pipeline",
                version: "1.0.0",
                hash: "legacy-hash",
            },
            legacy: true,
        },
    ],
};

const legacyManifest: Manifest = {
    ...testManifest,
    bundles: {
        pipeline: {
            ...testBundle,
            version: "1.0.0",
            items: [
                testItem,
                {
                    source: "pipeline/skills/sample/SKILL.md",
                    target: "skills/sample/SKILL.md",
                    category: "skill",
                },
            ],
        },
    },
};

const noUpdatesReport: UpdateReport = {
    updates: [],
    upToDate: [testInstalledBundle],
    notInManifest: [],
    legacySkills: [],
};

const updatesReport: UpdateReport = {
    updates: [
        {
            bundleName: "pipeline",
            installedVersion: "1.0.0",
            availableVersion: "1.1.0",
            units: [{ targetPath: "agents/pipeline-approve.agent.md", kind: "file", state: "unmodified" }],
        },
    ],
    upToDate: [],
    notInManifest: [],
    legacySkills: [],
};

async function prepareDroppedSkill(item: TemplateItem) {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-update-"));
    temporaryRoots.push(rootDir);
    const dirPath = path.join(rootDir, "skills/a");
    const skillFilePath = path.join(dirPath, "SKILL.md");
    const notesFilePath = path.join(dirPath, "notes.md");
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(skillFilePath, "# Original skill\n");
    await fs.writeFile(notesFilePath, "Original notes\n");

    const actual = await vi.importActual<typeof import("@/core/index.js")>("@/core/index.js");
    mockRemoveUnits.mockImplementation(actual.removeUnits);
    mockSelectTarget.mockResolvedValue({ platform: "claude-code", type: "project", rootDir });

    const installedBundle: InstalledBundle = {
        bundleName: "pipeline",
        version: "1.0.0",
        units: [
            {
                kind: "skill",
                dirPath,
                skillFilePath,
                relativePath: "skills/a",
                metadata: {
                    source: "fozy-labs/astp",
                    bundle: "pipeline",
                    version: "1.0.0",
                    hash: await computeSkillTreeHash(dirPath),
                },
                legacy: false,
            },
        ],
    };
    const manifest: Manifest = {
        ...testManifest,
        bundles: { pipeline: { ...testBundle, version: "1.1.0", items: [item] } },
    };
    mockScanInstalled.mockResolvedValue([installedBundle]);
    mockFetchManifest.mockResolvedValue(manifest);
    mockCompareVersions.mockReturnValue({
        updates: [
            {
                bundleName: "pipeline",
                installedVersion: "1.0.0",
                availableVersion: "1.1.0",
                units: [{ targetPath: "skills/a", kind: "skill", state: "removed" }],
            },
        ],
        upToDate: [],
        notInManifest: [],
        legacySkills: [],
    });
    mockFindBlockedUnits.mockResolvedValue([]);
    mockDownloadBundle.mockResolvedValue("/tmp/astp-pipeline");

    return { rootDir, skillFilePath, notesFilePath };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("executeUpdate", () => {
    // T41: CLI argument parsing — --force flag
    it("T41: accepts force option and passes to update flow", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockFindBlockedUnits.mockResolvedValue([
            { targetPath: "agents/pipeline-approve.agent.md", kind: "file", state: "modified" },
        ]);
        mockDownloadBundle.mockResolvedValue("/tmp/astp-pipeline");
        mockInstallFile.mockResolvedValue(undefined);

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });

        // With --force, modified files should still be installed
        expect(mockInstallFile).toHaveBeenCalledTimes(1);
        expect(mockInstallSkill).not.toHaveBeenCalled();
        expect(mockWarnModified).not.toHaveBeenCalled();
    });

    it("shows info when no installed files found", async () => {
        mockScanInstalled.mockResolvedValue([]);

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockFetchManifest).not.toHaveBeenCalled();
    });

    it("shows info when all bundles up to date", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(noUpdatesReport);

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("All bundles up to date.");
        expect(mockDownloadBundle).not.toHaveBeenCalled();
    });

    it("removes orphans without downloading when the manifest has no units", async () => {
        const emptyManifest: Manifest = {
            ...testManifest,
            bundles: { pipeline: { ...testBundle, items: [] } },
        };
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(emptyManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockFindBlockedUnits.mockResolvedValue([]);
        mockRemoveUnits.mockResolvedValue({ removed: [], skipped: [] });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockRemoveUnits).toHaveBeenCalledWith(testInstalledBundle.units, expect.any(String), undefined);
        expect(mockDownloadBundle).not.toHaveBeenCalled();
    });

    it("does not remove a dropped skill when downloading the replacement fails", async () => {
        const { skillFilePath, notesFilePath } = await prepareDroppedSkill({
            source: "pipeline/skills/a/b/SKILL.md",
            target: "skills/a/b/SKILL.md",
            category: "skill",
        });
        mockDownloadBundle.mockRejectedValue(new Error("network down"));

        await expect(executeUpdate({ platform: "claude-code" })).rejects.toThrow("network down");

        await expect(fs.readFile(skillFilePath, "utf8")).resolves.toBe("# Original skill\n");
        await expect(fs.readFile(notesFilePath, "utf8")).resolves.toBe("Original notes\n");
    });

    it("does not remove a dropped skill when a manifest target is invalid", async () => {
        const { skillFilePath, notesFilePath } = await prepareDroppedSkill({
            source: "pipeline/skills/a/b/SKILL.md",
            target: "skills/../../evil/SKILL.md",
            category: "skill",
        });

        await expect(executeUpdate({ platform: "claude-code" })).rejects.toThrow(/Invalid target path/);

        expect(mockDownloadBundle).not.toHaveBeenCalled();
        await expect(fs.readFile(skillFilePath, "utf8")).resolves.toBe("# Original skill\n");
        await expect(fs.readFile(notesFilePath, "utf8")).resolves.toBe("Original notes\n");
    });

    it("removes orphans and installs nothing when every manifest unit is blocked", async () => {
        const orphanUnit: InstalledBundle["units"][number] = {
            kind: "file",
            filePath: "/project/.claude/agents/old.agent.md",
            relativePath: "agents/old.agent.md",
            metadata: {
                source: "fozy-labs/astp",
                bundle: "pipeline",
                version: "1.0.0",
                hash: "abc123",
            },
        };
        const installedBundle: InstalledBundle = {
            ...testInstalledBundle,
            units: [...testInstalledBundle.units, orphanUnit],
        };
        mockScanInstalled.mockResolvedValue([installedBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockFindBlockedUnits.mockResolvedValue([{ targetPath: testItem.target, kind: "file", state: "modified" }]);
        mockRemoveUnits.mockResolvedValue({ removed: [], skipped: [] });
        mockDownloadBundle.mockResolvedValue("/tmp/astp-pipeline");

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockRemoveUnits).toHaveBeenCalledWith([orphanUnit], expect.any(String), undefined);
        expect(mockDownloadBundle).toHaveBeenCalledTimes(1);
        expect(mockInstallFile).not.toHaveBeenCalled();
        expect(mockInstallSkill).not.toHaveBeenCalled();
    });

    it("migrates only legacy skills when the bundle version is current", async () => {
        mockScanInstalled.mockResolvedValue([legacyBundle]);
        mockFetchManifest.mockResolvedValue(legacyManifest);
        mockCompareVersions.mockReturnValue({
            updates: [],
            upToDate: [legacyBundle],
            notInManifest: [],
            legacySkills: [{ bundleName: "pipeline", targetPath: "skills/sample", inManifest: true }],
        });
        mockDownloadBundle.mockResolvedValue("/tmp/astp-pipeline");
        mockInstallFile.mockResolvedValue(undefined);
        mockInstallSkill.mockResolvedValue(undefined);

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });

        expect(mockInstallSkill).toHaveBeenCalledTimes(1);
        expect(mockInstallFile).not.toHaveBeenCalled();
    });

    it("distinguishes legacy skills missing from the manifest", async () => {
        mockScanInstalled.mockResolvedValue([legacyBundleWithRemovedSkill]);
        mockFetchManifest.mockResolvedValue(legacyManifest);
        mockCompareVersions.mockReturnValue({
            updates: [],
            upToDate: [legacyBundleWithRemovedSkill],
            notInManifest: [],
            legacySkills: [
                { bundleName: "pipeline", targetPath: "skills/sample", inManifest: true },
                { bundleName: "pipeline", targetPath: "skills/removed", inManifest: false },
            ],
        });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockWarnLegacySkills).toHaveBeenCalledWith([
            { bundleName: "pipeline", targetPath: "skills/sample", inManifest: true },
        ]);
        expect(mockWarnLegacySkills).toHaveBeenCalledWith(
            [{ bundleName: "pipeline", targetPath: "skills/removed", inManifest: false }],
            false,
        );
        expect(mockDownloadBundle).not.toHaveBeenCalled();
        expect(mockShowInfo).not.toHaveBeenCalledWith("All bundles up to date.");
    });

    it("skips modified files without --force", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockFindBlockedUnits.mockResolvedValue([
            { targetPath: "agents/pipeline-approve.agent.md", kind: "file", state: "modified" },
        ]);
        mockDownloadBundle.mockResolvedValue("/tmp/astp-pipeline");

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(mockWarnModified).toHaveBeenCalled();
        expect(mockInstallFile).not.toHaveBeenCalled();
    });

    it("overwrites modified files with --force", async () => {
        mockScanInstalled.mockResolvedValue([testInstalledBundle]);
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(updatesReport);
        mockFindBlockedUnits.mockResolvedValue([
            { targetPath: "agents/pipeline-approve.agent.md", kind: "file", state: "modified" },
        ]);
        mockDownloadBundle.mockResolvedValue("/tmp/astp-pipeline");
        mockInstallFile.mockResolvedValue(undefined);

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });

        expect(mockInstallFile).toHaveBeenCalledTimes(1);
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("1 file"));
    });

    it("prompts for platform and target when not provided", async () => {
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);
        mockScanInstalled.mockResolvedValue([]);

        await executeUpdate({});

        expect(mockSelectPlatform).toHaveBeenCalled();
        expect(mockSelectTarget).toHaveBeenCalledWith("claude-code");
    });
});
