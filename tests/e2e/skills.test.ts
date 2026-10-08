import fs from "node:fs/promises";
import path from "node:path";

import { vi } from "vitest";

import { executeCheck } from "@/commands/check.js";
import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { executeUpdate } from "@/commands/update.js";
import {
    computeHash,
    computeSkillTreeHash,
    detectModified,
    downloadBundle,
    extractAstpMetadata,
    fetchManifest,
    injectAstpFields,
    scanInstalled,
} from "@/core/index.js";
import type { Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    confirmDelete,
    confirmInstall,
    showCheckReport,
    showInfo,
    warnLegacySkills,
    warnModified,
} from "@/ui/prompts.js";

import { cleanupDir, createFixtureManifest, createTempProject, makeProjectTarget, setupTemplateDir } from "./helpers.js";

vi.mock("@/core/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/core/index.js")>();
    return { ...actual, fetchManifest: vi.fn(), downloadBundle: vi.fn() };
});

vi.mock("@/types/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/types/index.js")>();
    return { ...actual, resolveTarget: vi.fn() };
});

vi.mock("@/ui/prompts.js", () => ({
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectBundles: vi.fn(),
    selectInstalledBundles: vi.fn(),
    confirmInstall: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(true),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showCheckReport: vi.fn(),
    showUpdateReport: vi.fn(),
    warnModified: vi.fn(),
    warnLegacySkills: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockConfirmDelete = vi.mocked(confirmDelete);
const mockShowCheckReport = vi.mocked(showCheckReport);
const mockShowInfo = vi.mocked(showInfo);
const mockWarnLegacySkills = vi.mocked(warnLegacySkills);
const mockWarnModified = vi.mocked(warnModified);

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
        mockDownloadBundle.mockResolvedValue(templateDir);
        return templateDir;
    }

    async function installSkillpack(): Promise<void> {
        await setupBundle();
        await executeInstall({ bundle: "skillpack", platform: "claude-code", target: "project" });
    }

    function skillRoot(): string {
        return path.join(projectDir, ".claude", "skills", "sample");
    }

    it("writes metadata only to SKILL.md and copies every other file byte-for-byte", async () => {
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

        expect(extractAstpMetadata(skillContent)).not.toBeNull();
        expect(extractAstpMetadata(reference.toString("utf8"))).toBeNull();
        expect(extractAstpMetadata(nestedSkill.toString("utf8"))).toBeNull();
        expect(reference).toEqual(sourceReference);
        expect(binary).toEqual(sourceBinary);
        expect(nestedSkill).toEqual(sourceNestedSkill);
        expect(script).toEqual(sourceScript);
        expect(conflicts).toEqual(sourceConflicts);
        expect(binary.includes(0)).toBe(true);
        expect(extractAstpMetadata(skillContent)?.hash).toBe(await computeSkillTreeHash(root));
    });

    it("reinstall removes files no longer present in the skill source", async () => {
        await installSkillpack();
        await fs.writeFile(path.join(skillRoot(), "extra.txt"), "stale");

        const manifestBundle = manifest.bundles.skillpack;
        manifestBundle.items = manifestBundle.items.filter((item) => !item.target.endsWith("data.bin"));
        const updatedTemplateDir = await setupBundle();
        await executeInstall({ bundle: "skillpack", platform: "claude-code", target: "project" });

        await expect(fs.access(path.join(skillRoot(), "extra.txt"))).rejects.toThrow();
        await expect(fs.access(path.join(skillRoot(), "examples", "sub", "deeper", "data.bin"))).rejects.toThrow();
        expect(await fs.readFile(path.join(updatedTemplateDir, "skills/sample/SKILL.md"), "utf8")).toContain("# SKILL");
    });

    it("detects tree edits, additions, and deletions as skill modifications", async () => {
        await installSkillpack();
        const bundle = (await scanInstalled(path.join(projectDir, ".claude"))).find((entry) => entry.bundleName === "skillpack")!;

        await expect(detectModified(bundle, path.join(projectDir, ".claude"))).resolves.toMatchObject([
            { targetPath: "skills/sample", kind: "skill", state: "unmodified" },
        ]);

        const referencePath = path.join(skillRoot(), "references", "touch.md");
        const reference = await fs.readFile(referencePath, "utf8");
        await fs.writeFile(referencePath, `${reference}\nEdited`);
        await expect(detectModified(bundle, path.join(projectDir, ".claude"))).resolves.toMatchObject([{ state: "modified" }]);

        const nestedSkillPath = path.join(skillRoot(), "examples", "sub", "SKILL.md");
        const nestedSkill = await fs.readFile(nestedSkillPath, "utf8");
        await fs.writeFile(nestedSkillPath, `${nestedSkill}\nEdited`);
        await expect(detectModified(bundle, path.join(projectDir, ".claude"))).resolves.toMatchObject([{ state: "modified" }]);

        await fs.writeFile(path.join(skillRoot(), "added.md"), "Added");
        await expect(detectModified(bundle, path.join(projectDir, ".claude"))).resolves.toMatchObject([{ state: "modified" }]);

        await fs.rm(path.join(skillRoot(), "added.md"));
        await fs.rm(referencePath);
        await expect(detectModified(bundle, path.join(projectDir, ".claude"))).resolves.toMatchObject([{ state: "modified" }]);

        await fs.rm(skillRoot(), { recursive: true });
        await expect(detectModified(bundle, path.join(projectDir, ".claude"))).resolves.toMatchObject([{ state: "modified" }]);
    });

    it("detects edits to scripts, conflicts, and deeply nested binary files", async () => {
        await installSkillpack();
        const installRoot = path.join(projectDir, ".claude");
        const bundle = (await scanInstalled(installRoot)).find((entry) => entry.bundleName === "skillpack")!;
        const paths = [
            path.join(skillRoot(), "scripts", "push.sh"),
            path.join(skillRoot(), "CONFLICTS.md"),
            path.join(skillRoot(), "examples", "sub", "deeper", "data.bin"),
        ];

        for (const filePath of paths) {
            const original = await fs.readFile(filePath);
            await fs.writeFile(filePath, Buffer.concat([original, Buffer.from([0, 1])]));
            await expect(detectModified(bundle, installRoot)).resolves.toMatchObject([{ state: "modified" }]);
            await fs.writeFile(filePath, original);
            await expect(detectModified(bundle, installRoot)).resolves.toMatchObject([{ state: "unmodified" }]);
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
        mockDownloadBundle.mockResolvedValue(templateDir);

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(extractAstpMetadata(await fs.readFile(path.join(skillRoot(), "SKILL.md"), "utf8"))?.version).toBe("1.1.0");
        await expect(fs.access(path.join(skillRoot(), "examples", "sub", "deeper", "data.bin"))).rejects.toThrow();
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
        mockDownloadBundle.mockResolvedValue(templateDir);

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(referencePath, "utf8")).toBe("User edit");
        expect(extractAstpMetadata(await fs.readFile(path.join(skillRoot(), "SKILL.md"), "utf8"))?.version).toBe("1.0.0");

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });
        expect(await fs.readFile(referencePath, "utf8")).not.toBe("User edit");
        expect(extractAstpMetadata(await fs.readFile(path.join(skillRoot(), "SKILL.md"), "utf8"))?.version).toBe("1.1.0");
    });

    it("preserves an unmanaged skill directory that collides with a new update unit", async () => {
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
        mockDownloadBundle.mockResolvedValue(templateDir);
        const userFile = path.join(projectDir, ".claude", "skills", "new", "user.txt");
        await fs.mkdir(path.dirname(userFile), { recursive: true });
        await fs.writeFile(userFile, "unmanaged");

        await executeUpdate({ platform: "claude-code", target: "project" });

        expect(await fs.readFile(userFile, "utf8")).toBe("unmanaged");
        expect(mockWarnModified).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ targetPath: "skills/new", kind: "skill" })]),
        );
        await expect(fs.access(path.join(path.dirname(userFile), "SKILL.md"))).rejects.toThrow();
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
            const metadata = { source: manifest.repository, bundle: "skillpack", version: manifest.bundles.skillpack.version };
            await fs.writeFile(targetPath, injectAstpFields(content, metadata, oldHash));
        }
    }

    it("reports legacy skills and skips them on same-version update without force", async () => {
        await writeLegacyInstall();
        const scanned = await scanInstalled(path.join(projectDir, ".claude"));
        const bundle = scanned.find((entry) => entry.bundleName === "skillpack")!;
        expect(bundle.units).toHaveLength(1);
        expect(bundle.units[0]).toMatchObject({ kind: "skill", legacy: true, relativePath: "skills/sample" });

        await executeCheck({ platform: "claude-code", target: "project" });
        expect(mockShowCheckReport).toHaveBeenCalled();
        expect(mockShowCheckReport.mock.calls[0][0].legacySkills).toContainEqual({
            bundleName: "skillpack",
            targetPath: "skills/sample",
            inManifest: true,
        });

        await executeUpdate({ platform: "claude-code", target: "project" });
        expect(mockWarnLegacySkills).toHaveBeenCalled();
        expect(mockShowInfo).not.toHaveBeenCalledWith("All bundles up to date.");
        expect(extractAstpMetadata(await fs.readFile(path.join(skillRoot(), "SKILL.md"), "utf8"))?.version).toBe("1.0.0");

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });
        const skillContent = await fs.readFile(path.join(skillRoot(), "SKILL.md"), "utf8");
        expect(extractAstpMetadata(skillContent)?.hash).toBe(await computeSkillTreeHash(skillRoot()));
        expect(extractAstpMetadata(await fs.readFile(path.join(skillRoot(), "references", "touch.md"), "utf8"))).toBeNull();
        expect(
            extractAstpMetadata(await fs.readFile(path.join(skillRoot(), "examples", "sub", "SKILL.md"), "utf8")),
        ).toBeNull();
        const migratedBundle = (await scanInstalled(path.join(projectDir, ".claude"))).find(
            (entry) => entry.bundleName === "skillpack",
        )!;
        expect(migratedBundle.units).toMatchObject([{ kind: "skill", legacy: false }]);
        await expect(detectModified(migratedBundle, path.join(projectDir, ".claude"))).resolves.toMatchObject([
            { targetPath: "skills/sample", kind: "skill", state: "unmodified" },
        ]);
    });

    it("recognizes a single-file legacy skill using its old content hash", async () => {
        await writeLegacyInstall(true);
        const bundle = (await scanInstalled(path.join(projectDir, ".claude"))).find((entry) => entry.bundleName === "skillpack")!;
        expect(bundle.units).toHaveLength(1);
        expect(bundle.units[0]).toMatchObject({ kind: "skill", legacy: true });
    });

    it("skips legacy skill deletion unless forced, then removes its whole directory", async () => {
        await writeLegacyInstall();

        await executeDelete({ bundle: "skillpack", platform: "claude-code", target: "project" });
        await expect(fs.access(path.join(skillRoot(), "SKILL.md"))).resolves.toBeUndefined();
        expect(mockWarnLegacySkills).toHaveBeenCalled();

        await executeDelete({ bundle: "skillpack", force: true, platform: "claude-code", target: "project" });
        await expect(fs.access(skillRoot())).rejects.toThrow();
    });
});
