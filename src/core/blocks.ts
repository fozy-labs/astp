/**
 * Pure parser and merger for `<astp-block>` template blocks (issue #11).
 *
 * Deliberately dependency-free (only node:crypto, no `@/` aliases): `scripts/`
 * imports this file directly under `node --experimental-strip-types`, so both
 * the CLI and the marketplace generator share one definition of the format.
 */

import { createHash } from "node:crypto";

import type { PlatformFilter } from "../types/index.js";

/** Same regex as `FM_REGEX` in frontmatter.ts — copied to keep this file dependency-free. */
const FM_REGEX = /^(---[ \t]*\r?\n)([\s\S]*?)(---[ \t]*(?:\r?\n|$))/;

const NAME_REGEX = /^[a-z][a-z0-9_]*$/;
const LABEL_REGEX = /^[a-z][a-z0-9_-]*$/;
const VALID_PLATFORMS = new Set(["claude-code"]);
const BLOCK_OPEN = /^<astp-block(?=[\s>])((?:[^>"]|"[^"]*")*)>\s*$/;
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
    parent?: string;
    description: string | null;
    useWhen?: string;
    labels?: string[];
    platforms?: PlatformFilter[];
    optional: boolean;
    required: boolean;
    /** Lines between the tag lines, including nested template blocks. */
    content: string;
}

export interface InstalledBlockRegion {
    name: string;
    parent?: string;
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
    /** Line range of the `<SETUP_REQUIRED>` region, inclusive; `edited` when its text differs from the default. */
    setup: { start: number; end: number; edited: boolean } | null;
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
    /** `true` forces every block; a set forces only the named ones. */
    force: boolean | ReadonlySet<string>;
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
    const normalized = content.replace(/\r\n/g, "\n");
    const frontmatter = extractFrontmatter(normalized);
    const lines = splitLines(normalized);
    const bodyStart = splitLines(frontmatter).length;
    const errors: Array<{ line: number; message: string }> = [];
    const blocks: TemplateBlock[] = [];
    const names = new Set<string>();
    const outsideLines: number[] = [];
    const installedTags: Array<{ index: number; name: string; text: string }> = [];
    const open: Array<{ block: TemplateBlock; line: number; contentStart: number }> = [];
    let sawBlock = false;
    let fence: Fence | null = null;

    const error = (line: number, message: string): void => {
        errors.push({ line, message });
    };

    for (let index = bodyStart; index < lines.length; index++) {
        const text = lineText(lines[index]!);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            if (open.length === 0 && text.trim() !== "") outsideLines.push(index);
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            if (open.length === 0 && text.trim() !== "") outsideLines.push(index);
            continue;
        }
        if (SETUP_OPEN.test(text) || SETUP_CLOSE.test(text)) {
            error(index, "<SETUP_REQUIRED> is not allowed in template files");
            continue;
        }
        if (FILL_OPEN.test(text) || FILL_CLOSE.test(text)) {
            if (open.length === 0) error(index, "<FILL_INSTRUCTION> must be inside an <astp-block>");
            continue;
        }
        const openMatch = text.match(BLOCK_OPEN);
        if (openMatch) {
            sawBlock = true;
            const parsed = parseAttributes(openMatch[1] ?? "", index, error);
            const parent = open[open.length - 1]?.block.name;
            const block: TemplateBlock = {
                name: parsed.name,
                ...(parent ? { parent } : {}),
                description: parsed.description,
                ...(parsed.useWhen ? { useWhen: parsed.useWhen } : {}),
                ...(parsed.labels.length > 0 ? { labels: parsed.labels } : {}),
                ...(parsed.platforms.length > 0 ? { platforms: parsed.platforms } : {}),
                optional: parsed.optional,
                required: parsed.required,
                content: "",
            };
            blocks.push(block);
            open.push({ block, line: index, contentStart: index + 1 });
            if (parsed.name && names.has(parsed.name)) {
                error(index, `duplicate block name '${parsed.name}'`);
            } else if (parsed.name) {
                names.add(parsed.name);
            }
            continue;
        }
        if (BLOCK_OPEN_PREFIX.test(text)) {
            error(index, 'malformed <astp-block> tag (expected a whole line like <astp-block name="x" optional>)');
            continue;
        }
        if (BLOCK_CLOSE.test(text)) {
            const current = open.pop();
            if (!current) {
                error(index, "stray </astp-block>");
                continue;
            }
            current.block.content = lines.slice(current.contentStart, index).join("");
            continue;
        }
        if (open.length > 0) {
            const tag = text.match(NAME_OPEN) ?? text.match(NAME_CLOSE);
            if (tag) installedTags.push({ index, name: tag[1]!, text });
        }
        if (open.length === 0 && text.trim() !== "") outsideLines.push(index);
    }

    for (const current of open) error(current.line, `unclosed <astp-block name="${current.block.name}">`);
    for (const { index, name, text } of installedTags) {
        if (names.has(name)) error(index, `'${text}' matches the installed tag of block '${name}'`);
    }
    if (sawBlock) {
        for (const index of outsideLines) {
            error(index, "text outside <astp-block> blocks is not allowed");
        }
    }

    return {
        frontmatter,
        blocks: blocks.filter((block) => block.name),
        errors: errors.sort((a, b) => a.line - b.line).map((entry) => `line ${entry.line + 1}: ${entry.message}`),
    };
}

