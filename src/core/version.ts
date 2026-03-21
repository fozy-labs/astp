import fs from "node:fs/promises";
import path from "node:path";

import type {
    BundleUpdate,
    FileState,
    FileStatus,
    InstalledBundle,
    InstalledFile,
    Manifest,
    UpdateReport,
} from "@/types/index.js";

import { computeHash, extractAstpMetadata, stripAstpFields } from "./frontmatter.js";

export async function scanInstalled(installRoot: string): Promise<InstalledBundle[]> {
    const files = await findMdFiles(installRoot);
    const installedFiles: InstalledFile[] = [];

    for (const filePath of files) {
        const content = await fs.readFile(filePath, "utf8");
        const metadata = extractAstpMetadata(content);
        if (!metadata) continue;

        const relativePath = path.relative(installRoot, filePath).replace(/\\/g, "/");
        installedFiles.push({ filePath, relativePath, metadata });
    }

    // Group by bundle
    const bundleMap = new Map<string, InstalledFile[]>();
    for (const file of installedFiles) {
        const key = file.metadata.bundle;
        if (!bundleMap.has(key)) bundleMap.set(key, []);
        bundleMap.get(key)!.push(file);
    }

    return Array.from(bundleMap.entries()).map(([bundleName, files]) => ({
        bundleName,
        version: files[0].metadata.version,
        files,
    }));
}

async function findMdFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...(await findMdFiles(fullPath)));
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
            results.push(fullPath);
        }
    }

    return results;
}

export function compareVersions(installed: InstalledBundle[], manifest: Manifest): UpdateReport {
    const updates: BundleUpdate[] = [];
    const upToDate: InstalledBundle[] = [];
    const notInManifest: InstalledBundle[] = [];

    for (const bundle of installed) {
        const manifestBundle = manifest.bundles[bundle.bundleName];
        if (!manifestBundle) {
            notInManifest.push(bundle);
            continue;
        }

        const cmp = compareSemver(bundle.version, manifestBundle.version);
        if (cmp < 0) {
            const files: FileStatus[] = classifyFiles(bundle, manifestBundle);
            updates.push({
                bundleName: bundle.bundleName,
                installedVersion: bundle.version,
                availableVersion: manifestBundle.version,
                files,
            });
        } else {
            upToDate.push(bundle);
        }
    }

    return { updates, upToDate, notInManifest };
}

function classifyFiles(installed: InstalledBundle, manifestBundle: { items: { target: string }[] }): FileStatus[] {
    const files: FileStatus[] = [];
    const installedPaths = new Set(installed.files.map((f) => f.relativePath));
    const manifestPaths = new Set(manifestBundle.items.map((i) => i.target));

    for (const file of installed.files) {
        if (manifestPaths.has(file.relativePath)) {
            files.push({ targetPath: file.relativePath, state: "unmodified" });
        } else {
            files.push({ targetPath: file.relativePath, state: "removed" });
        }
    }

    for (const item of manifestBundle.items) {
        if (!installedPaths.has(item.target)) {
            files.push({ targetPath: item.target, state: "new" });
        }
    }

    return files;
}

function compareSemver(a: string, b: string): number {
    const parse = (v: string): number[] | null => {
        const parts = v.split(".").map(Number);
        return parts.some(isNaN) ? null : parts;
    };

    const va = parse(a);
    const vb = parse(b);

    // Invalid installed version → treat as outdated
    if (!va) return -1;
    // Invalid manifest version → treat as up to date (don't update to unknown)
    if (!vb) return 0;

    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const na = va[i] ?? 0;
        const nb = vb[i] ?? 0;
        if (na < nb) return -1;
        if (na > nb) return 1;
    }

    return 0;
}

export async function detectModified(bundle: InstalledBundle, _installRoot: string): Promise<FileStatus[]> {
    const results: FileStatus[] = [];

    for (const file of bundle.files) {
        const content = await fs.readFile(file.filePath, "utf8");

        if (!file.metadata.hash) {
            results.push({ targetPath: file.relativePath, state: "modified" });
            continue;
        }

        const stripped = stripAstpFields(content);
        const currentHash = computeHash(stripped);
        const state: FileState = currentHash === file.metadata.hash ? "unmodified" : "modified";
        results.push({ targetPath: file.relativePath, state });
    }

    return results;
}
