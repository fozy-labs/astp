import * as p from "@clack/prompts";

import type { Bundle, InstallTarget, UpdateReport } from "@/types/index.js";
import { ALL_PLATFORMS } from "@/types/index.js";

import { confirmInstall, selectPlatform, showCheckReport, showUpdateReport, warnLegacySkills } from "../prompts.js";

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

describe("legacy skill prompts", () => {
    it("shows different check guidance for legacy skills with and without manifest entries", () => {
        const currentSkill = { bundleName: "core", targetPath: "skills/current", inManifest: true };
        const removedSkill = { bundleName: "core", targetPath: "skills/removed", inManifest: false };
        const report: UpdateReport = {
            updates: [],
            upToDate: [],
            notInManifest: [],
            legacySkills: [currentSkill, removedSkill],
        };

        vi.mocked(p.log.info).mockClear();
        showCheckReport(report);

        const reportText = String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0]);
        expect(reportText).toContain("core: legacy skill skills/current — run `astp update --force` to migrate.");
        expect(reportText).toContain("core: legacy skill skills/removed — not in the current manifest, left in place.");
        expect(reportText).not.toContain("skills/removed — run `astp update --force` to migrate.");
    });

    it("shows the force-migration hint when legacy skills are skipped", () => {
        warnLegacySkills([{ bundleName: "core", targetPath: "skills/example" }]);

        expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining("Run `astp update --force` to migrate."));
    });

    it("does not suggest migration when a legacy skill is absent from the manifest", () => {
        vi.mocked(p.log.warn).mockClear();
        warnLegacySkills([{ bundleName: "core", targetPath: "skills/example" }], false);

        expect(p.log.warn).toHaveBeenCalledWith(
            expect.stringContaining("These skills are not in the current manifest and were left in place."),
        );
        expect(p.log.warn).not.toHaveBeenCalledWith(expect.stringContaining("Run `astp update --force` to migrate."));
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
        showCheckReport(report);
        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain("↻ Out of sync");

        vi.mocked(p.log.info).mockClear();
        showUpdateReport(report);
        expect(String(vi.mocked(p.log.info).mock.calls.at(-1)?.[0])).toContain("core: 1.0.0 out of sync (1 file)");
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
