import { vi } from "vitest";

import { loadInstalled, writeLock } from "@/core/index.js";
import type { InstalledBundle, InstallTarget } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    confirmDelete,
    selectInstalledBundles,
    selectPlatform,
    selectTarget,
    showInfo,
    showSuccess,
    warnKeptRemoved,
} from "@/ui/prompts.js";

import { executeDelete } from "../delete.js";

vi.mock("@/core/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/core/index.js")>()),
    loadInstalled: vi.fn(),
    writeLock: vi.fn(),
}));

vi.mock("@/ui/prompts.js", () => ({
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectInstalledBundles: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(true),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    warnKeptRemoved: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock("@/types/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/types/index.js")>()),
    resolveTarget: vi.fn(),
}));

const mockLoadInstalled = vi.mocked(loadInstalled);
const mockWriteLock = vi.mocked(writeLock);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockSelectPlatform = vi.mocked(selectPlatform);
const mockSelectTarget = vi.mocked(selectTarget);
const mockSelectInstalledBundles = vi.mocked(selectInstalledBundles);
const mockConfirmDelete = vi.mocked(confirmDelete);
const mockShowInfo = vi.mocked(showInfo);
const mockShowSuccess = vi.mocked(showSuccess);
const mockWarnKeptRemoved = vi.mocked(warnKeptRemoved);

const testTarget: InstallTarget = {
    platform: "claude-code",
    type: "project",
    rootDir: "/project/.claude",
};

const testBundle: InstalledBundle = {
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

function createInstalledState(bundle = testBundle) {
    return {
        bundles: [bundle],
        lock: {
            schemaVersion: 1 as const,
            bundles: {
                pipeline: {
                    source: "fozy-labs/astp",
                    declined: [],
                    units: {
                        "agents/pipeline-approve.agent.md": {
                            kind: "file" as const,
                            version: "1.0.0",
                            hash: "abc123",
                        },
                    },
                },
            },
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTarget.mockReturnValue(testTarget);
    mockSelectPlatform.mockResolvedValue("claude-code");
    mockSelectTarget.mockResolvedValue(testTarget);
    mockLoadInstalled.mockResolvedValue(createInstalledState());
    mockSelectInstalledBundles.mockResolvedValue([testBundle]);
    mockConfirmDelete.mockResolvedValue(true);
    mockWriteLock.mockResolvedValue(undefined);
});

describe("executeDelete", () => {
    it("deletes the explicitly selected bundle", async () => {
        await executeDelete({ bundle: "pipeline", platform: "claude-code", target: "project" });

        expect(mockSelectInstalledBundles).not.toHaveBeenCalled();
        expect(mockWriteLock).toHaveBeenCalledWith("/project/.claude", expect.any(Object));
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("Deleted 1 file"));
    });

    it("shows info when no managed files are installed", async () => {
        mockLoadInstalled.mockResolvedValue({
            bundles: [],
            lock: { schemaVersion: 1, bundles: {} },
        });

        await executeDelete({ platform: "claude-code", target: "project" });

        expect(mockShowInfo).toHaveBeenCalledWith("No astp-managed files found.");
        expect(mockWriteLock).not.toHaveBeenCalled();
    });

    it("warns and skips modified files without force", async () => {
        const modifiedBundle: InstalledBundle = {
            ...testBundle,
            units: testBundle.units.map((unit) => ({ ...unit, state: "modified" as const })),
        };
        mockLoadInstalled.mockResolvedValue(createInstalledState(modifiedBundle));
        mockSelectInstalledBundles.mockResolvedValue([modifiedBundle]);

        await executeDelete({ bundle: "pipeline", platform: "claude-code", target: "project" });

        expect(mockWarnKeptRemoved).toHaveBeenCalledWith([
            { targetPath: "agents/pipeline-approve.agent.md", kind: "file", state: "modified" },
        ]);
        expect(mockShowInfo).toHaveBeenCalledWith("No files or skills deleted, kept 1 file.");
    });

    it("deletes modified files with force", async () => {
        const modifiedBundle: InstalledBundle = {
            ...testBundle,
            units: testBundle.units.map((unit) => ({ ...unit, state: "modified" as const })),
        };
        mockLoadInstalled.mockResolvedValue(createInstalledState(modifiedBundle));
        mockSelectInstalledBundles.mockResolvedValue([modifiedBundle]);

        await executeDelete({ bundle: "pipeline", force: true, platform: "claude-code", target: "project" });

        expect(mockWarnKeptRemoved).not.toHaveBeenCalled();
        expect(mockWriteLock).toHaveBeenCalledWith("/project/.claude", expect.any(Object));
    });

    it("throws when bundle is not installed", async () => {
        await expect(executeDelete({ bundle: "core", platform: "claude-code", target: "project" })).rejects.toThrow(
            "Installed bundle 'core' not found",
        );
    });
});
