import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { vi } from "vitest";

import type { Bundle, InstallTarget, TemplateItem } from "@/types/index.js";

import { computeHash } from "../frontmatter.js";
import { readLock, writeLock } from "../lock.js";
import { syncBundle } from "../sync.js";
import { loadInstalled } from "../version.js";

const mocks = vi.hoisted(() => ({ failOn: undefined as string | undefined }));

vi.mock("../installer.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../installer.js")>();
    return {
        ...actual,
        installFile: vi.fn(async (tempDir: string, item: TemplateItem, target: InstallTarget, content?: string) => {
            if (item.target === mocks.failOn) throw new Error("boom");
            return actual.installFile(tempDir, item, target, content);
        }),
    };
});

const A_V1 = "---\nname: a\n---\na v1\n";
const A_V2 = "---\nname: a\n---\na v2\n";
const B_V1 = "---\nname: b\n---\nb v1\n";
const R_V1 = "---\ndescription: r\n---\nr v1\n";
const R_V2 = "---\ndescription: r\n---\nr v2\n";

const agent = (target: string): TemplateItem => ({ source: `core/${target}`, target, category: "agent" });
const rule = (target: string): TemplateItem => ({ source: `core/${target}`, target, category: "rule" });

const bundle = (items: TemplateItem[]): Bundle => ({
    name: "core",
    version: "2.0.0",
    description: "core",
    default: true,
    items,
});

describe("syncBundle", () => {
    let rootDir: string;
    let tempDir: string;
    let target: InstallTarget;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-sync-root-"));
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-sync-tpl-"));
        target = { platform: "claude-code", type: "project", rootDir };
        mocks.failOn = undefined;
    });

    afterEach(async () => {
        await fs.rm(rootDir, { recursive: true, force: true });
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    async function writeFiles(base: string, files: Record<string, string>) {
        for (const [relativePath, content] of Object.entries(files)) {
            const filePath = path.join(base, relativePath);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content);
        }
    }

    async function writeV1Lock(units: Record<string, string>, version = "1.0.0") {
        await writeLock(rootDir, {
            schemaVersion: 1,
            bundles: {
                core: {
                    source: "test",
                    declined: [],
                    units: Object.fromEntries(
                        Object.entries(units).map(([relativePath, content]) => [
                            relativePath,
                            { kind: "file" as const, version, hash: computeHash(content) },
                        ]),
                    ),
                },
            },
        });
    }

    const syncCore = (
        installed: Awaited<ReturnType<typeof loadInstalled>>,
        items: TemplateItem[],
        selection: {
            selected: Set<string>;
            declined: Set<string>;
            force?: boolean;
        },
    ) =>
        syncBundle({
            target,
            source: "test",
            bundle: bundle(items),
            installed: installed.bundles.find((entry) => entry.bundleName === "core"),
            lock: installed.lock,
            tempDir,
            selected: selection.selected,
            declined: selection.declined,
            force: selection.force ?? false,
        });

    it("a throw in the middle of syncBundle leaves the lock matching the disk", async () => {
        await writeFiles(rootDir, { "agents/a.md": A_V1, "agents/b.md": B_V1, "rules/r.md": R_V1 });
        await writeFiles(tempDir, { "agents/a.md": A_V2, "agents/b.md": B_V1, "rules/r.md": R_V2 });
        await writeV1Lock({ "agents/a.md": A_V1, "agents/b.md": B_V1, "rules/r.md": R_V1 });
        const installed = await loadInstalled(rootDir);
        mocks.failOn = "rules/r.md";

        await expect(
            syncCore(installed, [agent("agents/a.md"), agent("agents/b.md"), rule("rules/r.md")], {
                selected: new Set(["agents/a.md", "rules/r.md"]),
                declined: new Set(["agents/b.md"]),
            }),
        ).rejects.toThrow("boom");

        const lock = await readLock(rootDir);
        const core = lock.bundles.core!;
        expect(core.units["agents/a.md"]).toEqual({ kind: "file", version: "2.0.0", hash: computeHash(A_V2) });
        expect(core.units["agents/b.md"]).toBeUndefined();
        expect(core.declined).toContain("agents/b.md");
        expect(core.units["rules/r.md"]).toEqual({ kind: "file", version: "1.0.0", hash: computeHash(R_V1) });

        await expect(fs.access(path.join(rootDir, "agents/b.md"))).rejects.toMatchObject({ code: "ENOENT" });
        expect(await fs.readFile(path.join(rootDir, "agents/a.md"), "utf8")).toBe(A_V2);

        const after = await loadInstalled(rootDir);
        const units = after.bundles.find((entry) => entry.bundleName === "core")!.units;
        expect(units.find((unit) => unit.relativePath === "agents/a.md")?.state).toBe("unmodified");
        expect(units.filter((unit) => unit.state === "missing" || unit.state === "modified")).toEqual([]);
    });

    it("a tracked unit under a user file is foreign", async () => {
        await writeFiles(rootDir, { "agents/a.md": A_V1 });
        await fs.writeFile(path.join(rootDir, "rules"), "mine");
        await writeFiles(tempDir, { "agents/a.md": A_V2, "rules/r.md": R_V2 });
        await writeV1Lock({ "agents/a.md": A_V1, "rules/r.md": R_V1 });
        const installed = await loadInstalled(rootDir);

        const result = await syncCore(installed, [agent("agents/a.md"), rule("rules/r.md")], {
            selected: new Set(["agents/a.md", "rules/r.md"]),
            declined: new Set(),
        });

        expect(result.installed.map((status) => status.targetPath)).toEqual(["agents/a.md"]);
        expect(result.foreign.map((status) => status.targetPath)).toEqual(["rules/r.md"]);
        const lock = await readLock(rootDir);
        const core = lock.bundles.core!;
        expect(core.units["rules/r.md"]).toBeUndefined();
        expect(core.declined).toEqual(["rules/r.md"]);
        expect(core.units["agents/a.md"]?.version).toBe("2.0.0");
        expect(await fs.readFile(path.join(rootDir, "rules"), "utf8")).toBe("mine");
    });

    it("an untracked unit under a user file is foreign", async () => {
        await writeFiles(rootDir, { "agents/a.md": A_V1 });
        await fs.writeFile(path.join(rootDir, "rules"), "mine");
        await writeFiles(tempDir, { "agents/a.md": A_V2, "rules/r.md": R_V2 });
        await writeV1Lock({ "agents/a.md": A_V1 });
        const installed = await loadInstalled(rootDir);

        const result = await syncCore(installed, [agent("agents/a.md"), rule("rules/r.md")], {
            selected: new Set(["agents/a.md", "rules/r.md"]),
            declined: new Set(),
        });

        expect(result.foreign.map((status) => status.targetPath)).toEqual(["rules/r.md"]);
        const lock = await readLock(rootDir);
        const core = lock.bundles.core!;
        expect(core.units["rules/r.md"]).toBeUndefined();
        expect(core.declined).toEqual(["rules/r.md"]);
        expect(await fs.readFile(path.join(rootDir, "rules"), "utf8")).toBe("mine");
    });
});
