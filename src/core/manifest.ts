import type { Bundle, ItemCategory, Manifest, Platform } from "@/types/index.js";
import { ALL_PLATFORMS } from "@/types/index.js";

import { assertSafeName, assertSafeRelativePath, foldPath, nullPrototype } from "./path-safety.js";
import { isOsClutterName } from "./skill-tree.js";

/** Supported manifest schema versions: major version → max supported minor version. */
export const SUPPORTED_SCHEMA_VERSIONS: Readonly<Record<number, number>> = {
    1: 0,
    2: 1,
};

export const UPDATE_CLI_COMMAND = "npm install -g @fozy-labs/astp";

export interface SchemaVersion {
    major: number;
    minor: number;
}

export interface NewerManifestNotice {
    manifestVersion: string;
    supportedVersion: string;
    updateCommand: string;
}

const SCHEMA_VERSION_REGEX = /^([1-9]\d*)\.(0|[1-9]\d*)$/;
const VALID_PLATFORMS: ReadonlySet<Platform> = new Set(ALL_PLATFORMS);
const VALID_CATEGORIES: ReadonlySet<ItemCategory> = new Set(["agent", "skill", "rule"]);
const LABEL_REGEX = /^[a-z][a-z0-9_-]*$/;

export function parseSchemaVersion(raw: unknown): SchemaVersion {
    if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1) {
        return { major: raw, minor: 0 };
    }
    if (typeof raw === "string") {
        const match = raw.match(SCHEMA_VERSION_REGEX);
        if (match) {
            const major = Number(match[1]);
            const minor = Number(match[2]);
            if (Number.isSafeInteger(major) && Number.isSafeInteger(minor)) {
                return { major, minor };
            }
        }
    }
    throw new Error("Invalid manifest: schemaVersion must be a positive integer or 'major.minor' string");
}

export function formatSupportedSchemaVersions(
    supported: Readonly<Record<number, number>> = SUPPORTED_SCHEMA_VERSIONS,
): string {
    return Object.entries(supported)
        .map(([major, maxMinor]) => [Number(major), maxMinor] as const)
        .sort(([a], [b]) => a - b)
        .map(([major, maxMinor]) => (maxMinor === 0 ? `${major}.0` : `${major}.0–${major}.${maxMinor}`))
        .join(", ");
}

export function checkManifestVersion(
    manifest: Pick<Manifest, "schemaVersion">,
    supported: Readonly<Record<number, number>> = SUPPORTED_SCHEMA_VERSIONS,
): NewerManifestNotice | null {
    const version = parseSchemaVersion(manifest.schemaVersion);
    const maxMinor = supported[version.major];
    if (maxMinor !== undefined && version.minor > maxMinor) {
        return {
            manifestVersion: `${version.major}.${version.minor}`,
            supportedVersion: `${version.major}.${maxMinor}`,
            updateCommand: UPDATE_CLI_COMMAND,
        };
    }
    return null;
}

export function validateManifest(
    data: unknown,
    supported: Readonly<Record<number, number>> = SUPPORTED_SCHEMA_VERSIONS,
): Manifest {
    if (typeof data !== "object" || data === null) {
        throw new Error("Invalid manifest: expected an object");
    }

    const obj = data as Record<string, unknown>;

    if (!("schemaVersion" in obj)) {
        throw new Error("Invalid manifest: missing schemaVersion");
    }

    const version = parseSchemaVersion(obj.schemaVersion);
    if (supported[version.major] === undefined) {
        const maxSupportedMajor = Math.max(...Object.keys(supported).map(Number));
        const suffix = version.major > maxSupportedMajor ? ` Update astp CLI: ${UPDATE_CLI_COMMAND}` : "";
        throw new Error(
            `Unsupported manifest schema version ${String(obj.schemaVersion)} (supported: ${formatSupportedSchemaVersions(supported)}).${suffix}`,
        );
    }

    if (!("bundles" in obj) || typeof obj.bundles !== "object" || obj.bundles === null) {
        throw new Error("Invalid manifest: missing or invalid bundles");
    }

    const bundles = obj.bundles as Record<string, unknown>;
    if (Object.keys(bundles).length === 0) {
        throw new Error("Invalid manifest: bundles must not be empty");
    }

    assertNoCollisions(Object.keys(bundles), "Invalid manifest: bundles");
    for (const [key, value] of Object.entries(bundles)) {
        validateBundle(key, value);
    }

    return { ...obj, bundles: nullPrototype(bundles) } as Manifest;
}

