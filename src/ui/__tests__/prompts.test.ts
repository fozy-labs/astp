import * as p from "@clack/prompts";

import { ALL_PLATFORMS } from "@/types/index.js";

import { selectPlatform } from "../prompts.js";

vi.mock("@clack/prompts", () => ({
    intro: vi.fn(),
    outro: vi.fn(),
    spinner: vi.fn(),
    select: vi.fn(),
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
