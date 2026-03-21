---
title: "CLI MDA Manager — Codebase Analysis"
date: 2026-03-21
stage: 01-research
role: rdpi-codebase-researcher
---

## Summary

The `astp` repository is a newly scaffolded Node.js/TypeScript project intended as a CLI tool for managing MDA (Markdown files readable by AI agents). It contains a fully operational AI agent setup under `.github/` (16 agents, 1 skill, 1 instructions file, 4 stage definitions) but no CLI source code yet. The `src/templates/` directory is empty and awaiting template extraction from `.github/`.


## Findings

### 1. Repository Directory Structure

```
astp/
├── .editorconfig
├── .gitignore
├── .prettierignore
├── LICENSE
├── package.json
├── package-lock.json
├── docs/                          # empty
├── src/
│   └── templates/                 # empty
├── .github/
│   ├── copilot-instructions.md    # project-specific, NOT a template candidate
│   ├── dependabot.yml
│   ├── agents/
│   │   ├── RDPI-Orchestrator.agent.md
│   │   ├── rdpi-approve.agent.md
│   │   ├── rdpi-architect.agent.md
│   │   ├── rdpi-codder.agent.md
│   │   ├── rdpi-codebase-researcher.agent.md
│   │   ├── rdpi-design-reviewer.agent.md
│   │   ├── rdpi-external-researcher.agent.md
│   │   ├── rdpi-implement-reviewer.agent.md
│   │   ├── rdpi-plan-reviewer.agent.md
│   │   ├── rdpi-planner.agent.md
│   │   ├── rdpi-qa-designer.agent.md
│   │   ├── rdpi-questioner.agent.md
│   │   ├── rdpi-redraft.agent.md
│   │   ├── rdpi-research-reviewer.agent.md
│   │   ├── rdpi-stage-creator.agent.md
│   │   └── rdpi-tester.agent.md
│   ├── instructions/
│   │   └── thoughts-workflow.instructions.md
│   ├── rdpi-stages/
│   │   ├── 01-research.md
│   │   ├── 02-design.md
│   │   ├── 03-plan.md
│   │   └── 04-implement.md
│   ├── skills/
│   │   └── orchestrate/
│   │       └── SKILL.md
│   └── workflows/
│       ├── ci.yml
│       └── publish.yml
└── .thoughts/                     # RDPI working directory (not part of templates)
```

- **Location**: `@/` (repository root)
- **What it does**: Houses the CLI project scaffolding and the existing AI agent configuration.
- **Key dependencies**: `@fozy-labs/js-configs` (shared configs for ESLint, Prettier, TypeScript, Vitest).
- **Patterns**: Standard npm project structure. `.github/` serves dual purpose — AI agent config and GitHub workflows.


### 2. MDA File Organization

MDA files are grouped into four categories by directory:

| Category | Directory | File Count | Purpose |
|----------|-----------|------------|---------|
| Agents | `.github/agents/` | 16 | Agent role definitions for VS Code Copilot |
| Skills | `.github/skills/orchestrate/` | 1 | Skill definitions (reusable capabilities) |
| Instructions | `.github/instructions/` | 1 | Workflow/convention instructions |
| Stage Definitions | `.github/rdpi-stages/` | 4 | RDPI pipeline stage configuration |

Total MDA files: **22** (16 agents + 1 skill + 1 instructions + 4 stages).

Additionally, `.github/copilot-instructions.md` exists but is explicitly excluded from templates per TASK.md (`@/.thoughts/2026-03-21-1200_cli-mda-manager/TASK.md:57`).


### 3. File Naming Conventions

**Agents** (`@/.github/agents/`):
- Pattern: `rdpi-<role-name>.agent.md` (lowercase, hyphen-separated)
- Exception: `RDPI-Orchestrator.agent.md` — PascalCase prefix, this is the only agent with a different casing convention.
- All 16 files end in `.agent.md`.

