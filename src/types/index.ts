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
    /** Files included in this bundle. */
    items: TemplateItem[];
}

/** A single template file within a bundle. */
export interface TemplateItem {
    /** Path relative to src/templates/ (e.g., "rdpi/agents/rdpi-approve.agent.md"). */
    source: string;
    /** Path relative to install root (e.g., "agents/rdpi-approve.agent.md"). */
    target: string;
    /** MDA file category for display grouping. */
    category: ItemCategory;
}

export type ItemCategory = "agent" | "skill" | "instruction" | "stage-definition";

// ── Install Target Types (§3.2) ──────────────────────────────────────

/** Where files are installed. */
export type InstallTargetType = "project" | "user";

/** Resolved install target with absolute paths. */
export interface InstallTarget {
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
    /** Bundle name ("rdpi", "base"). Maps to `astp-bundle` field. */
    bundle: string;
    /** Bundle version at install/update time ("1.0.0"). Maps to `astp-version` field. */
    version: string;
    /** SHA-256 hash of template content (without astp-* fields). Maps to `astp-hash` field. */
    hash: string;
}

/** An installed file with its metadata and filesystem location. */
export interface InstalledFile {
    /** Absolute path to the installed file. */
    filePath: string;
    /** Path relative to install root (matches manifest item.target). */
    relativePath: string;
    /** Parsed astp-* metadata from frontmatter. */
    metadata: InstalledFileMetadata;
}

/** Files grouped by bundle after scanning the install target. */
export interface InstalledBundle {
    bundleName: string;
    version: string;
    files: InstalledFile[];
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
}

/** Details about an available update for a single bundle. */
export interface BundleUpdate {
    bundleName: string;
    installedVersion: string;
    availableVersion: string;
    /** Per-file status (modified, unmodified, new, removed). */
    files: FileStatus[];
}

export interface FileStatus {
    /** Path relative to install root. */
    targetPath: string;
    state: FileState;
}

export type FileState = "unmodified" | "modified" | "new" | "removed";

// ── Re-exports ───────────────────────────────────────────────────────

export { resolveTarget } from "./resolve-target.js";
