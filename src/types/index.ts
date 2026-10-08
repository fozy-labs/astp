// ── Platform Types (§3.0) ────────────────────────────────────────────

/**
 * Coding agent platform a bundle targets.
 * `claude-code` — Anthropic Claude Code CLI (installs under `.claude/` or `$CLAUDE_CONFIG_DIR`, else `~/.claude/`).
 */
export type Platform = "claude-code";

export const ALL_PLATFORMS = ["claude-code"] as const satisfies readonly Platform[];

// ── Remote Manifest Types (§3.1) ──────────────────────────────────────

/** Remote manifest.json schema — the source of truth for available templates. */
export interface Manifest {
    /** Schema version (integer). CLI checks compatibility before processing. */
    schemaVersion: number;
    /** Source repository in "owner/repo" format. */
    repository: string;
    /** Available bundles, keyed by bundle name. */
    bundles: Record<string, Bundle>;
}

/** A named, versioned collection of template files. */
export interface Bundle {
    /** Bundle identifier (matches the key in Manifest.bundles). */
    name: string;
    /** Semver version string (e.g., "1.0.0"). */
    version: string;
    /** Human-readable description for display in prompts. */
    description: string;
    /** Whether this bundle is pre-selected by default in the interactive wizard. */
    default: boolean;
    /**
     * Platforms this bundle can be installed on. Defaults to all platforms when omitted.
     */
    platforms?: Platform[];
    /** Files included in this bundle. */
    items: TemplateItem[];
}

/** A single template file within a bundle. */
export interface TemplateItem {
    /** Path relative to templates/ (e.g., "docs/skills/markdown-craft/SKILL.md"). */
    source: string;
    /** Path relative to install root (e.g., "skills/markdown-craft/SKILL.md"). */
    target: string;
    /** MDA file category for display grouping. */
    category: ItemCategory;
}

export type ItemCategory = "agent" | "skill" | "instruction";

// ── Install Target Types (§3.2) ──────────────────────────────────────

/** Where files are installed. */
export type InstallTargetType = "project" | "user";

/** Resolved install target with absolute paths. */
export interface InstallTarget {
    /** Coding agent platform this target belongs to. */
    platform: Platform;
    type: InstallTargetType;
    /** Absolute path to the install root directory. */
    rootDir: string;
}

// ── Installed File Metadata Types (§3.3) ─────────────────────────────

/**
 * Metadata extracted from astp-* frontmatter fields of an installed file.
 * These fields are injected by the CLI during install/update.
 */
export interface InstalledFileMetadata {
    /** Source repository ("fozy-labs/astp"). Maps to `astp-source` frontmatter field. */
    source: string;
    /** Bundle name ("docs", "fozy-labs"). Maps to `astp-bundle` field. */
    bundle: string;
    /** Bundle version at install/update time ("1.0.0"). Maps to `astp-version` field. */
    version: string;
    /** SHA-256 of file content or the skill tree, excluding root astp-* fields. Maps to `astp-hash`. */
    hash: string;
}

/** An installed file item with its metadata and filesystem location. */
export interface InstalledFileUnit {
    kind: "file";
    /** Absolute path to the installed file. */
    filePath: string;
    /** Path relative to install root (matches manifest item.target). */
    relativePath: string;
    /** Parsed astp-* metadata from frontmatter. */
    metadata: InstalledFileMetadata;
}

/** An installed skill directory and its SKILL.md metadata. */
export interface InstalledSkillUnit {
    kind: "skill";
    /** Absolute path to the installed skill directory. */
    dirPath: string;
    /** Absolute path to the skill's SKILL.md file. */
    skillFilePath: string;
    /** Skill directory path relative to install root. */
    relativePath: string;
    /** Parsed astp-* metadata from SKILL.md frontmatter. */
    metadata: InstalledFileMetadata;
    /** Whether this directory uses the old per-file skill metadata format. */
    legacy: boolean;
}

export type InstalledUnit = InstalledFileUnit | InstalledSkillUnit;

/** Files and skill directories grouped by bundle after scanning the install target. */
export interface InstalledBundle {
    bundleName: string;
    /** Oldest unmodified unit version, or newest installed-unit version if all are modified or legacy. */
    version: string;
    units: InstalledUnit[];
}

// ── Version Comparison Types (§3.4) ──────────────────────────────────

/** Result of comparing installed state against remote manifest. */
export interface UpdateReport {
    /** Bundles with newer versions available. */
    updates: BundleUpdate[];
    /** Bundles that are up to date. */
    upToDate: InstalledBundle[];
    /** Installed bundles not found in remote manifest (removed upstream). */
    notInManifest: InstalledBundle[];
    /** Skill directories still using per-file metadata from older installs. */
    legacySkills: Array<{ bundleName: string; targetPath: string; inManifest: boolean }>;
}

/** Details about an available update for a single bundle. */
export interface BundleUpdate {
    bundleName: string;
    installedVersion: string;
    availableVersion: string;
    /** Per-unit status (modified, unmodified, new, removed). */
    units: FileStatus[];
}

export interface FileStatus {
    /** Path relative to install root. */
    targetPath: string;
    kind: "file" | "skill";
    state: FileState;
}

export type FileState = "unmodified" | "modified" | "legacy" | "new" | "removed";

// ── Re-exports ───────────────────────────────────────────────────────

export { bundleSupportsPlatform, filterBundlesByPlatform, getBundlePlatforms } from "./platform.js";
export { describeTarget, resolveTarget } from "./resolve-target.js";
