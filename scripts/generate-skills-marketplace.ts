/**
 * Regenerates `.claude-plugin/marketplace.json` from `templates/manifest.json`,
 * so `npx skills add fozy-labs/astp` finds the skills shipped in `templates/`.
 *
 *   npm run generate:skills          # write the file
 *   npm run generate:skills:check    # fail if the committed file is stale
 *
 * Only the file-system edges live here; the logic sits in `skills-marketplace.ts`
 * and is covered by `tests/scripts/skills-marketplace.test.ts`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { Manifest } from "../src/types/index.js";

import type { SkillLocation } from "./skills-marketplace.ts";
import {
    buildMarketplace,
    collectSkillLocations,
    collectSkillNames,
    GENERATE_COMMAND,
    MARKETPLACE_PATH,
    normalizeLineEndings,
    parseManifest,
    selectBundles,
    serializeMarketplace,
    TEMPLATES_DIR,
    validateManifestSources,
    validateSkillFile,
} from "./skills-marketplace.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST_PATH = `${TEMPLATES_DIR}/manifest.json`;

async function main(): Promise<void> {
    const checkOnly = process.argv.includes("--check");

    const manifest = parseManifest(await fs.readFile(path.join(REPO_ROOT, MANIFEST_PATH), "utf8"));
    const locations = collectSkillLocations(manifest);

    const errors = [...validateManifestSources(manifest), ...(await validateSkillFiles(locations))];
    if (errors.length > 0) {
        console.error(`${MANIFEST_PATH} and templates/ disagree:`);
        for (const error of errors) console.error(`  - ${error}`);
        process.exitCode = 1;
        return;
    }

    for (const warning of await findUnlistedSkills(manifest)) {
        console.warn(`warning: ${warning}`);
    }

    const content = serializeMarketplace(buildMarketplace(manifest));
    const outputPath = path.join(REPO_ROOT, MARKETPLACE_PATH);
    const existing = await readFileOrNull(outputPath);
    const isCurrent = existing !== null && normalizeLineEndings(existing) === content;

    if (checkOnly) {
        if (isCurrent) {
            console.log(`${MARKETPLACE_PATH} is up to date.`);
            return;
        }
        console.error(
            `${MARKETPLACE_PATH} is ${existing === null ? "missing" : "stale"}. Run \`${GENERATE_COMMAND}\`.`,
        );
        process.exitCode = 1;
        return;
    }

    if (isCurrent) {
        console.log(`${MARKETPLACE_PATH} unchanged (${describe(locations)}).`);
        return;
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, "utf8");
    console.log(`${existing === null ? "Created" : "Updated"} ${MARKETPLACE_PATH} (${describe(locations)}).`);
}

function describe(locations: SkillLocation[]): string {
    const plugins = new Set(locations.map((location) => location.pluginName));
    return `${locations.length} skills in ${plugins.size} plugins: ${[...plugins].join(", ")}`;
}

async function validateSkillFiles(locations: SkillLocation[]): Promise<string[]> {
    const errors: string[] = [];
    for (const location of locations) {
        const skillMd = path.join(REPO_ROOT, location.dir, "SKILL.md");
        const content = await readFileOrNull(skillMd);
        if (content === null) {
            errors.push(`${location.dir}/SKILL.md: listed in the manifest but missing on disk`);
            continue;
        }
        errors.push(...validateSkillFile(location, content));
    }
    return errors;
}

/**
 * Skill directories present on disk but absent from the manifest. Not an error —
 * a skill may be work in progress — but silence here would ship a bundle that
 * looks complete and is not.
 */
async function findUnlistedSkills(manifest: Manifest): Promise<string[]> {
    const warnings: string[] = [];
    for (const bundle of selectBundles(manifest)) {
        const listed = new Set(collectSkillNames(bundle));
        const skillsDir = path.join(REPO_ROOT, TEMPLATES_DIR, bundle.name, "skills");
        let entries;
        try {
            entries = await fs.readdir(skillsDir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || listed.has(entry.name)) continue;
            const hasSkillMd = (await readFileOrNull(path.join(skillsDir, entry.name, "SKILL.md"))) !== null;
            if (hasSkillMd) {
                warnings.push(
                    `${TEMPLATES_DIR}/${bundle.name}/skills/${entry.name} exists on disk but is not in ${MANIFEST_PATH} — it will not be published`,
                );
            }
        }
    }
    return warnings;
}

async function readFileOrNull(filePath: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, "utf8");
    } catch {
        return null;
    }
}

try {
    await main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
