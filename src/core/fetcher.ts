import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { downloadTemplate } from "giget";

import type { Bundle, Manifest } from "@/types/index.js";

import { validateManifest } from "./manifest.js";
import type { ManifestSource } from "./source.js";

const NPM_REGISTRY = "https://registry.npmjs.org";

export async function fetchManifest(source: ManifestSource): Promise<Manifest> {
    let text: string;
    if (source.kind === "url") {
        text = await fetchText(source.manifestUrl, `manifest at ${source.spec}`);
    } else {
        const manifestPath =
            source.kind === "local"
                ? source.manifestPath
                : path.join(await downloadArchive(source), source.manifestFile);
        try {
            text = await fs.readFile(manifestPath, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            const where = source.kind === "local" ? manifestPath : `${source.manifestFile} in the download`;
            throw new Error(`Manifest not found for source '${source.spec}': ${where}`);
        }
    }

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Invalid manifest JSON at source '${source.spec}'`);
    }
    return validateManifest(data);
}

/** Copies or fetches bundle `<root>/<bundle>/` into a fresh temp dir laid out by item `target`. */
export async function downloadBundle(source: ManifestSource, bundle: Bundle): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `astp-${bundle.name}-`));
    try {
        if (source.kind === "url") {
            const root = new URL(".", source.manifestUrl);
            for (const item of bundle.items) {
                const url = new URL([bundle.name, ...item.target.split("/")].map(encodeURIComponent).join("/"), root);
                if (!url.href.startsWith(root.href)) {
                    throw new Error(`item '${item.target}' resolves outside the manifest directory`);
                }
                const response = await request(url);
                // A missing file is reported by assertBundleSources.
                if (response.status === 404) continue;
                if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.href}`);
                const filePath = path.join(tempDir, item.target);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
            }
            return tempDir;
        }

        const manifestRoot =
            source.kind === "local"
                ? path.dirname(source.manifestPath)
                : path.dirname(path.join(await downloadArchive(source), source.manifestFile));
        const bundleDir = path.join(manifestRoot, bundle.name);
        try {
            await fs.cp(bundleDir, tempDir, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            throw new Error(`bundle directory not found: ${source.kind === "local" ? bundleDir : bundle.name}`);
        }
        return tempDir;
    } catch (error) {
        await fs.rm(tempDir, { recursive: true, force: true });
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to download bundle '${bundle.name}' from '${source.spec}': ${message}`);
    }
}

/** Removes the archive download kept for the life of a command. */
export async function closeSource(source: ManifestSource): Promise<void> {
    if (source.kind !== "archive" || !source.downloadDir) return;
    await fs.rm(source.downloadDir, { recursive: true, force: true });
    source.downloadDir = undefined;
}

async function downloadArchive(source: Extract<ManifestSource, { kind: "archive" }>): Promise<string> {
    if (source.downloadDir) return source.downloadDir;
    const address = typeof source.address === "string" ? source.address : await resolveNpmTarball(source.address);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-source-"));
    try {
        await withGigetEnv(source.auth, () => downloadTemplate(address, { dir, force: true }));
    } catch (error) {
        await fs.rm(dir, { recursive: true, force: true });
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to download source '${source.spec}': ${message}`);
    }
    source.downloadDir = dir;
    return dir;
}

async function resolveNpmTarball(pkg: { npm: string; version: string }): Promise<string> {
    const url = new URL(`${NPM_REGISTRY}/${pkg.npm.replace("/", "%2f")}/${encodeURIComponent(pkg.version)}`);
    const text = await fetchText(url, `npm package ${pkg.npm}@${pkg.version}`);
    const tarball = (JSON.parse(text) as { dist?: { tarball?: unknown } }).dist?.tarball;
    if (typeof tarball !== "string") throw new Error(`npm package ${pkg.npm}@${pkg.version} has no dist.tarball`);
    return tarball;
}

/**
 * Workaround for two giget behaviours it has no option for: it reads GIGET_AUTH itself and sends it
 * as Bearer to every host, and after a failed download it silently extracts a cached tarball.
 * Hide the token from non-GitHub hosts and point giget's cache at an empty temp dir.
 */
async function withGigetEnv<T>(auth: boolean, run: () => Promise<T>): Promise<T> {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-giget-cache-"));
    const keys = ["GIGET_AUTH", "XDG_CACHE_HOME", ...(process.platform === "win32" ? ["TEMP", "TMP"] : [])];
    const saved = new Map(keys.map((key) => [key, process.env[key]]));
    if (!auth) delete process.env.GIGET_AUTH;
    process.env.XDG_CACHE_HOME = cacheDir;
    // On Windows giget caches under os.tmpdir() instead of XDG_CACHE_HOME.
    if (process.platform === "win32") process.env.TEMP = process.env.TMP = cacheDir;
    try {
        return await run();
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await fs.rm(cacheDir, { recursive: true, force: true });
    }
}

async function request(url: URL): Promise<Response> {
    try {
        return await fetch(url);
    } catch {
        throw new Error(`network error fetching ${url.href}. Check your internet connection.`);
    }
}

async function fetchText(url: URL, what: string): Promise<string> {
    const response = await request(url);
    if (response.status === 404) throw new Error(`Not found: ${what} (${url.href})`);
    if (!response.ok) throw new Error(`Failed to fetch ${what}: HTTP ${response.status}`);
    return response.text();
}
