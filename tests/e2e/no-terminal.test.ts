import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const LOADER = new URL("./ts-loader.mjs", import.meta.url).href;
const TIMEOUT_MS = 10_000;

interface RunResult {
    code: number | null;
    stderr: string;
}

/** Runs the CLI without a terminal; `stdin: "pipe"` keeps stdin open, `"ignore"` closes it. */
function runCli(args: string[], cwd: string, stdin: "pipe" | "ignore"): Promise<RunResult> {
    return new Promise((resolve) => {
        const child = spawn(
            process.execPath,
            ["--no-warnings", "--import", LOADER, CLI, ...args],
            { cwd, env: { ...process.env, HOME: cwd, CLAUDE_CONFIG_DIR: "" }, stdio: [stdin, "pipe", "pipe"] },
        );
        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ code, stderr });
        });
    });
}

describe("without a terminal", () => {
    let cwd: string;

    beforeEach(async () => {
        cwd = await fs.mkdtemp(path.join(os.tmpdir(), "astp-no-tty-"));
    });

    afterEach(async () => {
        await fs.rm(cwd, { recursive: true, force: true });
    });

    const cases: Array<[string[], string]> = [
        [["check", "--platform", "claude-code"], "--target is required without a terminal (project|user)"],
        [["update", "--platform", "claude-code"], "--target is required without a terminal (project|user)"],
        [["sync", "--platform", "claude-code"], "--target is required without a terminal (project|user)"],
        [["list", "--platform", "claude-code"], "--target is required without a terminal (project|user)"],
        [["delete", "core", "--platform", "claude-code"], "--target is required without a terminal (project|user)"],
        [["install", "core", "--platform", "claude-code"], "--target is required without a terminal (project|user)"],
        [["check", "--target", "project"], "--platform is required without a terminal (claude-code|kimi-code)"],
        [
            ["install", "--platform", "claude-code", "--target", "project"],
            "install needs a bundle name without a terminal",
        ],
        [
            ["delete", "--platform", "claude-code", "--target", "project"],
            "delete needs a bundle name without a terminal",
        ],
        [[], "astp needs a command without a terminal; run astp --help"],
    ];

    for (const stdin of ["ignore", "pipe"] as const) {
        describe(stdin === "ignore" ? "stdin closed" : "stdin open", () => {
            it.each(cases)("astp %j exits with code 1 and says what is missing", async (args, message) => {
                const result = await runCli(args, cwd, stdin);

                expect(result.stderr).toContain(message);
                expect(result.stderr).not.toMatch(/^\s+at /m);
                expect(result.code).toBe(1);
            }, 2 * TIMEOUT_MS);
        });
    }
});
