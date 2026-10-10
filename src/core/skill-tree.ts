import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { extractFrontmatter } from "./blocks.js";
import { computeHash, stripAstpFields } from "./frontmatter.js";
import type { TemplateUnit } from "./units.js";

export interface TreeHashOptions {
    stripRootAstpFields?: boolean;
    /** Files with `<astp-block>` blocks contribute only their frontmatter to the hash. */
    blockFiles?: ReadonlySet<string>;
}

export async function computeSkillTreeHash(skillDir: string, options: TreeHashOptions = {}): Promise<string> {
    const { files, special } = await listSkillTree(skillDir);
    return computeFileListHash(skillDir, files, options, special);
}

export async function computeTemplateUnitHash(
    tempDir: string,
    unit: TemplateUnit,
    options: TreeHashOptions = {},
): Promise<string> {
    if (unit.kind === "file") {
        const content = await fs.readFile(path.join(tempDir, unit.item.target), "utf8");
        return options.blockFiles?.has(unit.item.target)
            ? computeHash(extractFrontmatter(content))
            : computeHash(content);
    }
    const relativePaths = unit.items.map((item) => path.posix.relative(unit.relativePath, item.target));
    return computeFileListHash(path.join(tempDir, unit.relativePath), relativePaths, options);
}

async function computeFileListHash(
    rootDir: string,
    relativePaths: string[],
    options: TreeHashOptions = {},
    specialPaths: string[] = [],
): Promise<string> {
    const lines: Array<{ path: string; line: string }> = specialPaths.map((specialPath) => ({
        path: specialPath,
        line: `-  ${specialPath}\n`,
    }));
    for (const relativePath of relativePaths) {
        const filePath = path.join(rootDir, relativePath);
        const fileBytes = await fs.readFile(filePath);
        const bytes =
            options.stripRootAstpFields && relativePath === "SKILL.md"
                ? Buffer.from(stripAstpFields(fileBytes.toString("utf8")), "utf8")
                : options.blockFiles?.has(relativePath)
                  ? Buffer.from(extractFrontmatter(fileBytes.toString("utf8")), "utf8")
                  : fileBytes;
        const normalizedBytes = normalizeLineEndings(bytes);
        const fileHash = createHash("sha256").update(normalizedBytes).digest("hex");
        lines.push({ path: relativePath, line: `${fileHash}  ${relativePath}\n` });
    }

    lines.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return createHash("sha256")
        .update(lines.map(({ line }) => line).join(""), "utf8")
        .digest("hex");
}

const OS_CLUTTER_FILES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

/** OS clutter file names astp ignores inside skill trees, matched on the lowercased basename. */
export function isOsClutterName(name: string): boolean {
    return OS_CLUTTER_FILES.has(name.toLowerCase());
}

/**
 * Relative `/`-separated paths under a skill dir: regular files, and every other non-directory
 * entry (symlinks, etc.). OS clutter files are skipped. Missing dir → both empty.
 */
export async function listSkillTree(dir: string): Promise<{ files: string[]; special: string[] }> {
    const files: string[] = [];
    const special: string[] = [];

    const walk = async (current: string, prefix: string): Promise<void> => {
        let entries;
        try {
            entries = await fs.readdir(current, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            return;
        }
        for (const entry of entries) {
            const relative = `${prefix}${entry.name}`;
            if (entry.isDirectory()) {
                await walk(path.join(current, entry.name), `${relative}/`);
            } else if (entry.isFile()) {
                if (!isOsClutterName(entry.name)) files.push(relative);
            } else {
                special.push(relative);
            }
        }
    };

    await walk(dir, "");
    return { files, special };
}

function normalizeLineEndings(bytes: Buffer): Buffer {
    const normalized = Buffer.allocUnsafe(bytes.length);
    let writeIndex = 0;
    for (let index = 0; index < bytes.length; index++) {
        if (bytes[index] === 0x0d && bytes[index + 1] === 0x0a) {
            normalized[writeIndex++] = 0x0a;
            index++;
        } else {
            normalized[writeIndex++] = bytes[index]!;
        }
    }
    return normalized.subarray(0, writeIndex);
}