**Skills** (`@/.github/skills/`):
- Pattern: `<skill-name>/SKILL.md` — each skill is a directory containing a `SKILL.md` file.
- Only one skill exists: `orchestrate/SKILL.md`.

**Instructions** (`@/.github/instructions/`):
- Pattern: `<name>.instructions.md`
- Only one file: `thoughts-workflow.instructions.md`.

**Stage Definitions** (`@/.github/rdpi-stages/`):
- Pattern: `NN-<stage-name>.md` (zero-padded number, hyphen-separated name)
- Files: `01-research.md`, `02-design.md`, `03-plan.md`, `04-implement.md`.


### 4. Frontmatter Patterns

#### 4.1 Agent Files — Standard (15 files)

Observed in `rdpi-codebase-researcher.agent.md`, `rdpi-approve.agent.md`, `rdpi-architect.agent.md`, `rdpi-codder.agent.md`, `rdpi-tester.agent.md`, `rdpi-redraft.agent.md`, `rdpi-questioner.agent.md`, `rdpi-external-researcher.agent.md`, `rdpi-design-reviewer.agent.md`, `rdpi-implement-reviewer.agent.md`, `rdpi-plan-reviewer.agent.md`, `rdpi-planner.agent.md`, `rdpi-research-reviewer.agent.md`, `rdpi-qa-designer.agent.md`, `rdpi-stage-creator.agent.md`:

```yaml
---
name: rdpi-<role-name>
description: "ONLY for RDPI pipeline."
user-invocable: false
tools: [search, read, edit, web, execute, vscode]
---
```

Fields:
- `name` (string): Agent identifier, matches filename without `.agent.md`.
- `description` (string): Short description; all 15 standard agents share `"ONLY for RDPI pipeline."`.
- `user-invocable` (boolean): Always `false` for these agents — they are subagent-only.
- `tools` (array of strings): Tool access list; all 15 share `[search, read, edit, web, execute, vscode]`.

#### 4.2 Agent Files — Orchestrator (1 file)

`@/.github/agents/RDPI-Orchestrator.agent.md:1-8`:

```yaml
---
name: RDPI-Orchestrator
description: Orchestrates the Research → Design → Plan → Implement pipeline by delegating work to specialized subagents.
disable-model-invocation: true
tools: [agent, search, read, edit, todo, vscode]
agents:
  - '*'
---
```

Fields (different from standard agents):
- `name`: PascalCase `RDPI-Orchestrator` (not lowercase).
- `description`: Unique, descriptive string (not the generic "ONLY for RDPI pipeline.").
- `disable-model-invocation` (boolean): `true` — unique to this agent.
- `tools`: Different set — includes `agent` and `todo`, excludes `web` and `execute`.
- `agents` (array): `['*']` — can delegate to any agent. Unique field, not present in other agents.
- `user-invocable`: absent (implicitly `true` — this is the user-facing entry point).

#### 4.3 Skill File

`@/.github/skills/orchestrate/SKILL.md:1-5`:

```yaml
---
name: "orchestrate"
description: "Helps orchestrate subagents"
license: https://opensource.org/licenses/MIT
---
```

Fields:
- `name` (string): Skill identifier.
- `description` (string): Short description.
- `license` (string): URL to license. Unique to skills; not present in agent or instruction frontmatter.

#### 4.4 Instructions File

`@/.github/instructions/thoughts-workflow.instructions.md:1-5`:

```yaml
---
name: "thoughts-workflow"
description: "Use when working with .thoughts/ feature development workflow files. Covers document formatting and stage structure for the Research → Design → Plan → Implement pipeline."
applyTo: ".thoughts/**"
---
```

Fields:
- `name` (string): Instruction set identifier.
- `description` (string): Longer description explaining when to use.
- `applyTo` (string): Glob pattern for automatic activation. Unique to instructions.

#### 4.5 Stage Definition Files

