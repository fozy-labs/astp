---
title: "Phases: 04-implement"
date: 2026-03-22
stage: 04-implement
---

# Phases: 04-implement

## Phase 1.1: Code — Project Configuration + Types

- **Agent**: `rdpi-codder`
- **Output**: Code changes per `../03-plan/01-phase.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

You are implementing **Plan Phase 1: Project Configuration + Types** for the `astp` CLI tool.

**Read these files first:**
- Plan phase: `../03-plan/01-phase.md` — contains all 6 tasks with exact specifications
- Design architecture: `../02-design/01-architecture.md` — module zones, constraints, import graph
- Design model: `../02-design/03-model.md` — all TypeScript interfaces for `src/types/`
- Design decisions: `../02-design/04-decisions.md` — ADR-1 (giget), ADR-3 (Commander), ADR-4 (@clack/prompts)
- Existing `package.json` at the project root — you will modify this file
- TASK.md: `../.thoughts/2026-03-21-1200_cli-mda-manager/TASK.md` — original requirements

**Read the `@fozy-labs/js-configs` package** to understand available shared configs:
- Check `node_modules/@fozy-labs/js-configs/` for available exports (typescript, eslint, vitest configs)
- Read the actual config files to understand what base settings are provided before extending them

**Implement all 6 tasks in order:**
1. Task 1.1: Update `package.json` — add `type`, `engines`, `bin`, `files`, dependencies, devDependencies, `ts-check:tests` script
2. Task 1.2: Create `tsconfig.json` — extend `@fozy-labs/js-configs/typescript`
3. Task 1.3: Create `tsconfig.test.json` — extend base tsconfig + test settings
4. Task 1.4: Create `eslint.config.js` — flat config from `@fozy-labs/js-configs/eslint`
5. Task 1.5: Create `vitest.config.ts` — from `@fozy-labs/js-configs/vitest`
6. Task 1.6: Create `src/types/resolve-target.ts` and `src/types/index.ts` — all shared types from the domain model

**Rules:**
- Follow existing code patterns (check `.editorconfig`, prettier config in `package.json`)
- Use `@/*` path alias for imports within `src/` (configure in tsconfig paths)
- All TypeScript interfaces must match `../02-design/03-model.md §3` exactly
- Do NOT create files outside this phase's scope
- Run `npm install` after updating `package.json` to install dependencies
- After implementation, verify: `npm run ts-check` passes

---

## Phase 1.2: Verify — Project Configuration + Types

- **Agent**: `rdpi-tester`
- **Output**: `verification-1.md`
- **Depends on**: 1.1
- **Retry limit**: 1

### Prompt

Phase 1.1 implemented project configuration and shared types for the `astp` CLI.

**Read the plan verification checklist:** `../03-plan/01-phase.md` — see `## Verification` section.

**Run all verification checks:**
1. `npm install` — completes without errors
2. `npm run ts-check` — TypeScript compilation passes
3. `npm run ts-check:tests` — test config compilation passes
4. `npm run lint` — ESLint config loads and passes
5. `npm run format:check` — Prettier formatting passes

**Additionally verify:**
- `tsconfig.json` exists and extends the shared base correctly
- `tsconfig.test.json` exists and includes `["src", "tests"]`
- `eslint.config.js` exists and is valid ESM
- `vitest.config.ts` exists
- `src/types/index.ts` exports all interfaces from `../02-design/03-model.md §3`
- `src/types/resolve-target.ts` has `resolveTarget()` function
- `package.json` has `type: "module"`, `engines.node >= 22`, `bin.astp`, all required deps

**Save report** to `04-implement/verification-1.md` with pass/fail per check and error details if any failed. If tests fail, report the failures — do not attempt fixes.

---

## Phase 2.1: Code — Core Layer

- **Agent**: `rdpi-codder`
- **Output**: Code changes per `../03-plan/02-phase.md`
- **Depends on**: 1.2
- **Retry limit**: 2

### Prompt

You are implementing **Plan Phase 2: Core Layer** for the `astp` CLI tool. This is the business logic layer — 5 core modules and 5 test files.

**Read these files first:**
- Plan phase: `../03-plan/02-phase.md` — all 10 tasks with exact specifications
- Design architecture: `../02-design/01-architecture.md` — module zones, import graph (§5)
- Design dataflow: `../02-design/02-dataflow.md` — install/update/check flows
- Design model: `../02-design/03-model.md` — types, metadata schema, invariants (§5)
- Design decisions: `../02-design/04-decisions.md` — ADR-1 (giget), ADR-6 (frontmatter injection)
- Design test cases: `../02-design/06-testcases.md` — T01-T30, T42-T46 specifications
- Design risks: `../02-design/08-risks.md` — R1 (giget isolation), R2 (frontmatter parsing), R9 (path traversal), R14 (line endings)
- Types from Phase 1: `src/types/index.ts` — all shared interfaces

**Implement all 10 tasks in order:**
1. Task 2.1: `src/core/frontmatter.ts` — extractAstpMetadata, injectAstpFields, stripAstpFields, computeHash
2. Task 2.2: `src/core/manifest.ts` — fetchManifest, validateManifest, resolveBundle
3. Task 2.3: `src/core/fetcher.ts` — downloadBundle (giget wrapper)
4. Task 2.4: `src/core/installer.ts` — installFile, validateTargetPath
5. Task 2.5: `src/core/version.ts` — scanInstalled, compareVersions, detectModified
6. Task 2.6: `src/core/__tests__/frontmatter.test.ts` — T01-T07, T25, T42
7. Task 2.7: `src/core/__tests__/manifest.test.ts` — T12-T15, T18-T19, T28-T30
8. Task 2.8: `src/core/__tests__/installer.test.ts` — T16-T17, T23-T24, T43-T46
9. Task 2.9: `src/core/__tests__/version.test.ts` — T08-T11, T20-T22, T26-T27
10. Task 2.10: `src/core/__tests__/fetcher.test.ts` — giget wrapper tests

**Rules:**
- Import types from `@/types` (barrel import)
- Import between core modules: `./frontmatter`, `./manifest`, etc.
- Create a barrel `src/core/index.ts` exporting all public functions
- Frontmatter parsing: only recognize `---` delimiters at the very start of the file (R2)
- Path validation in installer: reject `..`, absolute paths, resolved paths escaping root (R9)
- Hash computation: normalize CRLF → LF before SHA-256 (R14)
- All giget usage isolated to `fetcher.ts` only (R1)
- Use `node:crypto` for SHA-256, `node:fs/promises` for I/O, native `fetch()` for HTTP
- Test files use vitest — no explicit imports needed if globals configured
- Mock `giget` and `fetch()` in tests — no real network calls in unit tests
- After implementation, verify: `npm run ts-check && npm run test`

---

## Phase 4.1: Code — Templates + Manifest

- **Agent**: `rdpi-codder`
- **Output**: Code changes per `../03-plan/04-phase.md`
- **Depends on**: 1.2
- **Retry limit**: 2

### Prompt

You are implementing **Plan Phase 4: Templates + Manifest** for the `astp` CLI tool. This phase populates `src/templates/` with the canonical template files and manifest.

**Read these files first:**
- Plan phase: `../03-plan/04-phase.md` — all 4 tasks with exact file lists
- Design architecture: `../02-design/01-architecture.md` — §6 template layout, §7 install targets
- Design model: `../02-design/03-model.md` — §4.1 manifest schema, §4.3 source/target path conventions
- Design docs: `../02-design/07-docs.md` — template author documentation specs

**Implement all 4 tasks:**
1. Task 4.1: Create `src/templates/manifest.json` — 2 bundles (base: 1 item, rdpi: 21 items), schemaVersion 1
2. Task 4.2: Copy `.github/skills/orchestrate/SKILL.md` → `src/templates/base/skills/orchestrate/SKILL.md`
3. Task 4.3: Copy 21 rdpi files from `.github/` to `src/templates/rdpi/` — 16 agents, 1 instruction, 4 stage definitions
4. Task 4.4: Create `src/templates/README.md` — template author guide

**Critical details for manifest.json:**
- `source` paths use format `<bundleName>/<category>/<filename>` (e.g., `base/skills/orchestrate/SKILL.md`)
- `target` paths strip the bundle prefix (e.g., `skills/orchestrate/SKILL.md`)
- Both bundles version `"1.0.0"`
- `base` bundle has `"default": true`, `rdpi` has `"default": false`

**For file copies (Tasks 4.2, 4.3):**
- Copy exact file contents — do NOT modify the content
- Source files are in `.github/agents/`, `.github/skills/orchestrate/`, `.github/instructions/`, `.github/rdpi-stages/`
- Note: `.github/copilot-instructions.md` is project-specific, NOT part of any bundle
- Verify every `source` path in manifest.json maps to an actual file under `src/templates/`

**Rules:**
- No TypeScript files in this phase — only markdown, JSON
- Do NOT modify any files outside `src/templates/`
- Preserve original file contents exactly when copying

---

## Phase 2.2: Verify — Core Layer

- **Agent**: `rdpi-tester`
- **Output**: `verification-2.md`
- **Depends on**: 2.1
- **Retry limit**: 1

### Prompt

Phase 2.1 implemented 5 core modules and 5 test files for the `astp` CLI.

**Read the plan verification checklist:** `../03-plan/02-phase.md` — see `## Verification` section.

**Run all verification checks:**
1. `npm run ts-check` — all 5 core modules compile
2. `npm run ts-check:tests` — all 5 test files compile
3. `npm run test` — all unit tests pass

**Additionally verify:**
- All 5 core modules exist: `src/core/frontmatter.ts`, `src/core/manifest.ts`, `src/core/fetcher.ts`, `src/core/installer.ts`, `src/core/version.ts`
- All 5 test files exist under `src/core/__tests__/`
- Barrel export `src/core/index.ts` exists and exports all public functions
- Test cases T01-T15, T16-T30, T42-T46 are implemented in the test files
- Path validation tests T43-T46 cover traversal, absolute paths, escaping root, and Windows paths
- Frontmatter round-trip test T25 (inject → strip → equals original) passes

**Save report** to `04-implement/verification-2.md` with pass/fail per check and error details if any failed. If tests fail, report the failures — do not attempt fixes.

---

## Phase 4.2: Verify — Templates + Manifest

- **Agent**: `rdpi-tester`
- **Output**: `verification-4.md`
- **Depends on**: 4.1
- **Retry limit**: 1

### Prompt

Phase 4.1 populated `src/templates/` with template files and manifest.json.

**Read the plan verification checklist:** `../03-plan/04-phase.md` — see `## Verification` section.

**Run all verification checks:**
1. `src/templates/manifest.json` is valid JSON — parse it and verify structure
2. Manifest contains exactly 2 bundles: `base` (1 item) and `rdpi` (21 items) — count items in each
3. Total template files: 22 (1 in `base/` + 21 in `rdpi/`) — list and count all files under `src/templates/base/` and `src/templates/rdpi/`
4. Every `source` path in manifest references an existing file under `src/templates/` — check each path
5. `target` paths match expected install structure from design `../02-design/01-architecture.md §7`
6. Template file contents match originals in `.github/` — diff key files (at minimum: one agent, the orchestrate skill, one stage definition)
7. `src/templates/README.md` exists and documents manifest schema

**Save report** to `04-implement/verification-4.md` with pass/fail per check and error details if any failed.

---

## Phase 3.1: Code — UI + Commands + Entry

- **Agent**: `rdpi-codder`
- **Output**: Code changes per `../03-plan/03-phase.md`
- **Depends on**: 2.2
- **Retry limit**: 2

### Prompt

You are implementing **Plan Phase 3: UI + Commands + Entry** for the `astp` CLI tool. This is the presentation and command layer — prompts, wizard, 3 command handlers, CLI entry point, and tests.

**Read these files first:**
- Plan phase: `../03-plan/03-phase.md` — all 9 tasks with exact specifications
- Design architecture: `../02-design/01-architecture.md` — module zones, import graph (§5)
- Design dataflow: `../02-design/02-dataflow.md` — install (§3), update (§4), check (§5) flows
- Design use cases: `../02-design/05-usecases.md` — UC-1 through UC-5, terminal mockups
- Design test cases: `../02-design/06-testcases.md` — T31-T34, T40-T41
- Design decisions: `../02-design/04-decisions.md` — ADR-3 (Commander), ADR-4 (@clack/prompts)
- Core modules from Phase 2: `src/core/index.ts` — available exports

**Implement all 9 tasks in order:**
1. Task 3.1: `src/ui/prompts.ts` — selectAction, selectTarget, selectBundles, confirmInstall, showCheckReport, showUpdateReport, warnModified, showSuccess, showInfo
2. Task 3.2: `src/ui/wizard.ts` — launchWizard() orchestrating the interactive flow
3. Task 3.3: `src/commands/install.ts` — executeInstall() with manifest fetch, bundle selection, download, install
4. Task 3.4: `src/commands/update.ts` — executeUpdate() with scan, compare, modified detection, selective install
5. Task 3.5: `src/commands/check.ts` — executeCheck() read-only version comparison
6. Task 3.6: `src/cli.ts` — Commander.js program with shebang, 3 commands + default wizard
7. Task 3.7: `src/commands/__tests__/install.test.ts` — T40 + integration tests
8. Task 3.8: `src/commands/__tests__/update.test.ts` — T41 + integration tests
9. Task 3.9: `src/commands/__tests__/check.test.ts` — check command integration tests

**Rules:**
- `@clack/prompts` isolated to `src/ui/prompts.ts` only — other modules call prompts through this wrapper
- `commander` isolated to `src/cli.ts` only
- Import core functions from `@/core` (barrel import)
- Import types from `@/types`
- Import prompts from `@/ui/prompts`
- Handle `isCancel()` from @clack/prompts → `process.exit(0)` at every prompt point
- `src/cli.ts` must have `#!/usr/bin/env node` as first line
- Create barrel exports: `src/ui/index.ts`, `src/commands/index.ts`
- Mock core modules and prompts in command tests — no real network/filesystem calls
- After implementation, verify: `npm run ts-check && npm run test`

---

## Phase 3.2: Verify — UI + Commands + Entry

- **Agent**: `rdpi-tester`
- **Output**: `verification-3.md`
- **Depends on**: 3.1
- **Retry limit**: 1

### Prompt

Phase 3.1 implemented UI modules, command handlers, and CLI entry point for the `astp` CLI.

**Read the plan verification checklist:** `../03-plan/03-phase.md` — see `## Verification` section.

**Run all verification checks:**
1. `npm run ts-check` — all source files compile
2. `npm run ts-check:tests` — all test files compile
3. `npm run test` — all unit + integration tests pass

**Additionally verify:**
- All 6 source modules exist: `src/ui/prompts.ts`, `src/ui/wizard.ts`, `src/commands/install.ts`, `src/commands/update.ts`, `src/commands/check.ts`, `src/cli.ts`
- All 3 test files exist under `src/commands/__tests__/`
- `src/cli.ts` has `#!/usr/bin/env node` shebang
- `src/cli.ts` registers `install`, `update`, `check` commands + default wizard
- Test cases T40, T41 are implemented and passing
- Barrel exports exist: `src/ui/index.ts`, `src/commands/index.ts`
- Run `node dist/cli.js --help` after build — verify help output lists all 3 commands (build first: `npm run build`)

**Save report** to `04-implement/verification-3.md` with pass/fail per check and error details if any failed. If tests fail, report the failures — do not attempt fixes.

---

## Phase 5.1: Code — Documentation + E2E Tests

- **Agent**: `rdpi-codder`
- **Output**: Code changes per `../03-plan/05-phase.md`
- **Depends on**: 3.2, 4.2
- **Retry limit**: 2

### Prompt

You are implementing **Plan Phase 5: Documentation + E2E Tests** for the `astp` CLI tool. This is the final code phase — project README and end-to-end tests.

**Read these files first:**
- Plan phase: `../03-plan/05-phase.md` — all 4 tasks with exact specifications
- Design docs: `../02-design/07-docs.md` — README sections specification
- Design use cases: `../02-design/05-usecases.md` — UC-1 through UC-5 for README examples
- Design test cases: `../02-design/06-testcases.md` — T31-T39 E2E specifications
- Design risks: `../02-design/08-risks.md` — R4 (GIGET_AUTH for CI)
- Design architecture: `../02-design/01-architecture.md` — §6 bundle descriptions for README
- All core, UI, and command modules from Phases 2-3 (understand the assembled CLI)
- Template manifest: `src/templates/manifest.json` (from Phase 4)

**Implement tasks 5.1-5.3 (Task 5.4 is verification only):**
1. Task 5.1: Create root `README.md` — 7 sections: What is astp, Installation, Quick start, Commands, Bundles, CI/CD, How it works
2. Task 5.2: Create `tests/e2e/helpers.ts` — runCli(), createTempProject(), mock manifest server, cleanup utilities
3. Task 5.3: Create E2E test files:
   - `tests/e2e/install.test.ts` — T31 (install rdpi), T32 (install base), T38 (install nonexistent)
   - `tests/e2e/check.test.ts` — T33 (check after install), T34 (check empty project)
   - `tests/e2e/update.test.ts` — T35 (update to new version), T36 (skip modified), T37 (force update), T39 (non-TTY)

**Rules:**
- E2E tests invoke the built CLI via `node dist/cli.js` using `node:child_process`
- E2E tests must NOT hit real GitHub endpoints — use mock/fixture manifest and templates
- E2E tests need `npm run build` first — include build step in test setup or document it
- README must include `Node.js >= 22` requirement, both interactive and scripted usage examples
- Mention `GIGET_AUTH` env variable for CI/rate-limit scenarios
- Import types from `@/types` in helpers
- After implementation, run Task 5.4 verification: `npm run build && npm run test`

---

## Phase 5.2: Verify — Documentation + E2E Tests

- **Agent**: `rdpi-tester`
- **Output**: `verification-5.md`
- **Depends on**: 5.1
- **Retry limit**: 1

### Prompt

Phase 5.1 implemented README.md and E2E tests for the `astp` CLI.

**Read the plan verification checklist:** `../03-plan/05-phase.md` — see `## Verification` section (Task 5.4 items).

**Run all verification checks:**
1. `npm run ts-check` — all source files compile
2. `npm run ts-check:tests` — all test files compile (including E2E)
3. `npm run lint` — passes
4. `npm run format:check` — passes
5. `npm run build` — produces `dist/cli.js`
6. `npm run test` — full test suite passes (unit + integration + E2E)

**Additionally verify:**
- `README.md` exists at project root with all 7 sections from `../02-design/07-docs.md`
- `tests/e2e/helpers.ts` exists with `runCli()` and `createTempProject()` utilities
- E2E test files exist: `tests/e2e/install.test.ts`, `tests/e2e/check.test.ts`, `tests/e2e/update.test.ts`
- Test cases T31-T39 are all implemented across the 3 E2E test files
- All 46 test cases (T01-T46) are accounted for across all test files in the project

**Save report** to `04-implement/verification-5.md` with pass/fail per check and error details if any failed. If tests fail, report the failures — do not attempt fixes.

---

## Phase Final: Implementation Review

- **Agent**: `rdpi-implement-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1.2, 2.2, 4.2, 3.2, 5.2
- **Retry limit**: 2

### Prompt

All 5 plan phases have been implemented and verified. Review the complete implementation of the `astp` CLI tool.

**Read these files:**
- All plan phases: `../03-plan/01-phase.md` through `../03-plan/05-phase.md`
- Plan README: `../03-plan/README.md`
- Design documents: `../02-design/01-architecture.md` through `../02-design/08-risks.md`
- Research: `../01-research/README.md`
- TASK.md: `../TASK.md`
- All verification reports: `04-implement/verification-1.md`, `04-implement/verification-2.md`, `04-implement/verification-3.md`, `04-implement/verification-4.md`, `04-implement/verification-5.md`

**Review the implemented code:**
- All source files under `src/` — types, core, ui, commands, cli.ts
- All test files under `src/core/__tests__/`, `src/commands/__tests__/`, `tests/e2e/`
- Configuration files: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.js`, `vitest.config.ts`
- Template files: `src/templates/manifest.json`, template directories
- Root `README.md`

**Write the implementation record** — replace this stage's `04-implement/README.md` with:
- **Status**: Completed / Completed with issues
- **Phase completion**: N/5 phases implemented
- **Verification summary**: results from all 5 verification reports
- **Quality review checklist**:
  - All plan phases implemented (every task from all 5 phases)
  - All verification reports pass
  - No out-of-scope files modified
  - Code follows project patterns (`@/` alias, barrel exports, ESM, strict mode)
  - TypeScript strict mode compatible
  - Documentation proportional (README + templates README — matches design spec)
  - No security vulnerabilities (path traversal protection, no eval/exec of user input)
- **Change summary**: list all created/modified files grouped by plan phase
- **Post-implementation recommendations**: build, manual testing areas, publishing steps
- **Recommended commit message** in conventional commits format:
  ```
  ??(??): ??

  - ??
  - ??
  ```

---

# Redraft Round 1

## Phase 6: Fix ESLint, Prettier, and TypeScript issues

- **Agent**: `rdpi-codder`
- **Output**: Code changes (config files, source files as needed)
- **Depends on**: Final
- **Retry limit**: 2
- **Review issues**: #1 (ESLint project-service scope warnings) + user feedback (eslint, prettier, ts-types, ts-types-tests)

### Prompt

The implementation review found issues with project-wide linting and the user requested verification of all static checks. Your job is to make all 4 checks pass cleanly.

Read the review: `.thoughts/2026-03-21-1200_cli-mda-manager/04-implement/REVIEW.md` — issue #1 describes ESLint project-service scope warnings for `eslint.config.js`, `vitest.config.ts`, and `tests/e2e/helpers.ts`.

**Run each check, diagnose failures, and fix them:**

1. **`npx eslint .`** — currently fails with 3 parsing errors because `eslint.config.js`, `vitest.config.ts`, and `tests/e2e/helpers.ts` are outside `tsconfig.json` include scope. Fix this by one of:
   - Creating a `tsconfig.eslint.json` that extends `tsconfig.json` and adds these files to `include`, then configure ESLint's `parserOptions.project` to use it; OR
   - Adding an ESLint ignore pattern for non-src config files and ensuring `tests/e2e/` is covered by a tsconfig.
   Choose the approach that results in the cleanest configuration. The goal: `npx eslint .` exits 0 with no errors or warnings.

2. **`npx prettier --check .`** — run this command. If any files fail the format check, run `npx prettier --write .` to fix them. Verify the check passes after formatting.

3. **`npx tsc --noEmit`** — run TypeScript type checking on the main project. Fix any type errors found.

4. **`npx tsc -p tsconfig.test.json --noEmit`** — run TypeScript type checking for tests. Fix any type errors found.

**Rules:**
- Fix only what is needed to make all 4 checks pass — no unrelated changes.
- After all fixes, re-run all 4 commands to confirm they all pass.
- If a fix for one check breaks another, iterate until all 4 pass simultaneously.

---

## Phase 7: Verify all static checks pass

- **Agent**: `rdpi-tester`
- **Output**: `verification-6.md`
- **Depends on**: 6
- **Retry limit**: 1

### Prompt

Phase 6 fixed ESLint, Prettier, and TypeScript issues. Verify that all 4 static checks now pass cleanly.

**Run each check and record the result:**

1. `npx eslint .` — must exit 0 with no errors or warnings
2. `npx prettier --check .` — must report all files formatted
3. `npx tsc --noEmit` — must exit 0 with no type errors
4. `npx tsc -p tsconfig.test.json --noEmit` — must exit 0 with no type errors

**Additionally run the full test suite** to confirm no regressions:
5. `npm run test` — all tests must still pass

**Save report** to `04-implement/verification-6.md` with:
- Pass/fail status for each of the 5 checks
- Full command output for any failing check
- Summary: all checks green, or list of remaining issues

Do NOT attempt fixes — only report results.

---

## Phase 8: Re-review after Redraft Round 1

- **Agent**: `rdpi-implement-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 7
- **Retry limit**: 2

### Prompt

Redraft Round 1 fixed ESLint, Prettier, and TypeScript issues identified in the initial review.

Read these files:
- Original review: `.thoughts/2026-03-21-1200_cli-mda-manager/04-implement/REVIEW.md`
- New verification report: `.thoughts/2026-03-21-1200_cli-mda-manager/04-implement/verification-6.md`
- All previous verification reports: `verification-1.md` through `verification-5.md` in the stage directory

Verify that:
1. Issue #1 from REVIEW.md (ESLint project-service scope warnings) is resolved — `npx eslint .` passes
2. `npx prettier --check .` passes
3. `npx tsc --noEmit` passes
4. `npx tsc -p tsconfig.test.json --noEmit` passes
5. Full test suite still passes (`npm run test`)
6. No regressions introduced by the fixes

Update `04-implement/README.md` with the re-review results. Set status to `Completed` if all checks pass, or `Completed with issues` if any remain.

---
