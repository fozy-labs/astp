import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveGitCommit } from "../git.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const NEXT_SHA = "fedcba9876543210fedcba9876543210fedcba98";

describe("resolveGitCommit", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("returns an already resolved commit without a network request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveGitCommit({ provider: "gh", repo: "o/r", ref: SHA })).resolves.toBe(SHA);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        {
            provider: "gh" as const,
            url: `https://api.github.com/repos/o/r/commits/main`,
            body: { sha: SHA },
        },
        {
            provider: "gitlab" as const,
            url: `https://gitlab.com/api/v4/projects/o%2Fr/repository/commits/main`,
            body: { id: SHA },
        },
        {
            provider: "bitbucket" as const,
            url: `https://api.bitbucket.org/2.0/repositories/o/r/commit/main`,
            body: { hash: SHA },
        },
    ])("resolves $provider refs through its HTTP API", async ({ provider, url, body }) => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)));
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveGitCommit({ provider, repo: "o/r", ref: "main" })).resolves.toBe(SHA);
        expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "GET" }));
    });

    it("sends GIGET_AUTH only to the GitHub API", async () => {
        vi.stubEnv("GIGET_AUTH", "secret");
        const fetchMock = vi.fn(
            async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ sha: SHA })),
        );
        vi.stubGlobal("fetch", fetchMock);

        await resolveGitCommit({ provider: "gh", repo: "o/r", ref: "main" });
        expect(fetchMock.mock.calls[0]![1]).toMatchObject({
            headers: { Authorization: "Bearer secret", Accept: "application/vnd.github+json" },
        });
    });

    it("resolves SourceHut refs through GraphQL", async () => {
        const fetchMock = vi.fn(
            async (_url: string, _init?: RequestInit) =>
                new Response(JSON.stringify({ data: { user: { repository: { revparse_single: { id: SHA } } } } })),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveGitCommit({ provider: "sourcehut", repo: "~o/r", ref: "main" })).resolves.toBe(SHA);
        expect(fetchMock).toHaveBeenCalledWith("https://git.sr.ht/query", expect.objectContaining({ method: "POST" }));
        const init = fetchMock.mock.calls[0]![1];
        const body = JSON.parse(String(init?.body)) as { variables: Record<string, string> };
        expect(body.variables).toMatchObject({ owner: "~o", repo: "r", ref: "main" });
    });

    it("rejects invalid or ambiguous provider responses", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ sha: NEXT_SHA.slice(1) }))),
        );

        await expect(resolveGitCommit({ provider: "gh", repo: "o/r", ref: "main" })).rejects.toThrow(
            "did not return a full commit SHA",
        );
    });

    it("includes HTTP status and source coordinates in resolution errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 404 })),
        );

        await expect(resolveGitCommit({ provider: "gh", repo: "o/r", ref: "missing" })).rejects.toThrow(
            "Cannot resolve gh:o/r#missing: HTTP 404",
        );
    });
});
