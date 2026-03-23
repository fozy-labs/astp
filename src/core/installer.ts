import fs from "node:fs/promises";
import path from "node:path";

import type { InstallTarget, TemplateItem } from "@/types/index.js";

import { computeHash, injectAstpFields } from "./frontmatter.js";

export async function installFile(
    tempDir: string,
    item: TemplateItem,
    target: InstallTarget,
    meta: { source: string; bundle: string; version: string },
): Promise<void> {
    // giget downloads the bundle subdirectory, so file paths inside tempDir
    // mirror item.target (source path without the bundle prefix)
    const sourceFile = path.join(tempDir, item.target);
    const sourceContent = await fs.readFile(sourceFile, "utf8");

    validateTargetPath(target.rootDir, item.target);

    const content = sourceContent;
    const hash = computeHash(content);
    const finalContent = injectAstpFields(content, meta, hash);

    const targetFile = path.join(target.rootDir, item.target);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, finalContent, "utf8");
}

export function validateTargetPath(installRoot: string, targetPath: string): void {
    // Reject absolute paths (POSIX and Windows)
    if (path.isAbsolute(targetPath) || path.posix.isAbsolute(targetPath) || path.win32.isAbsolute(targetPath)) {
        throw new Error(`Invalid target path: absolute paths are not allowed: ${targetPath}`);
    }

    // Reject path traversal
    const segments = targetPath.split(/[/\\]/);
    if (segments.includes("..")) {
        throw new Error(`Invalid target path: path traversal is not allowed: ${targetPath}`);
    }

    // Verify resolved path stays within install root
    const normalizedRoot = path.resolve(installRoot);
    const resolved = path.resolve(installRoot, targetPath);
    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
        throw new Error(`Invalid target path: resolved path escapes install root: ${targetPath}`);
    }
}
