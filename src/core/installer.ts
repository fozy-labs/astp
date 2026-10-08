import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { InstallTarget, TemplateItem } from "@/types/index.js";

import { computeHash, injectAstpFields } from "./frontmatter.js";
import { computeSkillTreeHash } from "./skill-tree.js";
import type { SkillTemplateUnit } from "./units.js";

export async function installFile(
    tempDir: string,
    item: TemplateItem,
    target: InstallTarget,
    meta: { source: string; bundle: string; version: string },
): Promise<void> {
    // giget downloads the bundle subdirectory, so file paths inside tempDir
    // mirror item.target (source path without the bundle prefix)
    const sourceFile = path.join(tempDir, item.target);
    validateTargetPath(target.rootDir, item.target);

    const content = await fs.readFile(sourceFile, "utf8");
    const hash = computeHash(content);
    const finalContent = injectAstpFields(content, meta, hash);

    const targetFile = path.join(target.rootDir, item.target);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, finalContent, "utf8");
}

export async function installSkill(
    tempDir: string,
    unit: SkillTemplateUnit,
    target: InstallTarget,
    meta: { source: string; bundle: string; version: string },
): Promise<void> {
    const skillDir = path.join(target.rootDir, unit.relativePath);
    validateTargetPath(target.rootDir, unit.relativePath);
    for (const item of unit.items) validateTargetPath(target.rootDir, item.target);

    const skillMdPath = path.posix.join(unit.relativePath, "SKILL.md");
    const skillMd = unit.items.find((item) => item.target === skillMdPath);
    if (!skillMd) {
        throw new Error(`Skill directory '${unit.relativePath}' has no SKILL.md item.`);
    }

    const stagingDir = path.join(path.dirname(skillDir), `.${path.basename(skillDir)}.astp-tmp-${randomUUID()}`);
    let stagingCreated = false;
    try {
        await fs.mkdir(path.dirname(skillDir), { recursive: true });
        await fs.mkdir(stagingDir);
        stagingCreated = true;

        for (const item of unit.items) {
            const sourceFile = path.join(tempDir, item.target);
            const targetFile = path.join(target.rootDir, item.target);
            const stagingFile = path.join(stagingDir, path.relative(skillDir, targetFile));
            await fs.mkdir(path.dirname(stagingFile), { recursive: true });
            await fs.copyFile(sourceFile, stagingFile);
        }

        const hash = await computeSkillTreeHash(stagingDir);
        const stagingSkillFile = path.join(
            stagingDir,
            path.relative(skillDir, path.join(target.rootDir, skillMd.target)),
        );
        const content = await fs.readFile(stagingSkillFile, "utf8");
        await fs.writeFile(stagingSkillFile, injectAstpFields(content, meta, hash), "utf8");

        await fs.rm(skillDir, { recursive: true, force: true });
        await fs.rename(stagingDir, skillDir);
        stagingCreated = false;
    } catch (error) {
        if (stagingCreated) {
            await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
        }
        throw error;
    }
}

export function validateTargetPath(installRoot: string, targetPath: string): void {
    // Reject absolute paths (POSIX and Windows)
    if (path.isAbsolute(targetPath) || path.posix.isAbsolute(targetPath) || path.win32.isAbsolute(targetPath)) {
        throw new Error(`Invalid target path: absolute paths are not allowed: ${targetPath}`);
    }

    // Reject path traversal
    const segments = targetPath.split(/[/\\]/);
    if (segments.includes("..")) {
        throw new Error(`Invalid target path: path traversal is not allowed: ${targetPath}`);
    }

    // Verify resolved path stays within install root
    const normalizedRoot = path.resolve(installRoot);
    const resolved = path.resolve(installRoot, targetPath);
    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
        throw new Error(`Invalid target path: resolved path escapes install root: ${targetPath}`);
    }
}
