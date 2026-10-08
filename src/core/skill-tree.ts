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
    const files = await findRegularFiles(skillDir);
    const relativePaths = files.map((filePath) => path.relative(skillDir, filePath).split(path.sep).join("/"));
    return computeFileListHash(skillDir, relativePaths, options);
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
): Promise<string> {
    const lines: Array<{ path: string; line: string }> = [];
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

async function findRegularFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return files;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await findRegularFiles(fullPath)));
        } else if (entry.isFile()) {
            files.push(fullPath);
        }
    }

    return files;
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
