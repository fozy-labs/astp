import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveTarget } from "../../types/index.js";
import { installFile, validateTargetPath } from "../installer.js";

describe("resolveTarget", () => {
    // T16: Project target
    it("T16: resolves project target to .github under cwd", () => {
        const target = resolveTarget("project");
        expect(target.type).toBe("project");
        expect(target.rootDir).toBe(path.join(process.cwd(), ".github"));
    });

    // T17: User target
    it("T17: resolves user target to ~/.copilot", () => {
        const target = resolveTarget("user");
        expect(target.type).toBe("user");
        expect(target.rootDir).toBe(path.join(os.homedir(), ".copilot"));
    });
});

describe("validateTargetPath", () => {
    const installRoot = path.resolve(os.tmpdir(), "astp-validate-root");

    // T43: Reject path traversal
    it("T43: rejects paths with .. traversal", () => {
        expect(() => validateTargetPath(installRoot, "../../.bashrc")).toThrow("path traversal");
    });

    // T44: Reject absolute paths
    it("T44: rejects absolute POSIX paths", () => {
        expect(() => validateTargetPath(installRoot, "/etc/passwd")).toThrow("absolute paths");
    });

    it("T44: rejects absolute Windows paths", () => {
        expect(() => validateTargetPath(installRoot, "C:\\Windows\\System32\\cmd.exe")).toThrow("absolute paths");
    });

    // T45: Resolved path escaping install root
    it("T45: rejects resolved path escaping install root", () => {
        expect(() => validateTargetPath(installRoot, "agents/../../../etc/passwd")).toThrow();
    });

    // T46: Forward-slash paths resolve correctly
    it("T46: resolves paths with / separators correctly", () => {
        expect(() => validateTargetPath(installRoot, "skills/orchestrate/SKILL.md")).not.toThrow();
    });
});

describe("installFile", () => {
    let tempDir: string;
    let targetRoot: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-src-"));
        targetRoot = await fs.mkdtemp(path.join(os.tmpdir(), "astp-tgt-"));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.rm(targetRoot, { recursive: true, force: true });
    });

    // T23: Install file with injected astp fields
    it("T23: installs file with injected astp fields and preserved content", async () => {
        const sourceContent = `---
name: test-agent
---
Agent body`;

        await fs.mkdir(path.join(tempDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "agents", "test.agent.md"), sourceContent);

        await installFile(
            tempDir,
            {
                source: "test-bundle/agents/test.agent.md",
                target: "agents/test.agent.md",
                category: "agent",
            },
            { type: "project", rootDir: targetRoot },
            { source: "fozy-labs/astp", bundle: "test-bundle", version: "1.0.0" },
        );

        const installed = await fs.readFile(path.join(targetRoot, "agents", "test.agent.md"), "utf8");
        expect(installed).toContain("name: test-agent");
        expect(installed).toContain("astp-source: fozy-labs/astp");
        expect(installed).toContain("astp-bundle: test-bundle");
        expect(installed).toContain("astp-version: 1.0.0");
        expect(installed).toContain("astp-hash:");
        expect(installed).toContain("Agent body");
    });

    // T24: Creates nested directories
    it("T24: creates nested directories during install", async () => {
        const sourceContent = "# Stage content";
        await fs.mkdir(path.join(tempDir, "skills", "rdpi-01-research"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "skills", "rdpi-01-research", "SKILL.md"), sourceContent);

        await installFile(
            tempDir,
            {
                source: "test-bundle/skills/rdpi-01-research/SKILL.md",
                target: "skills/rdpi-01-research/SKILL.md",
                category: "skill",
            },
            { type: "project", rootDir: targetRoot },
            { source: "fozy-labs/astp", bundle: "test-bundle", version: "1.0.0" },
        );

        const stat = await fs.stat(path.join(targetRoot, "skills", "rdpi-01-research"));
        expect(stat.isDirectory()).toBe(true);

        const installed = await fs.readFile(path.join(targetRoot, "skills", "rdpi-01-research", "SKILL.md"), "utf8");
        expect(installed).toContain("# Stage content");
        expect(installed).toContain("astp-source:");
    });

    it("renders workflow version tokens from manifest metadata", async () => {
        const sourceContent = "rdpi-version: {{ASTP_WORKFLOW_VERSION}}\n";

        await fs.mkdir(path.join(tempDir, "instructions"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "instructions", "workflow.md"), sourceContent);

        await installFile(
            tempDir,
            {
                source: "test-bundle/instructions/workflow.md",
                target: "instructions/workflow.md",
                category: "instruction",
            },
            { type: "project", rootDir: targetRoot },
            {
                source: "fozy-labs/astp",
                bundle: "rdpi",
                version: "1.0.0",
                workflowVersion: "b0.5",
            },
        );

        const installed = await fs.readFile(path.join(targetRoot, "instructions", "workflow.md"), "utf8");
        expect(installed).toContain("rdpi-version: b0.5");
        expect(installed).not.toContain("{{ASTP_WORKFLOW_VERSION}}");
    });
});
