---
title: "Phases: 03-plan"
date: 2026-03-22
stage: 03-plan
---

# Phases: 03-plan

## Phase 1: Implementation Planning

- **Agent**: `rdpi-planner`
- **Output**: `README.md`, `01-phase.md` ... `NN-phase.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

You are planning the implementation of 6 targeted fixes to the astp CLI tool. These are small, surgical changes — mostly template text edits and one TypeScript code change. Do NOT over-engineer the plan.

**Read these documents first:**

- Task description: `../TASK.md`
- Research summary: `../01-research/README.md`
- Design change specification: `../02-design/01-architecture.md` (this is your primary input — it has exact before/after text for each fix)
- Design decisions: `../02-design/04-decisions.md`
- Test cases and risks: `../02-design/06-testcases.md`

**Before writing the plan, analyze:**

1. Map every change spec (Issues 1–6) from `01-architecture.md` to concrete files. Verify all file paths exist by searching the repository.
2. Identify dependencies between changes. Note: Issues 4 and 6 both touch `RDPI-Orchestrator.agent.md` — they must be in the same phase to avoid conflicts.
3. Determine which tasks can run in parallel vs. must be sequential.
4. Estimate per-task complexity (Low/Medium/High). All these are Low — they are text replacements with known before/after content.
5. Define verification criteria per phase (at minimum: `npm run ts-check` for any phase touching `.ts` files; grep-based content checks for template edits per `06-testcases.md`).

**Affected files (5 total):**

- `src/templates/rdpi/instructions/thoughts-workflow.instructions.md` — Issue 1
- `src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md` — Issue 2
- `src/ui/prompts.ts` — Issue 3 (the only TypeScript file)
- `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md` — Issues 4, 6
- `src/templates/rdpi/agents/rdpi-approve.agent.md` — Issue 5

**Output requirements:**

- Update `README.md` in this stage directory (`03-plan/`) with: Overview, Phase Map (Mermaid dependency graph), Phase Summary table, Execution Rules, Next Steps. Preserve the existing YAML frontmatter fields (`research`, `design`).
- Create individual `NN-phase.md` files. Each phase file must include: Goal, Dependencies (Requires/Blocks), Execution mode (Sequential/Parallel), Tasks (with exact file path, action Modify, detailed description referencing the design change spec), and Verification checklist.
- Each task must reference the Issue number and the relevant section of `../02-design/01-architecture.md`.
- Keep phases minimal. These are 6 small edits across 5 files — 2–3 implementation phases max. Group related template edits together. The TypeScript change (Issue 3) can be a separate phase only if it needs distinct verification.

**Constraints:**

- Every phase must leave the project in a compilable state.
- No vague tasks — every task specifies the exact file, the exact text to find, and the exact replacement (from design spec).
- Do not split trivial changes into separate phases unnecessarily.
- No docs/ or apps/demos/ impact — `docs/` is empty and these are internal fixes.
- The constraint from TASK.md applies: "Do NOT bloat existing files. Extra tokens = worse results."

---

## Phase 2: Plan Review

- **Agent**: `rdpi-plan-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1
- **Retry limit**: 2

### Prompt

Review the implementation plan produced by Phase 1 for the astp fixes batch.

**Read these documents:**

- Plan README: `./README.md` (in `03-plan/`)
- All phase files in `03-plan/`: list the directory and read every `NN-phase.md` file
- Design change specification: `../02-design/01-architecture.md`
- Design decisions: `../02-design/04-decisions.md`
- Test cases: `../02-design/06-testcases.md`
- Design README: `../02-design/README.md`

**Review criteria — verify each:**

1. Every design change spec (Issues 1–6 from `01-architecture.md`) is mapped to at least one plan task.
2. File paths are concrete and verified (not placeholders) — all 5 files: `src/templates/rdpi/instructions/thoughts-workflow.instructions.md`, `src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md`, `src/ui/prompts.ts`, `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`, `src/templates/rdpi/agents/rdpi-approve.agent.md`.
3. Dependencies between phases are correct (Issues 4 + 6 share a file — must be same phase or ordered).
4. Each phase has verification criteria (grep checks for templates, `npm run ts-check` for TS).
5. Each phase leaves the project in a compilable state.
6. No vague tasks — all tasks specify exact changes from the design spec.
7. Each task references the design section it implements (Issue number + `01-architecture.md` section).
8. Parallelizable vs. sequential tasks correctly marked.
9. Per-task complexity estimates present (expect Low for all).
10. Documentation tasks — confirm none needed (docs/ is empty, internal fixes).
11. Mermaid dependency graph present in README.md.
12. Phase summary table complete in README.md.

**After review:** Update `README.md` — add a `## Quality Review` section with a checklist table (criteria, status PASS/FAIL/PARTIAL, notes). Set `status` in frontmatter to `Draft`.

---
