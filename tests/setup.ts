import { afterEach, beforeEach, vi } from "vitest";

const SHA = "0123456789abcdef0123456789abcdef01234567";

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        sha: SHA,
                        id: SHA,
                        hash: SHA,
                        data: { user: { repository: { revparse_single: { id: SHA } } } },
                    }),
                ),
        ),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});
