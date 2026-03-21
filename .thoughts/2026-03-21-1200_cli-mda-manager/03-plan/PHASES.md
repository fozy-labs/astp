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

You are producing the implementation plan for `astp` — a Node.js CLI tool that manages MDA files. Read all inputs listed below before writing anything.

**Inputs to read:**

1. Task description: `../TASK.md`
2. Research summary: `../01-research/README.md`
3. Design documents (read ALL):
   - `../02-design/README.md` — overview and key decisions
   - `../02-design/01-architecture.md` — C4 diagrams, module responsibility table (§4), template source layout (§6), install target mapping (§7), constraints
   - `../02-design/02-dataflow.md` — sequence diagrams for wizard, install, update, check flows
   - `../02-design/03-model.md` — TypeScript interfaces, frontmatter schema, hash algorithm, manifest.json schema
   - `../02-design/04-decisions.md` — 6 ADRs (giget, semver, Commander.js, @clack/prompts, manifest-driven, astp-* frontmatter)
   - `../02-design/05-usecases.md` — 5 primary use cases + 7 edge cases
   - `../02-design/06-testcases.md` — 46 test cases (unit/integration/E2E)
   - `../02-design/08-risks.md` — 15 risks with mitigations
4. Existing project state: read `package.json` at the repository root to understand current dependencies, scripts, and configuration.

**Analysis before writing (do NOT skip):**

1. Map every design component from 01-architecture.md §4 (Module Responsibility table) to concrete files that need to be created or modified. Verify every file path against the actual repository using search — confirm what exists and what doesn't.
2. Map project configuration gaps noted in research (tsconfig.json, eslint config, `bin` field, `type: "module"`, runtime dependencies) to specific file modifications.
3. Map the template source layout (01-architecture.md §6) to files that must be created under `src/templates/`.
4. Map the manifest.json schema (03-model.md §4) to the actual `src/templates/manifest.json` file to create.
5. Map test cases from 06-testcases.md to test files (co-located pattern: `src/core/__tests__/frontmatter.test.ts`, etc.).
6. Identify dependencies between changes — which modules depend on which (use the import dependency graph from 01-architecture.md §5).
7. Determine which tasks can run in parallel vs. must be sequential.
8. Estimate per-task complexity (Low/Medium/High).
9. Define verification criteria per phase — minimum: `npm run ts-check` passes.

**Output structure requirements:**

Produce the following files in this directory (`03-plan/`):

**README.md** — Update the existing README.md with:
- `## Overview` — brief plan summary
- `## Phase Map` — Mermaid dependency graph showing phase execution order
- `## Phase Summary` — table with columns: Phase, Name, Tasks, Complexity, Parallelizable, Verification
- `## Execution Rules` — constraints (every phase compilable, dependency order, etc.)
- `## Next Steps` — what happens after plan approval
- Update frontmatter `status` to `Draft`

**Individual phase files** (`01-phase.md`, `02-phase.md`, etc.) — each with:
- Frontmatter: `title`, `date`, `stage: 03-plan`, `role: rdpi-planner`
- `## Goal` — what this phase accomplishes
- `## Dependencies` — Requires (previous phases) / Blocks (subsequent phases)
- `## Execution` — Sequential or Parallel
- `## Tasks` — numbered list, each task specifying:
  - Exact file path (create/modify/delete)
  - Action: Create, Modify, or Delete
  - Detailed description of changes
  - Design reference (e.g., "01-architecture.md §4, ManifestReader row")
  - Complexity: Low/Medium/High
- `## Verification` — checklist (minimum: `npm run ts-check`)

**Constraints:**

- Every phase MUST leave the project in a compilable state after all its tasks.
- No vague tasks — every task specifies exact file paths and concrete changes.
- Do not split trivial changes across phases unnecessarily.
- First phase should handle project configuration (tsconfig, package.json updates, types) so subsequent phases can compile.
- Core layer modules with no internal dependencies (frontmatter, manifest) should come before modules that depend on them.
- Template files (`src/templates/`) and manifest.json can be in a separate phase since they don't affect TypeScript compilation.
- Test files should be planned alongside or immediately after their corresponding source modules.
- Keep the plan to 4-6 phases — this is a small-to-medium CLI project with ~12 source files.

