import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchManifest } from "@/core/index.js";
import type { InstalledBundle, InstallTarget, Manifest } from "@/types/index.js";

import { Sources } from "../sources.js";

vi.mock("@/core/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/core/index.js")>()),
    fetchManifest: vi.fn(),
}));

const CURRENT_SHA = "0123456789abcdef0123456789abcdef01234567";
const LOCKED_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const manifest: Manifest = { schemaVersion: 1, bundles: {} };
const target: InstallTarget = { platform: "claude-code", type: "project", rootDir: "/project/.claude" };
const installed: InstalledBundle = { bundleName: "core", version: "1.0.0", units: [], declined: [] };

describe("Sources revisions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchManifest).mockResolvedValue(manifest);
    });

    it("pins a new source before fetching its manifest", async () => {
        const opened = await new Sources(target).open("gh:o/r#main", "cli");

        expect(opened.resolvedCommit).toBe(CURRENT_SHA);
        expect(opened.source).toMatchObject({ address: `gh:o/r/templates#${CURRENT_SHA}` });
        expect(opened.useLockedRevisions).toBe(false);
    });

    it("reuses a locked SHA without resolving the branch and caches revisions separately", async () => {
        const sources = new Sources(target);
        const current = await sources.open("gh:o/r#main", "cli");
        const locked = await sources.open("gh:o/r#main", "cli", {
            lockedSpec: "gh:o/r#main",
            lockedCommit: LOCKED_SHA,
        });

        expect(locked.resolvedCommit).toBe(LOCKED_SHA);
        expect(locked.source).toMatchObject({ address: `gh:o/r/templates#${LOCKED_SHA}` });
        expect(locked.useLockedRevisions).toBe(true);
        expect(locked).not.toBe(current);
        expect(fetchManifest).toHaveBeenCalledTimes(2);
    });

    it("keeps locked-ref behavior when the same SHA was already opened without it", async () => {
        const sources = new Sources(target);
        await sources.open("gh:o/r#main", "cli");
        const locked = await sources.open("gh:o/r#main", "cli", {
            lockedSpec: "gh:o/r#main",
            lockedCommit: CURRENT_SHA,
        });

        expect(locked.useLockedRevisions).toBe(true);
    });

    it("uses current upstream for update and the lock SHA for sync", async () => {
        const lock = {
            schemaVersion: 2 as const,
            bundles: {
                core: {
                    source: "gh:o/r#main",
                    resolvedCommit: LOCKED_SHA,
                    declined: [],
                    units: {},
                },
            },
        };
        const updateSources = new Sources(target);
        const syncSources = new Sources(target);

        const update = await updateSources.openInstalled([installed], lock);
        const sync = await syncSources.openInstalled([installed], lock, { locked: true });

        expect(update.get("core")!.resolvedCommit).toBe(CURRENT_SHA);
        expect(sync.get("core")!.resolvedCommit).toBe(LOCKED_SHA);
    });
});
