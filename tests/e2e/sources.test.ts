import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeCheck } from "@/commands/check.js";
import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { executeList } from "@/commands/list.js";
import { executeUpdate } from "@/commands/update.js";
import { loadInstalled } from "@/core/index.js";
import type { Bundle, Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { showCheckReport, showInfo, warnForeign, warnModified } from "@/ui/prompts.js";

import { createTempProject, makeProjectTarget, readLockFixture } from "./helpers.js";

vi.mock("@/types/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/types/index.js")>();
    return { ...actual, resolveTarget: vi.fn() };
});

vi.mock("@/ui/prompts.js", () => ({
    isInteractive: vi.fn(() => false),
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundleItems: vi.fn(),
    cancelNoBundles: vi.fn(),
    selectBlocks: vi.fn(),
    selectNewUnits: vi.fn(),
    confirmInstall: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showCheckReport: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    warnLegacyModified: vi.fn(),
    warnBlockConflicts: vi.fn(),
    warnKeptBlocks: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnReleased: vi.fn(),
    warnForeign: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

function ruleBundle(name: string, version: string): Bundle {
    return {
        name,
        version,
        description: name,
        default: true,
        platforms: ["claude-code"],
        items: [{ source: `${name}/rules/${name}.md`, target: `rules/${name}.md`, category: "rule" }],
    };
}

/** Writes a manifest and its bundles next to it; bundle `b` at `<dir of manifest>/b/`. */
async function writeSource(manifestPath: string, bundles: Record<string, string>): Promise<void> {
    const manifest: Manifest = { schemaVersion: 1, bundles: {} };
    for (const [name, version] of Object.entries(bundles)) {
        manifest.bundles[name] = ruleBundle(name, version);
        const file = path.join(path.dirname(manifestPath), name, "rules", `${name}.md`);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, `---\ndescription: ${name}\n---\n${name} ${version} from ${manifestPath}\n`);
    }
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
}

describe("E2E: manifest sources", () => {
    let projectDir: string;
    let cleanup: () => Promise<void>;
    let rootDir: string;
    const opts = { platform: "claude-code", target: "project" } as const;

    beforeEach(async () => {
        vi.clearAllMocks();
        ({ dir: projectDir, cleanup } = await createTempProject());
        const target = makeProjectTarget(projectDir);
        rootDir = target.rootDir;
        vi.mocked(resolveTarget).mockReturnValue(target);
        vi.spyOn(process, "cwd").mockReturnValue(projectDir);
        await writeSource(path.join(projectDir, "a/templates/manifest.json"), { core: "1.0.0" });
        await writeSource(path.join(projectDir, "tests/test.manifest.json"), { extra: "1.0.0", core: "5.0.0" });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await cleanup();
    });

    const rule = (name: string) => fs.readFile(path.join(rootDir, "rules", `${name}.md`), "utf8");

    it("records one source per bundle and updates each bundle from its own source", async () => {
        await executeInstall({ ...opts, bundle: "core", source: "./a" });
        await executeInstall({ ...opts, bundle: "extra", source: "./tests/test.manifest.json" });

        const lock = await readLockFixture(rootDir);
        expect(lock.bundles.core!.source).toBe("../a");
        expect(lock.bundles.extra!.source).toBe("../tests/test.manifest.json");
        await expect(fs.stat(path.join(projectDir, "a/templates/core/rules/core.md"))).resolves.toBeTruthy();

        await writeSource(path.join(projectDir, "a/templates/manifest.json"), { core: "1.1.0" });
        await executeCheck(opts);
        const report = vi.mocked(showCheckReport).mock.calls[0]![0];
        expect(report.updates.map((update) => [update.bundleName, update.availableVersion])).toEqual([
            ["core", "1.1.0"],
        ]);
        expect(report.upToDate.map((bundle) => bundle.bundleName)).toEqual(["extra"]);

        await executeUpdate(opts);
        expect(await rule("core")).toContain("core 1.1.0");
        expect(await rule("extra")).toContain("extra 1.0.0");
    });

    it("reinstalls from the lock source and switches only on explicit --source", async () => {
        await executeInstall({ ...opts, bundle: "core", source: "./a" });
        await writeSource(path.join(projectDir, "a/templates/manifest.json"), { core: "1.2.0" });

        await executeInstall({ ...opts, bundle: "core" });
        expect(await rule("core")).toContain("core 1.2.0");
        expect(vi.mocked(showInfo)).not.toHaveBeenCalledWith(expect.stringContaining("source:"));

        await executeInstall({ ...opts, bundle: "core", source: "./tests/test.manifest.json" });
        expect(await rule("core")).toContain("core 5.0.0");
        expect((await readLockFixture(rootDir)).bundles.core!.source).toBe("../tests/test.manifest.json");
        expect(vi.mocked(showInfo)).toHaveBeenCalledWith("core source: ../a → ../tests/test.manifest.json");
    });

    it("lists every bundle from an explicit --source, ignoring lock sources", async () => {
        await executeInstall({ ...opts, bundle: "core", source: "./a" });
        await fs.rm(path.join(projectDir, "a"), { recursive: true });
        const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        await executeList({ ...opts, source: "./tests/test.manifest.json", json: true });
        const { bundles } = JSON.parse(String(write.mock.calls[0]![0])) as {
            bundles: { name: string; version: string; installedVersion: string | null; source: string }[];
        };
        const core = bundles.find((bundle) => bundle.name === "core")!;
        expect([core.version, core.installedVersion, core.source]).toEqual([
            "5.0.0",
            "1.0.0",
            "../tests/test.manifest.json",
        ]);
    });

    it("lists an installed bundle missing from --source with its lock source", async () => {
        await executeInstall({ ...opts, bundle: "extra", source: "./tests/test.manifest.json" });
        const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        await executeList({ ...opts, source: "./a", json: true });
        const { bundles } = JSON.parse(String(write.mock.calls[0]![0])) as {
            bundles: { name: string; version: string | null; source: string }[];
        };
        const extra = bundles.find((bundle) => bundle.name === "extra")!;
        expect([extra.version, extra.source]).toEqual([null, "../tests/test.manifest.json"]);
    });

    it("fails on a linked directory in a local bundle without copying what it points to", async () => {
        const outside = path.join(projectDir, "outside");
        await fs.mkdir(outside);
        await fs.writeFile(path.join(outside, "core.md"), "---\ndescription: core\n---\nSECRET\n");
        const rules = path.join(projectDir, "a/templates/core/rules");
        await fs.rm(rules, { recursive: true });
        await fs.symlink(outside, rules, "junction");

        await expect(executeInstall({ ...opts, bundle: "core", source: "./a" })).rejects.toThrow(
            "Downloaded bundle 'core' is missing files listed in the manifest: rules/core.md",
        );
        const installed = await fs.readdir(rootDir, { recursive: true, withFileTypes: true }).catch(() => []);
        for (const entry of installed.filter((entry) => entry.isFile())) {
            expect(await fs.readFile(path.join(entry.parentPath, entry.name), "utf8")).not.toContain("SECRET");
        }
    });

    it("keeps --source in the printed force-retry commands", async () => {
        const bundle = ruleBundle("core", "1.0.0");
        bundle.items = [
            { source: "core/rules/a.md", target: "rules/a.md", category: "rule" },
            { source: "core/rules/b.md", target: "rules/b.md", category: "rule" },
        ];
        const manifestPath = path.join(projectDir, "a/templates/manifest.json");
        const manifest: Manifest = { schemaVersion: 1, bundles: { core: bundle } };
        const rules = path.join(projectDir, "a/templates/core/rules");
        await fs.writeFile(path.join(rules, "a.md"), "a v1\n");
        await fs.writeFile(path.join(rules, "b.md"), "b v1\n");
        await fs.writeFile(manifestPath, JSON.stringify(manifest));

        await executeInstall({ ...opts, bundle: "core", source: "./a" });
        await fs.appendFile(path.join(rootDir, "rules/a.md"), "local edit\n");
        const lockPath = path.join(rootDir, "astp.lock");
        const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
        delete lock.bundles.core.units["rules/b.md"];
        await fs.writeFile(lockPath, JSON.stringify(lock));
        await fs.writeFile(path.join(rootDir, "rules/b.md"), "not the template\n");

        await executeInstall({ ...opts, bundle: "core", source: "./a" });

        expect(vi.mocked(warnModified)).toHaveBeenCalledWith(
            [expect.objectContaining({ targetPath: "rules/a.md" })],
            "astp install core --skill rules/a.md --force --source ./a --target project",
        );
        expect(vi.mocked(warnForeign)).toHaveBeenCalledWith(
            "core",
            [expect.objectContaining({ targetPath: "rules/b.md" })],
            [],
            "project",
            "./a",
        );
    });

    it("never lets a second bundle take over a path another bundle owns", async () => {
        const shared = "---\ndescription: shared\n---\nshared v1\n";
        const writeSharedSource = async (dir: string, bundleName: string): Promise<void> => {
            const manifest: Manifest = {
                schemaVersion: 1,
                bundles: {
                    [bundleName]: {
                        name: bundleName,
                        version: "1.0.0",
                        description: bundleName,
                        default: true,
                        platforms: ["claude-code"],
                        items: [
                            {
                                source: `${bundleName}/rules/shared.md`,
                                target: "rules/shared.md",
                                category: "rule",
                            },
                        ],
                    },
                },
            };
            const rules = path.join(projectDir, dir, "templates", bundleName, "rules");
            await fs.mkdir(rules, { recursive: true });
            await fs.writeFile(path.join(rules, "shared.md"), shared);
            await fs.writeFile(path.join(projectDir, dir, "templates", "manifest.json"), JSON.stringify(manifest));
        };
        await writeSharedSource("a", "core");
        await writeSharedSource("b", "extra");

        await executeInstall({ ...opts, bundle: "core", source: "./a" });
        await executeInstall({ ...opts, bundle: "extra", source: "./b" });

        expect(vi.mocked(warnForeign)).toHaveBeenCalledWith(
            "extra",
            [{ targetPath: "rules/shared.md", kind: "file", state: "modified", owner: "core" }],
            [],
            "project",
            "./b",
        );
        let lock = await readLockFixture(rootDir);
        expect(lock.bundles.extra!.units["rules/shared.md"]).toBeUndefined();
        expect(lock.bundles.extra!.declined).toEqual(["rules/shared.md"]);

        await executeDelete({ ...opts, bundle: "core" });

        await expect(fs.access(path.join(rootDir, "rules/shared.md"))).rejects.toMatchObject({ code: "ENOENT" });
        lock = await readLockFixture(rootDir);
        expect(lock.bundles.core).toBeUndefined();
        expect(lock.bundles.extra!.units).toEqual({});
        const installed = await loadInstalled(rootDir);
        const extra = installed.bundles.find((entry) => entry.bundleName === "extra")!;
        expect(extra.units.filter((unit) => unit.state === "missing")).toEqual([]);
    });

    it("names the bundle and a fix when its lock source is gone", async () => {
        await executeInstall({ ...opts, bundle: "core", source: "./a" });
        await fs.rm(path.join(projectDir, "a"), { recursive: true });
        await expect(executeUpdate(opts)).rejects.toThrow(
            /Cannot read source '\.\.\/a' of core: .*\nTo switch source: astp install core --source <spec> --target project/s,
        );
    });
});
