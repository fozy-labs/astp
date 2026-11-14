import fs from "node:fs/promises";
import path from "node:path";

import { readDescription } from "./frontmatter.js";
import type { TemplateUnit } from "./units.js";

export async function readUnitDescription(tempDir: string, unit: TemplateUnit): Promise<string | null> {
    const item =
        unit.kind === "file"
            ? unit.item
            : unit.items.find((item) => item.target === path.posix.join(unit.relativePath, "SKILL.md"));
    if (!item) return null;
    return readDescription(await fs.readFile(path.join(tempDir, item.target), "utf8"));
}
