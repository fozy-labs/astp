---
name: "rdpi-04-implement"
description: "ONLY for RDPI pipeline."
---

# Stage: 04-Implement

Implement stage executes the approved plan. Code changes must precisely follow the plan - no deviations, no extra features, no unrelated refactoring.

## Available Roles

| Role | Agent | Description | Default Limit                            |
|------|-------|-------------|------------------------------------------|
| Coder | `rdpi-codder` | Implements code changes according to plan phase tasks | max 8 invocation per plan phase, retry 2 |
| Tester | `rdpi-tester` | Runs verification for completed phases, saves report to `verification-<N>.md` | max 8 invocation per plan phase, retry 1 |
| Implementation Reviewer | `rdpi-implement-reviewer` | Reviews all changes, creates implementation record README.md | max 4 invocation, retry 2 |

## Typical Phase Structure

The number of implement phases is derived from the plan. For each plan phase:

| Phase | Agent | Output | Depends on |
|-------|-------|--------|------------|
| N.1 | `rdpi-codder` | Code changes for plan phase N | Completion of plan phases that N depends on (see plan dependency graph) |
| N.2 | `rdpi-tester` | `verification-N.md` (in stage directory) | N.1 |
| Final | `rdpi-implement-reviewer` | `README.md` (implementation record) | All N.1 + N.2 |

**Parallel execution**: if the plan's dependency graph shows that plan phases X and Y are independent (e.g., both depend only on plan phase 1), then implement phases X.1 and Y.1 MUST have the same `Depends on` value (i.e., the tester phase of plan phase 1) — NOT depend on each other. The orchestrator will run them in parallel.

Example for plan: P1 → {P2, P3} → P4:

| Impl Phase | Agent | Depends on |
|------------|-------|------------|
| 1.1 | `rdpi-codder` | — |
| 1.2 | `rdpi-tester` | 1.1 |
| 2.1 | `rdpi-codder` | 1.2 |
| 3.1 | `rdpi-codder` | 1.2 |
| 2.2 | `rdpi-tester` | 2.1 |
| 3.2 | `rdpi-tester` | 3.1 |
| 4.1 | `rdpi-codder` | 2.2, 3.2 |
| 4.2 | `rdpi-tester` | 4.1 |
| Final | `rdpi-implement-reviewer` | all above |

Each plan phase becomes a code → test pair that forms a **retry loop**: if the tester reports failures (`Next step: retry-coder`), the orchestrator re-spawns the coder (with the verification report path for context), then re-runs the tester. This loop repeats until the tester passes or the coder's retry limit is exhausted. The reviewer runs once at the end, after ALL code → test pairs have passed, reading all verification files.

## Phase Prompt Guidelines

### Phase N.1 - Code Implementation (per plan phase)

The prompt MUST specify:
- Path to the specific plan phase file: `../03-plan/NN-phase.md`
- Path to relevant design documents (architecture, model, dataflow)
- Instructions:
  1. Read the phase plan fully
  2. Implement each task in order
  3. Follow existing code patterns precisely (naming, indentation, barrel exports, `@/` alias)
  4. Update `index.ts` barrel exports when adding new files
  5. Maintain TypeScript strict mode compatibility
  6. Do NOT modify files outside the current phase scope
- Error handling:
  - If `ts-check` fails after implementation: fix within phase scope (max 2 attempts)
  - If unfixable: document the issue and continue

### Phase N.2 - Verification (per plan phase)

The prompt MUST specify:
- What was implemented (reference the coder's phase)
- Run the verification checklist from the plan phase file:
  - `npm run ts-check`
  - Any phase-specific behavioral checks
  - API consistency checks
- Report format: pass/fail per check, error details if failed
- Save verification report to `04-implement/verification-<N>.md` (or `verification-<lowest-N>-<highest-N>.md` for grouped phases) - the implement-reviewer reads these files
- If tests fail: report to orchestrator (do not attempt fixes - that's the coder's job on retry)

### Final Phase - Implementation Review

The prompt MUST specify:
- Paths to ALL plan phases and their implemented changes
- Paths to research + design documents for traceability
- Path to verification files: `04-implement/verification-*.md`
- Write `README.md` in `04-implement/`, replacing the stage-creator's placeholder, with:
  - Implementation record: date, status, plan link
  - Phase completion status (N/N)
  - Verification results summary
  - Quality review checklist: all plan phases implemented, verification passed, no out-of-scope files modified, code follows project patterns, barrel exports correct, TypeScript strict mode, docs proportional, no security vulnerabilities
  - List of all changed files
  - Post-implementation recommendations (build, manual testing areas)

## Output Conventions

- Frontmatter fields: phase outputs use (title, date, stage, role); README.md uses (title, date, status, feature, plan, astp-version)
- Implementation record README.md structure: Status, Quality Review (Checklist + Documentation Proportionality + Issues Found), Post-Implementation Recommendations, Change Summary, Recommended Commit Message
- Code style: match existing codebase exactly (read neighbor files for reference)
- Use `@/*` path alias for imports within `src/`

## Scaling Rules

- For phases with only type changes: tester phase can be reduced to `ts-check` only
- **Preserve plan parallelism**: if the plan marks phases as independent/parallel, create separate implement phase pairs (code + test) for each and set their `Depends on` to reflect the plan's dependency graph — do NOT merge independent plan phases into a single coder invocation. The orchestrator handles parallel execution automatically.
- Grouping is only allowed for truly trivial plan phases (e.g., two phases that each touch 1-2 files with minor changes). In that case the tester saves a report named `verification-<lowest-N>-<highest-N>.md`.
- Never exceed 2x (number of plan phases) + 1 total phases for implement stage
