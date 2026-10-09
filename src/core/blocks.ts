/**
 * Pure parser and merger for `<astp-block>` template blocks (issue #11).
 *
 * Deliberately dependency-free (only node:crypto, no `@/` aliases): `scripts/`
 * imports this file directly under `node --experimental-strip-types`, so both
 * the CLI and the marketplace generator share one definition of the format.
 */

import { createHash } from "node:crypto";

/** Same regex as `FM_REGEX` in frontmatter.ts — copied to keep this file dependency-free. */
const FM_REGEX = /^(---[ \t]*\r?\n)([\s\S]*?)(---[ \t]*(?:\r?\n|$))/;

const NAME_REGEX = /^[a-z][a-z0-9_]*$/;
const BLOCK_OPEN = /^<astp-block(?=[\s>])([^>]*)>\s*$/;
const BLOCK_OPEN_PREFIX = /^<astp-block(?=[\s>])/;
const BLOCK_CLOSE = /^<\/astp-block>\s*$/;
const NAME_OPEN = /^<([a-z][a-z0-9_]*)>\s*$/;
const NAME_CLOSE = /^<\/([a-z][a-z0-9_]*)>\s*$/;
const SETUP_OPEN = /^<SETUP_REQUIRED>\s*$/;
const SETUP_CLOSE = /^<\/SETUP_REQUIRED>\s*$/;
const FILL_OPEN = /^<FILL_INSTRUCTION>\s*$/;
const FILL_CLOSE = /^<\/FILL_INSTRUCTION>\s*$/;

const SETUP_REQUIRED_TEXT =
    "<SETUP_REQUIRED>\n" +
    "Replace every <FILL_INSTRUCTION> in this file with the content it describes, then remove this block.\n" +
    "</SETUP_REQUIRED>\n";

/** First inner line of the outdated-block wrapper appended by the merge. */
const FILL_WRAPPER_MARKER =
    "The astp template of this block changed. Merge the new version below into this block, " +
    "keep the project-specific content, then remove this instruction.";

export interface TemplateBlock {
    name: string;
    optional: boolean;
    required: boolean;
    /** Lines between the tag lines, each with its `\n`; ends with `\n` unless empty. */
    content: string;
}

export interface InstalledBlockRegion {
    name: string;
    content: string;
    /** Line index of the `<name>` tag. */
    open: number;
    /** Line index of the `</name>` tag. */
    close: number;
}

export interface InstalledBlocks {
    frontmatter: string;
    /** Index of the first line after the frontmatter. */
    bodyStart: number;
    blocks: Map<string, InstalledBlockRegion>;
    /** Line range of the `<SETUP_REQUIRED>` region, inclusive. */
    setup: { start: number; end: number } | null;
    /** Everything except frontmatter, recorded blocks and SETUP_REQUIRED. */
    outsideText: string;
    lines: string[];
}

export interface MergeBlockFileArgs {
    template: { frontmatter: string; blocks: TemplateBlock[] };
    /** Parsed installed file; null renders fresh (new install, force re-render). */
    installed: InstalledBlocks | null;
    /** Lock `blocks` entries for this file: name -> template hash at install time. */
    lockHashes: Record<string, string>;
    /** Lock `declinedBlocks` names for this file. */
    declined: Set<string>;
    /** Names selected for this file. */
    selected: Set<string>;
    /** Template names not in the lock whose tag already appears in the file but did not parse as a region. */
    occupied?: Set<string>;
    force: boolean;
}

export interface MergeBlockFileResult {
    content: string;
    /** New `blocks` entries for this file: name -> hash. */
    blocks: Record<string, string>;
    /** New `declinedBlocks` names for this file. */
    declinedBlocks: string[];
    /** Deselected blocks kept because they changed locally. */
    kept: string[];
    /** Blocks removed upstream but changed locally: left in the file as consumer text, dropped from the lock. */
    released: string[];
    /** Selected blocks not in the lock whose region already exists with other content: left as is, declined. */
    foreign: string[];
    /** Locally changed blocks that also changed upstream (wrapper added). */
    conflicts: string[];
}

// ── Scanning ─────────────────────────────────────────────────────────

/** Lines each keeping their `\n` (the last line may lack it). */
function splitLines(content: string): string[] {
    return content.split(/(?<=\n)/).filter((line) => line.length > 0);
}

function lineText(line: string): string {
    return line.replace(/\r?\n$/, "");
}

