import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { downloadTemplate } from "giget";
import { vi } from "vitest";

import { executeInstall } from "@/commands/install.js";
import { executeProxyCheck, executeProxyDelete, executeProxyInstall, executeProxyUpdate } from "@/commands/proxy.js";
import type { Bundle, Manifest } from "@/types/index.js";
import { showProxyCheckReport } from "@/ui/prompts.js";

vi.mock("giget", () => ({ downloadTemplate: vi.fn() }));

vi.mock("@/ui/prompts.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/ui/prompts.js")>()),
    isInteractive: vi.fn(() => false),
    selectBundleItems: vi.fn(),
    selectNewUnits: vi.fn(),
    selectProxyBundles: vi.fn(),
    confirmProxyAction: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showProxyCheckReport: vi.fn(),
    warnModified: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnProxyForeign: vi.fn(),
    warnNewerManifest: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockedDownloadTemplate = vi.mocked(downloadTemplate);

let work: string;
let projectDir: string;
let upstreamDir: string;
let outputDir: string;
let cwd: string;

beforeEach(async () => {
    vi.clearAllMocks();
    mockedDownloadTemplate.mockReset();
    work = await fs.mkdtemp(path.join(os.tmpdir(), "astp-proxy-e2e-"));
    projectDir = path.join(work, "project");
    upstreamDir = path.join(work, "upstream");
    outputDir = path.join(projectDir, "templates");
    cwd = projectDir;
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(upstreamDir, { recursive: true });
    vi.spyOn(process, "cwd").mockImplementation(() => cwd);
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(work, { recursive: true, force: true });
});

function bundle(version = "1.0.0"): Bundle {
    return {
        name: "core",
        version,
        description: "Core",
        default: true,
        items: [
            { source: "core/rules/a.md", target: "rules/a.md", category: "rule" },
            { source: "core/rules/b.md", target: "rules/b.md", category: "rule" },
        ],
    };
}

async function writeUpstream(next: Bundle, files: Record<string, string>): Promise<void> {
    const manifest: Manifest = { schemaVersion: "3.1", bundles: { core: next } };
    await fs.writeFile(path.join(upstreamDir, "manifest.json"), JSON.stringify(manifest));
    for (const [file, content] of Object.entries(files)) {
        const target = path.join(upstreamDir, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
    }
}

async function readGenerated(): Promise<Manifest> {
    return JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8")) as Manifest;
}

const source = () => path.join(upstreamDir, "manifest.json");

it("imports a source, keeps no-op versions, checks it, and installs it downstream", async () => {
    await writeUpstream(bundle(), { "core/rules/a.md": "a v1\n", "core/rules/b.md": "b v1\n" });

    await executeProxyInstall({ bundle: "core", source: source() });
    expect(await fs.readFile(path.join(outputDir, "core/rules/a.md"), "utf8")).toBe("a v1\n");
    expect((await readGenerated()).bundles.core!.version).toBe("1.0.0");

    await executeProxyInstall({ bundle: "core" });
    expect((await readGenerated()).bundles.core!.version).toBe("1.0.0");
    await executeProxyCheck({});
    expect(vi.mocked(showProxyCheckReport)).toHaveBeenCalledWith([
        expect.objectContaining({ bundleName: "core", availableVersion: "1.0.0", outOfSync: false }),
    ]);

    await executeInstall({ bundle: "core", source: "./templates", platform: "claude-code", target: "project" });
    expect(await fs.readFile(path.join(projectDir, ".claude/rules/a.md"), "utf8")).toBe("a v1\n");
});

it("does not download remote refs while proxying and downloads one when installing downstream", async () => {
    const next = { ...bundle(), items: [], refs: [{ source: "gh:example/skills/remote#abc", target: "skills/remote" }] };
    await writeUpstream(next, {});

    await executeProxyInstall({ bundle: "core", source: source() });
    expect(mockedDownloadTemplate).not.toHaveBeenCalled();
    expect((await readGenerated()).bundles.core!.refs).toEqual(next.refs);

    mockedDownloadTemplate.mockImplementation(async (_input, options) => {
        await fs.mkdir(options!.dir!, { recursive: true });
        await fs.writeFile(path.join(options!.dir!, "SKILL.md"), "---\ndescription: Remote\n---\nremote\n");
        return { dir: options!.dir! } as never;
    });
    await executeInstall({ bundle: "core", source: "./templates", platform: "claude-code", target: "project" });

    expect(mockedDownloadTemplate).toHaveBeenCalledTimes(1);
    expect(mockedDownloadTemplate).toHaveBeenCalledWith(
        "gh:example/skills/remote#abc",
        expect.objectContaining({ force: true }),
    );
    expect(await fs.readFile(path.join(projectDir, ".claude/skills/remote/SKILL.md"), "utf8")).toContain("remote");
});

it("materializes local refs for local and archive downstream sources without the upstream", async () => {
    const next = { ...bundle(), items: [], refs: [{ source: "./external", target: "skills/local" }] };
    await writeUpstream(next, { "external/SKILL.md": "---\ndescription: Local\n---\nlocal\n" });
    await executeProxyInstall({ bundle: "core", source: source() });
    expect((await readGenerated()).bundles.core!.refs).toBeUndefined();
    await fs.rm(upstreamDir, { recursive: true, force: true });

    await executeInstall({ bundle: "core", source: "./templates", platform: "claude-code", target: "project" });
    expect(await fs.readFile(path.join(projectDir, ".claude/skills/local/SKILL.md"), "utf8")).toContain("local");

    await fs.rm(path.join(projectDir, ".claude"), { recursive: true, force: true });
    mockedDownloadTemplate.mockImplementation(async (input, options) => {
        expect(input).toBe("gh:org/proxy/templates#HEAD");
        await fs.cp(outputDir, options!.dir!, { recursive: true });
        return { dir: options!.dir! } as never;
    });
    await executeInstall({ bundle: "core", source: "gh:org/proxy", platform: "claude-code", target: "project" });

    expect(mockedDownloadTemplate).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(path.join(projectDir, ".claude/skills/local/SKILL.md"), "utf8")).toContain("local");
});

it("updates with edit protection and deletes units and the empty generated source", async () => {
    await writeUpstream(bundle(), { "core/rules/a.md": "a v1\n", "core/rules/b.md": "b v1\n" });
    await executeProxyInstall({ bundle: "core", source: source() });
    const localFile = path.join(outputDir, "core/rules/a.md");
    await fs.writeFile(localFile, "a local\n");
    await writeUpstream(bundle("1.1.0"), { "core/rules/a.md": "a v2\n", "core/rules/b.md": "b v1\n" });

    await executeProxyUpdate({});
    expect(await fs.readFile(localFile, "utf8")).toBe("a local\n");
    await executeProxyUpdate({ force: true });
    expect(await fs.readFile(localFile, "utf8")).toBe("a v2\n");
    expect((await readGenerated()).bundles.core!.version).toBe("1.0.1");

    await executeProxyDelete({ bundle: "core", skills: ["rules/b.md"] });
    expect((await readGenerated()).bundles.core!.version).toBe("2.0.0");
    await expect(fs.stat(path.join(outputDir, "core/rules/b.md"))).rejects.toMatchObject({ code: "ENOENT" });

    await executeProxyDelete({ bundle: "core" });
    await expect(fs.stat(path.join(outputDir, "manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(outputDir, "astp.lock"))).rejects.toMatchObject({ code: "ENOENT" });
});
