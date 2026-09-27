import os from "node:os";
import path from "node:path";

import type { InstallTarget, InstallTargetType, Platform } from "./index.js";

interface PlatformRoots {
    project: string;
    user: string;
    /** Environment variable that, when set, replaces the user root entirely. */
    userEnv?: string;
}

/**
 * Where each platform stores its MDA files. Project paths are repo-relative;
 * user paths are absolute (resolved against the home directory at runtime).
 */
const PLATFORM_ROOTS: Record<Platform, PlatformRoots> = {
    vscode: { project: ".github", user: ".copilot" },
    "claude-code": { project: ".claude", user: ".claude", userEnv: "CLAUDE_CONFIG_DIR" },
};

export function resolveTarget(platform: Platform, type: InstallTargetType): InstallTarget {
    const roots = PLATFORM_ROOTS[platform];
    const rootDir = type === "project" ? path.join(process.cwd(), roots.project) : resolveUserRoot(roots);

    return { platform, type, rootDir };
}

function resolveUserRoot(roots: PlatformRoots): string {
    const override = roots.userEnv ? process.env[roots.userEnv] : undefined;
    return override ? path.resolve(override) : path.join(os.homedir(), roots.user);
}

/**
 * Display label for a platform/target combination (e.g. `~/.claude/`, `.github/`).
 * Used in confirmation prompts so the user can see where files will be written.
 * A user root outside the home directory is shown as an absolute path.
 */
export function describeTarget(target: InstallTarget): string {
    if (target.type === "project") return `${PLATFORM_ROOTS[target.platform].project}/`;

    const fromHome = path.relative(os.homedir(), target.rootDir);
    const underHome =
        fromHome !== "" && fromHome !== ".." && !fromHome.startsWith(`..${path.sep}`) && !path.isAbsolute(fromHome);
    return underHome ? `~/${fromHome.split(path.sep).join("/")}/` : `${target.rootDir}/`;
}