function parseAttributes(
    attrPart: string,
    line: number,
    error: (line: number, message: string) => void,
): {
    name: string;
    description: string | null;
    useWhen: string | null;
    labels: string[];
    platforms: PlatformFilter[];
    optional: boolean;
    required: boolean;
} {
    let name = "";
    let description: string | null = null;
    let sawDescription = false;
    let useWhen: string | null = null;
    let sawUseWhen = false;
    const labels: string[] = [];
    let sawLabels = false;
    const platforms: PlatformFilter[] = [];
    let sawPlatforms = false;
    let optional = false;
    let required = false;
    for (const token of attrPart.match(/[^\s"]*(?:"[^"]*"[^\s"]*)+|[^\s"]+/g) ?? []) {
        const nameMatch = token.match(/^name="([^"]*)"$/);
        const descMatch = token.match(/^description="([^"]*)"$/);
        const useWhenMatch = token.match(/^use-when="([^"]*)"$/);
        const labelsMatch = token.match(/^labels="([^"]*)"$/);
        const platformsMatch = token.match(/^platforms="([^"]*)"$/);
        if (nameMatch) {
            if (name) error(line, "duplicate 'name' attribute");
            name = nameMatch[1]!;
        } else if (descMatch) {
            if (sawDescription) error(line, "duplicate 'description' attribute");
            sawDescription = true;
            const trimmed = descMatch[1]!.trim();
            if (!trimmed) error(line, "empty 'description' attribute");
            else description = trimmed;
        } else if (useWhenMatch) {
            if (sawUseWhen) error(line, "duplicate 'use-when' attribute");
            sawUseWhen = true;
            const trimmed = useWhenMatch[1]!.trim();
            if (!trimmed) error(line, "empty 'use-when' attribute");
            else useWhen = trimmed;
        } else if (labelsMatch) {
            if (sawLabels) error(line, "duplicate 'labels' attribute");
            sawLabels = true;
            const raw = labelsMatch[1]!.trim();
            if (!raw) {
                error(line, "empty 'labels' attribute");
            } else {
                const seen = new Set<string>();
                for (const part of raw.split(",")) {
                    const label = part.trim();
                    if (!LABEL_REGEX.test(label)) {
                        error(line, `invalid block label '${label}' (expected [a-z][a-z0-9_-]*)`);
                    } else if (seen.has(label)) {
                        error(line, `duplicate block label '${label}'`);
                    } else {
                        seen.add(label);
                        labels.push(label);
                    }
                }
            }
        } else if (platformsMatch) {
            if (sawPlatforms) error(line, "duplicate 'platforms' attribute");
            sawPlatforms = true;
            const raw = platformsMatch[1]!.trim();
            if (!raw) {
                error(line, "empty 'platforms' attribute");
            } else {
                const seen = new Set<string>();
                for (const part of raw.split(",")) {
                    const filter = part.trim();
                    const platform = filter.startsWith("!") ? filter.slice(1) : filter;
                    if (!VALID_PLATFORMS.has(platform)) {
                        error(line, `unknown block platform '${filter}'`);
                    } else if (seen.has(filter)) {
                        error(line, `duplicate block platform '${filter}'`);
                    } else {
                        seen.add(filter);
                        platforms.push(filter as PlatformFilter);
                    }
                }
            }
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
    return { name, description, useWhen, labels, platforms, optional, required };
}

