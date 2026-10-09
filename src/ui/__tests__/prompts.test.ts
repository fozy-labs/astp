import * as p from "@clack/prompts";

import type { Bundle, InstallTarget, UpdateReport } from "@/types/index.js";
import { ALL_PLATFORMS } from "@/types/index.js";

import {
    confirmInstall,
    selectPlatform,
    showCheckReport,
    showUpdateReport,
    warnForeign,
    warnLegacyModified,
    warnModified,
} from "../prompts.js";

vi.mock("@clack/prompts", () => ({
    intro: vi.fn(),
    outro: vi.fn(),
    spinner: vi.fn(),
    select: vi.fn(),
    confirm: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn() },
    isCancel: vi.fn(() => false),
    cancel: vi.fn(),
}));

const mockSelect = vi.mocked(p.select);

describe("selectPlatform", () => {
    it("skips the prompt when only one platform is supported", async () => {
        expect(ALL_PLATFORMS).toHaveLength(1);

        await expect(selectPlatform()).resolves.toBe(ALL_PLATFORMS[0]);

        expect(mockSelect).not.toHaveBeenCalled();
    });
});

describe("legacy migration prompts", () => {
    it("shows different check guidance for legacy units with and without manifest entries", () => {
        const currentSkill = {
            bundleName: "core",
            targetPath: "skills/current",
            kind: "skill" as const,
            clean: true,
            inManifest: true,
        };
        const removedSkill = {
            bundleName: "core",
            targetPath: "skills/removed",
            kind: "skill" as const,
            clean: true,
            inManifest: false,
        };
        const report: UpdateReport = {
            updates: [],
            upToDate: [],
            notInManifest: [],
            legacySkills: [currentSkill, removedSkill],
        };

        vi.mocked(p.log.info).mockClear();
        showCheckReport(report, "user");

        const reportText = String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0]);
        expect(reportText).toContain("core: legacy skill skills/current");
        expect(reportText).toContain("run `astp update --target user` to migrate.");
        expect(reportText).toContain("skills/removed — not in the current manifest, left in place.");
        expect(reportText).not.toContain("skills/removed — run `astp update --force` to migrate.");
    });

    it("shows the force-migration hint when modified legacy units are skipped", () => {
        warnLegacyModified([{ targetPath: "skills/example", kind: "skill", state: "legacy" }], "user");

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("Run `astp update --force --target user` to replace them."),
        );
    });

    it("prints overwrite commands with the run's target for foreign units", () => {
        vi.mocked(p.log.warn).mockClear();
        warnForeign("core", [{ targetPath: "skills/sample", kind: "skill", state: "modified" }], [], "user");

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("astp install core --skill skills/sample --force --target user"),
        );
    });

    it("shows the force-update command when modified units are skipped", () => {
        vi.mocked(p.log.warn).mockClear();
        warnModified([{ targetPath: "agents/example.md", kind: "file", state: "modified" }], "astp update --force");

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("Run `astp update --force` to overwrite them."),
        );
    });
});

describe("out-of-sync update prompts", () => {
    it("labels same-version divergence out of sync in check and update reports", () => {
        const report: UpdateReport = {
            updates: [
                {
                    bundleName: "core",
                    installedVersion: "1.0.0",
                    availableVersion: "1.0.0",
                    units: [{ targetPath: "agents/a.md", kind: "file", state: "new" }],
                },
            ],
            upToDate: [],
            notInManifest: [],
            legacySkills: [],
        };

        vi.mocked(p.log.info).mockClear();
        showCheckReport(report, "project");
        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain("↻ Out of sync");

        vi.mocked(p.log.info).mockClear();
        showUpdateReport(report);
        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain("core: 1.0.0 out of sync (1 file)");
    });

    it("reports bundles that are no longer in the current manifest", () => {
        const report: UpdateReport = {
            updates: [],
            upToDate: [],
            notInManifest: [{ bundleName: "removed", version: "1.0.0", units: [], declined: [] }],
            legacySkills: [],
        };

        vi.mocked(p.log.info).mockClear();
        showUpdateReport(report);

        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain(
            "removed: not in the current manifest, left in place.",
        );
    });
});

describe("install confirmation counts", () => {
    it("counts a nested SKILL.md within its outer skill", async () => {
        const bundle: Bundle = {
            name: "sample",
            version: "1.0.0",
            description: "Sample",
            default: false,
            items: [
                { source: "sample/skills/a/SKILL.md", target: "skills/a/SKILL.md", category: "skill" },
                {
                    source: "sample/skills/a/examples/sub/SKILL.md",
                    target: "skills/a/examples/sub/SKILL.md",
                    category: "skill",
                },
            ],
        };
        const target: InstallTarget = { platform: "claude-code", type: "project", rootDir: "/project/.claude" };
        vi.mocked(p.confirm).mockResolvedValue(true);

        await confirmInstall([bundle], target);

        expect(p.confirm).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("(1 skill)") }),
        );
    });
});
