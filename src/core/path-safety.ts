import fs from "node:fs/promises";
import path from "node:path";

// Control characters (C0, DEL, C1), bidi controls that can spoof names shown in prompts, and Windows-reserved characters.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069"*/:<>?\\|]/;
// From sindresorhus/filename-reserved-regex.
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|conin\$|conout\$|com[\d¹²³]|lpt[\d¹²³]) *(?:\..*)?$/i;
// An NTFS 8.3 short name such as `SKILLS~1` can alias another existing long name.
const SHORT_NAME_ALIAS = /~\d+(?:\.|$)/;

/** One path segment that names the same file on every supported OS; the trailing-dot rule also bans `.` and `..`. */
export function isSafeSegment(segment: string): boolean {
    return (
        segment.length > 0 &&
        segment.isWellFormed() &&
        Buffer.byteLength(segment, "utf8") <= 255 &&
        !FORBIDDEN_CHARS.test(segment) &&
        !/[. ]$/.test(segment) &&
        !WINDOWS_RESERVED.test(segment) &&
        !SHORT_NAME_ALIAS.test(segment)
    );
}

/** The form under which Windows and macOS, ignoring case and Unicode normalization, compare a path. */
export function foldPath(value: string): string {
    return value.normalize("NFC").toUpperCase().toLowerCase();
}

/** Copies a record keyed by untrusted names onto a null prototype, so keys like `constructor` or `__proto__` stay plain data. */
export function nullPrototype<T>(record: Readonly<Record<string, T>> = {}): Record<string, T> {
    return Object.assign(Object.create(null) as Record<string, T>, record);
}

/** A `/`-separated relative path whose every segment is safe; rules out absolute, drive and UNC paths. */
export function assertSafeRelativePath(value: unknown, what: string): asserts value is string {
    if (typeof value !== "string" || !value.split("/").every(isSafeSegment)) {
        throw new Error(`${what} must be a safe relative path: ${JSON.stringify(value)}`);
    }
}

export function assertSafeName(value: unknown, what: string): asserts value is string {
    if (typeof value !== "string" || !isSafeSegment(value)) {
        throw new Error(`${what} must be a safe name: ${JSON.stringify(value)}`);
    }
}

export async function assertInsideRoot(rootDir: string, relativePath: string): Promise<void> {
    const rootPath = path.resolve(rootDir);
    const canonicalRoot = await canonicalizeWithMissingSuffix(rootPath);
    const targetParent = path.dirname(path.resolve(rootPath, relativePath));
    const canonicalParent = await canonicalizeWithMissingSuffix(targetParent);
    const relativeParent = path.relative(canonicalRoot, canonicalParent);

    if (relativeParent === ".." || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) {
        throw new Error(`Target path '${relativePath}' escapes install root.`);
    }
}

async function canonicalizeWithMissingSuffix(targetPath: string): Promise<string> {
    let currentPath = path.resolve(targetPath);
    const missingSegments: string[] = [];

    while (true) {
        try {
            const canonicalAncestor = await fs.realpath(currentPath);
            return path.join(canonicalAncestor, ...missingSegments.reverse());
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "ENOENT" && code !== "ENOTDIR") throw error;

            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) throw error;
            missingSegments.push(path.basename(currentPath));
            currentPath = parentPath;
        }
    }
}