function validateBundle(key: string, data: unknown): void {
    if (typeof data !== "object" || data === null) {
        throw new Error(`Invalid bundle '${key}': expected an object`);
    }

    const bundle = data as Record<string, unknown>;

    assertSafeName(bundle.name, `Invalid bundle '${key}': name`);
    if (bundle.name !== key) {
        throw new Error(`Invalid bundle '${key}': name '${bundle.name}' must equal its key`);
    }

    if (!("version" in bundle) || typeof bundle.version !== "string") {
        throw new Error(`Invalid bundle '${key}': missing or invalid version`);
    }

    if ("use-when" in bundle && bundle["use-when"] !== undefined) {
        if (typeof bundle["use-when"] !== "string" || bundle["use-when"].trim() === "") {
            throw new Error(`Invalid bundle '${key}': use-when must be a non-empty string`);
        }
    }

    if (!("items" in bundle) || !Array.isArray(bundle.items)) {
        throw new Error(`Invalid bundle '${key}': missing or invalid items`);
    }

    const targets = bundle.items.map((item: unknown, index) => {
        const at = `Invalid bundle '${key}': items[${index}]`;
        if (typeof item !== "object" || item === null) throw new Error(`${at} must be an object`);
        const { source, target, category } = item as Record<string, unknown>;
        assertSafeRelativePath(target, `${at}.target`);
        if (isOsClutterName(target.split("/").pop()!)) {
            throw new Error(`${at}.target '${target}' is an OS clutter file name; astp ignores it in skills`);
        }
        if (source !== `${key}/${target}`) throw new Error(`${at}.source must be '${key}/${target}'`);
        if (!VALID_CATEGORIES.has(category as ItemCategory)) {
            throw new Error(`${at}.category must be one of: ${[...VALID_CATEGORIES].join(", ")}`);
        }
        validateUnitMetadata(item as Record<string, unknown>, at);
        return target as string;
    });

    if (bundle.refs !== undefined && !Array.isArray(bundle.refs)) {
        throw new Error(`Invalid bundle '${key}': refs must be an array`);
    }
    for (const [index, ref] of (bundle.refs ?? []).entries()) {
        const at = `Invalid bundle '${key}': refs[${index}]`;
        if (typeof ref !== "object" || ref === null) throw new Error(`${at} must be an object`);
        const { source, target } = ref as Record<string, unknown>;
        if (typeof source !== "string" || source.trim() === "") {
            throw new Error(`${at}.source must be a non-empty string`);
        }
        assertSafeRelativePath(target, `${at}.target`);
        const segments = target.split("/");
        if (segments.length !== 2 || segments[0] !== "skills") {
            throw new Error(`${at}.target must look like 'skills/<name>'`);
        }
        validateUnitMetadata(ref as Record<string, unknown>, at);
        targets.push(target);
    }
    const what = (bundle.refs?.length ?? 0) > 0 ? "items and refs" : "items";
    assertNoCollisions(targets, `Invalid bundle '${key}': ${what}`);

    validatePlatforms(bundle.platforms, `Invalid bundle '${key}'`);
}

function validateUnitMetadata(unit: Record<string, unknown>, at: string): void {
    const { optional, labels, platforms } = unit;
    validatePlatforms(platforms, at);
    if (optional !== undefined && typeof optional !== "boolean") {
        throw new Error(`${at}.optional must be a boolean`);
    }
    if (labels !== undefined) {
        if (!Array.isArray(labels)) {
            throw new Error(`${at}.labels must be an array of strings`);
        }
        const seenLabels = new Set<string>();
        for (const label of labels) {
            if (typeof label !== "string" || !LABEL_REGEX.test(label)) {
                throw new Error(`${at}.labels has invalid label '${String(label)}' (expected [a-z][a-z0-9_-]*)`);
            }
            if (seenLabels.has(label)) {
                throw new Error(`${at}.labels has duplicate label '${label}'`);
            }
            seenLabels.add(label);
        }
    }
}

function validatePlatforms(value: unknown, at: string): void {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${at}: platforms must be a non-empty array when present`);
    }
    for (const filter of value) {
        const platform = typeof filter === "string" && filter.startsWith("!") ? filter.slice(1) : filter;
        if (typeof platform !== "string" || !VALID_PLATFORMS.has(platform as Platform)) {
            throw new Error(
                `${at}: unknown platform '${String(filter)}'. Expected one of: ${[...VALID_PLATFORMS].join(", ")}`,
            );
        }
    }
}

/**
 * Every path and each of its parent folders must name one file on Windows and macOS, which ignore case
 * and Unicode normalization; a path also may not repeat or double as another path's folder.
 */
function assertNoCollisions(paths: string[], what: string): void {
    const seen = new Map<string, { path: string; file: boolean }>();
    for (const full of paths) {
        const segments = full.split("/");
        for (let length = 1; length <= segments.length; length++) {
            const prefix = segments.slice(0, length).join("/");
            const file = length === segments.length;
            const folded = foldPath(prefix);
            const other = seen.get(folded);
            if (other && (other.path !== prefix || other.file || file)) {
                throw new Error(`${what} ${JSON.stringify(other.path)} and ${JSON.stringify(prefix)} collide`);
            }
            seen.set(folded, { path: prefix, file });
        }
    }
}

export function resolveBundle(manifest: Manifest, bundleName: string): Bundle {
    const bundle = manifest.bundles[bundleName];
    if (!bundle) {
        const available = Object.keys(manifest.bundles).join(", ");
        throw new Error(`Bundle '${bundleName}' not found. Available: ${available}`);
    }
    return bundle;
}