`@/.github/rdpi-stages/01-research.md` through `04-implement.md` — **no YAML frontmatter**. These files start directly with a Markdown heading:

```markdown
# Stage: 01-Research
```

No frontmatter fields. Content is plain Markdown with tables and guidelines.


### 5. Bundle Mapping

Per TASK.md (`@/.thoughts/2026-03-21-1200_cli-mda-manager/TASK.md:42-50`), two bundles are defined:

#### 5.1 `orchestrate` Bundle (base)

> "The orchestrate skill (`skills/orchestrate/SKILL.md`). Installed by default when setting up VSCode support."

| # | File | Category |
|---|------|----------|
| 1 | `.github/skills/orchestrate/SKILL.md` | Skill |

**Total: 1 file.**

#### 5.2 `rdpi` Bundle (optional)

> "The full RDPI pipeline — 16 agent files, workflow instructions, 4 stage definitions, and the RDPI-Orchestrator agent."

| # | File | Category |
|---|------|----------|
| 1 | `.github/agents/RDPI-Orchestrator.agent.md` | Agent |
| 2 | `.github/agents/rdpi-approve.agent.md` | Agent |
| 3 | `.github/agents/rdpi-architect.agent.md` | Agent |
| 4 | `.github/agents/rdpi-codder.agent.md` | Agent |
| 5 | `.github/agents/rdpi-codebase-researcher.agent.md` | Agent |
| 6 | `.github/agents/rdpi-design-reviewer.agent.md` | Agent |
| 7 | `.github/agents/rdpi-external-researcher.agent.md` | Agent |
| 8 | `.github/agents/rdpi-implement-reviewer.agent.md` | Agent |
| 9 | `.github/agents/rdpi-plan-reviewer.agent.md` | Agent |
| 10 | `.github/agents/rdpi-planner.agent.md` | Agent |
| 11 | `.github/agents/rdpi-qa-designer.agent.md` | Agent |
| 12 | `.github/agents/rdpi-questioner.agent.md` | Agent |
| 13 | `.github/agents/rdpi-redraft.agent.md` | Agent |
| 14 | `.github/agents/rdpi-research-reviewer.agent.md` | Agent |
| 15 | `.github/agents/rdpi-stage-creator.agent.md` | Agent |
| 16 | `.github/agents/rdpi-tester.agent.md` | Agent |
| 17 | `.github/instructions/thoughts-workflow.instructions.md` | Instructions |
| 18 | `.github/rdpi-stages/01-research.md` | Stage Definition |
| 19 | `.github/rdpi-stages/02-design.md` | Stage Definition |
| 20 | `.github/rdpi-stages/03-plan.md` | Stage Definition |
| 21 | `.github/rdpi-stages/04-implement.md` | Stage Definition |

**Total: 21 files** (16 agents + 1 instructions + 4 stage definitions).

Note: TASK.md says "16 agent files" and also mentions "the RDPI-Orchestrator agent" separately. The actual agent count in `.github/agents/` is 16 total (including the Orchestrator). The description appears to count inclusively — all 16 agents are part of the bundle.

#### 5.3 Files Not in Either Bundle

| File | Reason |
|------|--------|
| `.github/copilot-instructions.md` | Explicitly excluded per TASK.md:57 ("project-specific and should NOT be part of any template bundle") |
| `.github/dependabot.yml` | GitHub automation config, not an MDA file |
| `.github/workflows/ci.yml` | CI pipeline, not an MDA file |
| `.github/workflows/publish.yml` | Publish pipeline, not an MDA file |


### 6. Project Configuration

#### 6.1 package.json

- **Location**: `@/package.json`
- **Name**: `astp`, version `0.1.0`
- **License**: GPL-3.0-or-later
- **Repository**: `github.com/fozy-labs/astp`
- **No `bin` field** — CLI entry point is not configured yet.
- **No `type` field** — defaults to CommonJS (the shared config `@fozy-labs/js-configs` uses `"type": "module"`).
- **No `main`/`exports` field** — no package entry point defined.
- **No direct dependencies** — only `devDependencies`.

