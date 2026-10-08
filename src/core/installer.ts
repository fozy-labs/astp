import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { InstallTarget, TemplateItem } from "@/types/index.js";

import { hasBlocks, parseTemplateBlocks } from "./blocks.js";
import { computeHash } from "./frontmatter.js";
import { assertInsideRoot } from "./path-safety.js";
import { computeSkillTreeHash } from "./skill-tree.js";
import type { SkillTemplateUnit, TemplateUnit } from "./units.js";

export async function installFile(
    tempDir: string,
    item: TemplateItem,
    target: InstallTarget,
    contentOverride?: string,
): Promise<string> {
    // giget downloads the bundle subdirectory, so file paths inside tempDir
    // mirror item.target (source path without the bundle prefix)
    const sourceFile = path.join(tempDir, item.target);
    validateTargetPath(target.rootDir, item.target);
    await assertInsideRoot(target.rootDir, item.target);

    const content = contentOverride ?? (await fs.readFile(sourceFile));
    const targetFile = path.join(target.rootDir, item.target);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.rm(targetFile, { recursive: true, force: true });
    await fs.writeFile(targetFile, content);
    return computeHash(content.toString("utf8"));
}

export interface InstallSkillOptions {
    /** Merged contents for files with blocks, written instead of the template bytes. */
    overrides?: ReadonlyMap<string, string>;
}

export async function installSkill(
    tempDir: string,
    unit: SkillTemplateUnit,
    target: InstallTarget,
    options: InstallSkillOptions = {},
): Promise<string> {
    const skillDir = path.join(target.rootDir, unit.relativePath);
    validateTargetPath(target.rootDir, unit.relativePath);
    await assertInsideRoot(target.rootDir, unit.relativePath);
    for (const item of unit.items) validateTargetPath(target.rootDir, item.target);

    if (!unit.items.some((item) => item.target === path.posix.join(unit.relativePath, "SKILL.md"))) {
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
            const override = options.overrides?.get(item.target);
            if (override !== undefined) await fs.writeFile(stagingFile, override, "utf8");
            else await fs.copyFile(sourceFile, stagingFile);
        }

        const hash = await computeSkillTreeHash(stagingDir);
        await assertInsideRoot(target.rootDir, unit.relativePath);
        await fs.rm(skillDir, { recursive: true, force: true });
        await fs.rename(stagingDir, skillDir);
        stagingCreated = false;
        return hash;
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

export function validateUnitTargets(installRoot: string, units: TemplateUnit[]): void {
    for (const unit of units) {
        validateTargetPath(installRoot, unit.relativePath);
        if (unit.kind === "skill") {
            for (const item of unit.items) validateTargetPath(installRoot, item.target);
        }
    }
}

export async function assertBundleSources(tempDir: string, bundleName: string, units: TemplateUnit[]): Promise<void> {
    const missing: string[] = [];
    for (const unit of units) {
        for (const item of unit.kind === "skill" ? unit.items : [unit.item]) {
            try {
                if (!(await fs.stat(path.join(tempDir, item.target))).isFile()) missing.push(item.target);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
                missing.push(item.target);
            }
        }
    }
    if (missing.length > 0) {
        throw new Error(
            `Downloaded bundle '${bundleName}' is missing files listed in the manifest: ${missing.join(", ")}`,
        );
    }
}

/** Every downloaded template file with `<astp-block>` tags must parse without errors. */
export async function assertBundleBlocks(tempDir: string, bundleName: string, units: TemplateUnit[]): Promise<void> {
    const errors: string[] = [];
    for (const unit of units) {
        for (const item of unit.kind === "skill" ? unit.items : [unit.item]) {
            const content = await fs.readFile(path.join(tempDir, item.target), "utf8");
            if (!hasBlocks(content)) continue;
            for (const error of parseTemplateBlocks(content).errors) {
                errors.push(`${item.target}: ${error}`);
            }
        }
    }
    if (errors.length > 0) {
        throw new Error(`Downloaded bundle '${bundleName}' has invalid blocks:\n${errors.join("\n")}`);
    }
}
