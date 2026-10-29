import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { selectUpdateBlocks } from "@/commands/blocks.js";
import { executeInstall } from "@/commands/install.js";
import { executeSync } from "@/commands/sync.js";
import { executeUpdate } from "@/commands/update.js";
import type { Bundle, Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { warnMixedVersion } from "@/ui/prompts.js";

import { createTempProject, makeProjectTarget } from "./helpers.js";

vi.mock("@/types/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/types/index.js")>();
    return { ...actual, resolveTarget: vi.fn() };
});

vi.mock("@/commands/blocks.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/commands/blocks.js")>();
    return { ...actual, selectUpdateBlocks: vi.fn(actual.selectUpdateBlocks) };
});

vi.mock("@/ui/prompts.js", () => ({
    isInteractive: vi.fn(() => false),
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundleItems: vi.fn(),
    selectNewUnits: vi.fn(),
    confirmInstall: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    warnMixedVersion: vi.fn(),
    warnLegacyModified: vi.fn(),
    warnBlockConflicts: vi.fn(),
    warnKeptBlocks: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnReleased: vi.fn(),
    warnForeign: vi.fn(),
    warnNewerManifest: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

async function writeSource(projectDir: string, version: string): Promise<void> {
    const bundle: Bundle = {
        name: "core",
        version,
        description: "Core",
        default: true,
        platforms: ["claude-code"],
        items: [{ source: "core/rules/core.md", target: "rules/core.md", category: "rule" }],
    };
    const manifest: Manifest = { schemaVersion: 1, bundles: { core: bundle } };
    const root = path.join(projectDir, "source/templates");
    await fs.mkdir(path.join(root, "core/rules"), { recursive: true });
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
    await fs.writeFile(path.join(root, "core/rules/core.md"), `---\ndescription: core\n---\n${version}\n`);
}

describe("E2E: sync", () => {
    let projectDir: string;
    let cleanup: () => Promise<void>;
    let rootDir: string;
    const opts = { platform: "claude-code", target: "project" } as const;
    const rulePath = () => path.join(rootDir, "rules/core.md");
    const lockPath = () => path.join(rootDir, "astp.lock");

    beforeEach(async () => {
        vi.clearAllMocks();
        ({ dir: projectDir, cleanup } = await createTempProject());
        const target = makeProjectTarget(projectDir);
        rootDir = target.rootDir;
        vi.mocked(resolveTarget).mockReturnValue(target);
        vi.spyOn(process, "cwd").mockReturnValue(projectDir);
        await writeSource(projectDir, "1.0.0");
        await executeInstall({ ...opts, bundle: "core", source: "./source" });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await cleanup();
    });

    it("restores a deleted file when its locked template still matches", async () => {
        const locked = await fs.readFile(lockPath(), "utf8");
        await fs.rm(rulePath());

        await executeSync(opts);

        expect(await fs.readFile(rulePath(), "utf8")).toContain("1.0.0");
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);
    });

    it("rejects drifted unlocked content without rewriting the lock and advances only via update", async () => {
        const locked = await fs.readFile(lockPath(), "utf8");
        await writeSource(projectDir, "2.0.0");
        await fs.rm(rulePath());

        await expect(executeSync(opts)).rejects.toThrow(
            "Locked unit 'core/rules/core.md' does not match its source; run astp update before sync",
        );
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);

        await executeUpdate(opts);
        expect(await fs.readFile(rulePath(), "utf8")).toContain("2.0.0");
        expect(await fs.readFile(lockPath(), "utf8")).not.toBe(locked);
    });

    it("protects modified files by default and restores them with --force without rewriting lock", async () => {
        const locked = await fs.readFile(lockPath(), "utf8");
        await fs.writeFile(rulePath(), "local edit\n");

        await executeSync(opts);
        expect(await fs.readFile(rulePath(), "utf8")).toBe("local edit\n");

        await executeSync({ ...opts, force: true });
        expect(await fs.readFile(rulePath(), "utf8")).toContain("1.0.0");
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);
    });

    it("restores the locked block selection rather than selecting every template block", async () => {
        const sourceRoot = path.join(projectDir, "block-source/templates");
        const bundle: Bundle = {
            name: "blocks",
            version: "1.0.0",
            description: "Blocks",
            default: true,
            platforms: ["claude-code"],
            items: [{ source: "blocks/rules/blocks.md", target: "rules/blocks.md", category: "rule" }],
        };
        const manifest: Manifest = { schemaVersion: 1, bundles: { blocks: bundle } };
        await fs.mkdir(path.join(sourceRoot, "blocks/rules"), { recursive: true });
        await fs.writeFile(path.join(sourceRoot, "manifest.json"), JSON.stringify(manifest));
        await fs.writeFile(
            path.join(sourceRoot, "blocks/rules/blocks.md"),
            `---\ndescription: Blocks\n---\n<astp-block name="alpha">\nAlpha\n</astp-block>\n<astp-block name="beta" optional>\nBeta\n</astp-block>\n`,
        );
        await executeInstall({ ...opts, bundle: "blocks", source: "./block-source" });
        const filePath = path.join(rootDir, "rules/blocks.md");
        const locked = await fs.readFile(lockPath(), "utf8");
        expect(await fs.readFile(filePath, "utf8")).toContain("Alpha");
        expect(await fs.readFile(filePath, "utf8")).not.toContain("Beta");

        await fs.rm(filePath);
        await executeSync(opts);

        expect(await fs.readFile(filePath, "utf8")).toContain("Alpha");
        expect(await fs.readFile(filePath, "utf8")).not.toContain("Beta");
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);
    });

    it("accepts kept deselected blocks whose template bodies changed without rewriting lock", async () => {
        const sourceRoot = path.join(projectDir, "block-source/templates");
        const templatePath = path.join(sourceRoot, "blocks/rules/blocks.md");
        const bundle: Bundle = {
            name: "blocks",
            version: "1.0.0",
            description: "Blocks",
            default: true,
            platforms: ["claude-code"],
            items: [{ source: "blocks/rules/blocks.md", target: "rules/blocks.md", category: "rule" }],
        };
        const manifest: Manifest = { schemaVersion: 1, bundles: { blocks: bundle } };
        await fs.mkdir(path.dirname(templatePath), { recursive: true });
        await fs.writeFile(path.join(sourceRoot, "manifest.json"), JSON.stringify(manifest));
        await fs.writeFile(
            templatePath,
            `---\ndescription: Blocks\n---\n<astp-block name="wrapper">\nWrapper v1\n<astp-block name="parent">\nParent v1\n<astp-block name="child">\nChild v1\n</astp-block>\n</astp-block>\n</astp-block>\n`,
        );
        await executeInstall({ ...opts, bundle: "blocks", source: "./block-source" });
        const blockPath = path.join(rootDir, "rules/blocks.md");
        await fs.writeFile(blockPath, (await fs.readFile(blockPath, "utf8")).replace("Child v1", "Local child"));

        bundle.version = "2.0.0";
        await fs.writeFile(path.join(sourceRoot, "manifest.json"), JSON.stringify(manifest));
        await fs.writeFile(
            templatePath,
            `---\ndescription: Blocks\n---\n<astp-block name="wrapper" optional>\nWrapper v2\n<astp-block name="parent">\nParent v2\n<astp-block name="child">\nChild v2\n</astp-block>\n</astp-block>\n</astp-block>\n`,
        );
        vi.mocked(selectUpdateBlocks).mockResolvedValueOnce(
            new Map([
                ["rules/blocks.md", { selected: new Set<string>(), declined: new Set(["wrapper", "parent", "child"]) }],
            ]),
        );
        await executeUpdate(opts);
        const locked = await fs.readFile(lockPath(), "utf8");
        expect(await fs.readFile(blockPath, "utf8")).toContain("Local child");
        await fs.rm(rulePath());

        await executeSync(opts);

        expect(await fs.readFile(rulePath(), "utf8")).toContain("1.0.0");
        expect(await fs.readFile(blockPath, "utf8")).toContain("Local child");
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);
    });

    it("rejects changed block bodies before restoring any files", async () => {
        const sourceRoot = path.join(projectDir, "block-source/templates");
        const templatePath = path.join(sourceRoot, "blocks/rules/blocks.md");
        const bundle: Bundle = {
            name: "blocks",
            version: "1.0.0",
            description: "Blocks",
            default: true,
            platforms: ["claude-code"],
            items: [{ source: "blocks/rules/blocks.md", target: "rules/blocks.md", category: "rule" }],
        };
        const manifest: Manifest = { schemaVersion: 1, bundles: { blocks: bundle } };
        await fs.mkdir(path.dirname(templatePath), { recursive: true });
        await fs.writeFile(path.join(sourceRoot, "manifest.json"), JSON.stringify(manifest));
        await fs.writeFile(
            templatePath,
            `---\ndescription: Blocks\n---\n<astp-block name="alpha">\nAlpha\n</astp-block>\n`,
        );
        await executeInstall({ ...opts, bundle: "blocks", source: "./block-source" });
        const locked = await fs.readFile(lockPath(), "utf8");
        const blockPath = path.join(rootDir, "rules/blocks.md");
        await fs.rm(rulePath());
        await fs.rm(blockPath);
        await fs.writeFile(
            templatePath,
            `---\ndescription: Blocks\n---\n<astp-block name="alpha">\nChanged upstream\n</astp-block>\n`,
        );

        await expect(executeSync({ ...opts, force: true })).rejects.toThrow(
            "Locked unit 'blocks/rules/blocks.md' does not match its source; run astp update before sync",
        );

        await expect(fs.lstat(rulePath())).rejects.toMatchObject({ code: "ENOENT" });
        await expect(fs.lstat(blockPath)).rejects.toMatchObject({ code: "ENOENT" });
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);
    });

    it("restores locked units without downloading an unselected Git ref", async () => {
        const manifestPath = path.join(projectDir, "source/templates/manifest.json");
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
        manifest.bundles.core!.refs = [
            { source: "gh:owner/unselected-skill", target: "skills/unselected", optional: true },
        ];
        await fs.writeFile(manifestPath, JSON.stringify(manifest));
        const locked = await fs.readFile(lockPath(), "utf8");
        await fs.rm(rulePath());

        await executeSync(opts);

        expect(await fs.readFile(rulePath(), "utf8")).toContain("1.0.0");
        await expect(fs.lstat(path.join(rootDir, "skills/unselected"))).rejects.toMatchObject({ code: "ENOENT" });
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);
    });

    it("skips mixed-version units under force and restores the other locked units", async () => {
        const sourceRoot = path.join(projectDir, "mixed-source/templates");
        const writeMixedSource = async (version: string) => {
            const bundle: Bundle = {
                name: "mixed",
                version,
                description: "Mixed",
                default: true,
                platforms: ["claude-code"],
                items: [
                    { source: "mixed/rules/edited.md", target: "rules/edited.md", category: "rule" },
                    { source: "mixed/rules/restored.md", target: "rules/restored.md", category: "rule" },
                ],
            };
            const manifest: Manifest = { schemaVersion: 1, bundles: { mixed: bundle } };
            await fs.mkdir(path.join(sourceRoot, "mixed/rules"), { recursive: true });
            await fs.writeFile(path.join(sourceRoot, "manifest.json"), JSON.stringify(manifest));
            for (const name of ["edited", "restored"]) {
                await fs.writeFile(
                    path.join(sourceRoot, `mixed/rules/${name}.md`),
                    `---\ndescription: ${name}\n---\n${version}\n`,
                );
            }
        };
        await writeMixedSource("1.0.0");
        await executeInstall({ ...opts, bundle: "mixed", source: "./mixed-source" });
        const editedPath = path.join(rootDir, "rules/edited.md");
        const restoredPath = path.join(rootDir, "rules/restored.md");
        await fs.writeFile(editedPath, "local edit\n");
        await writeMixedSource("2.0.0");
        await executeUpdate(opts);
        const locked = await fs.readFile(lockPath(), "utf8");
        await fs.rm(restoredPath);

        await executeSync({ ...opts, force: true });

        expect(vi.mocked(warnMixedVersion)).toHaveBeenCalledWith([
            { bundle: "mixed", unit: "rules/edited.md", version: "1.0.0", sourceVersion: "2.0.0" },
        ]);
        expect(await fs.readFile(editedPath, "utf8")).toBe("local edit\n");
        expect(await fs.readFile(restoredPath, "utf8")).toContain("2.0.0");
        expect(await fs.readFile(lockPath(), "utf8")).toBe(locked);
    });

    it("rejects an old Git lock without a resolved commit instead of following its branch", async () => {
        const lock = JSON.parse(await fs.readFile(lockPath(), "utf8")) as {
            schemaVersion: number;
            bundles: Record<string, { source: string }>;
        };
        lock.schemaVersion = 1;
        lock.bundles.core!.source = "gh:owner/repo#main";
        await fs.writeFile(lockPath(), JSON.stringify(lock));

        await expect(executeSync(opts)).rejects.toThrow(
            "Bundle 'core' has no resolvedCommit; run astp update before sync",
        );
    });
});