Scripts:

| Script | Command | Status |
|--------|---------|--------|
| `build` | `rimraf ./dist && tsc && tsc-alias` | Defined, requires `tsc` and `tsc-alias` (not in deps) |
| `build:watch` | `npm run build && (concurrently "tsc -w" "tsc-alias -w")` | Defined, requires `concurrently` (not in deps) |
| `ts-check` | `tsc --noEmit` | Defined |
| `test` | `vitest run` | Defined, requires `vitest` (not in deps) |
| `test:watch` | `vitest` | Defined |
| `test:coverage` | `vitest run --coverage` | Defined |
| `lint` | `eslint src/` | Defined, requires `eslint` (not in deps) |
| `lint:fix` | `eslint src/ --fix` | Defined |
| `format` | `prettier --write src/` | Defined, requires `prettier` (not in deps) |
| `format:check` | `prettier --check src/` | Defined |

DevDependencies:
- `@fozy-labs/js-configs` (`^0.1.3`) — shared configs package providing ESLint, Prettier, TypeScript, and Vitest configurations.

Missing direct devDependencies (referenced by scripts but not listed — likely expected to be peer deps of `@fozy-labs/js-configs` or need to be added):
- `typescript`
- `tsc-alias`
- `rimraf`
- `concurrently`
- `vitest`
- `eslint`
- `prettier`

Prettier config: delegated to `@fozy-labs/js-configs/prettier` via `"prettier"` field in package.json.

#### 6.2 TypeScript Configuration

**No `tsconfig.json` exists in the repository root.** The `@fozy-labs/js-configs` package provides a base config at `@fozy-labs/js-configs/typescript` (maps to `typescript/tsconfig.base.json`) with:

```json
{
    "compilerOptions": {
        "target": "ESNext",
        "module": "ESNext",
        "lib": ["DOM", "ESNext"],
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "isolatedModules": true,
        "noEmitOnError": true,
        "declaration": true,
        "jsx": "react-jsx"
    }
}
```

A `tsconfig.json` extending this base needs to be created. Build scripts reference `tsc` and `tsc-alias`, confirming TypeScript compilation is the intended build approach.

#### 6.3 ESLint Configuration

No `.eslintrc*` or `eslint.config.*` file exists in the repo root. The `@fozy-labs/js-configs` package exports an ESLint config at `@fozy-labs/js-configs/eslint`. An ESLint config file importing from this shared config needs to be created.

#### 6.4 Vitest Configuration

No `vitest.config.*` file exists. The `@fozy-labs/js-configs` package exports a Vitest config at `@fozy-labs/js-configs/vitest`.

#### 6.5 EditorConfig

`@/.editorconfig`: 4-space indentation, LF line endings, UTF-8 charset, 2-space for JSON/YAML, no trailing whitespace trimming for `.md` files.

#### 6.6 .gitignore

`@/.gitignore`: Ignores `node_modules`, `.idea`, `dist`, `*.tsbuildinfo`, `*.obsidian`, `coverage`.

#### 6.7 .prettierignore

`@/.prettierignore`: Ignores `dist/`, `coverage/`, `node_modules/`, `*.md`.

#### 6.8 CI/CD

- **CI** (`@/.github/workflows/ci.yml`): Runs on push to `main` and tags `v*`, and on PRs to `main`. Steps: `npm ci`, `ts-check`, `format:check`, `lint`, `ts-check:tests`, `test`. Uses Node.js 22.x.
- **Publish** (`@/.github/workflows/publish.yml`): Triggered by successful CI on `v*` tags. Runs `npm ci`, `npm run build`, `npm publish --access public` with npm token. Uses provenance via `id-token: write`.
- **Dependabot** (`@/.github/dependabot.yml`): Weekly updates for `github-actions` ecosystem only.

#### 6.9 Missing Configuration for CLI

