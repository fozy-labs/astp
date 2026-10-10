import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bundle } from "@/types/index.js";

import { canSymlinkFiles } from "../../__tests__/links.js";
import { closeSource, downloadBundle, fetchManifest } from "../fetcher.js";
import { resolveSource } from "../source.js";

vi.mock("giget", () => ({ downloadTemplate: vi.fn() }));

const mockedDownloadTemplate = vi.mocked(downloadTemplate);

const bundle: Bundle = {
    name: "docs",
    version: "1.0.0",
    description: "Docs",
    default: true,
    items: [{ source: "docs/rules/a.md", target: "rules/a.md", category: "rule" }],
};
const manifestJson = JSON.stringify({ schemaVersion: 1, bundles: { docs: bundle } });

async function writeRoot(dir: string, manifestFile = "manifest.json"): Promise<void> {
    await fs.mkdir(path.join(dir, "docs/rules"), { recursive: true });
    await fs.writeFile(path.join(dir, manifestFile), manifestJson);
    await fs.writeFile(path.join(dir, "docs/rules/a.md"), "# a\n");
}

describe("fetcher", () => {
    let work: string;
    const tempDirs: string[] = [];

    beforeEach(async () => {
        vi.clearAllMocks();
        work = await fs.mkdtemp(path.join(os.tmpdir(), "astp-fetcher-"));
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        await Promise.all([work, ...tempDirs.splice(0)].map((dir) => fs.rm(dir, { recursive: true, force: true })));
    });

    it("reads a local manifest and copies the bundle next to it, leaving the source intact", async () => {
        await writeRoot(path.join(work, "tests"), "test.manifest.json");
        const source = await resolveSource("./tests/test.manifest.json", work);
        expect(Object.keys((await fetchManifest(source)).bundles)).toEqual(["docs"]);
        const dir = await downloadBundle(source, bundle);
        tempDirs.push(dir);
        expect(await fs.readFile(path.join(dir, "rules/a.md"), "utf8")).toBe("# a\n");
        await fs.rm(dir, { recursive: true });
        await expect(fs.stat(path.join(work, "tests/docs/rules/a.md"))).resolves.toBeTruthy();
    });

    describe("links in a local source", () => {
        let root: string;
        let outside: string;
        let source: Awaited<ReturnType<typeof resolveSource>>;

        beforeEach(async () => {
            root = path.join(work, "src");
            outside = path.join(work, "outside");
            await writeRoot(root);
            await fs.mkdir(outside);
            await fs.writeFile(path.join(outside, "secret.md"), "SECRET");
            source = await resolveSource("./src/manifest.json", work);
        });

        async function download(): Promise<string> {
            const dir = await downloadBundle(source, bundle);
            tempDirs.push(dir);
            return dir;
        }

        it.skipIf(!canSymlinkFiles)("does not copy a file symlink", async () => {
            await fs.rm(path.join(root, "docs/rules/a.md"));
            await fs.symlink(path.join(outside, "secret.md"), path.join(root, "docs/rules/a.md"), "file");
            await expect(fs.lstat(path.join(await download(), "rules/a.md"))).rejects.toMatchObject({ code: "ENOENT" });
        });

        it("does not copy a directory link or junction", async () => {
            await fs.mkdir(path.join(root, "docs/skills/x"), { recursive: true });
            await fs.symlink(outside, path.join(root, "docs/skills/x/refs"), "junction");
            const dir = await download();
            await expect(fs.lstat(path.join(dir, "skills/x/refs"))).rejects.toMatchObject({ code: "ENOENT" });
            expect(await fs.readFile(path.join(dir, "rules/a.md"), "utf8")).toBe("# a\n");
        });

        it("copies nothing when the bundle directory is a link", async () => {
            await fs.rename(path.join(root, "docs"), path.join(outside, "docs"));
            await fs.symlink(path.join(outside, "docs"), path.join(root, "docs"), "junction");
            expect(await fs.readdir(await download())).toEqual([]);
        });

        it.skipIf(!canSymlinkFiles)("rejects a manifest that is a symlink", async () => {
            await fs.rename(path.join(root, "manifest.json"), path.join(outside, "manifest.json"));
            await fs.symlink(path.join(outside, "manifest.json"), path.join(root, "manifest.json"), "file");
            await expect(fetchManifest(source)).rejects.toThrow("is not a regular file");
        });
    });

    it("names the checked path when a local manifest is missing", async () => {
        const source = await resolveSource("./nowhere", work);
        await expect(fetchManifest(source)).rejects.toThrow(path.join(work, "nowhere/templates/manifest.json"));
    });

    it("downloads an archive once, with an isolated giget cache and GIGET_AUTH only for gh", async () => {
        vi.stubEnv("GIGET_AUTH", "secret");
        const seen: Array<{ input: string; auth?: string; cache?: string }> = [];
        mockedDownloadTemplate.mockImplementation(async (input, options) => {
            seen.push({ input, auth: process.env.GIGET_AUTH, cache: process.env.XDG_CACHE_HOME });
            await writeRoot(options!.dir!);
            return { dir: options!.dir! } as never;
        });

        const gh = await resolveSource("o/r#v1", work);
        await fetchManifest(gh);
        tempDirs.push(await downloadBundle(gh, bundle));
        const gitlab = await resolveSource("gitlab:o/r", work);
        await fetchManifest(gitlab);

        expect(seen.map(({ input, auth }) => [input, auth])).toEqual([
            ["gh:o/r/templates#v1", "secret"],
            ["gitlab:o/r/templates#HEAD", undefined],
        ]);
        expect(seen[0]!.cache).toMatch(/astp-giget-cache-/);
        expect(process.env.GIGET_AUTH).toBe("secret");
        await expect(fs.stat(seen[0]!.cache!)).rejects.toMatchObject({ code: "ENOENT" });

        await closeSource(gh);
        await closeSource(gitlab);
    });

    it("reports a manifest missing from the download", async () => {
        mockedDownloadTemplate.mockImplementation(async (_input, options) => ({ dir: options!.dir! }) as never);
        const source = await resolveSource("gh:o/r/missing", work);
        await expect(fetchManifest(source)).rejects.toThrow("Manifest not found for source 'gh:o/r/missing'");
        await closeSource(source);
    });

    it("rejects an archive whose manifest directory links outside the download", async () => {
        const outside = path.join(work, "outside");
        await writeRoot(outside);
        mockedDownloadTemplate.mockImplementation(async (_input, options) => {
            await fs.symlink(outside, path.join(options!.dir!, "templates"), "junction");
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("https://host/a.tgz", work);
        await expect(fetchManifest(source)).rejects.toThrow(
            "Manifest directory of source 'https://host/a.tgz' resolves outside the downloaded source",
        );
        await expect(downloadBundle(source, bundle)).rejects.toThrow(
            "bundle directory resolves outside the downloaded source",
        );
        await closeSource(source);
    });

    it("resolves an npm package to its tarball", async () => {
        const fetchMock = vi.fn(
            async (_url: URL) =>
                new Response(JSON.stringify({ dist: { tarball: "https://registry.npmjs.org/p/-/p-1.0.0.tgz" } })),
        );
        vi.stubGlobal("fetch", fetchMock);
        mockedDownloadTemplate.mockImplementation(async (_input, options) => {
            await writeRoot(path.join(options!.dir!, "templates"));
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("npm:@s/p@1.0.0", work);
        await fetchManifest(source);
        expect(fetchMock.mock.calls[0]![0].toString()).toBe("https://registry.npmjs.org/@s%2fp/1.0.0");
        expect(mockedDownloadTemplate.mock.calls[0]![0]).toBe("https://registry.npmjs.org/p/-/p-1.0.0.tgz");
        await closeSource(source);
    });

    it("fetches a URL manifest and each item relative to it", async () => {
        const fetchMock = vi.fn(async (url: URL) =>
            url.href.endsWith("manifest.json") ? new Response(manifestJson) : new Response(`file ${url.pathname}`),
        );
        vi.stubGlobal("fetch", fetchMock);
        const source = await resolveSource("https://host/m/manifest.json", work);
        await fetchManifest(source);
        const dir = await downloadBundle(source, bundle);
        tempDirs.push(dir);
        expect(await fs.readFile(path.join(dir, "rules/a.md"), "utf8")).toBe("file /m/docs/rules/a.md");
    });

    it("fetches a URL item whose name has URL syntax characters", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: URL) => new Response(`file ${url.pathname}`)),
        );
        const source = await resolveSource("https://host/m/manifest.json", work);
        const odd = { ...bundle, items: [{ ...bundle.items[0]!, target: "rules/a#1?%.md" }] };
        const dir = await downloadBundle(source, odd);
        tempDirs.push(dir);
        expect(await fs.readFile(path.join(dir, "rules/a#1?%.md"), "utf8")).toBe("file /m/docs/rules/a%231%3F%25.md");
    });

    it("rejects a URL item outside the manifest directory", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("x")),
        );
        const source = await resolveSource("https://host/m/manifest.json", work);
        const escaping = { ...bundle, items: [{ ...bundle.items[0]!, target: "../../../x.md" }] };
        await expect(downloadBundle(source, escaping)).rejects.toThrow("outside the manifest directory");
    });
});
