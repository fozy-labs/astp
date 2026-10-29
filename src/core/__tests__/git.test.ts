import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveGitCommit } from "../git.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const NEXT_SHA = "fedcba9876543210fedcba9876543210fedcba98";

function packet(value: string): string {
    return `${(value.length + 4).toString(16).padStart(4, "0")}${value}`;
}

function refAdvertisement(refs: Array<[string, string]>): string {
    const lines = refs
        .map(([name, sha], index) => packet(`${sha} ${name}${index === 0 ? "\0symref=HEAD:refs/heads/main" : ""}\n`))
        .join("");
    return `${packet("# service=git-upload-pack\n")}0000${lines}0000`;
}

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

    it("resolves SourceHut HEAD through unauthenticated Git smart HTTP", async () => {
        vi.stubEnv("GIGET_AUTH", "secret");
        const fetchMock = vi.fn(
            async () =>
                new Response(
                    refAdvertisement([
                        ["HEAD", SHA],
                        ["refs/heads/main", SHA],
                    ]),
                ),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(resolveGitCommit({ provider: "sourcehut", repo: "~o/r", ref: "HEAD" })).resolves.toBe(SHA);
        expect(fetchMock).toHaveBeenCalledWith("https://git.sr.ht/~o/r/info/refs?service=git-upload-pack", {
            method: "GET",
            headers: { Accept: "application/x-git-upload-pack-advertisement" },
        });
    });

    it.each([
        { ref: "main", refs: [["refs/heads/main", NEXT_SHA]] as Array<[string, string]> },
        { ref: "refs/heads/main", refs: [["refs/heads/main", NEXT_SHA]] as Array<[string, string]> },
        {
            ref: "v1.0.0",
            refs: [
                ["refs/tags/v1.0.0", SHA],
                ["refs/tags/v1.0.0^{}", NEXT_SHA],
            ] as Array<[string, string]>,
        },
    ])("resolves SourceHut ref $ref and prefers peeled tags", async ({ ref, refs }) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(refAdvertisement(refs))),
        );

        await expect(resolveGitCommit({ provider: "sourcehut", repo: "~o/r", ref })).resolves.toBe(NEXT_SHA);
    });

    it.each([
        { body: refAdvertisement([["refs/heads/main", SHA]]), ref: "missing" },
        { body: "not a pkt-line advertisement", ref: "HEAD" },
    ])("rejects an unresolvable or invalid SourceHut advertisement", async ({ body, ref }) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(body)),
        );

        await expect(resolveGitCommit({ provider: "sourcehut", repo: "~o/r", ref })).rejects.toThrow(
            "provider did not return a full commit SHA",
        );
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
