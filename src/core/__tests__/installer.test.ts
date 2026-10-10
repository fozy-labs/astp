import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describeTarget, resolveTarget } from "../../types/index.js";
import { computeHash } from "../frontmatter.js";
import { installFile, installSkill, validateTargetPath } from "../installer.js";

async function snapshotDirectory(root: string): Promise<Record<string, string>> {
    const snapshot: Record<string, string> = {};

    async function visit(directory: string, relativeDirectory: string): Promise<void> {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const filePath = path.join(directory, entry.name);
            const relativePath = path.join(relativeDirectory, entry.name);
            if (entry.isDirectory()) {
                await visit(filePath, relativePath);
            } else if (entry.isFile()) {
                snapshot[relativePath] = (await fs.readFile(filePath)).toString("base64");
            }
        }
    }

    await visit(root, "");
    return snapshot;
}

describe("resolveTarget", () => {
    // T16: Project target
    it("T16: resolves claude-code project target to .claude under cwd", () => {
        const target = resolveTarget("claude-code", "project");
        expect(target.platform).toBe("claude-code");
        expect(target.type).toBe("project");
        expect(target.rootDir).toBe(path.join(process.cwd(), ".claude"));
    });

    // T17: User target
    it("T17: resolves claude-code user target to ~/.claude", () => {
        vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
        const target = resolveTarget("claude-code", "user");
        expect(target.platform).toBe("claude-code");
        expect(target.type).toBe("user");
        expect(target.rootDir).toBe(path.join(os.homedir(), ".claude"));
    });

    it("resolves claude-code user target to CLAUDE_CONFIG_DIR when set", () => {
        const configDir = path.join(os.tmpdir(), "claude-alt");
        vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
        expect(resolveTarget("claude-code", "user").rootDir).toBe(configDir);
    });

    it("ignores an empty CLAUDE_CONFIG_DIR", () => {
        vi.stubEnv("CLAUDE_CONFIG_DIR", "");
        expect(resolveTarget("claude-code", "user").rootDir).toBe(path.join(os.homedir(), ".claude"));
    });

    it("leaves the claude-code project target alone when CLAUDE_CONFIG_DIR is set", () => {
        vi.stubEnv("CLAUDE_CONFIG_DIR", path.join(os.tmpdir(), "claude-alt"));
        expect(resolveTarget("claude-code", "project").rootDir).toBe(path.join(process.cwd(), ".claude"));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });
});

describe("describeTarget", () => {
    it("shows the default claude-code user root as ~/.claude/", () => {
        vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
        expect(describeTarget(resolveTarget("claude-code", "user"))).toBe("~/.claude/");
    });

    it("shows a CLAUDE_CONFIG_DIR under the home directory relative to ~", () => {
        vi.stubEnv("CLAUDE_CONFIG_DIR", path.join(os.homedir(), ".claude-alt"));
        expect(describeTarget(resolveTarget("claude-code", "user"))).toBe("~/.claude-alt/");
    });

    it("shows a CLAUDE_CONFIG_DIR outside the home directory as an absolute path", () => {
        const configDir = path.join(path.parse(os.homedir()).root, "claude-alt");
        vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
        expect(describeTarget(resolveTarget("claude-code", "user"))).toBe(`${configDir}/`);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });
});

