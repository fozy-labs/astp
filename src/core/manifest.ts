import type { Bundle, Manifest } from "@/types/index.js";

const SUPPORTED_SCHEMA_VERSION = 1;

export async function fetchManifest(repository?: string, ref?: string): Promise<Manifest> {
    const repo = repository ?? "fozy-labs/astp";
    const branch = ref ?? "main";
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(repo.split("/")[0])}/${encodeURIComponent(repo.split("/")[1])}/${encodeURIComponent(branch)}/src/templates/manifest.json`;

    let response: Response;
    try {
        response = await fetch(url);
    } catch {
        throw new Error("Failed to fetch manifest: network error. Check your internet connection.");
    }

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`Manifest not found at ref ${branch}`);
        }
        throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch {
        throw new Error("Failed to fetch manifest: invalid JSON response");
    }

    return validateManifest(data);
}

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

    if (!("repository" in obj) || typeof obj.repository !== "string") {
        throw new Error("Invalid manifest: missing or invalid repository");
    }

    if (!("bundles" in obj) || typeof obj.bundles !== "object" || obj.bundles === null) {
        throw new Error("Invalid manifest: missing or invalid bundles");
    }

    const bundles = obj.bundles as Record<string, unknown>;
    if (Object.keys(bundles).length === 0) {
        throw new Error("Invalid manifest: bundles must not be empty");
    }

    for (const [key, value] of Object.entries(bundles)) {
        validateBundle(key, value);
    }

    return data as Manifest;
}

function validateBundle(key: string, data: unknown): void {
    if (typeof data !== "object" || data === null) {
        throw new Error(`Invalid bundle '${key}': expected an object`);
    }

    const bundle = data as Record<string, unknown>;

    if (!("name" in bundle) || typeof bundle.name !== "string") {
        throw new Error(`Invalid bundle '${key}': missing or invalid name`);
    }

    if (!("version" in bundle) || typeof bundle.version !== "string") {
        throw new Error(`Invalid bundle '${key}': missing or invalid version`);
    }

    if (!("items" in bundle) || !Array.isArray(bundle.items)) {
        throw new Error(`Invalid bundle '${key}': missing or invalid items`);
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
