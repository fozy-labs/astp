import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVER = path.resolve("templates/agreement/skills/brainstorming/scripts/server.cjs");

async function bashTemporaryRoot(): Promise<string> {
    const { stdout } = await execFileAsync("bash", [
        "-c",
        "if command -v wslpath >/dev/null 2>&1; then wslpath -w /tmp; elif command -v cygpath >/dev/null 2>&1; then cygpath -w /tmp; else cd /tmp && pwd; fi",
    ]);
    return stdout.trim();
}

describe("brainstorming temporary session cleanup", () => {
    it("removes the session after an automatic server shutdown", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "brainstorm-session-"));
        const child = spawn(process.execPath, [SERVER], {
            env: {
                ...process.env,
                BRAINSTORM_DIR: root,
                BRAINSTORM_IDLE_TIMEOUT_MS: "20",
                BRAINSTORM_LIFECYCLE_CHECK_MS: "10",
            },
            stdio: "ignore",
        });

        try {
            const [code] = await once(child, "exit");
            expect(code).toBe(0);
            await expect(fs.access(root)).rejects.toMatchObject({ code: "ENOENT" });
        } finally {
            if (child.exitCode === null) child.kill();
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it("removes the session when stopping one with a stale PID", async () => {
        const temporaryRoot = await bashTemporaryRoot();
        const root = await fs.mkdtemp(path.join(temporaryRoot, "brainstorm-stale-"));
        const state = path.join(root, "state");
        await fs.mkdir(state, { recursive: true });
        await fs.writeFile(path.join(state, "server.pid"), "99999999\n");
        await fs.writeFile(path.join(state, "server-instance-id"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");

        try {
            await execFileAsync("bash", [
                "templates/agreement/skills/brainstorming/scripts/stop-server.sh",
                `/tmp/${path.basename(root)}`,
            ]);
            await expect(fs.access(root)).rejects.toMatchObject({ code: "ENOENT" });
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