// ── Installed parse ──────────────────────────────────────────────────

/**
 * Parses an installed file looking only for the recorded `names` and
 * SETUP_REQUIRED. Returns null when the file no longer parses — the unit then
 * counts as modified.
 */
export function parseInstalledBlocks(content: string, names: string[]): InstalledBlocks | null {
    const normalized = content.replace(/\r\n/g, "\n");
    const frontmatter = extractFrontmatter(normalized);
    const lines = splitLines(normalized);
    const bodyStart = splitLines(frontmatter).length;
    const wanted = new Set(names);
    const blocks = new Map<string, InstalledBlockRegion>();
    const outside: string[] = [];
    const open: Array<{ name: string; line: number }> = [];
    let fence: Fence | null = null;
    let setup: { start: number; end: number; edited: boolean } | null = null;
    let inSetup = false;
    let setupStart = 0;

    for (let index = bodyStart; index < lines.length; index++) {
        const text = lineText(lines[index]!);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            if (open.length === 0 && !inSetup) outside.push(lines[index]!);
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            if (open.length === 0 && !inSetup) outside.push(lines[index]!);
            continue;
        }
        if (SETUP_OPEN.test(text)) {
            if (open.length > 0) continue; // consumer text inside a recorded block
            if (inSetup || setup) return null;
            inSetup = true;
            setupStart = index;
            continue;
        }
        if (SETUP_CLOSE.test(text)) {
            if (open.length > 0) continue;
            if (!inSetup) return null;
            setup = {
                start: setupStart,
                end: index,
                edited: lines.slice(setupStart, index + 1).join("") !== SETUP_REQUIRED_TEXT,
            };
            inSetup = false;
            continue;
        }
        const nameOpen = text.match(NAME_OPEN);
        if (nameOpen) {
            const name = nameOpen[1]!;
            if (wanted.has(name)) {
                if (inSetup || blocks.has(name)) return null;
                open.push({ name, line: index });
            } else if (open.length === 0 && !inSetup) {
                outside.push(lines[index]!);
            }
            continue;
        }
        const nameClose = text.match(NAME_CLOSE);
        if (nameClose) {
            const name = nameClose[1]!;
            const current = open[open.length - 1];
            if (current?.name === name) {
                blocks.set(name, {
                    name,
                    ...(open.length > 1 ? { parent: open[open.length - 2]!.name } : {}),
                    open: current.line,
                    close: index,
                    content: lines.slice(current.line + 1, index).join(""),
                });
                open.pop();
            } else if (wanted.has(name)) {
                return null;
            } else if (open.length === 0 && !inSetup) {
                outside.push(lines[index]!);
            }
            continue;
        }
        if (open.length === 0 && !inSetup) outside.push(lines[index]!);
    }

    if (open.length > 0 || inSetup || fence) return null;
    return { frontmatter, bodyStart, blocks, setup, outsideText: outside.join(""), lines };
}

// ── Hashes ───────────────────────────────────────────────────────────

export function blockHash(content: string): string {
    const normalized = content.replace(/\r\n/g, "\n");
    return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 8);
}

export function installedBlockHash(region: InstalledBlockRegion, installed: InstalledBlocks): string {
    return blockHash(ownInstalledContent(region, installed));
}

/** computeHash-equivalent of the raw frontmatter ("" if none) — the unit hash of a file with blocks. */
export function frontmatterHash(content: string): string {
    const normalized = extractFrontmatter(content).replace(/\r\n/g, "\n");
    return createHash("sha256").update(normalized, "utf8").digest("hex");
}

// ── Rendering ────────────────────────────────────────────────────────

interface ChildRange {
    name: string;
    start: number;
    end: number;
}

function templateChildRanges(content: string): ChildRange[] {
    const lines = splitLines(content);
    const ranges: ChildRange[] = [];
    const open: Array<{ name: string; start: number }> = [];
    let fence: Fence | null = null;
    for (let index = 0; index < lines.length; index++) {
        const text = lineText(lines[index]!);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            continue;
        }
        const match = text.match(BLOCK_OPEN);
        if (match) {
            const name = (match[1] ?? "").match(/(?:^|\s)name="([^"]*)"/)?.[1] ?? "";
            open.push({ name, start: index });
        } else if (BLOCK_CLOSE.test(text)) {
            const current = open.pop();
            if (current && open.length === 0) ranges.push({ name: current.name, start: current.start, end: index });
        }
    }
    return ranges;
}

