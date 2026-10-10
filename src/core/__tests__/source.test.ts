import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { InstallTarget } from "@/types/index.js";

import { formatSource, resolveSource } from "../source.js";

const cwd = path.resolve("/work/project");

describe("resolveSource", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("resolves local files and dirs against the base dir", async () => {
        await expect(resolveSource("./tests/test.manifest.json", cwd)).resolves.toEqual({
            kind: "local",
            spec: path.join(cwd, "tests/test.manifest.json"),
            manifestPath: path.join(cwd, "tests/test.manifest.json"),
        });
        await expect(resolveSource(".", cwd)).resolves.toMatchObject({
            manifestPath: path.join(cwd, "templates/manifest.json"),
        });
    });

    it.each([
        ["fozy-labs/astp", "gh:fozy-labs/astp", "gh:fozy-labs/astp/templates#HEAD", "manifest.json", true],
        ["github:o/r#feat/x", "gh:o/r#feat/x", "gh:o/r/templates#feat/x", "manifest.json", true],
        [
            "o/r/tests/test.manifest.json#v1",
            "gh:o/r/tests/test.manifest.json#v1",
            "gh:o/r/tests#v1",
            "test.manifest.json",
            true,
        ],
        ["gitlab:g/p/sub", "gitlab:g/p/sub", "gitlab:g/p/sub/templates#HEAD", "manifest.json", false],
        ["bitbucket:o/r/m.json", "bitbucket:o/r/m.json", "bitbucket:o/r#HEAD", "m.json", false],
    ])("parses git spec %s", async (spec, stored, address, manifestFile, auth) => {
        await expect(resolveSource(spec, cwd)).resolves.toEqual({
            kind: "archive",
            spec: stored,
            address,
            manifestFile,
            auth,
        });
    });

    it("parses npm specs", async () => {
        await expect(resolveSource("npm:@fozy-labs/astp@0.3.1", cwd)).resolves.toMatchObject({
            spec: "npm:@fozy-labs/astp@0.3.1",
            address: { npm: "@fozy-labs/astp", version: "0.3.1" },
            auth: false,
        });
        await expect(resolveSource("npm:pkg", cwd)).resolves.toMatchObject({
            spec: "npm:pkg",
            address: { npm: "pkg", version: "latest" },
        });
    });

    it("routes .json URLs to fetch and other URLs to giget", async () => {
        await expect(resolveSource("https://host/a/manifest.json", cwd)).resolves.toMatchObject({ kind: "url" });
        await expect(resolveSource("https://host/a.tgz", cwd)).resolves.toMatchObject({
            kind: "archive",
            address: "https://host/a.tgz",
            manifestFile: "templates/manifest.json",
            auth: false,
        });
    });

    it("accepts plain http only for localhost", async () => {
        await expect(resolveSource("http://host/a.tgz", cwd)).rejects.toThrow("use https");
        await expect(resolveSource("http://host/m.json", cwd)).rejects.toThrow("use https");
        for (const host of ["localhost:8080", "127.0.0.1", "[::1]"]) {
            await expect(resolveSource(`http://${host}/m.json`, cwd)).resolves.toMatchObject({ kind: "url" });
        }
    });

    it("maps a GitHub repo URL without network", async () => {
        await expect(resolveSource("https://github.com/fozy-labs/astp", cwd)).resolves.toMatchObject({
            spec: "gh:fozy-labs/astp",
        });
    });

    it("rejects an account URL", async () => {
        await expect(resolveSource("https://github.com/fozy-labs", cwd)).rejects.toThrow(
            "names an account, not a repository",
        );
    });

    it("finds a slash ref in blob URLs by probing refs, shortest first", async () => {
        const fetchMock = vi.fn(
            async (url: string) => new Response(null, { status: url.endsWith("/tar.gz/feat/matt") ? 200 : 404 }),
        );
        vi.stubGlobal("fetch", fetchMock);
        await expect(resolveSource("https://github.com/o/r/blob/feat/matt/tests/m.json", cwd)).resolves.toMatchObject({
            spec: "gh:o/r/tests/m.json#feat/matt",
            address: "gh:o/r/tests#feat/matt",
        });
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "https://codeload.github.com/o/r/tar.gz/feat",
            "https://codeload.github.com/o/r/tar.gz/feat/matt",
        ]);
    });

    it("parses tree URLs with the ref only", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 200 })),
        );
        await expect(resolveSource("https://github.com/o/r/tree/v1/sub", cwd)).resolves.toMatchObject({
            spec: "gh:o/r/sub#v1",
            address: "gh:o/r/sub/templates#v1",
        });
    });

    it("fails when no ref of the URL exists", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 404 })),
        );
        await expect(resolveSource("https://github.com/o/r/tree/nope", cwd)).rejects.toThrow("no ref in the URL");
    });

    it.each(["gh:not-a-repo", "npm:", "ftp:x/y", "https://github.com/o/r/pulls"])("rejects %s", async (spec) => {
        await expect(resolveSource(spec, cwd)).rejects.toThrow();
    });

    it("rejects a bare owner/repo spec that names an existing local path", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "astp-src-"));
        try {
            await fs.mkdir(path.join(tmp, "my-skills", "pack"), { recursive: true });
            await expect(resolveSource("my-skills/pack", tmp)).rejects.toThrow("ambiguous");
            await expect(resolveSource("my-skills/pack", tmp)).rejects.toThrow("'./my-skills/pack'");
            await expect(resolveSource("my-skills/pack", tmp)).rejects.toThrow("'gh:my-skills/pack'");
            await expect(resolveSource("my-skills/pack#v1", tmp)).rejects.toThrow("ambiguous");
            await expect(resolveSource("my-skills/pack#v1", tmp)).rejects.toThrow("'./my-skills/pack'");
            await expect(resolveSource("my-skills/pack#v1", tmp)).rejects.toThrow("'gh:my-skills/pack#v1'");
            await expect(resolveSource("other/repo", tmp)).resolves.toMatchObject({
                kind: "archive",
                spec: "gh:other/repo",
            });
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });

    it("reports a local-path check failure instead of falling through to GitHub", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "astp-src-"));
        const error = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
        const spy = vi.spyOn(fs, "lstat").mockRejectedValue(error);
        try {
            await expect(resolveSource("team/pack", tmp)).rejects.toThrow(
                "Cannot check whether source 'team/pack' names a local path",
            );
            expect(spy).toHaveBeenCalled();
        } finally {
            spy.mockRestore();
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });

    it("treats a leading backslash pair as a local UNC path", async () => {
        await expect(resolveSource("\\\\server\\share\\pack", cwd)).resolves.toMatchObject({
            kind: "local",
            spec: path.resolve(cwd, "\\\\server\\share\\pack"),
        });
    });
});

