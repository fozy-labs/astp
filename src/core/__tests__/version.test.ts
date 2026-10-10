import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InstalledBundle, InstalledUnit, Manifest } from "@/types/index.js";

import { computeHash } from "../frontmatter.js";
import { writeLock } from "../lock.js";
import { computeSkillTreeHash } from "../skill-tree.js";
import { compareVersions, loadInstalled } from "../version.js";

describe("loadInstalled", () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-installed-"));
    });

    afterEach(async () => {
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    it("reports lock units as unmodified, modified, missing, and kind-mismatched", async () => {
        await fs.mkdir(path.join(rootDir, "skills/sample"), { recursive: true });
        await fs.mkdir(path.join(rootDir, "as-dir"));
        await fs.writeFile(path.join(rootDir, "skills/sample/SKILL.md"), "# Sample\n");
        await fs.writeFile(path.join(rootDir, "changed.md"), "edited");
        await writeLock(rootDir, {
            schemaVersion: 1,
            bundles: {
                core: {
                    source: "repo",
                    declined: [],
                    units: {
                        "skills/sample": {
                            kind: "skill",
                            version: "1.0.0",
                            hash: await computeSkillTreeHash(path.join(rootDir, "skills/sample")),
                        },
                        "changed.md": { kind: "file", version: "1.0.0", hash: "wrong" },
                        "missing.md": { kind: "file", version: "1.0.0", hash: "gone" },
                        "as-dir": { kind: "file", version: "1.0.0", hash: "wrong" },
                    },
                },
            },
        });

        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ relativePath: "skills/sample", state: "unmodified" }),
                expect.objectContaining({ relativePath: "changed.md", state: "modified" }),
                expect.objectContaining({ relativePath: "missing.md", state: "missing" }),
                expect.objectContaining({ relativePath: "as-dir", state: "modified" }),
            ]),
        );
    });

    it("finds clean and modified legacy file units", async () => {
        const cleanContent = "---\nname: clean\n---\n# clean\n";
        const clean = `---\nname: clean\nastp-source: repo\nastp-bundle: core\nastp-version: 0.3.1\nastp-hash: ${computeHash(cleanContent)}\n---\n# clean\n`;
        await fs.mkdir(path.join(rootDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(rootDir, "agents/clean.md"), clean);
        await fs.writeFile(
            path.join(rootDir, "agents/changed.md"),
            clean.replaceAll("clean", "changed") + "\nlocal edit",
        );
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ relativePath: "agents/clean.md", origin: "legacy", state: "unmodified" }),
                expect.objectContaining({ relativePath: "agents/changed.md", origin: "legacy", state: "modified" }),
            ]),
        );
    });

    it("detects clean legacy skills in the per-file and root-tree formats", async () => {
        const v031 = path.join(rootDir, "skills", "v031");
        await fs.mkdir(v031, { recursive: true });
        const addLegacyFields = (content: string, version: string) => {
            const hash = computeHash(content);
            return `---\nastp-source: repo\nastp-bundle: core\nastp-version: ${version}\nastp-hash: ${hash}\n---\n${content}`;
        };
        const v031Root = "# v031 skill\n";
        const v031Reference = "# reference\n";
        await fs.writeFile(path.join(v031, "SKILL.md"), addLegacyFields(v031Root, "0.3.1"));
        await fs.writeFile(path.join(v031, "reference.md"), addLegacyFields(v031Reference, "0.3.1"));

        const issue8 = path.join(rootDir, "skills", "issue8");
        await fs.mkdir(issue8, { recursive: true });
        const issue8Root = "---\nname: issue8\n---\n# issue8\n";
        await fs.writeFile(path.join(issue8, "SKILL.md"), issue8Root);
        const treeHash = await computeSkillTreeHash(issue8);
        await fs.writeFile(
            path.join(issue8, "SKILL.md"),
            `---\nname: issue8\nastp-source: repo\nastp-bundle: core\nastp-version: 0.4.0\nastp-hash: ${treeHash}\n---\n# issue8\n`,
        );

        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ relativePath: "skills/v031", kind: "skill", state: "unmodified" }),
                expect.objectContaining({ relativePath: "skills/issue8", kind: "skill", state: "unmodified" }),
            ]),
        );
    });

    it("keeps a lock-tracked skill unmodified when OS clutter files appear", async () => {
        const skillDir = path.join(rootDir, "skills", "sample");
        await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
        await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Sample\n");
        await writeLock(rootDir, {
            schemaVersion: 1,
            bundles: {
                core: {
                    source: "repo",
                    declined: [],
                    units: {
                        "skills/sample": {
                            kind: "skill",
                            version: "1.0.0",
                            hash: await computeSkillTreeHash(skillDir),
                        },
                    },
                },
            },
        });
        await fs.writeFile(path.join(skillDir, ".DS_Store"), "clutter");
        await fs.writeFile(path.join(skillDir, "references", "Thumbs.db"), "clutter");

        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toContainEqual(
            expect.objectContaining({ relativePath: "skills/sample", state: "unmodified" }),
        );
    });

    it("marks modified legacy skills as modified", async () => {
        const skillDir = path.join(rootDir, "skills", "sample");
        await fs.mkdir(skillDir, { recursive: true });
        const content = "# sample\n";
        await fs.writeFile(
            path.join(skillDir, "SKILL.md"),
            `---\nastp-source: repo\nastp-bundle: core\nastp-version: 0.3.1\nastp-hash: ${computeHash(content)}\n---\n${content}`,
        );
        await fs.writeFile(
            path.join(skillDir, "reference.md"),
            `---\nastp-source: repo\nastp-bundle: core\nastp-version: 0.3.1\nastp-hash: ${computeHash("# original\n")}\n---\n# edited\n`,
        );
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toContainEqual(
            expect.objectContaining({ relativePath: "skills/sample", kind: "skill", state: "modified" }),
        );
    });
});

