import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeCheck } from "@/commands/check.js";
import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";
import {
    compareVersions,
    computeHash,
    computeSkillTreeHash,
    downloadBundle,
    fetchManifest,
    loadInstalled,
} from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    confirmDelete,
    confirmInstall,
    showCheckReport,
    warnForeign,
    warnKeptRemoved,
    warnLegacyModified,
    warnModified,
    warnReleased,
} from "@/ui/prompts.js";

import {
    cleanupDir,
    createFixtureManifest,
    createTempProject,
    makeProjectTarget,
    readLockFixture,
    setupTemplateDir,
} from "./helpers.js";

vi.mock("@/core/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/core/index.js")>();
    return { ...actual, fetchManifest: vi.fn(), downloadBundle: vi.fn() };
});

vi.mock("@/types/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/types/index.js")>();
    return { ...actual, resolveTarget: vi.fn() };
});

vi.mock("@/ui/prompts.js", () => ({
    isInteractive: vi.fn(() => false),
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundles: vi.fn(),
    selectInstalledBundles: vi.fn(),
    selectBlocks: vi.fn(),
    selectUnits: vi.fn(),
    selectNewUnits: vi.fn(),
    confirmInstall: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(true),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showCheckReport: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    warnBlockConflicts: vi.fn(),
    warnKeptBlocks: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnReleased: vi.fn(),
    warnForeign: vi.fn(),
    warnLegacyModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockConfirmDelete = vi.mocked(confirmDelete);
const mockShowCheckReport = vi.mocked(showCheckReport);
const mockWarnKeptRemoved = vi.mocked(warnKeptRemoved);
const mockWarnLegacyModified = vi.mocked(warnLegacyModified);
const mockWarnModified = vi.mocked(warnModified);
const mockWarnForeign = vi.mocked(warnForeign);
const mockWarnReleased = vi.mocked(warnReleased);

describe("E2E: skill directory units", () => {
    let projectDir: string;
    let cleanup: () => Promise<void>;
    let manifest: Manifest;
    let templateDirs: string[];

    beforeEach(async () => {
        vi.clearAllMocks();
        const project = await createTempProject();
        projectDir = project.dir;
        cleanup = project.cleanup;
        manifest = createFixtureManifest("1.0.0");
        templateDirs = [];

        mockFetchManifest.mockResolvedValue(manifest);
        mockResolveTarget.mockReturnValue(makeProjectTarget(projectDir));
        mockConfirmInstall.mockResolvedValue(true);
        mockConfirmDelete.mockResolvedValue(true);
    });

    afterEach(async () => {
        await cleanup();
        for (const dir of templateDirs) await cleanupDir(dir);
    });

    async function setupBundle(bundleName = "skillpack"): Promise<string> {
        const templateDir = await setupTemplateDir(manifest, bundleName);
        templateDirs.push(templateDir);
        mockDownloadFrom(templateDir);
        return templateDir;
    }

    function mockDownloadFrom(templateDir: string): void {
        mockDownloadBundle.mockImplementation(async () => {
            const downloadDir = await fs.mkdtemp(`${templateDir}-download-`);
            templateDirs.push(downloadDir);
            for (const entry of await fs.readdir(templateDir)) {
                await fs.cp(path.join(templateDir, entry), path.join(downloadDir, entry), { recursive: true });
            }
            return downloadDir;
        });
    }

    async function installSkillpack(): Promise<void> {
        mockFetchManifest.mockResolvedValue(manifest);
        await setupBundle();
        await executeInstall({ bundle: "skillpack", platform: "claude-code", target: "project" });
    }

    function skillRoot(): string {
        return path.join(projectDir, ".claude", "skills", "sample");
    }

    function addLegacyFields(content: string, version: string, hash: string): string {
        const fields = `astp-source: ${manifest.repository}\nastp-bundle: skillpack\nastp-version: ${version}\nastp-hash: ${hash}`;
        const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        if (frontmatter) {
            return `---\n${frontmatter[1]}\n${fields}\n---\n${content.slice(frontmatter[0].length)}`;
        }
        return `---\n${fields}\n---\n${content}`;
    }

    async function getInstalledSkillpack() {
        const installed = await loadInstalled(path.join(projectDir, ".claude"));
        return installed.bundles.find((bundle) => bundle.bundleName === "skillpack");
    }

    function orphanManifest(version: string, includeOrphans: boolean): Manifest {
        const fixture = createFixtureManifest(version);
        fixture.bundles.skillpack.items = [
            {
                source: "skillpack/skills/a/SKILL.md",
                target: "skills/a/SKILL.md",
                category: "skill",
            },
            ...(includeOrphans
                ? [
                      {
                          source: "skillpack/skills/deprecated/z/SKILL.md",
                          target: "skills/deprecated/z/SKILL.md",
                          category: "skill" as const,
                      },
                      {
                          source: "skillpack/agents/old.agent.md",
                          target: "agents/old.agent.md",
                          category: "agent" as const,
                      },
                  ]
                : []),
        ];
        return fixture;
    }

    function skillManifest(version: string, targets: string[]): Manifest {
        const fixture = createFixtureManifest(version);
        fixture.bundles.skillpack.items = targets.map((target) => ({
            source: `skillpack/${target}`,
            target,
            category: "skill",
        }));
        return fixture;
    }

    it("installs nested skills and binary assets byte-for-byte", async () => {
        const templateDir = await setupBundle();
        await executeInstall({ bundle: "skillpack", platform: "claude-code", target: "project" });

        const root = skillRoot();
        const skillContent = await fs.readFile(path.join(root, "SKILL.md"), "utf8");
        const referencePath = "skills/sample/references/touch.md";
        const reference = await fs.readFile(path.join(root, "references", "touch.md"));
        const sourceReference = await fs.readFile(path.join(templateDir, referencePath));
        const binaryPath = "skills/sample/examples/sub/deeper/data.bin";
        const binary = await fs.readFile(path.join(root, "examples", "sub", "deeper", "data.bin"));
        const sourceBinary = await fs.readFile(path.join(templateDir, binaryPath));
        const nestedSkillPath = "skills/sample/examples/sub/SKILL.md";
        const nestedSkill = await fs.readFile(path.join(root, "examples", "sub", "SKILL.md"));
        const sourceNestedSkill = await fs.readFile(path.join(templateDir, nestedSkillPath));
        const scriptPath = "skills/sample/scripts/push.sh";
        const script = await fs.readFile(path.join(root, "scripts", "push.sh"));
        const sourceScript = await fs.readFile(path.join(templateDir, scriptPath));
        const conflictsPath = "skills/sample/CONFLICTS.md";
        const conflicts = await fs.readFile(path.join(root, "CONFLICTS.md"));
        const sourceConflicts = await fs.readFile(path.join(templateDir, conflictsPath));

        expect(skillContent).toBe(await fs.readFile(path.join(templateDir, "skills/sample/SKILL.md"), "utf8"));
        expect(skillContent).not.toContain("astp-source");
        expect(reference.toString("utf8")).not.toContain("astp-source");
        expect(nestedSkill.toString("utf8")).not.toContain("astp-source");
        expect(reference).toEqual(sourceReference);
        expect(binary).toEqual(sourceBinary);
        expect(nestedSkill).toEqual(sourceNestedSkill);
        expect(script).toEqual(sourceScript);
        expect(conflicts).toEqual(sourceConflicts);
        expect(binary.includes(0)).toBe(true);
        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(lock.bundles.skillpack.units["skills/sample"]).toMatchObject({
            kind: "skill",
            hash: await computeSkillTreeHash(root),
        });
    });

    it("force reinstall removes files no longer present in the skill source", async () => {
        await installSkillpack();
        await fs.writeFile(path.join(skillRoot(), "extra.txt"), "stale");

        const manifestBundle = manifest.bundles.skillpack;
        manifestBundle.items = manifestBundle.items.filter((item) => !item.target.endsWith("data.bin"));
        const updatedTemplateDir = await setupBundle();
        await executeInstall({ force: true, bundle: "skillpack", platform: "claude-code", target: "project" });

        await expect(fs.access(path.join(skillRoot(), "extra.txt"))).rejects.toThrow();
        await expect(fs.access(path.join(skillRoot(), "examples", "sub", "deeper", "data.bin"))).rejects.toThrow();
        expect(await fs.readFile(path.join(updatedTemplateDir, "skills/sample/SKILL.md"), "utf8")).toContain("# SKILL");
    });

    it("detects tree edits, additions, and deletions as skill modifications", async () => {
        await installSkillpack();
        const getState = async () => (await getInstalledSkillpack())?.units[0]?.state;

        expect(await getState()).toBe("unmodified");

        const referencePath = path.join(skillRoot(), "references", "touch.md");
        const reference = await fs.readFile(referencePath, "utf8");
        await fs.writeFile(referencePath, `${reference}\nEdited`);
        expect(await getState()).toBe("modified");

        const nestedSkillPath = path.join(skillRoot(), "examples", "sub", "SKILL.md");
        const nestedSkill = await fs.readFile(nestedSkillPath, "utf8");
        await fs.writeFile(nestedSkillPath, `${nestedSkill}\nEdited`);
        expect(await getState()).toBe("modified");

        await fs.writeFile(path.join(skillRoot(), "added.md"), "Added");
        expect(await getState()).toBe("modified");

        await fs.rm(path.join(skillRoot(), "added.md"));
        await fs.rm(referencePath);
        expect(await getState()).toBe("modified");

        await fs.rm(skillRoot(), { recursive: true });
        expect(await getState()).toBe("missing");
    });

    it("detects edits to scripts, conflicts, and deeply nested binary files", async () => {
        await installSkillpack();
        const installRoot = path.join(projectDir, ".claude");
        const paths = [
            path.join(skillRoot(), "scripts", "push.sh"),
            path.join(skillRoot(), "CONFLICTS.md"),
            path.join(skillRoot(), "examples", "sub", "deeper", "data.bin"),
        ];

        for (const filePath of paths) {
            const original = await fs.readFile(filePath);
            await fs.writeFile(filePath, Buffer.concat([original, Buffer.from([0, 1])]));
            expect((await getInstalledSkillpack())?.units[0]?.state).toBe("modified");
            await fs.writeFile(filePath, original);
            expect((await getInstalledSkillpack())?.units[0]?.state).toBe("unmodified");
        }
    });

    it("updates an unmodified skill as one unit and drops removed upstream files", async () => {
        await installSkillpack();
        const manifestV2 = createFixtureManifest("1.1.0");
        manifestV2.bundles.skillpack.items = manifestV2.bundles.skillpack.items.filter(
            (item) => !item.target.endsWith("data.bin"),
        );
        manifest = manifestV2;
        mockFetchManifest.mockResolvedValue(manifestV2);
        const templateDir = await setupTemplateDir(manifestV2, "skillpack");
        templateDirs.push(templateDir);
        mockDownloadFrom(templateDir);

        await executeUpdate({ platform: "claude-code", target: "project" });

        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(lock.bundles.skillpack.units["skills/sample"]).toMatchObject({
            version: "1.1.0",
        });
        await expect(fs.access(path.join(skillRoot(), "examples", "sub", "deeper", "data.bin"))).rejects.toThrow();
    });

    it.each([false, true])("replaces a dropped parent skill with a nested skill (force=%s)", async (force) => {
        manifest = skillManifest("1.0.0", ["skills/a/SKILL.md"]);
        await installSkillpack();

        manifest = skillManifest("1.1.0", ["skills/a/b/SKILL.md"]);
        mockFetchManifest.mockResolvedValue(manifest);
        await setupBundle();
        await executeUpdate({ force, platform: "claude-code", target: "project" });

        const installRoot = path.join(projectDir, ".claude");
        const newSkill = await fs.readFile(path.join(installRoot, "skills", "a", "b", "SKILL.md"), "utf8");
        expect(newSkill).not.toContain("astp-source");
        expect((await readLockFixture(installRoot)).bundles.skillpack.units["skills/a/b"]).toMatchObject({
            kind: "skill",
            version: "1.1.0",
        });
        await expect(fs.access(path.join(installRoot, "skills", "a", "SKILL.md"))).rejects.toThrow();
    });

    it.each([false, true])("replaces a dropped nested skill with its parent skill (force=%s)", async (force) => {
        manifest = skillManifest("1.0.0", ["skills/a/b/SKILL.md"]);
        await installSkillpack();

        manifest = skillManifest("1.1.0", ["skills/a/SKILL.md"]);
        mockFetchManifest.mockResolvedValue(manifest);
        await setupBundle();
        await executeUpdate({ force, platform: "claude-code", target: "project" });

        const installRoot = path.join(projectDir, ".claude");
        const newSkill = await fs.readFile(path.join(installRoot, "skills", "a", "SKILL.md"), "utf8");
        expect(newSkill).not.toContain("astp-source");
        expect((await readLockFixture(installRoot)).bundles.skillpack.units["skills/a"]).toMatchObject({
            kind: "skill",
            version: "1.1.0",
        });
        await expect(fs.access(path.join(installRoot, "skills", "a", "b", "SKILL.md"))).rejects.toThrow();
    });

    it("skips a modified skill as a whole unless --force is passed", async () => {
        await installSkillpack();
        const referencePath = path.join(skillRoot(), "references", "touch.md");
        await fs.writeFile(referencePath, "User edit");
        const versionedManifest = createFixtureManifest("1.1.0");
        manifest = versionedManifest;
        mockFetchManifest.mockResolvedValue(versionedManifest);
        const templateDir = await setupTemplateDir(versionedManifest, "skillpack");
        templateDirs.push(templateDir);
        mockDownloadFrom(templateDir);

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(referencePath, "utf8")).toBe("User edit");
        const initialLock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(initialLock.bundles.skillpack.units["skills/sample"].version).toBe("1.0.0");

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });
        expect(await fs.readFile(referencePath, "utf8")).not.toBe("User edit");
        const updatedLock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(updatedLock.bundles.skillpack.units["skills/sample"].version).toBe("1.1.0");
    });

    it("retries a restored old-version skill when another skill already reached the new version", async () => {
        const targets = ["skills/a/SKILL.md", "skills/b/SKILL.md"];
        manifest = skillManifest("1.0.0", targets);
        await installSkillpack();

        const installRoot = path.join(projectDir, ".claude");
        const skillAPath = path.join(installRoot, "skills", "a", "SKILL.md");
        const originalSkillA = await fs.readFile(skillAPath);
        await fs.appendFile(skillAPath, "\nUSER EDIT");

        manifest = skillManifest("1.1.0", targets);
        mockFetchManifest.mockResolvedValue(manifest);
        const templateDir = await setupBundle();
        await fs.writeFile(
            path.join(templateDir, "skills", "a", "SKILL.md"),
            `---
name: Skill A
---
Skill A v1.1 content`,
        );
        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(skillAPath, "utf8")).toContain("USER EDIT");
        expect(compareVersions((await loadInstalled(installRoot)).bundles, manifest).updates).toHaveLength(0);

        await fs.writeFile(skillAPath, originalSkillA);
        const restoredReport = compareVersions((await loadInstalled(installRoot)).bundles, manifest);
        expect(restoredReport.updates).toHaveLength(1);
        expect(restoredReport.updates[0]).toMatchObject({
            installedVersion: "1.0.0",
            availableVersion: "1.1.0",
        });

        await executeUpdate({ platform: "claude-code", target: "project" });

        const updatedSkillA = await fs.readFile(skillAPath, "utf8");
        expect(updatedSkillA).toContain("Skill A v1.1 content");
        expect(updatedSkillA).not.toContain("astp-source");
        expect((await readLockFixture(installRoot)).bundles.skillpack.units["skills/a"]).toMatchObject({
            kind: "skill",
            version: "1.1.0",
        });
    });

    it("declines a new skill at an unmanaged directory and installs it with --skill once removed", async () => {
        await installSkillpack();
        const manifestV2 = createFixtureManifest("1.1.0");
        manifestV2.bundles.skillpack.items.push({
            source: "skillpack/skills/new/SKILL.md",
            target: "skills/new/SKILL.md",
            category: "skill",
        });
        manifest = manifestV2;
        mockFetchManifest.mockResolvedValue(manifestV2);
        const templateDir = await setupTemplateDir(manifestV2, "skillpack");
        templateDirs.push(templateDir);
        mockDownloadFrom(templateDir);
        const userFile = path.join(projectDir, ".claude", "skills", "new", "user.txt");
        await fs.mkdir(path.dirname(userFile), { recursive: true });
        await fs.writeFile(userFile, "unmanaged");

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(userFile, "utf8")).toBe("unmanaged");
        expect(mockWarnForeign).toHaveBeenCalledWith(
            "skillpack",
            [expect.objectContaining({ targetPath: "skills/new", kind: "skill" })],
            [],
            "project",
        );
        await expect(fs.access(path.join(path.dirname(userFile), "SKILL.md"))).rejects.toThrow();
        expect((await readLockFixture(path.join(projectDir, ".claude"))).bundles.skillpack.declined).toEqual([
            "skills/new",
        ]);

        await fs.rm(path.dirname(userFile), { recursive: true });
        await executeInstall({ bundle: "skillpack", skills: ["new"], platform: "claude-code", target: "project" });

        const installedSkill = await fs.readFile(path.join(path.dirname(userFile), "SKILL.md"), "utf8");
        expect(installedSkill).not.toContain("astp-source");
        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(lock.bundles.skillpack.units["skills/new"]).toMatchObject({
            version: "1.1.0",
        });
    });

    it("removes unmodified skill and file units dropped upstream with empty parents", async () => {
        manifest = orphanManifest("1.0.0", true);
        await installSkillpack();

        manifest = orphanManifest("1.1.0", false);
        mockFetchManifest.mockResolvedValue(manifest);
        await setupBundle();
        await executeUpdate({ platform: "claude-code", target: "project" });

        const installRoot = path.join(projectDir, ".claude");
        await expect(fs.access(path.join(installRoot, "skills", "deprecated"))).rejects.toThrow();
        await expect(fs.access(path.join(installRoot, "agents", "old.agent.md"))).rejects.toThrow();
        await expect(fs.access(path.join(installRoot, "agents"))).rejects.toThrow();
    });

    it("verifies the updated bundle before pruning units dropped upstream", async () => {
        manifest = orphanManifest("1.0.0", true);
        await installSkillpack();

        const orphan = path.join(projectDir, ".claude", "skills", "deprecated", "z", "SKILL.md");
        manifest = orphanManifest("1.1.0", false);
        mockFetchManifest.mockResolvedValue(manifest);
        const templateDir = await setupBundle();
        await fs.rm(path.join(templateDir, "skills", "a", "SKILL.md"));

        await expect(executeUpdate({ platform: "claude-code", target: "project" })).rejects.toThrow(/missing/i);

        await expect(fs.access(orphan)).resolves.toBeUndefined();
    });

    it("releases modified orphan skills with a warning; later --force leaves them", async () => {
        manifest = orphanManifest("1.0.0", true);
        await installSkillpack();

        const installRoot = path.join(projectDir, ".claude");
        const skillA = path.join(installRoot, "skills", "a", "SKILL.md");
        const orphanSkill = path.join(installRoot, "skills", "deprecated", "z", "SKILL.md");
        await fs.appendFile(skillA, "\nUSER EDIT");
        await fs.appendFile(orphanSkill, "\nUSER EDIT");

        manifest = orphanManifest("1.1.0", false);
        mockFetchManifest.mockResolvedValue(manifest);
        await setupBundle();
        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(orphanSkill, "utf8")).toContain("USER EDIT");
        expect(mockWarnReleased).toHaveBeenCalledWith(
            [expect.objectContaining({ targetPath: "skills/deprecated/z", kind: "skill", state: "modified" })],
            [],
        );
        expect(mockWarnKeptRemoved).not.toHaveBeenCalled();

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });
        expect(await fs.readFile(orphanSkill, "utf8")).toContain("USER EDIT");
    });

    it("leaves a released orphan skill alone after its content is restored", async () => {
        manifest = orphanManifest("1.0.0", true);
        await installSkillpack();

        const installRoot = path.join(projectDir, ".claude");
        const orphanSkill = path.join(installRoot, "skills", "deprecated", "z", "SKILL.md");
        const originalContent = await fs.readFile(orphanSkill, "utf8");
        await fs.appendFile(orphanSkill, "\nUSER EDIT");

        manifest = orphanManifest("1.1.0", false);
        mockFetchManifest.mockResolvedValue(manifest);
        await setupBundle();
        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(orphanSkill, "utf8")).toContain("USER EDIT");
        await fs.writeFile(orphanSkill, originalContent);
        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(orphanSkill, "utf8")).toBe(originalContent);
    });

    async function writeLegacyInstall(singleFile = false): Promise<void> {
        const templateDir = await setupBundle();
        const root = skillRoot();
        await fs.mkdir(root, { recursive: true });
        const items = manifest.bundles.skillpack.items.filter(
            (item) => !singleFile || item.target === "skills/sample/SKILL.md",
        );
        for (const item of items) {
            const sourcePath = path.join(templateDir, item.target);
            const targetPath = path.join(projectDir, ".claude", item.target);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            if (!item.target.endsWith(".md")) {
                await fs.copyFile(sourcePath, targetPath);
                continue;
            }
            const content = await fs.readFile(sourcePath, "utf8");
            const oldHash = computeHash(content);
            await fs.writeFile(targetPath, addLegacyFields(content, manifest.bundles.skillpack.version, oldHash));
        }
    }

    it("reports modified legacy skills and preserves them during an update until forced", async () => {
        await writeLegacyInstall();
        const bundle = (await getInstalledSkillpack())!;
        expect(bundle.units).toHaveLength(1);
        expect(bundle.units[0]).toMatchObject({
            kind: "skill",
            origin: "legacy",
            state: "modified",
            relativePath: "skills/sample",
        });

        await executeCheck({ platform: "claude-code", target: "project" });
        expect(mockShowCheckReport).toHaveBeenCalled();
        expect(mockShowCheckReport.mock.calls[0][0].legacySkills).toContainEqual({
            bundleName: "skillpack",
            targetPath: "skills/sample",
            kind: "skill",
            clean: false,
            inManifest: true,
        });

        manifest = createFixtureManifest("1.1.0");
        mockFetchManifest.mockResolvedValue(manifest);
        const templateDir = await setupBundle();
        mockDownloadFrom(templateDir);
        await executeUpdate({ platform: "claude-code", target: "project" });
        expect(mockWarnLegacyModified).toHaveBeenCalledWith(expect.any(Array), "project");
        expect((await getInstalledSkillpack())?.units[0]).toMatchObject({ origin: "legacy", version: "1.0.0" });

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });
        const skillContent = await fs.readFile(path.join(skillRoot(), "SKILL.md"), "utf8");
        expect(skillContent).not.toContain("astp-source");
        expect(await fs.readFile(path.join(skillRoot(), "references", "touch.md"), "utf8")).not.toContain(
            "astp-source",
        );
        expect(await fs.readFile(path.join(skillRoot(), "examples", "sub", "SKILL.md"), "utf8")).not.toContain(
            "astp-source",
        );
        expect((await getInstalledSkillpack())?.units[0]).toMatchObject({
            kind: "skill",
            origin: "lock",
            state: "unmodified",
            version: "1.1.0",
        });
        const lock = await readLockFixture(path.join(projectDir, ".claude"));
        expect(lock.bundles.skillpack.units["skills/sample"].hash).toBe(await computeSkillTreeHash(skillRoot()));
    });

    it("recognizes and migrates a clean single-file legacy skill", async () => {
        await writeLegacyInstall(true);
        const bundle = (await getInstalledSkillpack())!;
        expect(bundle.units).toHaveLength(1);
        expect(bundle.units[0]).toMatchObject({ kind: "skill", origin: "legacy", state: "unmodified" });

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect((await getInstalledSkillpack())?.units[0]).toMatchObject({
            kind: "skill",
            origin: "lock",
            state: "unmodified",
        });
        expect(await fs.readFile(path.join(skillRoot(), "SKILL.md"), "utf8")).not.toContain("astp-source");
    });

    it("skips legacy skill deletion unless forced, then removes its whole directory", async () => {
        await writeLegacyInstall();

        await executeDelete({ bundle: "skillpack", platform: "claude-code", target: "project" });
        await expect(fs.access(path.join(skillRoot(), "SKILL.md"))).resolves.toBeUndefined();
        expect(mockWarnKeptRemoved).toHaveBeenCalled();

        await executeDelete({ bundle: "skillpack", force: true, platform: "claude-code", target: "project" });
        await expect(fs.access(skillRoot())).rejects.toThrow();
    });
});