describe("formatSource", () => {
    const project: InstallTarget = { platform: "claude-code", type: "project", rootDir: path.join(cwd, ".claude") };
    const user: InstallTarget = { platform: "claude-code", type: "user", rootDir: "/home/u/.claude" };

    it("stores project-local paths relative to the lock for project targets, absolute for user targets", async () => {
        const source = await resolveSource("./tests/test.manifest.json", cwd);
        expect(formatSource(source, project)).toBe("../tests/test.manifest.json");
        expect(formatSource(source, user)).toBe(path.join(cwd, "tests/test.manifest.json"));
        const reread = await resolveSource(formatSource(source, project), project.rootDir);
        expect(reread.spec).toBe(source.spec);
    });

    it("stores a local path outside the project as absolute", async () => {
        const source = await resolveSource("/elsewhere/src", cwd);
        expect(formatSource(source, project)).toBe(path.resolve("/elsewhere/src"));
    });

    it("stores a project dir whose name starts with '..' relative to the lock", async () => {
        const source = await resolveSource("./..assets", cwd);
        expect(formatSource(source, project)).toBe("../..assets");
    });

    it("stores remote specs as resolved", async () => {
        expect(formatSource(await resolveSource("o/r#v1", cwd), project)).toBe("gh:o/r#v1");
    });

    it.runIf(process.platform === "win32")("keeps a stored //server/share spec resolvable", async () => {
        const source = await resolveSource("//server/share/pack", cwd);
        const reread = await resolveSource(formatSource(source, user), user.rootDir);
        expect(reread).toMatchObject({ kind: "local", spec: source.spec });
    });
});