describe("compareVersions", () => {
    const createManifest = (bundleVersion: string): Manifest => ({
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            pipeline: {
                name: "pipeline",
                version: bundleVersion,
                description: "Pipeline",
                default: false,
                items: [{ source: "pipeline/agents/a.md", target: "agents/a.md", category: "agent" }],
            },
        },
    });

    const createUnit = (
        version: string,
        relativePath = "agents/a.md",
        state: InstalledUnit["state"] = "unmodified",
        origin: InstalledUnit["origin"] = "lock",
        kind: InstalledUnit["kind"] = "file",
    ): InstalledUnit => ({ kind, relativePath, version, state, origin });

    const createInstalled = (version: string, units = [createUnit(version)]): InstalledBundle[] => [
        { bundleName: "pipeline", version, units, declined: [] },
    ];

    it("detects an update when the manifest version is newer", () => {
        const report = compareVersions(createInstalled("1.0.0"), createManifest("1.2.0"));
        expect(report.updates).toHaveLength(1);
        expect(report.updates[0]).toMatchObject({ installedVersion: "1.0.0", availableVersion: "1.2.0" });
    });

    it("reports up to date when versions match", () => {
        const report = compareVersions(createInstalled("1.0.0"), createManifest("1.0.0"));
        expect(report.upToDate).toHaveLength(1);
        expect(report.updates).toHaveLength(0);
    });

    it("reports a same-version bundle as an update when a manifest unit is new", () => {
        const manifest = createManifest("1.0.0");
        manifest.bundles.pipeline!.items.push({
            source: "pipeline/agents/b.md",
            target: "agents/b.md",
            category: "agent",
        });

        const report = compareVersions(createInstalled("1.0.0"), manifest);
        expect(report.updates).toHaveLength(1);
        expect(report.updates[0]?.units).toContainEqual({
            targetPath: "agents/b.md",
            kind: "file",
            state: "new",
        });
    });

    it("reports a same-version bundle as an update when an installed unit is orphaned", () => {
        const manifest = createManifest("1.0.0");
        manifest.bundles.pipeline!.items = [];

        const report = compareVersions(createInstalled("1.0.0"), manifest);
        expect(report.updates).toHaveLength(1);
        expect(report.updates[0]?.units).toContainEqual({
            targetPath: "agents/a.md",
            kind: "file",
            state: "removed",
        });
    });

    it("does not downgrade when the installed version is newer", () => {
        const report = compareVersions(createInstalled("2.0.0"), createManifest("1.0.0"));
        expect(report.upToDate).toHaveLength(1);
        expect(report.updates).toHaveLength(0);
    });

    it("does not downgrade an installed-newer bundle when a manifest unit is new", () => {
        const manifest = createManifest("1.0.0");
        manifest.bundles.pipeline!.items.push({
            source: "pipeline/agents/b.md",
            target: "agents/b.md",
            category: "agent",
        });

        const report = compareVersions(createInstalled("2.0.0"), manifest);
        expect(report.upToDate).toHaveLength(1);
        expect(report.updates).toHaveLength(0);
    });

    it("handles invalid semver as an available update", () => {
        const report = compareVersions(createInstalled("not-a-version"), createManifest("1.0.0"));
        expect(report.updates).toHaveLength(1);
    });

    it("treats a bundle with only declined units as up to date", () => {
        const report = compareVersions(
            [{ bundleName: "pipeline", version: "", units: [], declined: ["agents/a.md"] }],
            createManifest("1.0.0"),
        );
        expect(report.upToDate).toHaveLength(1);
        expect(report.updates).toHaveLength(0);
    });

    it("offers an update when a declined-only bundle has a new unit upstream", () => {
        const manifest = createManifest("1.0.0");
        manifest.bundles.pipeline!.items.push({
            source: "pipeline/agents/b.md",
            target: "agents/b.md",
            category: "agent",
        });
        const report = compareVersions(
            [{ bundleName: "pipeline", version: "", units: [], declined: ["agents/a.md"] }],
            manifest,
        );
        expect(report.updates).toHaveLength(1);
        expect(report.updates[0]?.units).toContainEqual({
            targetPath: "agents/b.md",
            kind: "file",
            state: "new",
        });
    });

    it("classifies bundles missing from the manifest as not in the manifest", () => {
        const manifest: Manifest = {
            schemaVersion: 1,
            repository: "fozy-labs/astp",
            bundles: {
                core: {
                    name: "core",
                    version: "1.0.0",
                    description: "Core",
                    default: true,
                    items: [],
                },
            },
        };
        const report = compareVersions(createInstalled("1.0.0"), manifest);
        expect(report.notInManifest).toHaveLength(1);
        expect(report.notInManifest[0]?.bundleName).toBe("pipeline");
    });

    it("reports legacy units with cleanliness and manifest membership", () => {
        const manifest = createManifest("1.0.0");
        manifest.bundles.pipeline!.items.push({
            source: "pipeline/skills/sample/SKILL.md",
            target: "skills/sample/SKILL.md",
            category: "skill",
        });
        const report = compareVersions(
            [
                {
                    bundleName: "pipeline",
                    version: "1.0.0",
                    units: [
                        createUnit("1.0.0", "skills/sample", "unmodified", "legacy", "skill"),
                        createUnit("1.0.0", "skills/removed", "modified", "legacy", "skill"),
                    ],
                    declined: [],
                },
                {
                    bundleName: "retired",
                    version: "1.0.0",
                    units: [createUnit("1.0.0", "skills/retired", "unmodified", "legacy", "skill")],
                    declined: [],
                },
            ],
            manifest,
        );
        expect(report.legacySkills).toEqual([
            { bundleName: "pipeline", targetPath: "skills/sample", kind: "skill", clean: true, inManifest: true },
            { bundleName: "pipeline", targetPath: "skills/removed", kind: "skill", clean: false, inManifest: false },
            { bundleName: "retired", targetPath: "skills/retired", kind: "skill", clean: true, inManifest: false },
        ]);
    });
});