function childrenOf(blocks: TemplateBlock[], parent?: string): TemplateBlock[] {
    return blocks.filter((block) => block.parent === parent);
}

export function ownTemplateContent(block: TemplateBlock): string {
    const lines = splitLines(block.content);
    const ranges = templateChildRanges(block.content);
    return lines.filter((_, index) => !ranges.some((range) => index >= range.start && index <= range.end)).join("");
}

function ownInstalledContent(region: InstalledBlockRegion, installed: InstalledBlocks): string {
    const ranges = [...installed.blocks.values()]
        .filter((block) => block.parent === region.name)
        .map((block) => ({ start: block.open - region.open - 1, end: block.close - region.open - 1 }));
    return splitLines(region.content)
        .filter((_, index) => !ranges.some((range) => index >= range.start && index <= range.end))
        .join("");
}

function renderFreshBlock(block: TemplateBlock, blocks: TemplateBlock[], selected: ReadonlySet<string>): string {
    const lines = splitLines(block.content);
    const ranges = templateChildRanges(block.content);
    const byName = new Map(blocks.map((entry) => [entry.name, entry]));
    let output = "";
    let index = 0;
    for (const range of ranges) {
        output += lines.slice(index, range.start).join("");
        const child = byName.get(range.name);
        if (child && selected.has(child.name)) output += renderFreshBlock(child, blocks, selected);
        index = range.end + 1;
    }
    output += lines.slice(index).join("");
    return `<${block.name}>\n${output}</${block.name}>\n`;
}

function renderFresh(frontmatter: string, blocks: TemplateBlock[], selected: ReadonlySet<string>): string {
    let output = frontmatter;
    const roots = childrenOf(blocks).filter((block) => selected.has(block.name));
    if (blocks.some((block) => selected.has(block.name) && hasFillInstruction(ownTemplateContent(block)))) {
        output += `${output ? "\n" : ""}${SETUP_REQUIRED_TEXT}`;
    }
    if (roots.length > 0) {
        output += `${output ? "\n" : ""}${roots.map((block) => renderFreshBlock(block, blocks, selected)).join("\n")}`;
    }
    return output;
}

