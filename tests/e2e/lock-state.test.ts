import fs from "node:fs/promises";
import path from "node:path";

import { executeCheck } from "@/commands/check.js";
import { executeDelete } from "@/commands/delete.js";
import { executeInstall } from "@/commands/install.js";
import { executeList } from "@/commands/list.js";
import { executeUpdate } from "@/commands/update.js";
import { computeHash } from "@/core/frontmatter.js";
import { downloadBundle, fetchManifest } from "@/core/index.js";
import { computeSkillTreeHash } from "@/core/skill-tree.js";
import type { Bundle, Manifest } from "@/types/index.js";
import { resolveTarget } from "@/types/index.js";
import {
    confirmDelete,
    confirmInstall,
    isInteractive,
    selectBundles,
    selectNewUnits,
    selectPlatform,
    selectTarget,
    selectUnits,
    showCheckReport,
    warnLegacyModified,
} from "@/ui/prompts.js";

import { cleanupDir, createTempProject, setupTemplateDir } from "./helpers.js";

vi.mock("@/core/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/core/index.js")>()),
    fetchManifest: vi.fn(),
    downloadBundle: vi.fn(),
}));

vi.mock("@/types/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/types/index.js")>()),
    resolveTarget: vi.fn(),
}));

vi.mock("@/ui/prompts.js", () => ({
    confirmDelete: vi.fn(),
    confirmInstall: vi.fn(),
    isInteractive: vi.fn(),
    selectBundles: vi.fn(),
    selectInstalledBundles: vi.fn(),
    selectNewUnits: vi.fn(),
    selectPlatform: vi.fn(),
    selectTarget: vi.fn(),
    selectUnits: vi.fn(),
    showCheckReport: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showUpdateReport: vi.fn(),
    warnKeptRemoved: vi.fn(),
    warnLegacyModified: vi.fn(),
    warnModified: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockDownloadBundle = vi.mocked(downloadBundle);
const mockResolveTarget = vi.mocked(resolveTarget);
const mockConfirmInstall = vi.mocked(confirmInstall);
const mockConfirmDelete = vi.mocked(confirmDelete);
const mockIsInteractive = vi.mocked(isInteractive);
const mockSelectBundles = vi.mocked(selectBundles);
const mockSelectUnits = vi.mocked(selectUnits);
const mockSelectNewUnits = vi.mocked(selectNewUnits);

function createManifest(
    version = "1.0.0",
    targets = ["skills/alpha/SKILL.md", "skills/beta/SKILL.md", "agents/guide.md"],
    names = ["core"],
): Manifest {
    const bundles: Record<string, Bundle> = {};
    names.forEach((name) => {
        bundles[name] = {
            name,
            version,
            description: `${name} fixture`,
            default: false,
            platforms: ["claude-code"],
            items: targets.map((target) => ({
                source: `${name}/${target}`,
                target,
                category: target.startsWith("skills/") ? "skill" : "agent",
            })),
        };
    });
    return { schemaVersion: 1, repository: "fixture/repo", bundles };
}

describe("lock-file command flows", () => {
    let projectDir: string;
    let rootDir: string;
    let manifest: Manifest;
    let templateDirs: string[];

    beforeEach(async () => {
        const project = await createTempProject();
        projectDir = project.dir;
        rootDir = path.join(projectDir, ".claude");
        templateDirs = [];
        manifest = createManifest();
        mockResolveTarget.mockReturnValue({ platform: "claude-code", type: "project", rootDir });
        mockFetchManifest.mockImplementation(async () => manifest);
        mockDownloadBundle.mockImplementation(async (_repository, bundleName) => {
            const dir = await setupTemplateDir(manifest, bundleName);
            templateDirs.push(dir);
            return dir;
        });
        mockConfirmInstall.mockResolvedValue(true);
        mockConfirmDelete.mockResolvedValue(true);
        mockIsInteractive.mockReturnValue(false);
        mockSelectBundles.mockImplementation(async (currentManifest) => Object.values(currentManifest.bundles));
        mockSelectUnits.mockImplementation(async (_bundle, units) => units.map((unit) => unit.relativePath));
        mockSelectNewUnits.mockImplementation(async (_name, units) => units.map((unit) => unit.relativePath));
    });

    afterEach(async () => {
        await fs.rm(projectDir, { recursive: true, force: true });
        await Promise.all(templateDirs.map(cleanupDir));
        vi.clearAllMocks();
    });

    const install = (bundle = "core", skills?: string[]) =>
        executeInstall({ bundle, skills, platform: "claude-code", target: "project" });

    it("installs full units byte-identically and records their hashes in astp.lock", async () => {
        const templateDir = await setupTemplateDir(manifest, "core");
        templateDirs.push(templateDir);
        const templateContents = await Promise.all(
            manifest.bundles.core!.items.map((item) => fs.readFile(path.join(templateDir, item.target))),
        );
        mockDownloadBundle.mockResolvedValue(templateDir);
        await install();
        const lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(Object.keys(lock.bundles.core.units)).toEqual(["agents/guide.md", "skills/alpha", "skills/beta"]);
        expect(lock.bundles.core.declined).toEqual([]);
        for (const [index, item] of manifest.bundles.core!.items.entries()) {
            expect(Buffer.compare(templateContents[index]!, await fs.readFile(path.join(rootDir, item.target)))).toBe(
                0,
            );
        }
        expect(await fs.readFile(path.join(rootDir, "skills/alpha/SKILL.md"), "utf8")).not.toContain("astp-source");
        expect(lock.bundles.core.units["agents/guide.md"].hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("selects requested units, declines the rest, and installs new non-declined units on update", async () => {
        await install("core", ["alpha"]);
        let lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(Object.keys(lock.bundles.core.units)).toEqual(["skills/alpha"]);
        expect(lock.bundles.core.declined).toEqual(["agents/guide.md", "skills/beta"]);

        manifest = createManifest("1.1.0", [
            "skills/alpha/SKILL.md",
            "skills/beta/SKILL.md",
            "skills/gamma/SKILL.md",
            "agents/guide.md",
        ]);
        await executeUpdate({ platform: "claude-code", target: "project" });
        lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.core.units["skills/gamma"]).toBeDefined();
        expect(lock.bundles.core.declined).toContain("skills/beta");
        await expect(fs.access(path.join(rootDir, "skills/gamma/SKILL.md"))).resolves.toBeUndefined();
    });

    it("reports and restores a missing unit", async () => {
        await install();
        await fs.rm(path.join(rootDir, "skills/alpha"), { recursive: true });
        await executeCheck({ platform: "claude-code", target: "project" });
        expect(vi.mocked(showCheckReport).mock.calls[0]?.[0].updates[0]?.units).toContainEqual(
            expect.objectContaining({ targetPath: "skills/alpha", kind: "skill", state: "missing" }),
        );
        await executeUpdate({ platform: "claude-code", target: "project" });
        expect(await fs.readFile(path.join(rootDir, "skills/alpha/SKILL.md"), "utf8")).toContain("Skill v1.0.0");
    });

    it("selectively deletes and reinstalls a unit without restoring it during update", async () => {
        await install();
        await executeDelete({
            bundle: "core",
            skills: ["skills/alpha"],
            platform: "claude-code",
            target: "project",
        });
        manifest = createManifest("1.1.0");
        await executeUpdate({ platform: "claude-code", target: "project" });
        await expect(fs.access(path.join(rootDir, "skills/alpha"))).rejects.toMatchObject({ code: "ENOENT" });
        await install("core", ["alpha"]);
        await expect(fs.access(path.join(rootDir, "skills/alpha/SKILL.md"))).resolves.toBeUndefined();
    });

    it("keeps modified units on selective delete unless forced", async () => {
        await install();
        await fs.appendFile(path.join(rootDir, "skills/alpha/SKILL.md"), "local edit");
        await executeDelete({
            bundle: "core",
            skills: ["alpha"],
            platform: "claude-code",
            target: "project",
        });
        expect(await fs.readFile(path.join(rootDir, "skills/alpha/SKILL.md"), "utf8")).toContain("local edit");
        let lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.core.units["skills/alpha"]).toBeDefined();
        expect(lock.bundles.core.declined).not.toContain("skills/alpha");
        await executeDelete({
            bundle: "core",
            skills: ["alpha"],
            force: true,
            platform: "claude-code",
            target: "project",
        });
        await expect(fs.access(path.join(rootDir, "skills/alpha"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("keeps modified interactive deselections tracked and not declined", async () => {
        await install();
        await fs.appendFile(path.join(rootDir, "skills/beta/SKILL.md"), "local edit");
        mockIsInteractive.mockReturnValue(true);
        mockSelectUnits.mockResolvedValue(["skills/alpha"]);
        await install();
        const lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.core.units["skills/beta"]).toBeDefined();
        expect(lock.bundles.core.declined).not.toContain("skills/beta");
    });

    it("keeps modified units but declines the rest when deleting a bundle", async () => {
        await install();
        await fs.appendFile(path.join(rootDir, "skills/alpha/SKILL.md"), "local edit");
        await executeDelete({ bundle: "core", platform: "claude-code", target: "project" });
        let lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(Object.keys(lock.bundles.core.units)).toEqual(["skills/alpha"]);
        expect(lock.bundles.core.declined).toContain("agents/guide.md");
        expect(lock.bundles.core.declined).toContain("skills/beta");

        manifest = createManifest("1.1.0");
        await executeUpdate({ platform: "claude-code", target: "project" });
        await expect(fs.access(path.join(rootDir, "agents/guide.md"))).rejects.toMatchObject({ code: "ENOENT" });
        await expect(fs.access(path.join(rootDir, "skills/beta"))).rejects.toMatchObject({ code: "ENOENT" });
        lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.core.declined).toContain("agents/guide.md");
        expect(lock.bundles.core.declined).toContain("skills/beta");
    });

    it("removes clean upstream removals and preserves modified removed units", async () => {
        await install();
        await fs.appendFile(path.join(rootDir, "skills/beta/SKILL.md"), "local edit");
        manifest = createManifest("1.1.0", ["skills/gamma/SKILL.md"]);
        await executeUpdate({ platform: "claude-code", target: "project" });
        expect(await fs.readFile(path.join(rootDir, "skills/beta/SKILL.md"), "utf8")).toContain("local edit");
        const lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.core.units["skills/beta"]).toBeDefined();
        await expect(fs.access(path.join(rootDir, "skills/alpha"))).rejects.toMatchObject({ code: "ENOENT" });
        await expect(fs.access(path.join(rootDir, "agents/guide.md"))).rejects.toMatchObject({ code: "ENOENT" });
        await expect(fs.access(path.join(rootDir, "skills/gamma/SKILL.md"))).resolves.toBeUndefined();
    });

    it("adopts byte-identical untracked units and leaves modified untracked units untracked", async () => {
        await install();
        await fs.rm(path.join(rootDir, "astp.lock"));
        await fs.appendFile(path.join(rootDir, "agents/guide.md"), "local edit");
        await install();
        const lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.core.units["skills/alpha"]).toBeDefined();
        expect(lock.bundles.core.units["agents/guide.md"]).toBeUndefined();
        expect(await fs.readFile(path.join(rootDir, "agents/guide.md"), "utf8")).toContain("local edit");
    });

    it("prompts for unit selection only in interactive installs", async () => {
        mockIsInteractive.mockReturnValue(true);
        mockSelectUnits.mockResolvedValue(["skills/alpha"]);
        await install();
        manifest = createManifest("1.1.0", [
            "skills/alpha/SKILL.md",
            "skills/beta/SKILL.md",
            "skills/gamma/SKILL.md",
            "agents/guide.md",
        ]);
        mockSelectNewUnits.mockImplementation(async (_name, units) =>
            units.filter((unit) => unit.relativePath !== "skills/gamma").map((unit) => unit.relativePath),
        );
        await executeUpdate({ platform: "claude-code", target: "project" });
        const lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(Object.keys(lock.bundles.core.units)).toEqual(["skills/alpha"]);
        expect(lock.bundles.core.declined).toContain("skills/gamma");
        expect(mockSelectNewUnits).toHaveBeenCalledOnce();
        await executeUpdate({ platform: "claude-code", target: "project" });
        expect(mockSelectNewUnits).toHaveBeenCalledOnce();
        expect(mockSelectUnits).toHaveBeenCalledOnce();
    });

    it("rejects malformed locks before fetching the manifest", async () => {
        await fs.mkdir(rootDir, { recursive: true });
        await fs.writeFile(path.join(rootDir, "astp.lock"), "{");
        await expect(install()).rejects.toThrow("Invalid lock file");
        expect(mockFetchManifest).not.toHaveBeenCalled();
    });

    it("persists completed bundles when a later bundle download fails", async () => {
        manifest = createManifest("1.0.0", ["agents/guide.md"], ["first", "second"]);
        mockDownloadBundle.mockImplementation(async (_repository, bundleName) => {
            if (bundleName === "second") throw new Error("download failed");
            const dir = await setupTemplateDir(manifest, bundleName);
            templateDirs.push(dir);
            return dir;
        });
        await expect(executeInstall({ platform: "claude-code", target: "project" })).rejects.toThrow("download failed");
        const lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.first).toBeDefined();
        expect(lock.bundles.second).toBeUndefined();
    });

    it("prints detailed JSON list output without prompt noise", async () => {
        await install();
        const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await executeList({ bundle: "core", json: true, platform: "claude-code", target: "project" });
        const output = String(write.mock.calls[0]?.[0]);
        expect(JSON.parse(output).units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: "skills/alpha", status: "installed", description: expect.any(String) }),
            ]),
        );
        write.mockRestore();
    });

    it("requires a target for JSON list output before prompting", async () => {
        await expect(executeList({ json: true })).rejects.toThrow("--json requires --target");
        expect(vi.mocked(selectPlatform)).not.toHaveBeenCalled();
        expect(vi.mocked(selectTarget)).not.toHaveBeenCalled();
    });

    it("lists installed bundles missing from the manifest without downloading them", async () => {
        await install();
        const guidePath = path.join(rootDir, "agents/guide.md");
        const guideContent = await fs.readFile(guidePath, "utf8");
        const legacyContent = guideContent.replace(
            /^---\n/,
            `---\nastp-source: fixture/repo\nastp-bundle: core\nastp-version: 1.0.0\nastp-hash: ${computeHash(guideContent)}\n`,
        );
        await fs.writeFile(guidePath, legacyContent);
        const lockPath = path.join(rootDir, "astp.lock");
        const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
        delete lock.bundles.core.units["agents/guide.md"];
        await fs.writeFile(lockPath, JSON.stringify(lock));
        manifest = { ...manifest, bundles: {} };
        mockDownloadBundle.mockClear();

        const jsonWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await executeList({ bundle: "core", json: true, platform: "claude-code", target: "project" });
        const json = JSON.parse(String(jsonWrite.mock.calls[0]?.[0]));
        expect(json).toMatchObject({ bundle: "core", version: null, installedVersion: "1.0.0" });
        expect(json.units).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "skills/alpha",
                    status: "removed",
                    description: null,
                }),
                expect.objectContaining({
                    path: "agents/guide.md",
                    status: "legacy",
                    description: null,
                }),
            ]),
        );
        jsonWrite.mockRestore();

        const textWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await executeList({ bundle: "core", platform: "claude-code", target: "project" });
        const text = String(textWrite.mock.calls[0]?.[0]);
        expect(text).toContain("alpha");
        expect(text).toContain("removed");
        expect(text).toContain("guide.md");
        expect(text).toContain("legacy");
        expect(text).not.toContain("guide description");
        expect(mockDownloadBundle).not.toHaveBeenCalled();
        textWrite.mockRestore();
    });

    it("rejects install through a symlinked parent without touching outside files", async () => {
        manifest = createManifest("1.0.0", ["agents/guide.md"]);
        const outside = path.join(projectDir, "outside");
        await fs.mkdir(outside, { recursive: true });
        await fs.writeFile(path.join(outside, "marker.txt"), "keep");
        await fs.mkdir(rootDir, { recursive: true });
        await fs.symlink(outside, path.join(rootDir, "agents"), "dir");

        await expect(install()).rejects.toThrow(/escape|outside/i);
        expect(await fs.readdir(outside)).toEqual(["marker.txt"]);
        expect(await fs.readFile(path.join(outside, "marker.txt"), "utf8")).toBe("keep");
    });

    it("rejects update through a symlinked parent without touching outside files", async () => {
        manifest = createManifest("1.0.0", ["agents/guide.md"]);
        await install();
        const outside = path.join(projectDir, "outside");
        await fs.mkdir(outside, { recursive: true });
        const installedContent = await fs.readFile(path.join(rootDir, "agents/guide.md"));
        await fs.rm(path.join(rootDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(outside, "guide.md"), installedContent);
        await fs.writeFile(path.join(outside, "marker.txt"), "keep");
        await fs.symlink(outside, path.join(rootDir, "agents"), "dir");
        manifest = createManifest("1.1.0", ["agents/guide.md"]);

        await expect(executeUpdate({ platform: "claude-code", target: "project" })).rejects.toThrow(/escape|outside/i);
        expect(await fs.readFile(path.join(outside, "guide.md"))).toEqual(installedContent);
        expect(await fs.readFile(path.join(outside, "marker.txt"), "utf8")).toBe("keep");
    });

    it("rejects delete through a symlinked parent without touching outside files", async () => {
        manifest = createManifest("1.0.0", ["agents/guide.md"]);
        await install();
        const outside = path.join(projectDir, "outside");
        await fs.mkdir(outside, { recursive: true });
        const installedContent = await fs.readFile(path.join(rootDir, "agents/guide.md"));
        await fs.rm(path.join(rootDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(outside, "guide.md"), installedContent);
        await fs.writeFile(path.join(outside, "marker.txt"), "keep");
        await fs.symlink(outside, path.join(rootDir, "agents"), "dir");

        await expect(executeDelete({ bundle: "core", platform: "claude-code", target: "project" })).rejects.toThrow(
            /escape|outside/i,
        );
        expect(await fs.readFile(path.join(outside, "guide.md"))).toEqual(installedContent);
        expect(await fs.readFile(path.join(outside, "marker.txt"), "utf8")).toBe("keep");
    });

    it("removes a unit symlink without following its outside target", async () => {
        manifest = createManifest("1.0.0", ["agents/guide.md"]);
        await install();
        const outsideFile = path.join(projectDir, "outside.md");
        await fs.writeFile(outsideFile, "keep");
        const unitPath = path.join(rootDir, "agents/guide.md");
        await fs.rm(unitPath);
        await fs.symlink(outsideFile, unitPath, "file");

        await executeDelete({ bundle: "core", force: true, platform: "claude-code", target: "project" });

        expect(await fs.readFile(outsideFile, "utf8")).toBe("keep");
        await expect(fs.lstat(unitPath)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("distinguishes units when a manifest changes their kind at the same path", async () => {
        await install();
        const bundle = manifest.bundles.core!;
        manifest = {
            ...manifest,
            bundles: {
                ...manifest.bundles,
                core: {
                    ...bundle,
                    items: [{ source: "core/skills/alpha", target: "skills/alpha", category: "agent" }],
                },
            },
        };

        const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await executeList({ bundle: "core", json: true, platform: "claude-code", target: "project" });
        const units = JSON.parse(String(write.mock.calls[0]?.[0])).units;
        expect(units).toContainEqual(expect.objectContaining({ path: "skills/alpha", kind: "file", status: "new" }));
        expect(units).toContainEqual(
            expect.objectContaining({ path: "skills/alpha", kind: "skill", status: "removed" }),
        );
        write.mockRestore();
    });

    it("lists installed, modified, missing, declined, new, and removed units in JSON", async () => {
        await install();
        await fs.appendFile(path.join(rootDir, "skills/alpha/SKILL.md"), "local edit");
        await fs.rm(path.join(rootDir, "agents/guide.md"));
        manifest = createManifest("1.0.0", [
            "skills/alpha/SKILL.md",
            "skills/beta/SKILL.md",
            "skills/gamma/SKILL.md",
            "skills/delta/SKILL.md",
            "agents/guide.md",
        ]);
        const lockPath = path.join(rootDir, "astp.lock");
        const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
        lock.bundles.core.declined = ["skills/gamma"];
        await fs.writeFile(lockPath, JSON.stringify(lock));

        const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await executeList({ bundle: "core", json: true, platform: "claude-code", target: "project" });
        const listed = JSON.parse(String(write.mock.calls[0]?.[0])).units;
        expect(listed).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: "skills/alpha", status: "modified" }),
                expect.objectContaining({ path: "skills/beta", status: "installed" }),
                expect.objectContaining({ path: "skills/gamma", status: "declined" }),
                expect.objectContaining({ path: "skills/delta", status: "new" }),
                expect.objectContaining({ path: "agents/guide.md", status: "missing" }),
            ]),
        );
        write.mockRestore();

        manifest = createManifest("1.0.0", ["skills/alpha/SKILL.md"]);
        const removedWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await executeList({ bundle: "core", json: true, platform: "claude-code", target: "project" });
        expect(JSON.parse(String(removedWrite.mock.calls[0]?.[0])).units).toContainEqual(
            expect.objectContaining({ path: "skills/beta", status: "removed", description: null }),
        );
        removedWrite.mockRestore();
    });

    it("migrates a clean legacy file without --force", async () => {
        const templateContent = `---\nname: guide\ndescription: guide description\n---\n# guide\n\nAgent v1.0.0 description.\n`;
        const legacyContent = `---\nname: guide\ndescription: guide description\nastp-source: fixture/repo\nastp-bundle: core\nastp-version: 1.0.0\nastp-hash: ${computeHash(templateContent)}\n---\n# guide\n\nAgent v1.0.0 description.\n`;
        await fs.mkdir(rootDir, { recursive: true });
        await fs.mkdir(path.join(rootDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(rootDir, "agents/guide.md"), legacyContent);
        await executeUpdate({ platform: "claude-code", target: "project" });
        expect(await fs.readFile(path.join(rootDir, "agents/guide.md"), "utf8")).toBe(templateContent);
        expect(JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8")).bundles.core).toBeDefined();
    });

    it("checks and migrates both legacy skill formats and legacy files", async () => {
        manifest = createManifest("1.0.0", [
            "skills/v031/SKILL.md",
            "skills/issue8/SKILL.md",
            "skills/modified/SKILL.md",
            "agents/guide.md",
        ]);
        const templates = await setupTemplateDir(manifest, "core");
        templateDirs.push(templates);
        const readTemplate = async (relativePath: string) => fs.readFile(path.join(templates, relativePath), "utf8");
        const addFields = (content: string, version: string, hash: string) =>
            content.replace(
                /^---\n/,
                `---\nastp-source: fixture/repo\nastp-bundle: core\nastp-version: ${version}\nastp-hash: ${hash}\n`,
            );

        await fs.mkdir(path.join(rootDir, "skills/v031"), { recursive: true });
        const v031Template = await readTemplate("skills/v031/SKILL.md");
        await fs.writeFile(
            path.join(rootDir, "skills/v031/SKILL.md"),
            addFields(v031Template, "0.3.1", computeHash(v031Template)),
        );

        await fs.mkdir(path.join(rootDir, "skills/issue8"), { recursive: true });
        const issue8Template = await readTemplate("skills/issue8/SKILL.md");
        await fs.writeFile(path.join(rootDir, "skills/issue8/SKILL.md"), issue8Template);
        const issue8Hash = await computeSkillTreeHash(path.join(rootDir, "skills/issue8"));
        await fs.writeFile(
            path.join(rootDir, "skills/issue8/SKILL.md"),
            addFields(issue8Template, "0.2.0", issue8Hash),
        );

        await fs.mkdir(path.join(rootDir, "skills/modified"), { recursive: true });
        const modifiedTemplate = await readTemplate("skills/modified/SKILL.md");
        await fs.writeFile(
            path.join(rootDir, "skills/modified/SKILL.md"),
            `${addFields(modifiedTemplate, "0.3.1", computeHash(modifiedTemplate))}local edit`,
        );

        await fs.mkdir(path.join(rootDir, "agents"), { recursive: true });
        const fileTemplate = await readTemplate("agents/guide.md");
        await fs.writeFile(
            path.join(rootDir, "agents/guide.md"),
            addFields(fileTemplate, "0.3.1", computeHash(fileTemplate)),
        );

        await executeCheck({ platform: "claude-code", target: "project" });
        const legacy = vi.mocked(showCheckReport).mock.calls.at(-1)?.[0].legacySkills;
        expect(legacy).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ targetPath: "skills/v031", clean: true }),
                expect.objectContaining({ targetPath: "skills/issue8", clean: true }),
                expect.objectContaining({ targetPath: "skills/modified", clean: false }),
                expect.objectContaining({ targetPath: "agents/guide.md", clean: true }),
            ]),
        );

        await executeUpdate({ platform: "claude-code", target: "project" });
        expect(await fs.readFile(path.join(rootDir, "skills/v031/SKILL.md"), "utf8")).toBe(v031Template);
        expect(await fs.readFile(path.join(rootDir, "skills/issue8/SKILL.md"), "utf8")).toBe(issue8Template);
        expect(await fs.readFile(path.join(rootDir, "agents/guide.md"), "utf8")).toBe(fileTemplate);
        expect(await fs.readFile(path.join(rootDir, "skills/modified/SKILL.md"), "utf8")).toContain("local edit");
        expect(vi.mocked(warnLegacyModified)).toHaveBeenCalled();

        await executeUpdate({ force: true, platform: "claude-code", target: "project" });
        expect(await fs.readFile(path.join(rootDir, "skills/modified/SKILL.md"), "utf8")).toBe(modifiedTemplate);
        const lock = JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
        expect(lock.bundles.core.units["skills/modified"]).toBeDefined();
    });

    it("keeps JSON summary output valid", async () => {
        const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        await executeList({ json: true, platform: "claude-code", target: "project" });
        expect(JSON.parse(String(write.mock.calls[0]?.[0])).bundles).toHaveLength(1);
        write.mockRestore();
    });
});
