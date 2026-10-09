import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bundle } from "@/types/index.js";

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