/** Fence length for the wrapper: max(3, longest line-starting backtick run in the new content + 1). */
function wrapperFenceLength(content: string): number {
    let longest = 0;
    for (const line of splitLines(content)) {
        const match = lineText(line).match(/^ {0,3}(`+)/);
        if (match) longest = Math.max(longest, match[1]!.length);
    }
    return Math.max(3, longest + 1);
}

/** Appends the outdated-block wrapper before the closing tag, replacing an existing one in place. */
function withFillWrapper(current: string, template: string): string {
    const lines = splitLines(current);
    let fence: Fence | null = null;
    let noteStart = -1;
    for (let index = 0; index < lines.length; index++) {
        const text = lineText(lines[index]!);
        if (fence) {
            if (fenceCloses(text, fence)) fence = null;
            continue;
        }
        const opened = fenceOpen(text);
        if (opened) {
            fence = opened;
            continue;
        }
        if (noteStart < 0) {
            if (FILL_OPEN.test(text) && lineText(lines[index + 1] ?? "") === FILL_WRAPPER_MARKER) noteStart = index;
        } else if (FILL_CLOSE.test(text)) {
            lines.splice(noteStart, index - noteStart + 1);
            break;
        }
    }
    const wrapperFence = "`".repeat(wrapperFenceLength(template));
    const body = template.endsWith("\n") || template === "" ? template : `${template}\n`;
    const wrapper = `<FILL_INSTRUCTION>\n${FILL_WRAPPER_MARKER}\n\n${wrapperFence}md\n${body}${wrapperFence}\n</FILL_INSTRUCTION>\n`;
    const head = lines.join("");
    return `${head}${head && !head.endsWith("\n") ? "\n" : ""}${wrapper}`;
}

// ── Merge ────────────────────────────────────────────────────────────

type BlockAction = { type: "replace" | "conflict"; block: TemplateBlock } | { type: "keep" | "remove" };

export function mergeBlockFile(args: MergeBlockFileArgs): MergeBlockFileResult {
    const { blocks: templateBlocks } = args.template;
    const installed = args.installed;
    const inTemplate = new Set(templateBlocks.map((block) => block.name));
    const forced = (name: string): boolean => args.force === true || (args.force !== false && args.force.has(name));

    const newHashes = Object.create(null) as Record<string, string>;
    const declined = new Set([...args.declined].filter((name) => inTemplate.has(name)));
    const kept: string[] = [];
    const released: string[] = [];
    const foreign: string[] = [];
    const conflicts: string[] = [];
    const actions = new Map<string, BlockAction>();
    const insertions: TemplateBlock[] = [];

    const selected = new Set(args.selected);
    const byName = new Map(templateBlocks.map((block) => [block.name, block]));
    for (const block of templateBlocks) {
        let current = block;
        while (selected.has(current.name) && current.parent) {
            selected.add(current.parent);
            current = byName.get(current.parent)!;
        }
    }
    for (const block of templateBlocks) {
        if (block.parent && !selected.has(block.parent)) selected.delete(block.name);
    }

    for (const block of templateBlocks) {
        const ownContent = ownTemplateContent(block);
        const templateHash = blockHash(ownContent);
        const inLock = block.name in args.lockHashes;
        const lockHash = args.lockHashes[block.name];
        const region = installed?.blocks.get(block.name);
        const currentHash = region && installed ? blockHash(ownInstalledContent(region, installed)) : undefined;

        if (selected.has(block.name)) {
            if (region && inLock) {
                if (currentHash === lockHash || currentHash === templateHash) {
                    actions.set(block.name, { type: "replace", block });
                } else if (forced(block.name) && !hasFillInstruction(ownContent)) {
                    actions.set(block.name, { type: "replace", block });
                } else if (templateHash !== lockHash) {
                    actions.set(block.name, { type: "conflict", block });
                    conflicts.push(block.name);
                } else {
                    actions.set(block.name, { type: "keep" });
                }
                newHashes[block.name] = templateHash;
            } else if (region && (currentHash === templateHash || forced(block.name))) {
                // An untracked region (e.g. a released block brought back upstream): adopt it.
                actions.set(block.name, { type: "replace", block });
                newHashes[block.name] = templateHash;
            } else if (region || (args.occupied?.has(block.name) && !forced(block.name))) {
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
            if (currentHash === lockHash || forced(block.name)) {
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

    const foreignNames = new Set(foreign);
    for (const block of templateBlocks) {
        let parent = block.parent;
        let blocked = false;
        while (parent) {
            if (foreignNames.has(parent)) {
                blocked = true;
                break;
            }
            parent = byName.get(parent)?.parent;
        }
        if (!blocked) continue;
        actions.delete(block.name);
        const insertion = insertions.indexOf(block);
        if (insertion >= 0) insertions.splice(insertion, 1);
        delete newHashes[block.name];
        declined.add(block.name);
        for (const list of [kept, conflicts]) {
            const index = list.indexOf(block.name);
            if (index >= 0) list.splice(index, 1);
        }
    }

    // Recorded names that left the template.
    for (const name of Object.keys(args.lockHashes)) {
        if (inTemplate.has(name)) continue;
        declined.delete(name);
        const region = installed?.blocks.get(name);
        if (!region) continue;
        const lockHash = args.lockHashes[name]!;
        if (installed && blockHash(ownInstalledContent(region, installed)) === lockHash) {
            actions.set(name, { type: "remove" });
        } else if (forced(name)) {
            actions.set(name, { type: "remove" });
        } else {
            actions.set(name, { type: "keep" });
            released.push(name);
        }
    }

    if (installed) {
        const regions = [...installed.blocks.values()].sort((a, b) => b.open - a.open);
        for (const region of regions) {
            if (actions.get(region.name)?.type !== "remove") continue;
            const retainedChild = regions.some(
                (candidate) => candidate.parent === region.name && actions.get(candidate.name)?.type !== "remove",
            );
            if (!retainedChild) continue;
            actions.set(region.name, { type: "keep" });
            if (inTemplate.has(region.name)) {
                newHashes[region.name] = args.lockHashes[region.name]!;
                declined.delete(region.name);
                kept.push(region.name);
            } else {
                released.push(region.name);
            }
        }
    }

    const content =
        installed === null
            ? renderFresh(args.template.frontmatter, templateBlocks, selected)
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

interface MergeContext {
    args: MergeBlockFileArgs;
    installed: InstalledBlocks;
    actions: Map<string, BlockAction>;
    insertions: TemplateBlock[];
    byName: Map<string, TemplateBlock>;
    emitted: Set<string>;
}

function mergeInstalled(
    args: MergeBlockFileArgs,
    installed: InstalledBlocks,
    actions: Map<string, BlockAction>,
    insertions: TemplateBlock[],
): string {
    const context: MergeContext = {
        args,
        installed,
        actions,
        insertions,
        byName: new Map(args.template.blocks.map((block) => [block.name, block])),
        emitted: new Set(),
    };
    const output = splitLines(args.template.frontmatter);
    output.push(...mergeRange(installed.bodyStart, installed.lines.length, undefined, context, true));

    // Re-add SETUP_REQUIRED when FILL_INSTRUCTIONs remain.
    const frontmatterLines = splitLines(args.template.frontmatter).length;
    if (!installed.setup?.edited && hasFillInstruction(output.slice(frontmatterLines).join(""))) {
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

function renderExistingRegion(region: InstalledBlockRegion, context: MergeContext): string {
    if (context.emitted.has(region.name)) return "";
    context.emitted.add(region.name);
    const action = context.actions.get(region.name) ?? { type: "keep" as const };
    if (action.type === "remove") return "";
    let content: string;
    if (action.type === "replace") {
        content = renderTemplateRegion(action.block, context);
    } else if (action.type === "conflict") {
        content = renderConflictRegion(region, action.block, context);
    } else {
        content = mergeRange(region.open + 1, region.close, region.name, context, false).join("");
    }
    return `${context.installed.lines[region.open]!}${content}${context.installed.lines[region.close]!}`;
}

function renderInsertedBlock(block: TemplateBlock, context: MergeContext): string {
    return `<${block.name}>\n${renderTemplateRegion(block, context)}</${block.name}>\n`;
}

function renderTemplateRegion(block: TemplateBlock, context: MergeContext): string {
    const lines = splitLines(block.content);
    const ranges = templateChildRanges(block.content);
    let output = "";
    let index = 0;
    for (const range of ranges) {
        output += lines.slice(index, range.start).join("");
        const child = context.byName.get(range.name);
        if (child) {
            const region = context.installed.blocks.get(child.name);
            if (region) output += renderExistingRegion(region, context);
            else if (context.insertions.includes(child)) {
                output += renderInsertedBlock(child, context);
            }
        }
        index = range.end + 1;
    }
    output += lines.slice(index).join("");
    for (const region of context.installed.blocks.values()) {
        if (region.parent === block.name && !context.byName.has(region.name)) {
            output += renderExistingRegion(region, context);
        }
    }
    return output;
}

function renderConflictRegion(region: InstalledBlockRegion, block: TemplateBlock, context: MergeContext): string {
    const lines = splitLines(region.content);
    const children = [...context.installed.blocks.values()].filter((child) => child.parent === region.name);
    const markers = new Map<string, string>();
    let output = "";
    let index = 0;
    for (const child of children) {
        const start = child.open - region.open - 1;
        const end = child.close - region.open - 1;
        const marker = `@@ASTP_NESTED_${child.name}@@\n`;
        output += lines.slice(index, start).join("") + marker;
        const moved = context.byName.has(child.name) && context.byName.get(child.name)!.parent !== region.name;
        markers.set(marker, moved ? "" : renderExistingRegion(child, context));
        index = end + 1;
    }
    output += lines.slice(index).join("");
    output = withFillWrapper(output, ownTemplateContent(block));
    for (const [marker, rendered] of markers) output = output.replace(marker, rendered);
    for (const child of context.insertions.filter((entry) => entry.parent === region.name)) {
        const rendered = renderInsertedBlock(child, context);
        output = insertAtTemplateText(output, child, rendered, context) ?? output + rendered;
    }
    return output;
}

function insertAtTemplateText(
    content: string,
    block: TemplateBlock,
    rendered: string,
    context: MergeContext,
): string | null {
    if (!block.parent) return null;
    const parent = context.byName.get(block.parent);
    if (!parent) return null;
    const lines = splitLines(parent.content);
    const ranges = templateChildRanges(parent.content);
    const position = ranges.findIndex((range) => range.name === block.name);
    if (position < 0) return null;
    const range = ranges[position]!;
    const before = lines.slice(position > 0 ? ranges[position - 1]!.end + 1 : 0, range.start).join("");
    const after = lines.slice(range.end + 1, ranges[position + 1]?.start).join("");
    if (after.trim()) {
        const anchor = content.indexOf(after);
        if (anchor >= 0) return content.slice(0, anchor) + rendered + content.slice(anchor);
    }
    if (before.trim()) {
        const anchor = content.indexOf(before);
        if (anchor >= 0)
            return content.slice(0, anchor + before.length) + rendered + content.slice(anchor + before.length);
    }
    return null;
}

function mergeRange(
    start: number,
    end: number,
    parent: string | undefined,
    context: MergeContext,
    root: boolean,
): string[] {
    const { installed, actions, args } = context;
    const { lines } = installed;
    const output: string[] = [];
    const siblings = childrenOf(args.template.blocks, parent);
    const blockAtOpen = new Map<number, InstalledBlockRegion>();
    for (const region of installed.blocks.values()) {
        if (region.parent === parent) blockAtOpen.set(region.open, region);
    }

    const arrivals = siblings.flatMap((block) => {
        if (context.insertions.includes(block)) {
            return [{ block, rendered: renderInsertedBlock(block, context) }];
        }
        const region = installed.blocks.get(block.name);
        return region && region.parent !== parent ? [{ block, rendered: renderExistingRegion(region, context) }] : [];
    });

    // Anchor arrivals at the nearest template-ordered sibling still present at this level.
    const insertAfter = new Map<number, string[]>();
    const insertBefore = new Map<number, string[]>();
    const atEnd: Array<{ block: TemplateBlock; rendered: string }> = [];
    for (const arrival of arrivals) {
        const position = siblings.indexOf(arrival.block);
        let anchor: InstalledBlockRegion | undefined;
        for (let index = position - 1; index >= 0; index--) {
            const sibling = siblings[index]!;
            const candidate = installed.blocks.get(sibling.name);
            if (candidate && candidate.parent === parent && actions.get(candidate.name)?.type !== "remove") {
                anchor = candidate;
                break;
            }
        }
        if (anchor) {
            const list = insertAfter.get(anchor.close) ?? [];
            list.push(arrival.rendered);
            insertAfter.set(anchor.close, list);
            continue;
        }
        for (let index = position + 1; index < siblings.length; index++) {
            const candidate = installed.blocks.get(siblings[index]!.name);
            if (candidate && candidate.parent === parent && actions.get(candidate.name)?.type !== "remove") {
                anchor = candidate;
                break;
            }
        }
        if (anchor) {
            const list = insertBefore.get(anchor.open) ?? [];
            list.push(arrival.rendered);
            insertBefore.set(anchor.open, list);
        } else {
            atEnd.push(arrival);
        }
    }

    const separateBefore = (rendered: string): void => {
        const last = output[output.length - 1];
        if (last !== undefined && last.trim() !== "") output.push("\n");
        output.push(rendered);
    };

    let index = start;
    while (index < end) {
        if (root && installed.setup && index === installed.setup.start) {
            if (installed.setup.edited) {
                output.push(...lines.slice(installed.setup.start, installed.setup.end + 1));
            }
            index = installed.setup.end + 1;
            if (!installed.setup.edited && index < end && lines[index]!.trim() === "") index++;
            continue;
        }
        const region = blockAtOpen.get(index);
        if (!region) {
            output.push(lines[index]!);
            index++;
            continue;
        }
        for (const rendered of insertBefore.get(index) ?? []) {
            separateBefore(rendered);
            output.push("\n");
        }
        const relocated = context.byName.has(region.name) && context.byName.get(region.name)!.parent !== parent;
        if (relocated || actions.get(region.name)?.type === "remove") {
            index = region.close + 1;
            if (index < end && lines[index]!.trim() === "") index++;
            else if (output[output.length - 1]?.trim() === "") output.pop();
            continue;
        }
        output.push(renderExistingRegion(region, context));
        index = region.close + 1;
        for (const rendered of insertAfter.get(region.close) ?? []) {
            if (output[output.length - 1]?.trim() !== "") output.push("\n");
            output.push(rendered);
            if (index < end && lines[index]!.trim() !== "") output.push("\n");
        }
    }
    for (const arrival of atEnd) {
        const positioned = insertAtTemplateText(output.join(""), arrival.block, arrival.rendered, context);
        if (positioned !== null) {
            output.length = 0;
            output.push(positioned);
        } else {
            separateBefore(arrival.rendered);
        }
    }
    return output;
}