export function extractFrontmatter(content: string): string {
    return content.match(FM_REGEX)?.[0] ?? "";
}

interface Fence {
    char: string;
    length: number;
}

/** A line with up to 3 leading spaces then a run of >=3 backticks or tildes opens a fence. */
function fenceOpen(lineText: string): Fence | null {
    const match = lineText.match(/^ {0,3}(`{3,}|~{3,})/);
    return match ? { char: match[1]![0]!, length: match[1]!.length } : null;
}

function fenceCloses(lineText: string, fence: Fence): boolean {
    const match = lineText.match(fence.char === "`" ? /^ {0,3}(`+)\s*$/ : /^ {0,3}(~+)\s*$/);
    return match !== null && match[1]!.length >= fence.length;
}

export function hasBlocks(content: string): boolean {
    const lines = splitLines(content);
    let fence: Fence | null = null;
    for (const line of lines.slice(splitLines(extractFrontmatter(content)).length)) {
        const text = lineText(line);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            continue;
        }
        if (BLOCK_OPEN_PREFIX.test(text) || BLOCK_CLOSE.test(text)) return true;
    }
    return false;
}

/** True when a `<FILL_INSTRUCTION>` opens at column 0 outside code fences. */
export function hasFillInstruction(content: string): boolean {
    let fence: Fence | null = null;
    for (const line of splitLines(content)) {
        const text = lineText(line);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            continue;
        }
        if (FILL_OPEN.test(text)) return true;
    }
    return false;
}

// ── Template parse ───────────────────────────────────────────────────

export function parseTemplateBlocks(content: string): {
    frontmatter: string;
    blocks: TemplateBlock[];
    errors: string[];
} {
    const frontmatter = extractFrontmatter(content);
    const lines = splitLines(content);
    const bodyStart = splitLines(frontmatter).length;
    const errors: Array<{ line: number; message: string }> = [];
    const blocks: TemplateBlock[] = [];
    const names = new Set<string>();
    const outsideLines: number[] = [];
    let sawBlock = false;
    let fence: Fence | null = null;
    let open: { name: string; optional: boolean; required: boolean; line: number } | null = null;
    let contentStart = 0;

    const error = (line: number, message: string): void => {
        errors.push({ line, message });
    };

    for (let index = bodyStart; index < lines.length; index++) {
        const text = lineText(lines[index]!);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            if (!open && text.trim() !== "") outsideLines.push(index);
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            if (!open && text.trim() !== "") outsideLines.push(index);
            continue;
        }
        if (SETUP_OPEN.test(text) || SETUP_CLOSE.test(text)) {
            error(index, "<SETUP_REQUIRED> is not allowed in template files");
            continue;
        }
        if (FILL_OPEN.test(text) || FILL_CLOSE.test(text)) {
            if (!open) error(index, "<FILL_INSTRUCTION> must be inside an <astp-block>");
            continue;
        }
        const openMatch = text.match(BLOCK_OPEN);
        if (openMatch) {
            sawBlock = true;
            if (open) {
                error(index, "<astp-block> blocks cannot be nested");
                continue;
            }
            const parsed = parseAttributes(openMatch[1] ?? "", index, error);
            open = { ...parsed, line: index };
            if (parsed.name && names.has(parsed.name)) {
                error(index, `duplicate block name '${parsed.name}'`);
            } else if (parsed.name) {
                names.add(parsed.name);
            }
            contentStart = index + 1;
            continue;
        }
        if (BLOCK_CLOSE.test(text)) {
            if (!open) {
                error(index, "stray </astp-block>");
                continue;
            }
            if (open.name) {
                blocks.push({
                    name: open.name,
                    optional: open.optional,
                    required: open.required,
                    content: lines.slice(contentStart, index).join(""),
                });
            }
            open = null;
            continue;
        }
        if (!open && text.trim() !== "") outsideLines.push(index);
    }

    if (open) error(open.line, `unclosed <astp-block name="${open.name}">`);
    if (sawBlock) {
        for (const index of outsideLines) {
            error(index, "text outside <astp-block> blocks is not allowed");
        }
    }

    return {
        frontmatter,
        blocks,
        errors: errors.sort((a, b) => a.line - b.line).map((entry) => `line ${entry.line + 1}: ${entry.message}`),
    };
}

