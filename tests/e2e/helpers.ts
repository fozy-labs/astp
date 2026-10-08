import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InstallTarget, Manifest, TemplateItem } from "@/types/index.js";

export async function readLockFixture(rootDir: string): Promise<{
    schemaVersion: number;
    bundles: Record<
        string,
        {
            source: string;
            declined: string[];
            units: Record<
                string,
                {
                    kind: "file" | "skill";
                    version: string;
                    hash: string;
                    blocks?: Record<string, string>;
                    declinedBlocks?: string[];
                }
            >;
        }
    >;
}> {
    return JSON.parse(await fs.readFile(path.join(rootDir, "astp.lock"), "utf8"));
}

// ── Fixture Manifests ─────────────────────────────────────────────────

export function createFixtureManifest(version = "1.0.0"): Manifest {
    return {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            core: {
                name: "core",
                version,
                description: "Core orchestration skill",
                default: true,
                platforms: ["claude-code"],
                items: [
                    {
                        source: "core/skills/orchestrate/SKILL.md",
                        target: "skills/orchestrate/SKILL.md",
                        category: "skill",
                    },
                ],
            },
            skillpack: {
                name: "skillpack",
                version,
                description: "Multi-file skill fixture",
                default: false,
                platforms: ["claude-code"],
                items: [
                    {
                        source: "skillpack/skills/sample/references/touch.md",
                        target: "skills/sample/references/touch.md",
                        category: "skill",
                    },
                    {
                        source: "skillpack/skills/sample/scripts/push.sh",
                        target: "skills/sample/scripts/push.sh",
                        category: "skill",
                    },
                    {
                        source: "skillpack/skills/sample/examples/sub/SKILL.md",
                        target: "skills/sample/examples/sub/SKILL.md",
                        category: "skill",
                    },
                    {
                        source: "skillpack/skills/sample/examples/sub/deeper/data.bin",
                        target: "skills/sample/examples/sub/deeper/data.bin",
                        category: "skill",
                    },
                    {
                        source: "skillpack/skills/sample/CONFLICTS.md",
                        target: "skills/sample/CONFLICTS.md",
                        category: "skill",
                    },
                    {
                        source: "skillpack/skills/sample/SKILL.md",
                        target: "skills/sample/SKILL.md",
                        category: "skill",
                    },
                ],
            },
            pipeline: {
                name: "pipeline",
                version,
                description: "Full pipeline — agents, instructions, and stage definitions",
                default: false,
                platforms: ["claude-code"],
                items: [
                    {
                        source: "pipeline/agents/pipeline-orchestrator.agent.md",
                        target: "agents/pipeline-orchestrator.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-approve.agent.md",
                        target: "agents/pipeline-approve.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-architect.agent.md",
                        target: "agents/pipeline-architect.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-codder.agent.md",
                        target: "agents/pipeline-codder.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-codebase-researcher.agent.md",
                        target: "agents/pipeline-codebase-researcher.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-design-reviewer.agent.md",
                        target: "agents/pipeline-design-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-external-researcher.agent.md",
                        target: "agents/pipeline-external-researcher.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-implement-reviewer.agent.md",
                        target: "agents/pipeline-implement-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-plan-reviewer.agent.md",
                        target: "agents/pipeline-plan-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-planner.agent.md",
                        target: "agents/pipeline-planner.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-problem-analyst.agent.md",
                        target: "agents/pipeline-problem-analyst.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-qa-designer.agent.md",
                        target: "agents/pipeline-qa-designer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-questioner.agent.md",
                        target: "agents/pipeline-questioner.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-redraft.agent.md",
                        target: "agents/pipeline-redraft.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-research-reviewer.agent.md",
                        target: "agents/pipeline-research-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-stage-creator.agent.md",
                        target: "agents/pipeline-stage-creator.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/agents/pipeline-tester.agent.md",
                        target: "agents/pipeline-tester.agent.md",
                        category: "agent",
                    },
                    {
                        source: "pipeline/rules/thoughts-workflow.rules.md",
                        target: "rules/thoughts-workflow.rules.md",
                        category: "rule",
                    },
                    {
                        source: "pipeline/skills/pipeline-01-research/SKILL.md",
                        target: "skills/pipeline-01-research/SKILL.md",
                        category: "skill",
                    },
                    {
                        source: "pipeline/skills/pipeline-02-design/SKILL.md",
                        target: "skills/pipeline-02-design/SKILL.md",
                        category: "skill",
                    },
                    {
                        source: "pipeline/skills/pipeline-03-plan/SKILL.md",
                        target: "skills/pipeline-03-plan/SKILL.md",
                        category: "skill",
                    },
                    {
                        source: "pipeline/skills/pipeline-04-implement/SKILL.md",
                        target: "skills/pipeline-04-implement/SKILL.md",
                        category: "skill",
                    },
                ],
            },
        },
    };
}

// ── Temp project directory ────────────────────────────────────────────

export async function createTempProject(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "astp-e2e-"));
    return {
        dir,
        cleanup: () => fs.rm(dir, { recursive: true, force: true }),
    };
}

// ── Template fixture directory ────────────────────────────────────────

/**
 * Creates a temp directory with template files matching what `downloadBundle` would return.
 * File paths inside the directory match `item.target` for each bundle item.
 */
export async function setupTemplateDir(
    manifest: Manifest,
    bundleName: string,
    contents: Record<string, string> = {},
): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `astp-tpl-${bundleName}-`));
    const bundle = manifest.bundles[bundleName];

    for (const item of bundle.items) {
        const filePath = path.join(dir, item.target);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const content = contents[item.target] ?? generateTemplateContent(item, bundle.version);
        await fs.writeFile(filePath, content, typeof content === "string" ? "utf8" : undefined);
    }

    return dir;
}

function generateTemplateContent(item: TemplateItem, version: string): string | Buffer {
    if (item.target.endsWith(".bin")) return Buffer.from([0, 255, 17, 0, 42]);
    if (item.target.endsWith(".sh")) return "#!/bin/sh\nprintf 'template script\\n'\n";

    const name = path.basename(item.target, path.extname(item.target));

    switch (item.category) {
        case "agent":
            return `---\nname: ${name}\ndescription: ${name} description\n---\n# ${name}\n\nAgent v${version} description.\n`;
        case "skill":
            return `---\nname: ${name}\ndescription: ${name} description\n---\n# ${name}\n\nSkill v${version} content.\n`;
        case "rule":
            return `---\ndescription: ${name}\n---\n# ${name}\n\nRule v${version} content.\n`;
        default:
            throw new Error(`Unknown category: ${item.category}`);
    }
}

// ── Install target from temp dir ──────────────────────────────────────

export function makeProjectTarget(baseDir: string): InstallTarget {
    return { platform: "claude-code", type: "project", rootDir: path.join(baseDir, ".claude") };
}

// ── Cleanup utility ───────────────────────────────────────────────────

export async function cleanupDir(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
}
