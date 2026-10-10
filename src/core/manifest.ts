import type { Bundle, ItemCategory, Manifest, Platform } from "@/types/index.js";
import { ALL_PLATFORMS } from "@/types/index.js";

import { assertSafeName, assertSafeRelativePath, nullPrototype } from "./path-safety.js";

const SUPPORTED_SCHEMA_VERSION = 1;
const VALID_PLATFORMS: ReadonlySet<Platform> = new Set(ALL_PLATFORMS);
const VALID_CATEGORIES: ReadonlySet<ItemCategory> = new Set(["agent", "skill", "rule"]);

export function validateManifest(data: unknown): Manifest {
    if (typeof data !== "object" || data === null) {
        throw new Error("Invalid manifest: expected an object");
    }

    const obj = data as Record<string, unknown>;

    if (!("schemaVersion" in obj)) {
        throw new Error("Invalid manifest: missing schemaVersion");
    }

    if (typeof obj.schemaVersion !== "number") {
        throw new Error("Invalid manifest: schemaVersion must be a number");
    }

    if (obj.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
        throw new Error(`Unsupported manifest schema version ${obj.schemaVersion}. Update astp CLI.`);
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

    if (!("items" in bundle) || !Array.isArray(bundle.items)) {
        throw new Error(`Invalid bundle '${key}': missing or invalid items`);
    }

    const targets = bundle.items.map((item: unknown, index) => {
        const at = `Invalid bundle '${key}': items[${index}]`;
        if (typeof item !== "object" || item === null) throw new Error(`${at} must be an object`);
        const { source, target, category } = item as Record<string, unknown>;
        assertSafeRelativePath(target, `${at}.target`);
        if (source !== `${key}/${target}`) throw new Error(`${at}.source must be '${key}/${target}'`);
        if (!VALID_CATEGORIES.has(category as ItemCategory)) {
            throw new Error(`${at}.category must be one of: ${[...VALID_CATEGORIES].join(", ")}`);
        }
        return target;
    });
    assertNoCollisions(targets, `Invalid bundle '${key}': items`);

    if ("platforms" in bundle && bundle.platforms !== undefined) {
        if (!Array.isArray(bundle.platforms) || bundle.platforms.length === 0) {
            throw new Error(`Invalid bundle '${key}': platforms must be a non-empty array when present`);
        }
        for (const platform of bundle.platforms) {
            if (typeof platform !== "string" || !VALID_PLATFORMS.has(platform as Platform)) {
                throw new Error(
                    `Invalid bundle '${key}': unknown platform '${String(platform)}'. Expected one of: ${[...VALID_PLATFORMS].join(", ")}`,
                );
            }
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
            const folded = prefix.normalize("NFC").toUpperCase().toLowerCase();
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
