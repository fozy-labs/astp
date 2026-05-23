import os from "node:os";
import path from "node:path";

import type { InstallTarget, InstallTargetType, Platform } from "./index.js";

interface PlatformRoots {
    project: string;
    user: string;
}

/**
 * Where each platform stores its MDA files. Project paths are repo-relative;
 * user paths are absolute (resolved against the home directory at runtime).
 */
const PLATFORM_ROOTS: Record<Platform, PlatformRoots> = {
    vscode: { project: ".github", user: ".copilot" },
    "claude-code": { project: ".claude", user: ".claude" },
};

export function resolveTarget(platform: Platform, type: InstallTargetType): InstallTarget {
    const roots = PLATFORM_ROOTS[platform];
    const rootDir = type === "project" ? path.join(process.cwd(), roots.project) : path.join(os.homedir(), roots.user);

    return { platform, type, rootDir };
}

/**
 * Display label for a platform/target combination (e.g. `~/.claude/`, `.github/`).
 * Used in confirmation prompts so the user can see where files will be written.
 */
export function describeTarget(target: InstallTarget): string {
    const roots = PLATFORM_ROOTS[target.platform];
    return target.type === "project" ? `${roots.project}/` : `~/${roots.user}/`;
}
