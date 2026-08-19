/**
 * Pure logic behind `.claude-plugin/marketplace.json` — the file that lets the
 * `skills` CLI (`npx skills add fozy-labs/astp`, vercel-labs/skills) discover the
 * skills that live inside `templates/<bundle>/skills/`.
 *
 * Without that file the CLI only finds our skills through its recursive fallback
 * scan: flat, ungrouped, and gone the moment a `skills/` or `.claude/skills/`
 * directory appears in the repository root.
 *
 * Repository-side tooling: it validates the *sources* committed here, while
 * `src/core/manifest.ts` validates a manifest downloaded by an installed CLI.
 * The two never share a runtime — only types.
 */

import type { Bundle, Manifest, TemplateItem } from "../src/types/index.js";

// ── Constants ────────────────────────────────────────────────────────

/** Directory holding template bundles, relative to the repository root. */
export const TEMPLATES_DIR = "templates";

/** Generated marketplace file, relative to the repository root. */
export const MARKETPLACE_PATH = ".claude-plugin/marketplace.json";

/** Command that regenerates the marketplace file. */
export const GENERATE_COMMAND = "npm run generate:skills";

const GENERATED_NOTE = `Generated from templates/manifest.json — do not edit by hand, run \`${GENERATE_COMMAND}\`.`;

// ── Marketplace Types ────────────────────────────────────────────────

/** One bundle exposed to the `skills` CLI as a plugin. */
export interface MarketplacePlugin {
    /** Bundle name — also the grouping label the CLI shows. */
    name: string;
    /** Repository-relative path to the bundle directory. Must start with `./`. */
    source: string;
    description: string;
    version: string;
    /** Skill directories relative to `source`. Must start with `./`. */
    skills: string[];
}

/** Shape of `.claude-plugin/marketplace.json`. */
export interface Marketplace {
    name: string;
    owner: { name: string; url: string };
    metadata: { description: string };
    plugins: MarketplacePlugin[];
}

/** A skill directory resolved to a repository-relative path, for on-disk validation. */
export interface SkillLocation {
    /** Bundle the skill belongs to. */
    pluginName: string;
    /** Directory name under `skills/` — must match the SKILL.md `name` field. */
    skillName: string;
    /** e.g. `templates/docs/skills/markdown-craft`. */
    dir: string;
}

/** The two frontmatter fields the `skills` CLI requires. */
export interface SkillFrontmatter {
    name?: string;
    description?: string;
}

// ── Bundle Selection ─────────────────────────────────────────────────

/**
 * A bundle ships to the marketplace when it supports Claude Code *and* contains
 * at least one skill. Bundles built around VS Code agents and instructions
 * (`base`, `rdpi`) are excluded: the `skills` CLI installs skills only, so a
 * partial install would hand the user a pipeline with its agents missing.
 *
 * Mirrors the default in `src/types/platform.ts`: a bundle without `platforms`
 * predates platform support and is VS Code–only.
 */
export function supportsClaudeCode(bundle: Bundle): boolean {
    return (bundle.platforms ?? []).includes("claude-code");
}

