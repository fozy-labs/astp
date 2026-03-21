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

export function injectAstpFields(content: string, metadata: Omit<InstalledFileMetadata, "hash">, hash: string): string {
    const astpBlock = [
        `astp-source: ${metadata.source}`,
        `astp-bundle: ${metadata.bundle}`,
        `astp-version: ${metadata.version}`,
        `astp-hash: ${hash}`,
    ].join("\n");

    const match = content.match(FM_REGEX);
    if (match) {
        const opening = match[1];
        const existingFields = match[2];
        const closing = match[3];
        const body = content.substring(match[0].length);

        // Existing fields may or may not end with \n
        const sep = existingFields.length > 0 && !existingFields.endsWith("\n") ? "\n" : "";

        return `${opening}${existingFields}${sep}${astpBlock}\n${closing}${body}`;
    }

    // No frontmatter — prepend new block
    return `---\n${astpBlock}\n---\n${content}`;
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
