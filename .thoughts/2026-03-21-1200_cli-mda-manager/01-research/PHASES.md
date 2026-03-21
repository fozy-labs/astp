---
title: "Phases: 01-research"
date: 2026-03-21
stage: 01-research
rdpi-version: b0.5
---

# Phases: 01-research

## Phase 1: Codebase Analysis

- **Agent**: `rdpi-codebase-researcher`
- **Output**: `01-codebase-analysis.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

You are researching the `astp` repository to support the design of a Node.js CLI tool that manages MDA files (markdown files readable by AI agents: skills, agents, instructions, stage definitions).

**Read first:**
- `@/TASK.md` at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\TASK.md` — full task description.
- `@/package.json` at `d:\Area\projects\fz\astp\package.json` — project configuration.

**Entry points to analyze:**
1. `.github/` directory — this contains the full existing AI agent setup that will become the source material for templates:
   - `.github/agents/` — 16 agent files (`*.agent.md`)
   - `.github/skills/orchestrate/` — the orchestrate skill (`SKILL.md`)
   - `.github/instructions/thoughts-workflow.instructions.md` — workflow instructions
   - `.github/rdpi-stages/` — 4 stage definition files (`01-research.md` through `04-implement.md`)
   - `.github/copilot-instructions.md` — project-specific instructions (NOT a template candidate)
2. `src/templates/` — currently empty, will hold templates extracted from `.github/`.
3. `src/` — no CLI code exists yet; document the empty state.

**What to document:**
- **MDA file organization**: How files are grouped by type (agents, skills, instructions, rdpi-stages). List all files with their full relative paths.
- **File naming conventions**: Patterns for each file type (e.g., `rdpi-*.agent.md`, `*.instructions.md`).
- **Frontmatter patterns**: Read 3–4 representative MDA files from different categories and document their frontmatter fields and structure. Include the orchestrate skill `SKILL.md`, at least one agent file, the workflow instructions file, and one rdpi-stage file.
- **Bundle mapping**: Based on TASK.md, the `orchestrate` bundle = `skills/orchestrate/SKILL.md`. The `rdpi` bundle = all 16 agents + workflow instructions + 4 rdpi-stages + the RDPI-Orchestrator agent. Document which files belong to each bundle. Note any files that don't fit either bundle.
- **Project configuration**: TypeScript setup, build tooling, scripts, dependencies, prettier/lint config. Document what's already set up and what's missing for a CLI tool (e.g., `bin` field in package.json, CLI entry point).
- **Directory structure**: Full tree of the repository.

**Scope boundaries**: Only analyze files in this repository. Do NOT propose solutions or make recommendations — only gather and organize facts.

Write output to `01-codebase-analysis.md` in the stage directory.

---

## Phase 2: External Research

- **Agent**: `rdpi-external-researcher`
- **Output**: `02-external-research.md`
- **Depends on**: —
- **Retry limit**: 1

### Prompt

You are researching the Node.js CLI tool ecosystem to inform the design of `astp` — a CLI that installs, updates, and manages MDA template files (markdown files for AI agent configuration).

**Read first:**
- `@/TASK.md` at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\TASK.md` — full task description.

**Research areas:**

1. **CLI Frameworks** — Compare the major Node.js CLI frameworks for building interactive command-line tools:
   - Commander.js, Yargs, Oclif, Citty/unbuild (unjs ecosystem)
   - Evaluate: TypeScript support, maintenance status (last release, open issues), bundle size, learning curve, plugin/command structure, community adoption.
   - Context: The CLI needs subcommands (`install`, `update`, `check`), interactive prompts, and should be lightweight.

2. **Interactive Prompt Libraries** — Compare libraries for user-friendly terminal interactions:
   - Inquirer.js, @inquirer/prompts, @clack/prompts, Prompts (terkelg)
   - Evaluate: TypeScript support, maintenance, UX quality (spinners, colors, multi-select), bundle size, composability.

3. **Template Distribution Strategies** — How do existing tools manage/distribute template files?
   - Analyze approaches: git-based fetching (degit, giget), npm registry (templates as npm packages), HTTP/API fetching (GitHub API raw content), embedded templates (bundled in CLI package).
   - For each approach: pros, cons, versioning implications, offline support, update detection ease.
   - Relevant tools to study: degit, giget, create-*, plop, hygen, copier.

4. **Versioning for Template Bundles** — Strategies for independently versioning bundles and individual items:
   - Semantic versioning for template collections, git tag-based versioning, content hashing, manifest-based version tracking.
   - How to detect updates: comparing local vs remote versions, checksums, last-modified timestamps.

5. **npm CLI Packaging Best Practices** — How to publish a Node.js CLI tool:
   - `bin` field configuration, shebang lines, TypeScript compilation for CLI, ESM vs CJS considerations for CLI tools, peer dependencies.

**Skepticism directive**: Cross-reference claims across multiple sources. For each finding, annotate with a confidence level:
- **High**: Verified across official docs and multiple reputable sources.
- **Medium**: Found in reputable sources but limited cross-referencing.
- **Low**: Single source or opinion-based.

Separate established best practices from community opinions.

Write output to `02-external-research.md` in the stage directory.

---

## Phase 3: Open Questions

- **Agent**: `rdpi-questioner`
- **Output**: `03-open-questions.md`
- **Depends on**: 1, 2
- **Retry limit**: 1

### Prompt

You are synthesizing unresolved questions and trade-offs for the `astp` CLI tool — a Node.js CLI that manages MDA files (AI agent configuration templates).

**Read first:**
- `@/TASK.md` at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\TASK.md` — full task description.
- Codebase analysis at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\01-research\01-codebase-analysis.md`.
- External research at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\01-research\02-external-research.md`.

