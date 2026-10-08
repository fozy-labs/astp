import fs from "node:fs/promises";
import path from "node:path";

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