function parseAttributes(
    attrPart: string,
    line: number,
    error: (line: number, message: string) => void,
): { name: string; optional: boolean; required: boolean } {
    let name = "";
    let optional = false;
    let required = false;
    for (const token of attrPart.trim().split(/\s+/).filter(Boolean)) {
        const nameMatch = token.match(/^name="([^"]*)"$/);
        if (nameMatch) {
            if (name) error(line, "duplicate 'name' attribute");
            name = nameMatch[1]!;
        } else if (token === "optional") {
            optional = true;
        } else if (token === "required") {
            required = true;
        } else {
            error(line, `unknown attribute '${token}'`);
        }
    }
    if (!name) {
        error(line, "missing or invalid 'name' attribute (expected [a-z][a-z0-9_]*)");
    } else if (!NAME_REGEX.test(name)) {
        error(line, `invalid block name '${name}' (expected [a-z][a-z0-9_]*)`);
        name = "";
    }
    if (optional && required) error(line, "attributes 'optional' and 'required' cannot be combined");
    return { name, optional, required };
}

// ── Installed parse ──────────────────────────────────────────────────

/**
 * Parses an installed file looking only for the recorded `names` and
 * SETUP_REQUIRED. Returns null when the file no longer parses — the unit then
 * counts as modified.
 */
export function parseInstalledBlocks(content: string, names: string[]): InstalledBlocks | null {
    const frontmatter = extractFrontmatter(content);
    const lines = splitLines(content);
    const bodyStart = splitLines(frontmatter).length;
    const wanted = new Set(names);
    const blocks = new Map<string, InstalledBlockRegion>();
    const outside: string[] = [];
    let fence: Fence | null = null;
    let open: { name: string; line: number } | null = null;
    let setup: { start: number; end: number } | null = null;
    let inSetup = false;
    let setupStart = 0;

    for (let index = bodyStart; index < lines.length; index++) {
        const text = lineText(lines[index]!);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            if (!open && !inSetup) outside.push(lines[index]!);
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            if (!open && !inSetup) outside.push(lines[index]!);
            continue;
        }
        if (SETUP_OPEN.test(text)) {
            if (open) continue; // consumer text inside a recorded block
            if (inSetup || setup) return null;
            inSetup = true;
            setupStart = index;
            continue;
        }
        if (SETUP_CLOSE.test(text)) {
            if (!inSetup) return null;
            setup = { start: setupStart, end: index };
            inSetup = false;
            continue;
        }
        const nameOpen = text.match(NAME_OPEN);
        if (nameOpen) {
            const name = nameOpen[1]!;
            if (wanted.has(name)) {
                if (open || inSetup || blocks.has(name)) return null;
                open = { name, line: index };
            } else if (!open && !inSetup) {
                outside.push(lines[index]!);
            }
            continue;
        }
        const nameClose = text.match(NAME_CLOSE);
        if (nameClose) {
            const name = nameClose[1]!;
            if (open && name === open.name) {
                blocks.set(name, {
                    name,
                    open: open.line,
                    close: index,
                    content: lines.slice(open.line + 1, index).join(""),
                });
                open = null;
            } else if (wanted.has(name)) {
                return null;
            } else if (!open && !inSetup) {
                outside.push(lines[index]!);
            }
            continue;
        }
        if (!open && !inSetup) outside.push(lines[index]!);
    }

    if (open || inSetup) return null;
    return { frontmatter, bodyStart, blocks, setup, outsideText: outside.join(""), lines };
}

// ── Hashes ───────────────────────────────────────────────────────────

export function blockHash(content: string): string {
    const normalized = content.replace(/\r\n/g, "\n");
    return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 8);
}

/** computeHash-equivalent of the raw frontmatter ("" if none) — the unit hash of a file with blocks. */
export function frontmatterHash(content: string): string {
    const normalized = extractFrontmatter(content).replace(/\r\n/g, "\n");
    return createHash("sha256").update(normalized, "utf8").digest("hex");
}

// ── Rendering ────────────────────────────────────────────────────────

function renderBlock(block: TemplateBlock): string {
    return `<${block.name}>\n${block.content}</${block.name}>\n`;
}

function renderFresh(frontmatter: string, blocks: TemplateBlock[]): string {
    let output = frontmatter;
    if (blocks.some((block) => hasFillInstruction(block.content))) {
        output += `${output ? "\n" : ""}${SETUP_REQUIRED_TEXT}`;
    }
    if (blocks.length > 0) {
        output += `${output ? "\n" : ""}${blocks.map(renderBlock).join("\n")}`;
    }
    return output;
}