Based on TASK.md requirements and existing state:

| Item | Status | Notes |
|------|--------|-------|
| `bin` field in package.json | Missing | Required for CLI executable registration |
| CLI entry point (`src/cli.ts` or similar) | Missing | No source files exist in `src/` |
| `tsconfig.json` | Missing | Needs to extend `@fozy-labs/js-configs/typescript` |
| `eslint.config.js` (or similar) | Missing | Needs to import from `@fozy-labs/js-configs/eslint` |
| `vitest.config.ts` | Missing | Needs to import from `@fozy-labs/js-configs/vitest` |
| `type: "module"` in package.json | Missing | Base tsconfig targets ESNext modules |
| Runtime dependencies | Missing | No `dependencies` in package.json (will need CLI framework, prompts library, etc.) |
| Templates in `src/templates/` | Missing | Directory exists but is empty |

### 7. Source Code State

- **Location**: `@/src/`
- **Contents**: Single empty subdirectory `templates/`.
- **No TypeScript files, no CLI code, no library code.** The project is at the scaffolding stage.


## Code References

- `@/package.json:1-30` — Full project configuration (name, version, scripts, dependencies, prettier delegation).
- `@/package.json:14-25` — All npm scripts (build, test, lint, format).
- `@/package.json:27-29` — Single devDependency: `@fozy-labs/js-configs`.
- `@/.editorconfig:1-13` — Editor configuration (indentation, charset, line endings).
- `@/.gitignore:1-6` — Ignored paths (node_modules, dist, coverage, IDE files).
- `@/.prettierignore:1-4` — Prettier-ignored paths (dist, coverage, node_modules, *.md).
- `@/.github/copilot-instructions.md:1-3` — Project-specific Copilot instructions (NOT a template; references `docs/CONTRIBUTING.md`).
- `@/.github/agents/RDPI-Orchestrator.agent.md:1-8` — Orchestrator agent frontmatter (unique fields: `disable-model-invocation`, `tools`, `agents`).
- `@/.github/agents/rdpi-codebase-researcher.agent.md:1-5` — Standard agent frontmatter pattern (name, description, user-invocable, tools).
- `@/.github/agents/rdpi-approve.agent.md:1-5` — Standard agent frontmatter pattern.
- `@/.github/agents/rdpi-codder.agent.md:1-5` — Standard agent frontmatter pattern.
- `@/.github/skills/orchestrate/SKILL.md:1-5` — Skill frontmatter (name, description, license).
- `@/.github/instructions/thoughts-workflow.instructions.md:1-5` — Instructions frontmatter (name, description, applyTo).
- `@/.github/rdpi-stages/01-research.md:1-2` — Stage definition (no frontmatter, starts with `# Stage: 01-Research`).
- `@/.github/rdpi-stages/02-design.md:1-2` — Stage definition (no frontmatter).
- `@/.github/rdpi-stages/03-plan.md:1-2` — Stage definition (no frontmatter).
- `@/.github/rdpi-stages/04-implement.md:1-2` — Stage definition (no frontmatter).
- `@/.github/workflows/ci.yml:1-24` — CI pipeline (Node 22.x, ts-check, format, lint, test).
- `@/.github/workflows/publish.yml:1-28` — Publish pipeline (npm publish on v* tags).
- `@/.github/dependabot.yml:1-6` — Dependabot config (github-actions weekly).
- `@/.thoughts/2026-03-21-1200_cli-mda-manager/TASK.md:1-57` — Full task description with requirements and constraints.
- `@/.thoughts/2026-03-21-1200_cli-mda-manager/TASK.md:42-43` — `orchestrate` bundle definition.
- `@/.thoughts/2026-03-21-1200_cli-mda-manager/TASK.md:44-50` — `rdpi` bundle definition.
- `@/.thoughts/2026-03-21-1200_cli-mda-manager/TASK.md:57` — `copilot-instructions.md` exclusion.
