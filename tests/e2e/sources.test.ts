import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeCheck } from "@/commands/check.js";
import { executeInstall } from "@/commands/install.js";
import { executeList } from "@/commands/list.js";
import { executeUpdate } from "@/commands/update.js";
import type { Bundle, Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import { showCheckReport, showInfo } from "@/ui/prompts.js";

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
    selectUnits: vi.fn(),
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

    it("names the bundle and a fix when its lock source is gone", async () => {
        await executeInstall({ ...opts, bundle: "core", source: "./a" });
        await fs.rm(path.join(projectDir, "a"), { recursive: true });
        await expect(executeUpdate(opts)).rejects.toThrow(
            /Cannot read source '\.\.\/a' of core: .*\nTo switch source: astp install core --source <spec> --target project/s,
        );
    });
});
