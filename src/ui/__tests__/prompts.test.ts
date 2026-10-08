import * as p from "@clack/prompts";

import { ALL_PLATFORMS } from "@/types/index.js";
import type { UpdateReport } from "@/types/index.js";

import { selectPlatform, showCheckReport, showUpdateReport } from "../prompts.js";

vi.mock("@clack/prompts", () => ({
    intro: vi.fn(),
    outro: vi.fn(),
    spinner: vi.fn(),
    select: vi.fn(),
    isCancel: vi.fn(() => false),
    cancel: vi.fn(),
    log: {
        info: vi.fn(),
        warn: vi.fn(),
        success: vi.fn(),
    },
}));

const mockSelect = vi.mocked(p.select);
const mockInfo = vi.mocked(p.log.info);

describe("selectPlatform", () => {
    it("skips the prompt when only one platform is supported", async () => {
        expect(ALL_PLATFORMS).toHaveLength(1);

        await expect(selectPlatform()).resolves.toBe(ALL_PLATFORMS[0]);

        expect(mockSelect).not.toHaveBeenCalled();
    });
});

describe("update reports", () => {
    it("labels same-version file divergence as out of sync", () => {
        const report: UpdateReport = {
            updates: [
                {
                    bundleName: "pipeline",
                    installedVersion: "1.0.0",
                    availableVersion: "1.0.0",
                    files: [{ targetPath: "agents/b.md", state: "new" }],
                },
            ],
            upToDate: [],
            notInManifest: [],
        };

        showCheckReport(report);
        expect(mockInfo).toHaveBeenLastCalledWith(expect.stringContaining("↻ Out of sync"));

        showUpdateReport(report);
        expect(mockInfo).toHaveBeenLastCalledWith("pipeline: 1.0.0 out of sync (1 file)");
    });
});
