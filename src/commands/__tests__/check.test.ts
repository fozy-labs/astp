import { vi } from "vitest";

import { compareVersions, fetchManifest, loadInstalled } from "@/core/index.js";
import type { InstalledBundle, InstallTarget, Manifest, UpdateReport } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { selectPlatform, selectTarget, showCheckReport, showInfo } from "@/ui/prompts.js";

import { executeCheck } from "../check.js";

vi.mock("@/core/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/core/index.js")>()),
    fetchManifest: vi.fn(),
    loadInstalled: vi.fn(),
    compareVersions: vi.fn(),
}));

vi.mock("@/ui/prompts.js", () => ({
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    showCheckReport: vi.fn(),
    showInfo: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock("@/types/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/types/index.js")>()),
    resolveTarget: vi.fn(),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockLoadInstalled = vi.mocked(loadInstalled);
const mockCompareVersions = vi.mocked(compareVersions);
const mockSelectPlatform = vi.mocked(selectPlatform);
const mockSelectTarget = vi.mocked(selectTarget);
const mockShowCheckReport = vi.mocked(showCheckReport);
const mockShowInfo = vi.mocked(showInfo);
const mockResolveTarget = vi.mocked(resolveTarget);
const emptyState = { lock: { schemaVersion: 1 as const, bundles: {} }, bundles: [] };

const testTarget: InstallTarget = {
    platform: "claude-code",
    type: "project",
    rootDir: "/project/.claude",
};

const testInstalledBundle: InstalledBundle = {
    bundleName: "pipeline",
    version: "1.0.0",
    units: [
        {
            kind: "file",
            relativePath: "agents/pipeline-approve.agent.md",
            version: "1.0.0",
            origin: "lock",
            state: "unmodified",
        },
    ],
    declined: [],
};

const testManifest: Manifest = {
    schemaVersion: 1,
    repository: "fozy-labs/astp",
    bundles: {
        pipeline: {
            name: "pipeline",
            version: "1.2.0",
            description: "Pipeline",
            default: false,
            platforms: ["claude-code"],
            items: [
                {
                    source: "pipeline/agents/pipeline-approve.agent.md",
                    target: "agents/pipeline-approve.agent.md",
                    category: "agent",
                },
            ],
        },
    },
};

const mixedReport: UpdateReport = {
    updates: [
        {
            bundleName: "pipeline",
            installedVersion: "1.0.0",
            availableVersion: "1.2.0",
            units: [{ targetPath: "agents/pipeline-approve.agent.md", kind: "file", state: "unmodified" }],
        },
    ],
    upToDate: [],
    notInManifest: [],
    legacySkills: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    mockLoadInstalled.mockResolvedValue(emptyState);
    mockResolveTarget.mockReturnValue(testTarget);
});

describe("executeCheck", () => {
    it("shows info when no installed files found", async () => {
        await executeCheck({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockFetchManifest).not.toHaveBeenCalled();
        expect(mockShowCheckReport).not.toHaveBeenCalled();
        expect(mockLoadInstalled).toHaveBeenCalledWith("/project/.claude");
    });

    it("fetches manifest and displays report when files are installed", async () => {
        mockLoadInstalled.mockResolvedValue({ ...emptyState, bundles: [testInstalledBundle] });
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(mixedReport);

        await executeCheck({ platform: "claude-code", target: "project" });

        expect(mockFetchManifest).toHaveBeenCalled();
        expect(mockCompareVersions).toHaveBeenCalledWith([testInstalledBundle], testManifest);
        expect(mockShowCheckReport).toHaveBeenCalledWith(mixedReport, "project");
    });

    it("displays mixed states correctly", async () => {
        const upToDateBundle: InstalledBundle = {
            bundleName: "core",
            version: "1.0.0",
            units: [],
            declined: [],
        };

        const report: UpdateReport = {
            updates: [
                {
                    bundleName: "pipeline",
                    installedVersion: "1.0.0",
                    availableVersion: "1.2.0",
                    units: [],
                },
            ],
            upToDate: [upToDateBundle],
            notInManifest: [],
            legacySkills: [],
        };

        mockLoadInstalled.mockResolvedValue({ ...emptyState, bundles: [testInstalledBundle, upToDateBundle] });
        mockFetchManifest.mockResolvedValue(testManifest);
        mockCompareVersions.mockReturnValue(report);

        await executeCheck({ platform: "claude-code", target: "project" });

        expect(mockShowCheckReport).toHaveBeenCalledWith(report, "project");
    });

    it("prompts for platform and target when not provided", async () => {
        mockSelectPlatform.mockResolvedValue("claude-code");
        mockSelectTarget.mockResolvedValue(testTarget);

        await executeCheck({});

        expect(mockSelectPlatform).toHaveBeenCalled();
        expect(mockSelectTarget).toHaveBeenCalledWith("claude-code");
    });
});
