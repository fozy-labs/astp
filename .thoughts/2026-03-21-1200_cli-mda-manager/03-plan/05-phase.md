---
title: "Phase 5: Documentation + E2E Tests"
date: 2026-03-22
stage: 03-plan
role: rdpi-planner
rdpi-version: b0.5
---

## Goal

Create the project README and end-to-end tests that validate the full CLI workflow. After this phase, the project is fully documented, all test layers (unit, integration, E2E) pass, and the CLI is ready for publishing.

## Dependencies

- **Requires**: Phase 3 (CLI assembled and functional), Phase 4 (template files exist for E2E fixtures)
- **Blocks**: None (final phase)

## Execution

Sequential — must complete after both Phase 3 and Phase 4.

## Tasks

### Task 5.1: Create root `README.md`

- **File**: `README.md`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Project documentation following the sections specified in the design's documentation impact analysis.
- **Details**:
  Create `README.md` at the repository root with 7 sections [ref: ../02-design/07-docs.md, README.md]:

  1. **What is astp** — one-paragraph description: CLI tool for managing MDA files (skills, agents, instructions) used by AI coding agents
  2. **Installation** — `npm install -g astp`, Node.js >= 22 requirement [ref: ../02-design/01-architecture.md Constraints]
  3. **Quick start** — two examples: `astp` (interactive wizard), `astp install rdpi --target project` (scripted) [ref: ../02-design/05-usecases.md UC-1, UC-2]
  4. **Commands** — reference table: `install [bundle] [--target]`, `update [--force] [--target]`, `check [--target]`, default interactive wizard [ref: ../02-design/02-dataflow.md §1]
  5. **Bundles** — table with `base` (1 file, default) and `rdpi` (21 files, optional) with descriptions [ref: ../02-design/01-architecture.md §6]
  6. **CI/CD** — example usage with `--target` flags for non-interactive mode, `GIGET_AUTH` env variable for rate limit avoidance [ref: ../02-design/05-usecases.md UC-5, ../02-design/08-risks.md#r4]
  7. **How it works** — brief explanation: fetches templates from GitHub via giget, injects `astp-*` frontmatter for version tracking [ref: ../02-design/04-decisions.md ADR-1, ADR-6]

### Task 5.2: Create E2E test helpers

- **File**: `tests/e2e/helpers.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Shared setup utilities for E2E tests — temp directories, CLI invocation, fixture templates.
- **Details**:
  Shared utilities for all E2E test files:
  - `runCli(args: string[], options?): Promise<{ stdout, stderr, exitCode }>` — invoke `node dist/cli.js` via `node:child_process.execFile` in a temp directory
  - `createTempProject(): Promise<{ dir, cleanup }>` — create isolated temp directory for each test
  - `mockManifestServer()` or fixture setup — provide a local/mock manifest and template source for E2E tests to avoid hitting real GitHub endpoints
  - Cleanup utilities for after-each teardown

  E2E tests validate real CLI behavior — actual process spawning, actual file system operations [ref: ../02-design/06-testcases.md, E2E tests section].

### Task 5.3: Create E2E test files

- **Files**: `tests/e2e/install.test.ts`, `tests/e2e/check.test.ts`, `tests/e2e/update.test.ts`
- **Action**: Create
- **Complexity**: High
- **Description**: End-to-end test cases that invoke the built CLI binary and verify exit codes, stdout output, and filesystem state.
- **Details**:
  **`tests/e2e/install.test.ts`** — install flow E2E tests [ref: ../02-design/06-testcases.md]:
  - **T31**: `astp install rdpi --target project` → exit 0, 21 files under `.github/`, each has `astp-*` frontmatter
  - **T32**: `astp install base --target project` → exit 0, 1 file at `.github/skills/orchestrate/SKILL.md`
  - **T38**: `astp install nonexistent --target project` → exit 1, stderr contains "not found"

  **`tests/e2e/check.test.ts`** — check flow E2E tests:
  - **T33**: Install rdpi → `astp check --target project` → exit 0, stdout contains "Up to date"
  - **T34**: Empty project → `astp check --target project` → exit 0, stdout contains "No astp-managed files"

  **`tests/e2e/update.test.ts`** — update flow E2E tests:
  - **T35**: Install v1.0.0 → swap manifest to v1.1.0 → `astp update --target project` → exit 0, `astp-version` = `1.1.0`
  - **T36**: Install → edit file → `astp update --target project` → modified file skipped with warning
  - **T37**: Install → edit file → `astp update --force --target project` → all files updated
  - **T39**: `astp` (no args) in non-TTY → graceful handling [ref: ../02-design/06-testcases.md T39]

  Note: E2E tests require the project to be built first (`npm run build`) before invoking `dist/cli.js`. Test setup should build or use a pre-built binary.

### Task 5.4: Verify full test suite

- **File**: N/A (verification task)
- **Action**: Verify
- **Complexity**: Low
- **Description**: Run the complete test suite and CI pipeline checks to confirm everything works end-to-end.
- **Details**:
  Execute all CI checks locally:
  1. `npm run ts-check` — TypeScript compilation check
  2. `npm run format:check` — Prettier formatting check
  3. `npm run lint` — ESLint check
  4. `npm run ts-check:tests` — Test file compilation check
  5. `npm run build` — Full build (required for E2E tests)
  6. `npm run test` — Complete test suite (unit + integration + E2E)

  Verify correctness criteria from [ref: ../02-design/06-testcases.md, Correctness Verification]:
  - Install round-trip: installed files have correct astp-* metadata
  - Check accuracy: version comparison matches expectations
  - Update integrity: versions and hashes update correctly
  - Modification detection: edited files flagged correctly
  - Hash consistency: strip + hash matches astp-hash for unmodified files

## Verification

- [ ] `README.md` exists at project root with all 7 sections
- [ ] E2E tests compile (`npm run ts-check:tests`)
- [ ] `npm run build` produces `dist/cli.js`
- [ ] Full test suite passes: `npm run test` (T31-T39 + all unit/integration tests)
- [ ] `npm run ts-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] All 46 test cases from design are implemented and passing
