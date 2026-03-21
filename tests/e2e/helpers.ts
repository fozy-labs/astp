import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InstallTarget, Manifest, TemplateItem } from "@/types/index.js";

// ── Fixture Manifests ─────────────────────────────────────────────────

export function createFixtureManifest(version = "1.0.0"): Manifest {
    return {
        schemaVersion: 1,
        repository: "fozy-labs/astp",
        bundles: {
            base: {
                name: "base",
                version,
                description: "Base skill for VSCode Copilot agent orchestration",
                default: true,
                items: [
                    {
                        source: "base/skills/orchestrate/SKILL.md",
                        target: "skills/orchestrate/SKILL.md",
                        category: "skill",
                    },
                ],
            },
            rdpi: {
                name: "rdpi",
                version,
                description: "Full RDPI pipeline — agents, instructions, and stage definitions",
                default: false,
                items: [
                    {
                        source: "rdpi/agents/RDPI-Orchestrator.agent.md",
                        target: "agents/RDPI-Orchestrator.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-approve.agent.md",
                        target: "agents/rdpi-approve.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-architect.agent.md",
                        target: "agents/rdpi-architect.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-codder.agent.md",
                        target: "agents/rdpi-codder.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-codebase-researcher.agent.md",
                        target: "agents/rdpi-codebase-researcher.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-design-reviewer.agent.md",
                        target: "agents/rdpi-design-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-external-researcher.agent.md",
                        target: "agents/rdpi-external-researcher.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-implement-reviewer.agent.md",
                        target: "agents/rdpi-implement-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-plan-reviewer.agent.md",
                        target: "agents/rdpi-plan-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-planner.agent.md",
                        target: "agents/rdpi-planner.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-qa-designer.agent.md",
                        target: "agents/rdpi-qa-designer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-questioner.agent.md",
                        target: "agents/rdpi-questioner.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-redraft.agent.md",
                        target: "agents/rdpi-redraft.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-research-reviewer.agent.md",
                        target: "agents/rdpi-research-reviewer.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-stage-creator.agent.md",
                        target: "agents/rdpi-stage-creator.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/agents/rdpi-tester.agent.md",
                        target: "agents/rdpi-tester.agent.md",
                        category: "agent",
                    },
                    {
                        source: "rdpi/instructions/thoughts-workflow.instructions.md",
                        target: "instructions/thoughts-workflow.instructions.md",
                        category: "instruction",
                    },
                    {
                        source: "rdpi/rdpi-stages/01-research.md",
                        target: "rdpi-stages/01-research.md",
                        category: "stage-definition",
                    },
                    {
                        source: "rdpi/rdpi-stages/02-design.md",
                        target: "rdpi-stages/02-design.md",
                        category: "stage-definition",
                    },
                    {
                        source: "rdpi/rdpi-stages/03-plan.md",
                        target: "rdpi-stages/03-plan.md",
                        category: "stage-definition",
                    },
                    {
                        source: "rdpi/rdpi-stages/04-implement.md",
                        target: "rdpi-stages/04-implement.md",
                        category: "stage-definition",
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
export async function setupTemplateDir(manifest: Manifest, bundleName: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `astp-tpl-${bundleName}-`));
    const bundle = manifest.bundles[bundleName];

    for (const item of bundle.items) {
        const filePath = path.join(dir, item.target);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, generateTemplateContent(item, bundle.version), "utf8");
    }

    return dir;
}

function generateTemplateContent(item: TemplateItem, version: string): string {
    const name = path.basename(item.target, path.extname(item.target));

    switch (item.category) {
        case "agent":
            return `---\nname: ${name}\n---\n# ${name}\n\nAgent v${version} description.\n`;
        case "skill":
            return `---\nname: ${name}\n---\n# ${name}\n\nSkill v${version} content.\n`;
        case "instruction":
            return `---\ndescription: ${name}\n---\n# ${name}\n\nInstruction v${version} content.\n`;
        case "stage-definition":
            return `# Stage: ${name}\n\nStage v${version} content.\n`;
        default:
            throw new Error(`Unknown category: ${item.category}`);
    }
}

// ── Install target from temp dir ──────────────────────────────────────

export function makeProjectTarget(baseDir: string): InstallTarget {
    return { type: "project", rootDir: path.join(baseDir, ".github") };
}

// ── Cleanup utility ───────────────────────────────────────────────────

export async function cleanupDir(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
}