describe("loadInstalled legacy compatibility", () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-legacy-"));
    });

    afterEach(async () => {
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    async function writeLegacyFile(
        relativePath: string,
        version: string,
        content: string,
        hash = computeHash(content),
    ) {
        const filePath = path.join(rootDir, relativePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(
            filePath,
            `---\nastp-source: fozy-labs/astp\nastp-bundle: pipeline\nastp-version: ${version}\nastp-hash: ${hash}\n---\n${content}`,
        );
        return filePath;
    }

    async function writeLegacySkill(relativePath: string, version: string, content: string, modified = false) {
        const skillDir = path.join(rootDir, relativePath);
        await fs.mkdir(skillDir, { recursive: true });
        const filePath = await writeLegacyFile(path.join(relativePath, "SKILL.md"), version, content);
        if (modified) await fs.appendFile(filePath, "\nlocal edit");
    }

    it("treats a legacy file with a matching hash as unmodified", async () => {
        const content = "---\nname: test\n---\nBody";
        await writeLegacyFile("agents/agent.md", "1.0.0", content);
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toContainEqual(
            expect.objectContaining({ relativePath: "agents/agent.md", origin: "legacy", state: "unmodified" }),
        );
    });

    it("treats a legacy file with a mismatching hash as modified", async () => {
        const content = "---\nname: test\n---\nBody";
        const filePath = await writeLegacyFile("agents/agent.md", "1.0.0", content);
        await fs.appendFile(filePath, "\nlocal edit");
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toContainEqual(
            expect.objectContaining({ relativePath: "agents/agent.md", origin: "legacy", state: "modified" }),
        );
    });

    it("treats a legacy file without a hash as modified", async () => {
        await writeLegacyFile("agents/agent.md", "1.0.0", "Agent", "");
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toContainEqual(
            expect.objectContaining({ relativePath: "agents/agent.md", origin: "legacy", state: "modified" }),
        );
    });

    it("scans legacy units but excludes unmanaged files", async () => {
        const content = "---\nname: managed\n---\nBody";
        await writeLegacyFile("agents/managed-a.md", "1.0.0", content);
        await writeLegacyFile("agents/managed-b.md", "1.0.0", content);
        await fs.mkdir(path.join(rootDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(rootDir, "agents/custom.md"), "---\nname: custom\n---\nBody");

        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles).toHaveLength(1);
        expect(loaded.bundles[0]?.units.map((unit) => unit.relativePath)).toEqual([
            "agents/managed-a.md",
            "agents/managed-b.md",
        ]);
    });

    it("ignores astp-tagged files outside the install layout", async () => {
        const content = "---\nname: x\n---\nBody";
        await writeLegacySkill("skills/a", "1.0.0", "# a\n");
        await writeLegacyFile("agents/g.md", "1.0.0", content);

        await writeLegacySkill("worktrees/feat/.claude/skills/a", "1.0.0", "# a\n");
        await writeLegacyFile("worktrees/feat/.claude/agents/g.md", "1.0.0", content);
        await writeLegacySkill("plugins/marketplaces/x/skills/a", "1.0.0", "# a\n");
        await writeLegacyFile("notes.md", "1.0.0", content);
        await fs.mkdir(path.join(rootDir, "skills/b/references"), { recursive: true });
        await fs.writeFile(path.join(rootDir, "skills/b/SKILL.md"), "---\nname: b\n---\n# b\n");
        await writeLegacyFile("skills/b/references/r.md", "1.0.0", content);

        const loaded = await loadInstalled(rootDir);
        const paths = loaded.bundles.flatMap((bundle) => bundle.units.map((unit) => unit.relativePath)).sort();
        expect(paths).toEqual(["agents/g.md", "skills/a"]);
    });

    it("keeps a legacy skill clean when an OS clutter file appears", async () => {
        await writeLegacySkill("skills/a", "0.3.1", "# a\n");
        await fs.writeFile(path.join(rootDir, "skills/a/.DS_Store"), "clutter");

        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toContainEqual(
            expect.objectContaining({ relativePath: "skills/a", origin: "legacy", state: "unmodified" }),
        );
    });

    it("compares a legacy unit and a new manifest unit against the manifest", async () => {
        await writeLegacyFile("agents/a.md", "1.0.0", "Agent");
        const installed = await loadInstalled(rootDir);
        const manifest: Manifest = {
            schemaVersion: 1,
            repository: "fozy-labs/astp",
            bundles: {
                pipeline: {
                    name: "pipeline",
                    version: "2.0.0",
                    description: "Pipeline",
                    default: false,
                    items: [
                        { source: "pipeline/agents/a.md", target: "agents/a.md", category: "agent" },
                        { source: "pipeline/agents/new.md", target: "agents/new.md", category: "agent" },
                    ],
                },
            },
        };
        const report = compareVersions(installed.bundles, manifest);
        expect(report.updates[0]?.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ targetPath: "agents/a.md", state: "legacy" }),
                expect.objectContaining({ targetPath: "agents/new.md", state: "new" }),
            ]),
        );
    });

    it("chooses the oldest version among clean legacy units", async () => {
        await writeLegacySkill("skills/a", "1.0.0", "# a\n");
        await writeLegacyFile("agents/b.md", "1.1.0", "b");
        await writeLegacyFile("agents/c.md", "1.1.0", "c");
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toHaveLength(3);
        expect(loaded.bundles[0]?.version).toBe("1.0.0");
    });

    it("ignores modified old units when choosing the bundle version", async () => {
        await writeLegacySkill("skills/a", "1.0.0", "# a\n", true);
        await writeLegacyFile("agents/b.md", "1.1.0", "b");
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.version).toBe("1.1.0");
    });

    it("uses the newest version when every installed unit is modified", async () => {
        const oldFile = await writeLegacyFile("agents/a.md", "1.0.0", "a");
        const newFile = await writeLegacyFile("agents/b.md", "1.1.0", "b");
        await fs.appendFile(oldFile, "\nedit");
        await fs.appendFile(newFile, "\nedit");
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.version).toBe("1.1.0");
    });

    it("uses the newest version when the other installed file units are modified", async () => {
        for (let index = 0; index < 5; index++) {
            const version = index === 4 ? "1.1.0" : "1.0.0";
            const filePath = await writeLegacyFile(`agents/${index}.md`, version, `Agent ${index}`);
            if (index < 4) await fs.appendFile(filePath, "\nEdited");
        }
        const loaded = await loadInstalled(rootDir);
        expect(loaded.bundles[0]?.units).toHaveLength(5);
        expect(loaded.bundles[0]?.units.filter((unit) => unit.version === "1.0.0")).toHaveLength(4);
        expect(loaded.bundles[0]?.version).toBe("1.1.0");
    });
});

