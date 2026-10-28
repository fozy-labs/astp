import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bundle } from "@/types/index.js";

import { canSymlinkFiles } from "../../__tests__/links.js";
import { closeSource, downloadBundle, fetchManifest } from "../fetcher.js";
import { resolveSource } from "../source.js";
import { groupTemplateItems } from "../units.js";

vi.mock("giget", () => ({ downloadTemplate: vi.fn() }));

const mockedDownloadTemplate = vi.mocked(downloadTemplate);
const REF_SHA = "0123456789abcdef0123456789abcdef01234567";

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
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ sha: REF_SHA }))),
        );
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

    it("downloads an external skill ref without requiring a local bundle directory", async () => {
        const referenced: Bundle = {
            ...bundle,
            items: [],
            refs: [{ source: "gh:owner/repo/skills/external#main", target: "skills/external" }],
        };
        mockedDownloadTemplate.mockImplementation(async (input, options) => {
            expect(input).toBe(`gh:owner/repo/skills/external#${REF_SHA}`);
            await fs.mkdir(path.join(options!.dir!, "references"), { recursive: true });
            await fs.writeFile(path.join(options!.dir!, "SKILL.md"), "---\ndescription: External\n---\n# External\n");
            await fs.writeFile(path.join(options!.dir!, "references/guide.md"), "Guide\n");
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("./manifest.json", work);

        const dir = await downloadBundle(source, referenced);
        tempDirs.push(dir);

        expect(await fs.readFile(path.join(dir, "skills/external/SKILL.md"), "utf8")).toContain("# External");
        expect(await fs.readFile(path.join(dir, "skills/external/references/guide.md"), "utf8")).toBe("Guide\n");
    });

    it("downloads an external ref at its locked SHA without resolving the branch again", async () => {
        const locked = "fedcba9876543210fedcba9876543210fedcba98";
        const referenced: Bundle = {
            ...bundle,
            items: [],
            refs: [{ source: "gh:owner/repo/skills/external#main", target: "skills/external" }],
        };
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        mockedDownloadTemplate.mockImplementation(async (input, options) => {
            expect(input).toBe(`gh:owner/repo/skills/external#${locked}`);
            await fs.mkdir(options!.dir!, { recursive: true });
            await fs.writeFile(path.join(options!.dir!, "SKILL.md"), "---\ndescription: External\n---\n# External\n");
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("./manifest.json", work);
        const units = groupTemplateItems(referenced);

        const dir = await downloadBundle(
            source,
            referenced,
            units,
            undefined,
            new Map([["skills/external", { lockedCommit: locked, requireLocked: true }]]),
        );
        tempDirs.push(dir);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(units[0]).toMatchObject({ resolvedCommit: locked });
    });

    it("rejects an external ref without SKILL.md", async () => {
        const referenced: Bundle = {
            ...bundle,
            items: [],
            refs: [{ source: "gh:owner/repo/skills/external", target: "skills/external" }],
        };
        mockedDownloadTemplate.mockImplementation(async (_input, options) => {
            await fs.mkdir(options!.dir!, { recursive: true });
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("./manifest.json", work);

        await expect(downloadBundle(source, referenced)).rejects.toThrow(
            "Referenced skill 'gh:owner/repo/skills/external' has no SKILL.md",
        );
    });

    it("rejects a local ref outside the manifest directory", async () => {
        const referenced: Bundle = {
            ...bundle,
            items: [],
            refs: [{ source: "../private", target: "skills/private" }],
        };
        await fs.mkdir(path.join(work, "private"), { recursive: true });
        await fs.writeFile(path.join(work, "private/SKILL.md"), "# Private\n");
        const source = await resolveSource("./templates/manifest.json", work);

        await expect(downloadBundle(source, referenced)).rejects.toThrow(
            "Local ref '../private' resolves outside the manifest directory",
        );
    });

    it.each([
        { direction: "ref nested in a skill", unitPath: "skills/trusted", refTarget: "skills/trusted/nested" },
        { direction: "skill nested in a ref", unitPath: "skills/trusted/nested", refTarget: "skills/trusted" },
    ])("rejects a $direction before downloading", async ({ unitPath, refTarget }) => {
        const skillRoot = path.join(work, "docs", unitPath);
        await fs.mkdir(skillRoot, { recursive: true });
        await fs.writeFile(path.join(skillRoot, "SKILL.md"), "trusted\n");
        const overlapping: Bundle = {
            ...bundle,
            items: [
                {
                    source: `docs/${unitPath}/SKILL.md`,
                    target: `${unitPath}/SKILL.md`,
                    category: "skill",
                },
            ],
            refs: [{ source: "gh:owner/repo/skills/external#main", target: refTarget }],
        };
        mockedDownloadTemplate.mockImplementation(async (_input, options) => {
            await fs.mkdir(options!.dir!, { recursive: true });
            await fs.writeFile(path.join(options!.dir!, "SKILL.md"), "malicious\n");
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("./manifest.json", work);

        await expect(downloadBundle(source, overlapping)).rejects.toThrow(
            `Ref target '${refTarget}' overlaps existing unit '${unitPath}'`,
        );
        expect(mockedDownloadTemplate).not.toHaveBeenCalled();
    });

    it("rejects a ref whose target contains an ordinary file before downloading", async () => {
        await writeRoot(work);
        const overlapping: Bundle = {
            ...bundle,
            refs: [{ source: "gh:owner/repo/skills/external#main", target: "rules" }],
        };
        mockedDownloadTemplate.mockImplementation(async (_input, options) => {
            await fs.mkdir(options!.dir!, { recursive: true });
            await fs.writeFile(path.join(options!.dir!, "SKILL.md"), "external\n");
            await fs.writeFile(path.join(options!.dir!, "a.md"), "malicious\n");
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("./manifest.json", work);

        await expect(downloadBundle(source, overlapping)).rejects.toThrow(
            "Ref target 'rules' overlaps existing unit 'rules/a.md'",
        );
        expect(mockedDownloadTemplate).not.toHaveBeenCalled();
    });

    it("rejects overlapping ref targets before downloading either ref", async () => {
        const overlapping: Bundle = {
            ...bundle,
            items: [],
            refs: [
                { source: "gh:owner/repo/skills/external#main", target: "skills/external" },
                { source: "gh:owner/repo/skills/other#main", target: "skills/external/nested" },
            ],
        };
        const source = await resolveSource("./manifest.json", work);

        await expect(downloadBundle(source, overlapping)).rejects.toThrow(
            "Ref target 'skills/external/nested' overlaps existing unit 'skills/external'",
        );
        expect(mockedDownloadTemplate).not.toHaveBeenCalled();
    });

    it("preserves legitimate refs alongside disjoint template units", async () => {
        await writeRoot(work);
        const referenced: Bundle = {
            ...bundle,
            refs: [{ source: "gh:owner/repo/skills/external#main", target: "skills/external" }],
        };
        mockedDownloadTemplate.mockImplementation(async (_input, options) => {
            await fs.mkdir(options!.dir!, { recursive: true });
            await fs.writeFile(path.join(options!.dir!, "SKILL.md"), "external\n");
            return { dir: options!.dir! } as never;
        });
        const source = await resolveSource("./manifest.json", work);

        const dir = await downloadBundle(source, referenced);
        tempDirs.push(dir);

        expect(await fs.readFile(path.join(dir, "rules/a.md"), "utf8")).toBe("# a\n");
        expect(await fs.readFile(path.join(dir, "skills/external/SKILL.md"), "utf8")).toBe("external\n");
    });

    it("copies a local item to its platform target without changing the source", async () => {
        await writeRoot(work);
        const source = await resolveSource("./manifest.json", work);
        const overridden: Bundle = {
            ...bundle,
            items: [{ ...bundle.items[0]!, targets: { "kimi-code": "AGENTS.md" } }],
        };
        const dir = await downloadBundle(source, overridden, undefined, "kimi-code");
        tempDirs.push(dir);

        expect(await fs.readFile(path.join(dir, "AGENTS.md"), "utf8")).toBe("# a\n");
        expect(await fs.readFile(path.join(work, "docs/rules/a.md"), "utf8")).toBe("# a\n");
        await expect(fs.stat(path.join(work, "docs/AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("preserves canonical content through chained overrides for local and archive sources", async () => {
        const chained: Bundle = {
            ...bundle,
            items: [
                { ...bundle.items[0]!, targets: { "kimi-code": "rules/b.md" } },
                {
                    source: "docs/rules/b.md",
                    target: "rules/b.md",
                    category: "rule",
                    targets: { "kimi-code": "rules/c.md" },
                },
            ],
        };
        await writeRoot(work);
        await fs.writeFile(path.join(work, "docs/rules/b.md"), "# b\n");
        const local = await resolveSource("./manifest.json", work);
        const localDir = await downloadBundle(local, chained, undefined, "kimi-code");
        tempDirs.push(localDir);
        expect(await fs.readFile(path.join(localDir, "rules/b.md"), "utf8")).toBe("# a\n");
        expect(await fs.readFile(path.join(localDir, "rules/c.md"), "utf8")).toBe("# b\n");

        mockedDownloadTemplate.mockImplementation(async (_input, options) => {
            await writeRoot(options!.dir!);
            await fs.writeFile(path.join(options!.dir!, "docs/rules/b.md"), "# b\n");
            return { dir: options!.dir! } as never;
        });
        const archive = await resolveSource("gh:o/r", work);
        const archiveDir = await downloadBundle(archive, chained, undefined, "kimi-code");
        tempDirs.push(archiveDir);
        await closeSource(archive);
        expect(await fs.readFile(path.join(archiveDir, "rules/b.md"), "utf8")).toBe("# a\n");
        expect(await fs.readFile(path.join(archiveDir, "rules/c.md"), "utf8")).toBe("# b\n");
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

    it("fetches the canonical URL source and writes its platform target", async () => {
        const fetchMock = vi.fn(async (url: URL) => new Response(`file ${url.pathname}`));
        vi.stubGlobal("fetch", fetchMock);
        const source = await resolveSource("https://host/m/manifest.json", work);
        const overridden: Bundle = {
            ...bundle,
            items: [{ ...bundle.items[0]!, targets: { "kimi-code": "AGENTS.md" } }],
        };
        const dir = await downloadBundle(source, overridden, undefined, "kimi-code");
        tempDirs.push(dir);

        expect(await fs.readFile(path.join(dir, "AGENTS.md"), "utf8")).toBe("file /m/docs/rules/a.md");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not fetch or write an excluded override over an active URL target", async () => {
        const fetchMock = vi.fn(async (url: URL) => new Response(`file ${url.pathname}`));
        vi.stubGlobal("fetch", fetchMock);
        const source = await resolveSource("https://host/m/manifest.json", work);
        const filtered: Bundle = {
            ...bundle,
            items: [
                {
                    source: "docs/AGENTS.md",
                    target: "AGENTS.md",
                    category: "rule",
                    platforms: ["kimi-code"],
                },
                {
                    ...bundle.items[0]!,
                    platforms: ["claude-code"],
                    targets: { "kimi-code": "AGENTS.md" },
                },
            ],
        };
        const dir = await downloadBundle(source, filtered, undefined, "kimi-code");
        tempDirs.push(dir);

        expect(await fs.readFile(path.join(dir, "AGENTS.md"), "utf8")).toBe("file /m/docs/AGENTS.md");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("fetches a URL item whose name has URL syntax characters", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: URL) => new Response(`file ${url.pathname}`)),
        );
        const source = await resolveSource("https://host/m/manifest.json", work);
        const odd = { ...bundle, items: [{ ...bundle.items[0]!, target: "rules/a#1%.md" }] };
        const dir = await downloadBundle(source, odd);
        tempDirs.push(dir);
        expect(await fs.readFile(path.join(dir, "rules/a#1%.md"), "utf8")).toBe("file /m/docs/rules/a%231%25.md");
    });

    it.each(["../../../x.md", "agents/..\\..\\..\\x.txt"])(
        "rejects URL item %j before fetching or writing outside the temp dir",
        async (target) => {
            const fetchMock = vi.fn(async () => new Response("x"));
            vi.stubGlobal("fetch", fetchMock);
            const source = await resolveSource("https://host/m/manifest.json", work);
            const escaping = { ...bundle, items: [{ ...bundle.items[0]!, target }] };
            await expect(downloadBundle(source, escaping)).rejects.toThrow("safe relative path");
            expect(fetchMock).not.toHaveBeenCalled();
            await expect(fs.stat(path.resolve(os.tmpdir(), "../x.txt"))).rejects.toMatchObject({ code: "ENOENT" });
        },
    );
});
