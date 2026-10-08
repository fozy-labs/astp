import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { downloadTemplate } from "giget";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadBundle } from "../fetcher.js";

vi.mock("giget", () => ({
    downloadTemplate: vi.fn(),
}));

const mockedDownloadTemplate = vi.mocked(downloadTemplate);

describe("downloadBundle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        const tempEntriesBefore = new Set(await fs.readdir(os.tmpdir()));
        mockedDownloadTemplate.mockRejectedValue(new Error("network timeout"));

        try {
            await expect(downloadBundle("fozy-labs/astp", "docs")).rejects.toThrow(
                "Failed to download bundle 'docs': network timeout",
            );

            const createdTempDirs = (await fs.readdir(os.tmpdir())).filter(
                (entry) => entry.startsWith("astp-docs-") && !tempEntriesBefore.has(entry),
            );
            expect(createdTempDirs).toEqual([]);
        } finally {
            const newTempDirs = (await fs.readdir(os.tmpdir())).filter(
                (entry) => entry.startsWith("astp-docs-") && !tempEntriesBefore.has(entry),
            );
            await Promise.all(
                newTempDirs.map((entry) => fs.rm(path.join(os.tmpdir(), entry), { recursive: true, force: true })),
            );
        }
    });
});