export function selectBundles(manifest: Manifest): Bundle[] {
    return Object.values(manifest.bundles)
        .filter((bundle) => supportsClaudeCode(bundle) && bundle.items.some(isSkillItem))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function isSkillItem(item: TemplateItem): boolean {
    return item.category === "skill";
}

/** Skill directory names of a bundle, derived from `skills/<name>/...` targets. */
export function collectSkillNames(bundle: Bundle): string[] {
    const names = new Set<string>();
    for (const item of bundle.items) {
        if (!isSkillItem(item)) continue;
        const name = skillNameFromTarget(item.target);
        if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

function skillNameFromTarget(target: string): string | null {
    const segments = target.split("/");
    if (segments.length < 3 || segments[0] !== "skills" || !segments[1]) return null;
    return segments[1];
}

/** Every skill directory the marketplace will point at, for on-disk validation. */
export function collectSkillLocations(manifest: Manifest): SkillLocation[] {
    return selectBundles(manifest).flatMap((bundle) =>
        collectSkillNames(bundle).map((skillName) => ({
            pluginName: bundle.name,
            skillName,
            dir: `${TEMPLATES_DIR}/${bundle.name}/skills/${skillName}`,
        })),
    );
}

// ── Marketplace Construction ─────────────────────────────────────────

export function buildMarketplace(manifest: Manifest): Marketplace {
    const { owner, repo } = splitRepository(manifest.repository);
    return {
        name: repo,
        owner: { name: owner, url: `https://github.com/${owner}` },
        metadata: { description: GENERATED_NOTE },
        plugins: selectBundles(manifest).map(toPlugin),
    };
}

function toPlugin(bundle: Bundle): MarketplacePlugin {
    return {
        name: bundle.name,
        source: `./${TEMPLATES_DIR}/${bundle.name}`,
        description: bundle.description,
        version: bundle.version,
        skills: collectSkillNames(bundle).map((name) => `./skills/${name}`),
    };
}

function splitRepository(repository: string): { owner: string; repo: string } {
    const [owner, repo, ...rest] = repository.split("/");
    if (!owner || !repo || rest.length > 0) {
        throw new Error(`Invalid manifest repository '${repository}': expected "owner/repo"`);
    }
    return { owner, repo };
}

/** Stable serialization — byte-identical across runs, always LF. */
export function serializeMarketplace(marketplace: Marketplace): string {
    return `${JSON.stringify(marketplace, null, 4)}\n`;
}

/**
 * Normalizes CRLF to LF before a committed file is compared against generated
 * output. With `core.autocrlf=true` a Windows checkout rewrites line endings,
 * which would otherwise report an up-to-date file as stale — the same reason
 * `computeHash()` normalizes before hashing.
 */
export function normalizeLineEndings(content: string): string {
    return content.replace(/\r\n/g, "\n");
}

// ── Manifest Parsing ─────────────────────────────────────────────────

/**
 * Parses `templates/manifest.json` with the checks this generator depends on.
 * Deliberately narrower than `validateManifest()` in `src/core`: that one guards
 * a CLI against a hostile remote, this one guards a maintainer against a typo.
 */
export function parseManifest(raw: string): Manifest {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Invalid manifest: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    }

    if (typeof data !== "object" || data === null) {
        throw new Error("Invalid manifest: expected an object");
    }

    const manifest = data as Partial<Manifest>;
    if (typeof manifest.repository !== "string") {
        throw new Error("Invalid manifest: missing or invalid repository");
    }
    if (typeof manifest.bundles !== "object" || manifest.bundles === null) {
        throw new Error("Invalid manifest: missing or invalid bundles");
    }

    for (const [key, bundle] of Object.entries(manifest.bundles)) {
        if (typeof bundle !== "object" || bundle === null) {
            throw new Error(`Invalid bundle '${key}': expected an object`);
        }
        if (typeof bundle.name !== "string" || typeof bundle.version !== "string") {
            throw new Error(`Invalid bundle '${key}': missing or invalid name/version`);
        }
        if (!Array.isArray(bundle.items)) {
            throw new Error(`Invalid bundle '${key}': missing or invalid items`);
        }
    }

    return data as Manifest;
}

// ── Validation ───────────────────────────────────────────────────────

/**
 * Checks the manifest entries the marketplace is built from. Returns every
 * problem found so a maintainer fixes them in one pass.
 */
export function validateManifestSources(manifest: Manifest): string[] {
    const errors: string[] = [];
    const ownerOfSkill = new Map<string, string>();

    for (const [key, bundle] of Object.entries(manifest.bundles)) {
        if (bundle.name !== key) {
            errors.push(`bundles.${key}: name '${bundle.name}' does not match its key`);
        }
    }

    for (const bundle of selectBundles(manifest)) {
        if (typeof bundle.description !== "string" || bundle.description.length === 0) {
            errors.push(`bundle '${bundle.name}': description is required for a marketplace plugin`);
        }

        for (const item of bundle.items) {
            if (!isSkillItem(item)) continue;
            if (!skillNameFromTarget(item.target)) {
                errors.push(
                    `bundle '${bundle.name}': skill target '${item.target}' must look like skills/<name>/<file>`,
                );
            }
            const expectedSource = `${bundle.name}/${item.target}`;
            if (item.source !== expectedSource) {
                errors.push(
                    `bundle '${bundle.name}': source '${item.source}' must be '${expectedSource}' to match its target`,
                );
            }
        }

        for (const skillName of collectSkillNames(bundle)) {
            const hasSkillMd = bundle.items.some(
                (item) => isSkillItem(item) && item.target === `skills/${skillName}/SKILL.md`,
            );
            if (!hasSkillMd) {
                errors.push(`bundle '${bundle.name}': skill '${skillName}' has no skills/${skillName}/SKILL.md item`);
            }

            // The skills CLI keeps one flat namespace across a repository: a duplicate
            // name is silently dropped on install.
            const previousOwner = ownerOfSkill.get(skillName);
            if (previousOwner) {
                errors.push(`skill '${skillName}' is declared by both '${previousOwner}' and '${bundle.name}'`);
            } else {
                ownerOfSkill.set(skillName, bundle.name);
            }
        }
    }

    return errors;
}

/** Checks a SKILL.md against what the `skills` CLI requires of it. */
export function validateSkillFile(location: SkillLocation, content: string): string[] {
    const errors: string[] = [];
    const path = `${location.dir}/SKILL.md`;
    const frontmatter = parseSkillFrontmatter(content);

    if (!frontmatter.name) {
        errors.push(`${path}: missing required frontmatter field 'name'`);
    } else if (frontmatter.name !== location.skillName) {
        // The CLI installs a skill under its frontmatter name; a mismatch would put
        // the files somewhere astp's own target paths never look.
        errors.push(`${path}: frontmatter name '${frontmatter.name}' must match the directory '${location.skillName}'`);
    }

    if (!frontmatter.description) {
        errors.push(`${path}: missing required frontmatter field 'description'`);
    }

    return errors;
}

// ── Frontmatter ──────────────────────────────────────────────────────

const FRONTMATTER_REGEX = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

/**
 * Reads the top-level `name` and `description` of a SKILL.md frontmatter.
 * Covers the YAML subset our skills use: plain scalars, quoted scalars, and
 * folded (`>`) or literal (`|`) blocks.
 */
export function parseSkillFrontmatter(content: string): SkillFrontmatter {
    const match = content.match(FRONTMATTER_REGEX);
    if (!match) return {};

    const fields: Record<string, string> = {};
    let blockKey: string | null = null;
    let blockStyle: ">" | "|" = ">";
    let blockLines: string[] = [];

    const flushBlock = (): void => {
        if (!blockKey) return;
        const lines = [...blockLines];
        while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
        fields[blockKey] = lines.join(blockStyle === "|" ? "\n" : " ").trim();
        blockKey = null;
        blockLines = [];
    };

    for (const line of match[1].split(/\r?\n/)) {
        const isIndented = /^[ \t]/.test(line);
        const keyMatch = isIndented ? null : line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);

        if (keyMatch) {
            flushBlock();
            const [, key, rawValue] = keyMatch;
            const value = rawValue.trim();
            const blockMatch = value.match(/^([>|])[-+]?\d*$/);
            if (blockMatch) {
                blockKey = key;
                blockStyle = blockMatch[1] === "|" ? "|" : ">";
            } else {
                fields[key] = unquote(value);
            }
            continue;
        }

        if (blockKey) blockLines.push(line.trim());
    }
    flushBlock();

    return { name: fields.name, description: fields.description };
}

function unquote(value: string): string {
    const quoted = value.match(/^(["'])([\s\S]*)\1$/);
    return quoted ? quoted[2] : value;
}
