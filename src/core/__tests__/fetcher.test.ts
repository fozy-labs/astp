import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadTemplate } from "giget";

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

        await downloadBundle("fozy-labs/astp", "rdpi");

        expect(mockedDownloadTemplate).toHaveBeenCalledWith(
            "gh:fozy-labs/astp/src/templates/rdpi#main",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-rdpi-/),
            }),
        );
    });

    it("uses custom ref when provided", async () => {
        mockedDownloadTemplate.mockResolvedValue({ source: "", dir: "/tmp/download" } as never);

        await downloadBundle("fozy-labs/astp", "base", "v1.0.0");

        expect(mockedDownloadTemplate).toHaveBeenCalledWith(
            "gh:fozy-labs/astp/src/templates/base#v1.0.0",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-base-/),
            }),
        );
    });

    it("uses a unique destination directory for each download", async () => {
        mockedDownloadTemplate.mockResolvedValue({ source: "", dir: "/tmp/download" } as never);

        await downloadBundle("fozy-labs/astp", "base");
        await downloadBundle("fozy-labs/astp", "rdpi");

        expect(mockedDownloadTemplate).toHaveBeenNthCalledWith(
            1,
            "gh:fozy-labs/astp/src/templates/base#main",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-base-/),
            }),
        );
        expect(mockedDownloadTemplate).toHaveBeenNthCalledWith(
            2,
            "gh:fozy-labs/astp/src/templates/rdpi#main",
            expect.objectContaining({
                dir: expect.stringMatching(/astp-rdpi-/),
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

        const result = await downloadBundle("fozy-labs/astp", "rdpi");
        expect(result).toBe("/tmp/my-download");
    });

    it("throws user-friendly error on giget failure", async () => {
        mockedDownloadTemplate.mockRejectedValue(new Error("network timeout"));

        await expect(downloadBundle("fozy-labs/astp", "rdpi")).rejects.toThrow(
            "Failed to download bundle 'rdpi': network timeout",
        );
    });
});
