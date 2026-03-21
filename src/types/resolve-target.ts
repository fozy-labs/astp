import os from "node:os";
import path from "node:path";

import type { InstallTarget, InstallTargetType } from "./index.js";

export function resolveTarget(type: InstallTargetType): InstallTarget {
    const rootDir = type === "project" ? path.join(process.cwd(), ".github") : path.join(os.homedir(), ".copilot");

    return { type, rootDir };
}
