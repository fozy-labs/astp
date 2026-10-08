import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { stripAstpFields } from "./frontmatter.js";

export async function computeSkillTreeHash(skillDir: string): Promise<string> {
    const files = await findRegularFiles(skillDir);
    const lines: Array<{ path: string; line: string }> = [];

    for (const filePath of files) {
        const relativePath = path.relative(skillDir, filePath).split(path.sep).join("/");
        const fileBytes = await fs.readFile(filePath);
        const bytes =
            relativePath === "SKILL.md" ? Buffer.from(stripAstpFields(fileBytes.toString("utf8")), "utf8") : fileBytes;
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
