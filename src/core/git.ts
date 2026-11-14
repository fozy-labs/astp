export type GitProvider = "gh" | "gitlab" | "bitbucket" | "sourcehut";

export interface GitCoordinates {
    provider: GitProvider;
    repo: string;
    ref: string;
}

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

export function isCommitSha(value: unknown): value is string {
    return typeof value === "string" && COMMIT_SHA_RE.test(value);
}

export async function resolveGitCommit(git: GitCoordinates): Promise<string> {
    if (isCommitSha(git.ref)) return git.ref;
    const label = `${git.provider}:${git.repo}#${git.ref}`;
    const request = gitRequest(git);
    let response: Response;
    try {
        response = await fetch(request.url, request.init);
    } catch {
        throw new Error(`Cannot resolve ${label}: network error. Check your internet connection.`);
    }
    if (!response.ok) throw new Error(`Cannot resolve ${label}: HTTP ${response.status}`);

    let commit: unknown;
    if (git.provider === "sourcehut") {
        let data: ArrayBuffer;
        try {
            data = await response.arrayBuffer();
        } catch {
            throw new Error(`Cannot resolve ${label}: provider returned an invalid Git ref advertisement`);
        }
        commit = sourcehutCommit(new Uint8Array(data), git.ref);
    } else {
        let data: unknown;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Cannot resolve ${label}: provider returned invalid JSON`);
        }
        commit = responseCommit(git.provider, data);
    }
    if (!isCommitSha(commit)) throw new Error(`Cannot resolve ${label}: provider did not return a full commit SHA`);
    return commit;
}

function gitRequest(git: GitCoordinates): { url: string; init: RequestInit } {
    const ref = encodeURIComponent(git.ref);
    const repo = git.repo
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (git.provider === "gh") {
        headers.Accept = "application/vnd.github+json";
        if (process.env.GIGET_AUTH) headers.Authorization = `Bearer ${process.env.GIGET_AUTH}`;
        return { url: `https://api.github.com/repos/${repo}/commits/${ref}`, init: { method: "GET", headers } };
    }
    if (git.provider === "gitlab") {
        return {
            url: `https://gitlab.com/api/v4/projects/${encodeURIComponent(git.repo)}/repository/commits/${ref}`,
            init: { method: "GET", headers },
        };
    }
    if (git.provider === "bitbucket") {
        return {
            url: `https://api.bitbucket.org/2.0/repositories/${repo}/commit/${ref}`,
            init: { method: "GET", headers },
        };
    }

    return {
        url: `https://git.sr.ht/${repo}/info/refs?service=git-upload-pack`,
        init: { method: "GET", headers: { Accept: "application/x-git-upload-pack-advertisement" } },
    };
}

function sourcehutCommit(data: Uint8Array, ref: string): string | undefined {
    const refs = new Map<string, string>();
    const decoder = new TextDecoder();
    let offset = 0;
    while (offset < data.length) {
        if (offset + 4 > data.length) return undefined;
        const header = decoder.decode(data.subarray(offset, offset + 4));
        if (!/^[0-9a-f]{4}$/i.test(header)) return undefined;
        const length = Number.parseInt(header, 16);
        offset += 4;
        if (length === 0) continue;
        if (length < 4 || offset + length - 4 > data.length) return undefined;
        const line = decoder
            .decode(data.subarray(offset, offset + length - 4))
            .replace(/\n$/, "")
            .split("\0", 1)[0]!;
        offset += length - 4;
        const match = /^([0-9a-f]{40}) (\S+)$/i.exec(line);
        if (match) refs.set(match[2]!, match[1]!);
    }

    const candidates =
        ref === "HEAD"
            ? ["HEAD"]
            : ref.startsWith("refs/")
              ? [`${ref}^{}`, ref]
              : [`refs/heads/${ref}`, `refs/tags/${ref}^{}`, `refs/tags/${ref}`];
    for (const candidate of candidates) {
        const commit = refs.get(candidate);
        if (isCommitSha(commit)) return commit;
    }
    return undefined;
}

function responseCommit(provider: Exclude<GitProvider, "sourcehut">, data: unknown): unknown {
    if (!isRecord(data)) return undefined;
    if (provider === "gh") return data.sha;
    if (provider === "gitlab") return data.id;
    return data.hash;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
