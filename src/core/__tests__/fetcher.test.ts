import fs from "node:fs/promises";

import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBundle } from "../fetcher.js";

vi.mock("giget", () => ({
    downloadTemplate: vi.fn(),
}));

const mockedDownloadTemplate = vi.mocked(downloadTemplate);

describe("downloadBundle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        const dirs = mockedDownloadTemplate.mock.calls
            .map(([, options]) => options?.dir)
            .filter((dir): dir is string => !!dir);
        await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    });

    it("composes correct giget source string with default ref", async () => {
        mockedDownloadTemplate.mockResolvedValue({ source: "", dir: "/tmp/download" } as never);

        await downloadBundle("fozy-labs/astp", "docs");

        expect(mockedDownloadTemplate).toHaveBeenCalledWith(
            "gh:fozy-labs/astp/templates/docs#main",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-docs-/),
            }),
        );
    });

    it("uses custom ref when provided", async () => {
        mockedDownloadTemplate.mockResolvedValue({ source: "", dir: "/tmp/download" } as never);

        await downloadBundle("fozy-labs/astp", "fozy-labs", "v1.0.0");

        expect(mockedDownloadTemplate).toHaveBeenCalledWith(
            "gh:fozy-labs/astp/templates/fozy-labs#v1.0.0",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-fozy-labs-/),
            }),
        );
    });

    it("uses a unique destination directory for each download", async () => {
        mockedDownloadTemplate.mockResolvedValue({ source: "", dir: "/tmp/download" } as never);

        await downloadBundle("fozy-labs/astp", "fozy-labs");
        await downloadBundle("fozy-labs/astp", "docs");

        expect(mockedDownloadTemplate).toHaveBeenNthCalledWith(
            1,
            "gh:fozy-labs/astp/templates/fozy-labs#main",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-fozy-labs-/),
            }),
        );
        expect(mockedDownloadTemplate).toHaveBeenNthCalledWith(
            2,
            "gh:fozy-labs/astp/templates/docs#main",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-docs-/),
            }),
        );

        const firstCallOptions = mockedDownloadTemplate.mock.calls[0]?.[1];
        const secondCallOptions = mockedDownloadTemplate.mock.calls[1]?.[1];

        expect(firstCallOptions?.dir).not.toBe(secondCallOptions?.dir);
    });

    it("returns the temp directory path", async () => {
        mockedDownloadTemplate.mockResolvedValue({
            source: "",
            dir: "/tmp/my-download",
        } as never);

        const result = await downloadBundle("fozy-labs/astp", "docs");
        expect(result).toBe("/tmp/my-download");
    });

    it("throws user-friendly error on giget failure", async () => {
        mockedDownloadTemplate.mockRejectedValue(new Error("network timeout"));

        await expect(downloadBundle("fozy-labs/astp", "docs")).rejects.toThrow(
            "Failed to download bundle 'docs': network timeout",
        );
    });

    it("removes the temp directory after a download failure", async () => {
        mockedDownloadTemplate.mockRejectedValue(new Error("network timeout"));

        await expect(downloadBundle("fozy-labs/astp", "docs")).rejects.toThrow(
            "Failed to download bundle 'docs': network timeout",
        );

        const dir = mockedDownloadTemplate.mock.calls[0]?.[1]?.dir;
        expect(dir).toEqual(expect.stringMatching(/astp-docs-/));
        if (!dir) throw new Error("Expected download temp directory");
        await expect(fs.stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
    });
});
