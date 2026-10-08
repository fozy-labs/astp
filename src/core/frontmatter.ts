import { createHash } from "node:crypto";
import path from "node:path";

import type { InstalledFileMetadata } from "@/types/index.js";

/**
 * Matches YAML frontmatter at the very start of a file (R2: conservative approach).
 * Group 1: opening `---` + newline
 * Group 2: field content between delimiters
 * Group 3: closing `---` + newline (or end of string)
 */
const FM_REGEX = /^(---[ \t]*\r?\n)([\s\S]*?)(---[ \t]*(?:\r?\n|$))/;

/**
 * Matches a leading `# astp-*` comment block (same conservative, header-only rule).
 * Group 1: optional shebang line
 * Group 2: one or more `# astp-*:` lines
 */
const HC_REGEX = /^(#![^\n]*\r?\n)?((?:# astp-[a-z]+:[^\n]*\r?\n)+)/;

export type MetadataFormat = "frontmatter" | "hash-comment";

/** Which in-file form carries the astp-* fields for this path, or null when astp cannot track the file. */
export function metadataFormat(filePath: string): MetadataFormat | null {
    switch (path.extname(filePath).toLowerCase()) {
        case ".md":
            return "frontmatter";
        case ".sh":
            return "hash-comment";
        default:
            return null;
    }
}

export function extractAstpMetadata(content: string): InstalledFileMetadata | null {
    const fm = content.match(FM_REGEX);
    const fields = fm ? fm[2] : hashCommentFields(content);
    if (!fields) return null;

    const source = extractField(fields, "astp-source");
    if (!source) return null;

    return {
        source,
        bundle: extractField(fields, "astp-bundle") ?? "",
        version: extractField(fields, "astp-version") ?? "",
        hash: extractField(fields, "astp-hash") ?? "",
    };
}

/** Field lines of a leading `# astp-*` block with the `# ` prefixes removed, or null. */
function hashCommentFields(content: string): string | null {
    const match = content.match(HC_REGEX);
    return match ? match[2].replace(/^# /gm, "") : null;
}

function extractField(fields: string, key: string): string | undefined {
    const regex = new RegExp(`^${key}:\\s*(.+)$`, "m");
    const match = fields.match(regex);
    return match ? match[1].trim() : undefined;
}

export function injectAstpFields(
    content: string,
    metadata: Omit<InstalledFileMetadata, "hash">,
    hash: string,
    format: MetadataFormat = "frontmatter",
): string {
    if (format === "hash-comment") {
        const astpBlock =
            [
                `# astp-source: ${metadata.source}`,
                `# astp-bundle: ${metadata.bundle}`,
                `# astp-version: ${metadata.version}`,
                `# astp-hash: ${hash}`,
            ].join("\n") + "\n";

        const existing = content.match(HC_REGEX);
        if (existing) {
            return `${existing[1] ?? ""}${astpBlock}${content.substring(existing[0].length)}`;
        }

        if (content.startsWith("#!")) {
            const eol = content.indexOf("\n");
            if (eol === -1) return `${content}\n${astpBlock}`;
            return `${content.substring(0, eol + 1)}${astpBlock}${content.substring(eol + 1)}`;
        }

        return `${astpBlock}${content}`;
    }

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
    if (!match) {
        // Hash-comment form: drop the astp-* block, keep shebang and body
        const hc = content.match(HC_REGEX);
        if (!hc) return content;
        return `${hc[1] ?? ""}${content.substring(hc[0].length)}`;
    }

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
