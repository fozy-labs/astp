import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Bundle, Manifest } from "@/types/index.js";

import { assertBundleBlocks, assertBundleSources } from "../installer.js";
import { downloadProxyBundle, loadProxyState, syncProxyBundle } from "../proxy.js";
import { resolveSource } from "../source.js";
import { groupTemplateItems } from "../units.js";

let rootDir: string;
let upstreamDir: string;
let outputDir: string;

beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-proxy-core-"));
    upstreamDir = path.join(rootDir, "upstream");
    outputDir = path.join(rootDir, "project", "templates");
    await fs.mkdir(upstreamDir, { recursive: true });
});

afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
});

function ruleBundle(version = "1.0.0"): Bundle {
    return {
        name: "core",
        version,
        description: "Core",
        default: true,
        items: [{ source: "core/rules/core.md", target: "rules/core.md", category: "rule" }],
    };
}

async function writeUpstream(bundle: Bundle, files: Record<string, string>): Promise<void> {
    const manifest: Manifest = { schemaVersion: "3.1", bundles: { core: bundle } };
    await fs.mkdir(upstreamDir, { recursive: true });
    await fs.writeFile(path.join(upstreamDir, "manifest.json"), JSON.stringify(manifest));
    for (const [file, content] of Object.entries(files)) {
        const target = path.join(upstreamDir, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
    }
}

async function sync(bundle: Bundle, selected?: Set<string>, force = false, replaceBundle = false) {
    const source = await resolveSource(path.join(upstreamDir, "manifest.json"), rootDir);
    const units = groupTemplateItems(bundle);
    const { tempDir, units: downloaded } = await downloadProxyBundle(source, bundle, units);
    try {
        await assertBundleSources(
            tempDir,
            bundle.name,
            downloaded.filter((unit) => unit.kind !== "skill" || unit.items.length > 0),
        );
        await assertBundleBlocks(
            tempDir,
            bundle.name,
            downloaded.filter((unit) => unit.kind !== "skill" || unit.items.length > 0),
        );
        const state = await loadProxyState(outputDir);
        return await syncProxyBundle({
            rootDir: outputDir,
            source: source.spec,
            bundle,
            tempDir,
            units,
            selected: selected ?? new Set(units.map((unit) => unit.relativePath)),
            force,
            replaceBundle,
            state,
        });
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

async function generated(): Promise<Manifest> {
    return JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8")) as Manifest;
}

it("keeps remote refs lazy and materializes local refs as regular items", async () => {
    const bundle = ruleBundle();
    bundle.refs = [
        { source: "./external", target: "skills/local", labels: ["local"] },
        { source: "gh:example/skills/remote#abc123", target: "skills/remote" },
    ];
    await writeUpstream(bundle, {
        "core/rules/core.md": "rule\n",
        "external/SKILL.md": "---\nname: local\n---\nlocal\n",
        "external/references/a.md": "reference\n",
    });

    await sync(bundle);

    const manifest = await generated();
    expect(manifest.bundles.core!.refs).toEqual([
        { source: "gh:example/skills/remote#abc123", target: "skills/remote" },
    ]);
    expect(manifest.bundles.core!.items.map((item) => item.target)).toEqual([
        "rules/core.md",
        "skills/local/references/a.md",
        "skills/local/SKILL.md",
    ]);
    expect(manifest.bundles.core!.items.find((item) => item.target === "skills/local/SKILL.md")).toMatchObject({
        source: "core/skills/local/SKILL.md",
        labels: ["local"],
    });
    expect(await fs.readFile(path.join(outputDir, "core/skills/local/SKILL.md"), "utf8")).toContain("local");
    await expect(fs.stat(path.join(outputDir, "core/skills/remote"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await loadProxyState(outputDir)).lock.bundles.core!.refs).toEqual({
        "core/skills/remote": { version: "1.0.0", hash: expect.any(String) },
    });
});

it("preserves the published version on a no-op and bumps patch, minor, then major", async () => {
    let bundle = ruleBundle();
    await writeUpstream(bundle, { "core/rules/core.md": "v1\n" });
    await sync(bundle);
    await sync(bundle);
    expect((await generated()).bundles.core!.version).toBe("1.0.0");

    bundle = ruleBundle("1.1.0");
    await writeUpstream(bundle, { "core/rules/core.md": "v2\n" });
    await sync(bundle);
    expect((await generated()).bundles.core!.version).toBe("1.0.1");

    bundle = ruleBundle("1.2.0");
    bundle.items.push({ source: "core/rules/extra.md", target: "rules/extra.md", category: "rule" });
    await writeUpstream(bundle, { "core/rules/core.md": "v2\n", "core/rules/extra.md": "extra\n" });
    await sync(bundle);
    expect((await generated()).bundles.core!.version).toBe("1.1.0");

    bundle = ruleBundle("2.0.0");
    await writeUpstream(bundle, { "core/rules/core.md": "v2\n" });
    await sync(bundle);
    expect((await generated()).bundles.core!.version).toBe("2.0.0");
});

it("keeps local edits until forced and retains a modified upstream removal", async () => {
    const bundle = ruleBundle();
    await writeUpstream(bundle, { "core/rules/core.md": "upstream\n" });
    await sync(bundle);
    const outputFile = path.join(outputDir, "core/rules/core.md");
    await fs.writeFile(outputFile, "local\n");

    const skipped = await sync(bundle);
    expect(skipped.skipped.map((unit) => unit.targetPath)).toEqual(["core/rules/core.md"]);
    expect(await fs.readFile(outputFile, "utf8")).toBe("local\n");

    const forced = await sync(bundle, undefined, true);
    expect(forced.skipped).toEqual([]);
    expect(await fs.readFile(outputFile, "utf8")).toBe("upstream\n");

    await fs.writeFile(outputFile, "owned\n");
    const empty = { ...bundle, items: [], refs: undefined };
    const kept = await sync(empty);
    expect(kept.kept.map((unit) => unit.targetPath)).toEqual(["core/rules/core.md"]);
    expect(await fs.readFile(outputFile, "utf8")).toBe("owned\n");
    expect((await generated()).bundles.core!.items).toHaveLength(1);
    expect((await loadProxyState(outputDir)).lock.bundles.core).toBeUndefined();
});

it("does not replace an organization-owned ref target without force", async () => {
    const initial = ruleBundle();
    await writeUpstream(initial, { "core/rules/core.md": "rule\n" });
    await sync(initial);
    const current = await generated();
    current.bundles.core!.refs = [{ source: "gh:org/custom#one", target: "skills/shared" }];
    await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(current));

    const upstream = ruleBundle("1.1.0");
    upstream.refs = [{ source: "gh:upstream/shared#two", target: "skills/shared" }];
    await writeUpstream(upstream, { "core/rules/core.md": "rule\n" });
    const result = await sync(upstream);

    expect(result.foreign.map((unit) => unit.targetPath)).toEqual(["core/skills/shared"]);
    expect((await generated()).bundles.core!.refs).toEqual([{ source: "gh:org/custom#one", target: "skills/shared" }]);
});

it("upgrades an existing output schema before writing platform target overrides", async () => {
    await fs.mkdir(outputDir, { recursive: true });
    const existing: Manifest = {
        schemaVersion: "2.1",
        bundles: {
            other: {
                name: "other",
                version: "1.0.0",
                description: "Other",
                default: false,
                items: [{ source: "other/rules/a.md", target: "rules/a.md", category: "rule" }],
            },
        },
    };
    await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(existing));
    const bundle = ruleBundle();
    bundle.items[0]!.targets = { "kimi-code": "AGENTS.md" };
    await writeUpstream(bundle, { "core/rules/core.md": "rule\n" });

    await sync(bundle);

    const manifest = await generated();
    expect(manifest.schemaVersion).toBe("3.1");
    expect(manifest.bundles.other).toEqual(existing.bundles.other);
    expect(manifest.bundles.core!.items[0]!.targets).toEqual({ "kimi-code": "AGENTS.md" });
});

it("removes only a bundle symlink during forced replacement and preserves its destination", async () => {
    await fs.mkdir(outputDir, { recursive: true });
    const outside = path.join(rootDir, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "keep.txt"), "keep\n");
    await fs.symlink(outside, path.join(outputDir, "core"), "junction");
    const existing: Manifest = { schemaVersion: "3.1", bundles: { core: ruleBundle() } };
    await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(existing));
    const bundle = ruleBundle();
    await writeUpstream(bundle, { "core/rules/core.md": "rule\n" });

    await sync(bundle, undefined, true, true);

    expect(await fs.readFile(path.join(outside, "keep.txt"), "utf8")).toBe("keep\n");
    expect(await fs.readFile(path.join(outputDir, "core/rules/core.md"), "utf8")).toBe("rule\n");
});

