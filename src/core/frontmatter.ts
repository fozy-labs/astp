import { createHash } from "node:crypto";

import type { InstalledFileMetadata } from "@/types/index.js";

/**
 * Matches YAML frontmatter at the very start of a file (R2: conservative approach).
 * Group 1: opening `---` + newline
 * Group 2: field content between delimiters
 * Group 3: closing `---` + newline (or end of string)
 */
const FM_REGEX = /^(---[ \t]*\r?\n)([\s\S]*?)(---[ \t]*(?:\r?\n|$))/;

export function extractAstpMetadata(content: string): InstalledFileMetadata | null {
    const match = content.match(FM_REGEX);
    if (!match) return null;

    const fields = match[2];
    const source = extractField(fields, "astp-source");
    if (!source) return null;

    return {
        source,
        bundle: extractField(fields, "astp-bundle") ?? "",
        version: extractField(fields, "astp-version") ?? "",
        hash: extractField(fields, "astp-hash") ?? "",
    };
}

function extractField(fields: string, key: string): string | undefined {
    const regex = new RegExp(`^${key}:\\s*(.+)$`, "m");
    const match = fields.match(regex);
    return match ? match[1].trim() : undefined;
}

export function stripAstpFields(content: string): string {
    const match = content.match(FM_REGEX);
    if (!match) return content;

    const fields = match[2];
    const body = content.substring(match[0].length);

    // Remove lines starting with astp-
    const remaining = fields
        .split(/\r?\n/)
        .filter((line) => !line.startsWith("astp-"))
        .filter((line) => line.trim().length > 0);

    if (remaining.length === 0) {
        // Only astp-* fields existed — remove entire frontmatter block
        return body;
    }

    // Reconstruct frontmatter with remaining fields
    const opening = match[1];
    const closing = match[3];
    return `${opening}${remaining.join("\n")}\n${closing}${body}`;
}

export function computeHash(content: string): string {
    // Normalize CRLF → LF before hashing (R14)
    const normalized = content.replace(/\r\n/g, "\n");
    return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function readDescription(content: string): string | null {
    const match = content.match(FM_REGEX);
    if (!match) return null;
    const lines = match[2].split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!;
        const field = line.match(/^description:\s*(.*)$/);
        if (!field) continue;
        const value = field[1]!.trim();
        if (["|", "|-", ">", ">-"].includes(value)) {
            const block: string[] = [];
            const indentation = line.match(/^\s*/)?.[0].length ?? 0;
            for (let next = index + 1; next < lines.length; next++) {
                const blockLine = lines[next]!;
                if (blockLine.trim() === "") continue;
                const blockIndentation = blockLine.match(/^\s*/)?.[0].length ?? 0;
                if (blockIndentation <= indentation) break;
                block.push(blockLine.trim());
            }
            return block.length > 0 ? block.join(" ") : null;
        }
        if (!value) return null;
        const quoted = value.match(/^(["'])(.*)\1$/);
        return quoted ? quoted[2]! : value;
    }
    return null;
}