**Context**: The `astp` CLI tool will install, update, and check for updates to MDA template bundles (orchestrate, rdpi) and individual items. Templates live in `src/templates/` and are fetched/synced from the repository. The CLI is written in TypeScript and published as an npm package.

**Generate questions covering these areas:**

1. **Template distribution mechanism** — How should templates be delivered? Embedded in the npm package vs fetched from GitHub at runtime? What are the trade-offs for offline support, versioning, and update speed?
2. **Versioning strategy** — How to version bundles independently from the CLI? How to version individual items within a bundle? What metadata format to track installed versions locally?
3. **Update detection** — How does the CLI detect that newer templates are available? Comparing against what source of truth? How to handle version conflicts when a user has modified installed files?
4. **Install targets** — Project-level (`.github/`) vs user-level (`~/.copilot/`). Can both coexist? How to handle conflicts between them? What's the default?
5. **CLI architecture** — Which framework and prompt library best fit the requirements (based on external research findings)? How should commands be structured?
6. **Template-CLI decoupling** — TASK.md requires that updating templates doesn't require a new CLI version. How to achieve this? What's the contract between CLI code and template structure?
7. **Scope boundaries** — What's in scope for v0.1.0 vs future versions? Which features are essential vs nice-to-have?

**For each question provide:**
- Context (why this matters)
- Available options (from research, if applicable)
- Risks of each option
- Researcher recommendation (your best assessment, clearly labeled as recommendation)
- Priority: **High** (blocks design), **Medium** (affects design quality), **Low** (can be deferred)

Write output to `03-open-questions.md` in the stage directory.

---

## Phase 4: Research Review

- **Agent**: `rdpi-research-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1, 2, 3
- **Retry limit**: 2

### Prompt

You are reviewing and synthesizing all research outputs for the `astp` CLI MDA Manager feature.

**Read these files:**
- `@/TASK.md` at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\TASK.md` — original task description.
- Codebase analysis at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\01-research\01-codebase-analysis.md`.
- External research at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\01-research\02-external-research.md`.
- Open questions at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\01-research\03-open-questions.md`.

**Update `README.md`** at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\01-research\README.md` with the following structure:

```markdown
## Summary
<2–3 sentences: what was researched and why>

## Documents
<bulleted list linking to each phase output file with brief description>

## Key Findings
<5–7 bullet points: the most important facts discovered across all research>

## Contradictions and Gaps
<any conflicting information between documents, or areas where research is insufficient>

## Quality Review
<checklist verifying research quality — check each item:>
- [ ] All phase output files exist and are non-empty
- [ ] File paths and cross-references are accurate
- [ ] External research includes source attribution with confidence levels
- [ ] Codebase analysis contains only facts, no solution proposals
- [ ] Open questions are actionable (not vague) with priority levels
- [ ] Frontmatter is correct in all files (title, date, stage, role)
- [ ] Cross-references between documents are consistent (claims in one doc match another)
- [ ] No solutions or design decisions proposed in any research document

## Next Steps
<what the design stage should focus on, based on research findings>
```

Keep the existing frontmatter from README.md. Set `status: Draft` (research is complete and ready for review).

**Quality review requirements:**
- Verify that each referenced file actually exists.
- Check that codebase analysis contains only facts (no recommendations or solution proposals).
- Check that external research has confidence level annotations.
- Check that open questions have priority levels and are actionable.
- If you find issues, note them in the "Contradictions and Gaps" section — do NOT fix other documents.

---