---

## Phase 2: Plan Review

- **Agent**: `rdpi-plan-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1
- **Retry limit**: 2

### Prompt

Review the implementation plan for `astp` CLI — a Node.js CLI tool for managing MDA files.

**Files to read:**

1. All plan files in this directory (`03-plan/`):
   - `README.md` — phase map, summary table, execution rules
   - All `NN-phase.md` files (list the directory to find them)
2. All design documents for traceability check:
   - `../02-design/README.md` — overview and key decisions
   - `../02-design/01-architecture.md` — module responsibility table (§4), template layout (§6), constraints
   - `../02-design/02-dataflow.md` — data flows for all commands
   - `../02-design/03-model.md` — TypeScript interfaces, manifest schema
   - `../02-design/04-decisions.md` — 6 ADRs
   - `../02-design/05-usecases.md` — use cases
   - `../02-design/06-testcases.md` — 46 test cases
   - `../02-design/08-risks.md` — risk mitigations

**Review criteria (check ALL):**

1. **Design traceability**: Every component from 01-architecture.md §4 (Module Responsibility table — 12 modules) is mapped to at least one plan task.
2. **File path validity**: All file paths in tasks are concrete and verified, not placeholders. Paths match the project structure (e.g., `src/core/frontmatter.ts`, not `src/frontmatter.ts`).
3. **Dependency correctness**: Phase dependencies reflect the import graph from 01-architecture.md §5. No phase reads an output that hasn't been produced by a prior phase.
4. **Compilability**: Each phase leaves the project in a state where `npm run ts-check` passes. Early phases create types/config needed by later phases.
5. **Task concreteness**: No vague tasks. Every task specifies exact file path, action (Create/Modify/Delete), and detailed changes.
6. **Design references**: Each task references the design document section it implements.
7. **Parallelization**: Tasks correctly marked as parallelizable vs. sequential based on dependencies.
8. **Complexity estimates**: Per-task complexity estimates (Low/Medium/High) present and reasonable.
9. **Test coverage**: Test phases/tasks cover the test cases from 06-testcases.md. Test files follow co-located pattern (`src/core/__tests__/*.test.ts`).
10. **Documentation impact**: Documentation tasks proportional to existing docs (empty `docs/` directory — minimal docs needed).
11. **Mermaid diagram**: Phase dependency graph present in README.md.
12. **Summary table**: Phase summary table complete with all required columns.
13. **Template files**: `src/templates/` directory structure and `manifest.json` creation are planned.
14. **Configuration**: Project config tasks (tsconfig, package.json `bin` + `type: "module"`, dependencies) are in the first phase.

**Output:**

Update `README.md` in this directory:
- Add `## Quality Review` section with a checklist table (criterion | status | notes) for all 14 criteria above.
- List any issues found with severity (High/Medium/Low), including file references and specific descriptions.
- Set frontmatter `status` to `Draft`.

---

# Redraft Round 1

## Phase 3: Fix issues #1, #2, and user feedback (barrel pattern)

- **Agent**: `rdpi-redraft`
- **Output**: `02-phase.md`, `01-phase.md`, `README.md`
- **Depends on**: 1, 2
- **Retry limit**: 2
- **Review issues**: #1, #2, user feedback

### Prompt

Read REVIEW.md at `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\03-plan\REVIEW.md`.
Your assigned issues: #1, #2, and user feedback.
Affected files: `02-phase.md`, `01-phase.md`, `README.md` (all in this directory: `d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\03-plan\`).

**Issue #1 — Task 2.10 duplicate test IDs (Medium):**
File: `02-phase.md`, Task 2.10.
T28-T30 in the design (`../02-design/06-testcases.md`) are manifest fetch integration tests, correctly mapped in Task 2.7. Task 2.10 (fetcher.test.ts) reuses the same T28-T30 IDs for different giget/fetcher tests.
Fix: Replace T28, T29, T30 references in Task 2.10 with labels indicating these are additional tests beyond the design's T01-T46 (e.g., "FT-01", "FT-02", "FT-03" or simply remove the T-prefix IDs and describe them as "Additional fetcher tests not in design test matrix"). Also update the Phase 2 verification checklist line that says "T01-T15, T16-T30" — make sure the T28-T30 claim still refers only to the manifest tests (Task 2.7), not fetcher tests.

**Issue #2 — Phase Summary table missing "Parallelizable" column (Low):**
File: `README.md`, Phase Summary table.
Add a "Parallelizable" column to the table. Values based on the Phase Map dependency graph: Phase 1 = No, Phase 2 = Yes (with Phase 4), Phase 3 = No, Phase 4 = Yes (with Phase 2), Phase 5 = No. You may remove the "Dependencies" column if the Parallelizable column makes it redundant, or keep both — your choice, but the "Parallelizable" column must be present.

**User feedback — barrel pattern for index.ts:**
File: `01-phase.md`, Task 1.6.
Currently Task 1.6 (`src/types/index.ts`) defines all interfaces AND contains the `resolveTarget()` utility function. The user requires that `index.ts` files be barrel re-exports only (no logic).
Fix: Split Task 1.6 into two tasks:
- One task creates `src/types/target.ts` with the `resolveTarget()` function and the `InstallTargetType`/`InstallTarget` types it directly uses.
- Task 1.6 becomes a barrel that re-exports from `src/types/target.ts` (and defines the remaining interfaces inline, or splits them too — your choice, but `index.ts` must have NO logic, only `export` / `export * from` statements).
Update the task count in `README.md` Phase Summary table accordingly (Phase 1 goes from 6 to 7 tasks).
Also check `02-phase.md` — there's a note at line ~206 saying "T16-T17 test `resolveTarget()` exported from `src/types/index.ts`". Update it to reference the new file path (`src/types/target.ts`).

Fix only your assigned issues. Do not change anything else.

---

## Phase 4: Re-review after Redraft Round 1

- **Agent**: `rdpi-plan-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 3
- **Retry limit**: 2

### Prompt

Re-review the implementation plan after Redraft Round 1 fixes.

**Files modified in this round** (verify these specifically):
- `02-phase.md` — Task 2.10 test IDs should no longer duplicate T28-T30; verification checklist updated
- `01-phase.md` — Task 1.6 split: `src/types/index.ts` is now barrel-only, `resolveTarget()` moved to a separate file
- `README.md` — Phase Summary table now has a "Parallelizable" column; Phase 1 task count updated

**Re-review scope:**
1. Verify Task 2.10 no longer references T28-T30 (those belong to Task 2.7 per `../02-design/06-testcases.md`).
2. Verify `src/types/index.ts` (Task 1.6) contains only re-exports — no function definitions or logic.
3. Verify Phase Summary table has a "Parallelizable" column with correct values matching the dependency graph.
4. Verify Phase 1 task count is updated correctly in the summary table.
5. Verify the note in `02-phase.md` about T16-T17 references the correct file (not `index.ts`).
6. Re-check all 14 original review criteria from Phase 2 to ensure no regressions.

**Files to read:**
- `README.md`, `01-phase.md`, `02-phase.md` in this directory
- `REVIEW.md` in this directory (to confirm all issues are addressed)
- `../02-design/06-testcases.md` (to verify test ID correctness)

**Output:**
Update `README.md`:
- Update the `## Quality Review` section with re-review results.
- If all issues are resolved and no regressions found, set frontmatter `status` to `Draft`.
- If issues remain, set status to `Redraft` and describe remaining issues.

---

# Redraft Round 2

## Phase 5: Comprehensive plan re-review

- **Agent**: `rdpi-plan-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1, 3
- **Retry limit**: 2
- **Review issues**: User feedback — full re-verification of entire plan

### Prompt

The user requested a complete re-verification of the entire implementation plan. Perform a thorough review of ALL plan files from scratch — do not rely on previous review results.

**Files to read (plan):**

- `README.md` in this directory (`d:\Area\projects\fz\astp\.thoughts\2026-03-21-1200_cli-mda-manager\03-plan\`)
- `01-phase.md` through `05-phase.md` in this directory (list the directory to confirm all phase files)
- `REVIEW.md` in this directory — note the one remaining Low-severity issue: Task 2.8 references `src/types/index.ts` (barrel) instead of `src/types/resolve-target.ts` (source file). Verify whether this was fixed. If not, flag it again.

**Design documents to read (for traceability):**

- `../02-design/README.md`
- `../02-design/01-architecture.md` — module responsibility table (§4), import dependency graph (§5), template layout (§6), install target mapping (§7)
- `../02-design/02-dataflow.md` — sequence diagrams
- `../02-design/03-model.md` — TypeScript interfaces, manifest schema
- `../02-design/04-decisions.md` — ADRs
- `../02-design/05-usecases.md` — use cases and edge cases
- `../02-design/06-testcases.md` — 46 test cases (verify test ID mapping)
- `../02-design/08-risks.md` — risks and mitigations

**Review ALL 14 criteria thoroughly:**

1. **Design traceability**: Every component from 01-architecture.md §4 (Module Responsibility table — 12 modules) is mapped to at least one plan task.
2. **File path validity**: All file paths in tasks are concrete and verified. Paths match the project structure (`src/core/`, `src/types/`, `src/cli/`, `src/templates/`).
3. **Dependency correctness**: Phase dependencies reflect the import graph from 01-architecture.md §5. No phase reads an output that hasn't been produced by a prior phase.
4. **Compilability**: Each phase leaves the project in a state where `npm run ts-check` passes. Early phases create types/config needed by later phases.
5. **Task concreteness**: No vague tasks. Every task specifies exact file path, action (Create/Modify/Delete), and detailed changes.
6. **Design references**: Each task references the design document section it implements.
7. **Parallelization**: Tasks correctly marked as parallelizable vs. sequential based on dependencies. README.md Phase Summary table has a "Parallelizable" column.
8. **Complexity estimates**: Per-task complexity estimates (Low/Medium/High) present and reasonable.
9. **Test coverage**: Test tasks cover the 46 test cases from 06-testcases.md. Test IDs are not duplicated across tasks. Test files follow co-located pattern (`src/core/__tests__/*.test.ts`).
10. **Documentation impact**: Documentation tasks proportional to existing docs (empty `docs/` directory).
11. **Mermaid diagram**: Phase dependency graph present and correct in README.md.
12. **Summary table**: Phase summary table complete with all required columns (Phase, Name, Tasks, Complexity, Parallelizable, Verification).
13. **Template files**: `src/templates/` directory structure and `manifest.json` creation are planned.
14. **Configuration**: Project config tasks (tsconfig, package.json `bin` + `type: "module"`, dependencies) are in the first phase.

**Additional checks:**

- Verify `src/types/index.ts` is barrel-only (no logic) per the Redraft Round 1 fix. The `resolveTarget()` function should be in a separate file, and all references in plan tasks should point to the correct source file (not the barrel).
- Verify Task 2.10 test IDs do not duplicate T28-T30 (those belong to Task 2.7 per 06-testcases.md).
- Verify Phase 1 task count in the summary table matches the actual number of tasks in `01-phase.md`.

**Output:**

Update `README.md` in this directory:
- Replace the existing `## Quality Review` section with fresh re-review results — a checklist table (criterion | status | notes) for all 14 criteria.
- List any issues found with severity (Critical/High/Medium/Low), file references, and specific descriptions.
- If all criteria pass with no issues above Low severity, set frontmatter `status` to `Draft`.
- If issues remain, set status to `Redraft` and describe remaining issues.

---
