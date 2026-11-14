import fs from "node:fs/promises";
import path from "node:path";

import type { Platform } from "@/types/index.js";
import { supportsPlatform } from "@/types/index.js";

import { hasBlocks, parseTemplateBlocks } from "./blocks.js";
import type { TemplateBlock } from "./blocks.js";
import type { TemplateUnit } from "./units.js";

/** A downloaded template file that contains `<astp-block>` blocks. */
export interface UnitBlockFile {
    /** Item target relative to the install root. */
    target: string;
    content: string;
    frontmatter: string;
    blocks: TemplateBlock[];
}

/** Files of a unit that contain blocks, keyed by item target. */
export async function readUnitBlockFiles(
    tempDir: string,
    unit: TemplateUnit,
    platform?: Platform,
): Promise<Map<string, UnitBlockFile>> {
    const items = unit.kind === "skill" ? unit.items : [unit.item];
    const result = new Map<string, UnitBlockFile>();
    for (const item of items) {
        const content = await fs.readFile(path.join(tempDir, item.target), "utf8");
        if (!hasBlocks(content)) continue;
        const parsed = parseTemplateBlocks(content);
        if (parsed.errors.length > 0) {
            throw new Error(`Template file '${item.target}' has invalid blocks: ${parsed.errors.join("; ")}`);
        }
        const blocks = [];
        const supported = new Set<string>();
        for (const block of parsed.blocks) {
            if (
                (!platform || supportsPlatform(block.platforms, platform)) &&
                (!block.parent || supported.has(block.parent))
            ) {
                blocks.push(block);
                supported.add(block.name);
            }
        }
        result.set(item.target, {
            target: item.target,
            content,
            frontmatter: parsed.frontmatter,
            blocks,
        });
    }
    return result;
}
