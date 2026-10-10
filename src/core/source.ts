import fs from "node:fs/promises";
import path from "node:path";

import type { InstallTarget } from "@/types/index.js";

export const DEFAULT_SOURCE = "gh:fozy-labs/astp";

const DEFAULT_MANIFEST = "templates/manifest.json";
const GIT_PROVIDERS = new Set(["gh", "github", "gitlab", "bitbucket", "sourcehut"]);
// giget's parseGitURI grammar: the repository is always two segments.
const GIT_RE = /^(?<repo>[\w.-]+\/[\w.-]+)(?<path>\/[^#]*)?(?:#(?<ref>[\w./@-]+))?$/;
const NPM_RE = /^(?<name>(?:@[\w.-]+\/)?[\w.-]+)(?:@(?<version>[\w.+-]+))?$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_RE = /^(?:\.{1,2}(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/;

export const ACCEPTED_SOURCES = [
    "./path/manifest.json or ./dir (local)",
    "owner/repo[/path][#ref]",
    "gh:, gitlab:, bitbucket:, sourcehut: + owner/repo[/path][#ref]",
    "https://github.com/owner/repo[/tree/<ref>/<dir> | /blob/<ref>/<file>.json]",
    "npm:<name>[@<version or tag>]",
    "https://…/<file>.json (manifest URL)",
    "https://… (tarball)",
];

/**
 * Where a manifest is read from. The manifest's directory is the manifest root:
 * bundle `<b>` lives in `<root>/<b>/`, its items at `<b>/<target>`.
 */
export type ManifestSource =
    | { kind: "local"; spec: string; manifestPath: string }
    | {
          kind: "archive";
          spec: string;
          /** giget input of the downloaded directory, or an npm package to resolve to its tarball. */
          address: string | { npm: string; version: string };
          /** Manifest path inside the download. */
          manifestFile: string;
          auth: boolean;
          downloadDir?: string;
      }
    | { kind: "url"; spec: string; manifestUrl: URL };

/** Parse a `--source` value or a lock `source`; relative local paths resolve against `baseDir`. */
export async function resolveSource(spec: string, baseDir: string): Promise<ManifestSource> {
    const trimmed = spec.trim();
    if (LOCAL_RE.test(trimmed)) {
        const resolved = path.resolve(baseDir, trimmed);
        const manifestPath = isJson(resolved) ? resolved : path.join(resolved, DEFAULT_MANIFEST);
        return { kind: "local", spec: resolved, manifestPath };
    }

    const provider = /^([\w-]+):(?!\/\/)(.*)$/.exec(trimmed);
    if (provider?.[1] === "npm") {
        const match = NPM_RE.exec(provider[2]!);
        if (!match?.groups) throw invalidSource(spec);
        const { name, version = "latest" } = match.groups as { name: string; version?: string };
        return {
            kind: "archive",
            spec: `npm:${name}${match.groups.version ? `@${version}` : ""}`,
            address: { npm: name, version },
            manifestFile: DEFAULT_MANIFEST,
            auth: false,
        };
    }
    if (provider && GIT_PROVIDERS.has(provider[1]!)) {
        return gitSource(provider[1] === "github" ? "gh" : provider[1]!, provider[2]!, spec);
    }

    if (/^https?:\/\//i.test(trimmed)) {
        let url: URL;
        try {
            url = new URL(trimmed);
        } catch {
            throw invalidSource(spec);
        }
        if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
            throw new Error(`Source '${spec}' uses plain http; use https (http is allowed only for localhost)`);
        }
        if (url.hostname === "github.com" || url.hostname === "www.github.com") return githubUrlSource(url, spec);
        if (isJson(url.pathname)) return { kind: "url", spec: url.href, manifestUrl: url };
        return { kind: "archive", spec: url.href, address: url.href, manifestFile: DEFAULT_MANIFEST, auth: false };
    }

    if (!provider) {
        const exists = await fs.access(path.resolve(baseDir, trimmed)).then(
            () => true,
            () => false,
        );
        if (exists) {
            throw new Error(
                `Source '${spec}' is ambiguous: a local path with that name exists. Use './${trimmed}' for the local path or 'gh:${trimmed}' for GitHub.`,
            );
        }
        return gitSource("gh", trimmed, spec);
    }
    throw invalidSource(spec);
}

/** The string recorded in `astp.lock`: relative to the lock for a path inside a project, else absolute. */
export function formatSource(source: ManifestSource, target: InstallTarget): string {
    if (source.kind !== "local" || target.type === "user") return source.spec;
    const fromProject = path.relative(path.dirname(target.rootDir), source.spec);
    if (fromProject === ".." || fromProject.startsWith(`..${path.sep}`) || path.isAbsolute(fromProject))
        return source.spec;
    const relative = path.relative(target.rootDir, source.spec).split(path.sep).join("/");
    return relative.startsWith("../") || relative === ".." ? relative : `./${relative}`;
}

function gitSource(provider: string, rest: string, spec: string): ManifestSource {
    const match = GIT_RE.exec(rest);
    if (!match?.groups) throw invalidSource(spec);
    const { repo, ref } = match.groups as { repo: string; ref?: string };
    const subPath = (match.groups.path ?? "").replace(/\/+$/, "");
    const refSuffix = `#${ref ?? "HEAD"}`;
    const json = isJson(subPath);
    const dir = json ? path.posix.dirname(subPath) : `${subPath}/templates`;
    return {
        kind: "archive",
        spec: `${provider}:${repo}${subPath}${ref ? `#${ref}` : ""}`,
        address: `${provider}:${repo}${dir === "/" ? "" : dir}${refSuffix}`,
        manifestFile: json ? path.posix.basename(subPath) : "manifest.json",
        auth: provider === "gh",
    };
}

async function githubUrlSource(url: URL, spec: string): Promise<ManifestSource> {
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const [owner, rawRepo, mode, ...rest] = segments;
    if (!owner) throw invalidSource(spec);
    if (!rawRepo) {
        throw new Error(`Source '${spec}' names an account, not a repository, e.g. https://github.com/fozy-labs/astp`);
    }
    const repo = `${owner}/${rawRepo.replace(/\.git$/, "")}`;
    if (!mode) return gitSource("gh", repo, spec);
    if ((mode !== "tree" && mode !== "blob") || rest.length === 0) throw invalidSource(spec);
    if (mode === "blob" && !isJson(rest[rest.length - 1]!)) {
        throw new Error(`Source '${spec}' must point to a .json manifest file`);
    }

    // A ref may contain "/". A raw.githubusercontent.com URL is the same string for every split, so
    // probe the ref itself on codeload (404 for a missing ref), shortest first.
    const minPathSegments = mode === "blob" ? 1 : 0;
    for (let refLength = 1; refLength <= rest.length - minPathSegments; refLength++) {
        const ref = rest.slice(0, refLength).join("/");
        const subPath = rest.slice(refLength).join("/");
        if (await refExists(repo, ref)) return gitSource("gh", `${repo}${subPath ? `/${subPath}` : ""}#${ref}`, spec);
    }
    throw new Error(`Source '${spec}': no ref in the URL exists on GitHub`);
}

async function refExists(repo: string, ref: string): Promise<boolean> {
    const encoded = [...repo.split("/"), ...ref.split("/")].map(encodeURIComponent).join("/");
    const token = process.env.GIGET_AUTH;
    let response: Response;
    try {
        response = await fetch(`https://codeload.github.com/${encoded.replace(/^([^/]+\/[^/]+)\//, "$1/tar.gz/")}`, {
            method: "HEAD",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    } catch {
        throw new Error("Failed to reach GitHub: network error. Check your internet connection.");
    }
    if (response.ok) return true;
    if (response.status === 404) return false;
    throw new Error(`Failed to reach GitHub: HTTP ${response.status}`);
}

function isJson(value: string): boolean {
    return value.toLowerCase().endsWith(".json");
}

function invalidSource(spec: string): Error {
    return new Error(`Invalid source '${spec}'. Accepted forms:\n  ${ACCEPTED_SOURCES.join("\n  ")}`);
}