describe("loadInstalled with blocks", () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-version-blocks-"));
    });

    afterEach(async () => {
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    const TEMPLATE_FM = "---\ndescription: d\n---\n";
    const BLOCK_CONTENT = "text\n";
    // import lazily to keep the top import list untouched
    async function lockUnitFor(extra: Record<string, unknown> = {}) {
        const { frontmatterHash, blockHash } = await import("../blocks.js");
        return {
            kind: "file" as const,
            version: "1.0.0",
            hash: frontmatterHash(TEMPLATE_FM),
            blocks: { "rules/x.md#a": blockHash(BLOCK_CONTENT) },
            declinedBlocks: ["rules/x.md#gone"],
            ...extra,
        };
    }

    async function setup(content: string) {
        await fs.mkdir(path.join(rootDir, "rules"), { recursive: true });
        await fs.writeFile(path.join(rootDir, "rules/x.md"), content);
        await writeLock(rootDir, {
            schemaVersion: 1,
            bundles: {
                core: {
                    source: "repo",
                    declined: [],
                    units: { "rules/x.md": await lockUnitFor() },
                },
            },
        });
        const loaded = await loadInstalled(rootDir);
        return loaded.bundles[0]!.units[0]!;
    }

    const CLEAN = `${TEMPLATE_FM}\n<a>\n${BLOCK_CONTENT}</a>\n`;

    it("reports a clean block file as unmodified with no missing/dirty", async () => {
        const unit = await setup(CLEAN);
        expect(unit.state).toBe("unmodified");
        expect(unit.blocks).toEqual({ missing: false, dirty: false, edited: [] });
    });

    it("a filled block is dirty but still unmodified", async () => {
        const unit = await setup(CLEAN.replace("text", "filled"));
        expect(unit.state).toBe("unmodified");
        expect(unit.blocks).toEqual({ missing: false, dirty: true, edited: ["rules/x.md#a"] });
    });

    it("consumer text outside blocks is dirty but edits no block", async () => {
        const unit = await setup(`${CLEAN}extra\n`);
        expect(unit.blocks).toEqual({ missing: false, dirty: true, edited: [] });
    });

    it("a deleted block is missing, not modified", async () => {
        const unit = await setup(`${TEMPLATE_FM}\n`);
        expect(unit.state).toBe("unmodified");
        expect(unit.blocks).toEqual({ missing: true, dirty: false, edited: [] });
    });

    it("an unparseable file is modified", async () => {
        const unit = await setup(`${TEMPLATE_FM}\n<a>\n${BLOCK_CONTENT}`);
        expect(unit.state).toBe("modified");
    });

    it("edited frontmatter is modified", async () => {
        const unit = await setup(CLEAN.replace("description: d", "description: other"));
        expect(unit.state).toBe("modified");
    });
});
