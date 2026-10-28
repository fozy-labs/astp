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

    let data: unknown;
    try {
        data = await response.json();
    } catch {
        throw new Error(`Cannot resolve ${label}: provider returned invalid JSON`);
    }
    const commit = responseCommit(git.provider, data);
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

    const separator = git.repo.indexOf("/");
    const owner = git.repo.slice(0, separator);
    const repository = git.repo.slice(separator + 1);
    return {
        url: "https://git.sr.ht/query",
        init: {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
                query: `query ResolveCommit($owner: String!, $repo: String!, $ref: String!) {
                    user(username: $owner) { repository(name: $repo) { revparse_single(revspec: $ref) { id } } }
                }`,
                variables: { owner, repo: repository, ref: git.ref },
            }),
        },
    };
}

function responseCommit(provider: GitProvider, data: unknown): unknown {
    if (!isRecord(data)) return undefined;
    if (provider === "gh") return data.sha;
    if (provider === "gitlab") return data.id;
    if (provider === "bitbucket") return data.hash;
    if (!isRecord(data.data) || !isRecord(data.data.user) || !isRecord(data.data.user.repository)) return undefined;
    const commit = data.data.user.repository.revparse_single;
    return isRecord(commit) ? commit.id : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