/** Fence length for the wrapper: max(3, longest line-starting backtick run in the new content + 1). */
function wrapperFenceLength(content: string): number {
    let longest = 0;
    for (const line of splitLines(content)) {
        const match = lineText(line).match(/^`+/);
        if (match) longest = Math.max(longest, match[0].length);
    }
    return Math.max(3, longest + 1);
}

/** Appends the outdated-block wrapper before the closing tag, replacing an existing one in place. */
function withFillWrapper(current: string, template: string): string {
    const lines = splitLines(current);
    for (let index = 0; index < lines.length - 1; index++) {
        if (!FILL_OPEN.test(lineText(lines[index]!))) continue;
        if (lineText(lines[index + 1]!) !== FILL_WRAPPER_MARKER) continue;
        const close = lines.findIndex((line, at) => at > index && FILL_CLOSE.test(lineText(line)));
        if (close > index) {
            lines.splice(index, close - index + 1);
            break;
        }
    }
    const fence = "`".repeat(wrapperFenceLength(template));
    const body = template.endsWith("\n") || template === "" ? template : `${template}\n`;
    const wrapper = `<FILL_INSTRUCTION>\n${FILL_WRAPPER_MARKER}\n\n${fence}md\n${body}${fence}\n</FILL_INSTRUCTION>\n`;
    const head = lines.join("");
    return `${head}${head && !head.endsWith("\n") ? "\n" : ""}${wrapper}`;
}

// ── Merge ────────────────────────────────────────────────────────────

type BlockAction = { type: "replace" | "conflict"; block: TemplateBlock } | { type: "keep" | "remove" };

export function mergeBlockFile(args: MergeBlockFileArgs): MergeBlockFileResult {
    const { blocks: templateBlocks } = args.template;
    const installed = args.installed;
    const inTemplate = new Set(templateBlocks.map((block) => block.name));

    const newHashes: Record<string, string> = {};
    const declined = new Set([...args.declined].filter((name) => inTemplate.has(name)));
    const kept: string[] = [];
    const released: string[] = [];
    const foreign: string[] = [];
    const conflicts: string[] = [];
    const actions = new Map<string, BlockAction>();
    const insertions: TemplateBlock[] = [];

    for (const block of templateBlocks) {
        const templateHash = blockHash(block.content);
        const inLock = block.name in args.lockHashes;
        const lockHash = args.lockHashes[block.name];
        const region = installed?.blocks.get(block.name);
        const currentHash = region ? blockHash(region.content) : undefined;

        if (args.selected.has(block.name)) {
            if (region && inLock) {
                if (currentHash === lockHash || currentHash === templateHash) {
                    actions.set(block.name, { type: "replace", block });
                } else if (templateHash !== lockHash) {
                    if (args.force) {
                        actions.set(block.name, { type: "replace", block });
                    } else {
                        actions.set(block.name, { type: "conflict", block });
                        conflicts.push(block.name);
                    }
                } else {
                    actions.set(block.name, { type: "keep" });
                }
                newHashes[block.name] = templateHash;
            } else if (region && (currentHash === templateHash || args.force)) {
                // An untracked region (e.g. a released block brought back upstream): adopt it.
                actions.set(block.name, { type: "replace", block });
                newHashes[block.name] = templateHash;
            } else if (region || (args.occupied?.has(block.name) && !args.force)) {
                declined.add(block.name);
                foreign.push(block.name);
            } else {
                insertions.push(block);
                newHashes[block.name] = templateHash;
            }
            continue;
        }

        // Deselected.
        if (region && inLock) {
            if (currentHash === lockHash || args.force) {
                actions.set(block.name, { type: "remove" });
                declined.add(block.name);
            } else {
                actions.set(block.name, { type: "keep" });
                newHashes[block.name] = lockHash!;
                kept.push(block.name);
                declined.delete(block.name);
            }
        } else {
            declined.add(block.name);
        }
    }

    // Recorded names that left the template.
    for (const name of Object.keys(args.lockHashes)) {
        if (inTemplate.has(name)) continue;
        declined.delete(name);
        const region = installed?.blocks.get(name);
        if (!region) continue;
        const lockHash = args.lockHashes[name]!;
        if (blockHash(region.content) === lockHash || args.force) {
            actions.set(name, { type: "remove" });
        } else {
            actions.set(name, { type: "keep" });
            released.push(name);
        }
    }

    const content =
        installed === null
            ? renderFresh(args.template.frontmatter, insertions)
            : mergeInstalled(args, installed, actions, insertions);

    return {
        content,
        blocks: newHashes,
        declinedBlocks: [...declined].sort(),
        kept: kept.sort(),
        released: released.sort(),
        foreign: foreign.sort(),
        conflicts: conflicts.sort(),
    };
}

function mergeInstalled(
    args: MergeBlockFileArgs,
    installed: InstalledBlocks,
    actions: Map<string, BlockAction>,
    insertions: TemplateBlock[],
): string {
    const { lines, bodyStart } = installed;
    const output: string[] = splitLines(args.template.frontmatter);

    const blockAtOpen = new Map<number, InstalledBlockRegion>();
    for (const region of installed.blocks.values()) blockAtOpen.set(region.open, region);

    // Anchor each insertion at the nearest template-ordered block present in the file.
    const insertAfter = new Map<number, string[]>();
    const insertBefore = new Map<number, string[]>();
    const atEnd: string[] = [];
    for (const block of insertions) {
        const rendered = renderBlock(block);
        const position = args.template.blocks.indexOf(block);
        let anchor: InstalledBlockRegion | undefined;
        for (let index = position - 1; index >= 0; index--) {
            const name = args.template.blocks[index]!.name;
            const candidate = installed.blocks.get(name);
            if (candidate && actions.get(name)?.type !== "remove") {
                anchor = candidate;
                break;
            }
        }
        if (anchor) {
            const list = insertAfter.get(anchor.close) ?? [];
            list.push(rendered);
            insertAfter.set(anchor.close, list);
            continue;
        }
        for (let index = position + 1; index < args.template.blocks.length; index++) {
            const name = args.template.blocks[index]!.name;
            const candidate = installed.blocks.get(name);
            if (candidate && actions.get(name)?.type !== "remove") {
                anchor = candidate;
                break;
            }
        }
        if (anchor) {
            const list = insertBefore.get(anchor.open) ?? [];
            list.push(rendered);
            insertBefore.set(anchor.open, list);
        } else {
            atEnd.push(rendered);
        }
    }

    const separateBefore = (rendered: string): void => {
        const last = output[output.length - 1];
        if (last !== undefined && last.trim() !== "") output.push("\n");
        output.push(rendered);
    };

    let index = bodyStart;
    while (index < lines.length) {
        if (installed.setup && index === installed.setup.start) {
            index = installed.setup.end + 1;
            if (index < lines.length && lines[index]!.trim() === "") index++;
            continue;
        }
        const region = blockAtOpen.get(index);
        if (!region) {
            output.push(lines[index]!);
            index++;
            continue;
        }
        const action = actions.get(region.name) ?? { type: "keep" as const };
        for (const rendered of insertBefore.get(index) ?? []) {
            separateBefore(rendered);
            output.push("\n");
        }
        if (action.type === "remove") {
            index = region.close + 1;
            if (index < lines.length && lines[index]!.trim() === "") index++;
            else if (output[output.length - 1]?.trim() === "") output.pop();
            continue;
        }
        output.push(lines[region.open]!);
        if (action.type === "replace") {
            output.push(...splitLines(action.block.content));
        } else if (action.type === "conflict") {
            output.push(...splitLines(withFillWrapper(region.content, action.block.content)));
        } else {
            output.push(...lines.slice(region.open + 1, region.close));
        }
        output.push(lines[region.close]!);
        index = region.close + 1;
        for (const rendered of insertAfter.get(region.close) ?? []) {
            if (output[output.length - 1]?.trim() !== "") output.push("\n");
            output.push(rendered);
            if (index < lines.length && lines[index]!.trim() !== "") output.push("\n");
        }
    }
    for (const rendered of atEnd) separateBefore(rendered);

    // Re-add SETUP_REQUIRED when FILL_INSTRUCTIONs remain.
    const frontmatterLines = splitLines(args.template.frontmatter).length;
    if (hasFillInstruction(output.slice(frontmatterLines).join(""))) {
        const insertion: string[] = [];
        const previous = output[frontmatterLines - 1];
        if (frontmatterLines > 0 && previous !== undefined && previous.trim() !== "") insertion.push("\n");
        insertion.push(...splitLines(SETUP_REQUIRED_TEXT));
        const next = output[frontmatterLines];
        if (next !== undefined && next.trim() !== "") insertion.push("\n");
        output.splice(frontmatterLines, 0, ...insertion);
    }

    return output.join("");
}