it("keeps unprocessed manifest units when a later copy fails", async () => {
    const initial = ruleBundle();
    initial.items.push({ source: "core/rules/extra.md", target: "rules/extra.md", category: "rule" });
    await writeUpstream(initial, { "core/rules/core.md": "core v1\n", "core/rules/extra.md": "extra v1\n" });
    await sync(initial);
    const upstream = ruleBundle("1.1.0");
    upstream.items.push({ source: "core/rules/extra.md", target: "rules/extra.md", category: "rule" });
    await writeUpstream(upstream, { "core/rules/core.md": "core v2\n", "core/rules/extra.md": "extra v2\n" });
    const copyFile = fs.copyFile;
    let copies = 0;
    const spy = vi.spyOn(fs, "copyFile").mockImplementation(async (source, destination) => {
        copies += 1;
        if (copies === 2) throw new Error("copy failed");
        return copyFile(source, destination);
    });

    try {
        await expect(sync(upstream)).rejects.toThrow("copy failed");
    } finally {
        spy.mockRestore();
    }

    const manifest = await generated();
    expect(manifest.bundles.core!.items.map((item) => item.target).sort()).toEqual(["rules/core.md", "rules/extra.md"]);
    expect(manifest.bundles.core!.version).toBe("1.0.1");
    expect(await fs.readFile(path.join(outputDir, "core/rules/extra.md"), "utf8")).toBe("extra v1\n");
});