describe("validateTargetPath", () => {
    const installRoot = path.resolve(os.tmpdir(), "astp-validate-root");

    // T43: Reject path traversal
    it("T43: rejects paths with .. traversal", () => {
        expect(() => validateTargetPath(installRoot, "../../.bashrc")).toThrow("safe relative path");
    });

    // T44: Reject absolute paths
    it("T44: rejects absolute POSIX paths", () => {
        expect(() => validateTargetPath(installRoot, "/etc/passwd")).toThrow("safe relative path");
    });

    it("T44: rejects absolute Windows paths", () => {
        expect(() => validateTargetPath(installRoot, "C:\\Windows\\System32\\cmd.exe")).toThrow("safe relative path");
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

    it("installs file byte-identically and returns its hash", async () => {
        const sourceContent = `---
name: test-agent
---
Agent body`;

        await fs.mkdir(path.join(tempDir, "agents"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "agents", "test.agent.md"), sourceContent);

        const hash = await installFile(
            tempDir,
            {
                source: "test-bundle/agents/test.agent.md",
                target: "agents/test.agent.md",
                category: "agent",
            },
            { platform: "claude-code", type: "project", rootDir: targetRoot },
        );

        const installed = await fs.readFile(path.join(targetRoot, "agents", "test.agent.md"), "utf8");
        expect(installed).toContain("name: test-agent");
        expect(installed).toBe(sourceContent);
        expect(hash).toBe(computeHash(sourceContent));
    });

    // T24: Creates nested directories
    it("T24: creates nested directories during install", async () => {
        const sourceContent = "# Stage content";
        await fs.mkdir(path.join(tempDir, "skills", "pipeline-01-research"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "skills", "pipeline-01-research", "SKILL.md"), sourceContent);

        await installSkill(
            tempDir,
            {
                kind: "skill",
                relativePath: "skills/pipeline-01-research",
                items: [
                    {
                        source: "test-bundle/skills/pipeline-01-research/SKILL.md",
                        target: "skills/pipeline-01-research/SKILL.md",
                        category: "skill",
                    },
                ],
            },
            { platform: "claude-code", type: "project", rootDir: targetRoot },
        );

        const stat = await fs.stat(path.join(targetRoot, "skills", "pipeline-01-research"));
        expect(stat.isDirectory()).toBe(true);

        const installed = await fs.readFile(
            path.join(targetRoot, "skills", "pipeline-01-research", "SKILL.md"),
            "utf8",
        );
        expect(installed).toBe(sourceContent);
    });
});

describe("installSkill failure safety", () => {
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

    it("preserves the installed skill and cleans staging when a source item is missing", async () => {
        const relativePath = "skills/sample";
        const skillDir = path.join(targetRoot, relativePath);
        const referencePath = path.join(skillDir, "references", "keep.md");
        await fs.mkdir(path.dirname(referencePath), { recursive: true });
        await fs.writeFile(path.join(skillDir, "SKILL.md"), "Existing skill");
        await fs.writeFile(referencePath, "Existing reference");
        await fs.writeFile(path.join(skillDir, "asset.bin"), Buffer.from([0, 1, 2, 255]));
        const existingTree = await snapshotDirectory(skillDir);

        const sourceSkillDir = path.join(tempDir, relativePath);
        await fs.mkdir(sourceSkillDir, { recursive: true });
        await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "Replacement skill");

        await expect(
            installSkill(
                tempDir,
                {
                    kind: "skill",
                    relativePath,
                    items: [
                        {
                            source: "test-bundle/skills/sample/SKILL.md",
                            target: "skills/sample/SKILL.md",
                            category: "skill",
                        },
                        {
                            source: "test-bundle/skills/sample/references/missing.md",
                            target: "skills/sample/references/missing.md",
                            category: "skill",
                        },
                    ],
                },
                { platform: "claude-code", type: "project", rootDir: targetRoot },
            ),
        ).rejects.toThrow();

        expect(await snapshotDirectory(skillDir)).toEqual(existingTree);
        expect((await fs.readdir(path.dirname(skillDir))).filter((entry) => entry.includes(".astp-tmp-"))).toEqual([]);
    });

    it("rejects a symlinked parent before writing outside the install root", async () => {
        const outside = path.join(tempDir, "outside");
        await fs.mkdir(outside);
        await fs.writeFile(path.join(outside, "marker.txt"), "keep");
        const sourceFile = path.join(tempDir, "skills/sample/SKILL.md");
        await fs.mkdir(path.dirname(sourceFile), { recursive: true });
        await fs.writeFile(sourceFile, "New skill");
        await fs.symlink(outside, path.join(targetRoot, "skills"), "dir");

        await expect(
            installSkill(
                tempDir,
                {
                    kind: "skill",
                    relativePath: "skills/sample",
                    items: [
                        {
                            source: "bundle/skills/sample/SKILL.md",
                            target: "skills/sample/SKILL.md",
                            category: "skill",
                        },
                    ],
                },
                { platform: "claude-code", type: "project", rootDir: targetRoot },
            ),
        ).rejects.toThrow(/escape|outside/i);

        expect(await fs.readdir(outside)).toEqual(["marker.txt"]);
        expect(await fs.readFile(path.join(outside, "marker.txt"), "utf8")).toBe("keep");
    });
});
