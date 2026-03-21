---
title: "Phase 3: UI + Commands + Entry"
date: 2026-03-22
stage: 03-plan
role: rdpi-planner
rdpi-version: b0.5
---

## Goal

Implement the presentation layer (prompts, wizard), command handlers (install, update, check), and the CLI entry point. After this phase, the CLI is fully functional — `astp install`, `astp update`, `astp check`, and interactive `astp` all work.

## Dependencies

- **Requires**: Phase 2 (all core modules)
- **Blocks**: Phase 5 (E2E tests test the assembled CLI)

## Execution

Sequential after Phase 2.

## Tasks

### Task 3.1: Create `src/ui/prompts.ts`

- **File**: `src/ui/prompts.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Reusable @clack/prompts wrappers for all interactive input patterns used across commands and wizard.
- **Details**:
  Implement the Prompts module [ref: ../02-design/01-architecture.md §4, Prompts row]:

  **`selectAction(): Promise<'install' | 'update' | 'check'>`**
  - `@clack/prompts.select()` with options: Install bundles, Check for updates, Update installed files [ref: ../02-design/05-usecases.md UC-1, wizard terminal mockup]
  - Handle `isCancel()` → `cancel()` + `process.exit(0)` [ref: ../02-design/05-usecases.md UC-1, Error Handling]

  **`selectTarget(): Promise<InstallTarget>`**
  - `@clack/prompts.select()` — "Project level (.github/)" or "User level (~/.copilot/)" [ref: ../02-design/02-dataflow.md §3-§5]
  - Returns resolved `InstallTarget` via `resolveTarget()` from types

  **`selectBundles(manifest: Manifest): Promise<Bundle[]>`**
  - `@clack/prompts.multiselect()` — list all bundles with descriptions and file counts [ref: ../02-design/05-usecases.md UC-1]
  - Pre-select bundles where `default: true` (base bundle) [ref: ../02-design/01-architecture.md §6]

  **`confirmInstall(bundles: Bundle[], target: InstallTarget): Promise<boolean>`**
  - `@clack/prompts.confirm()` — "Install N bundles (M files) to <target>?"

  **`showCheckReport(report: UpdateReport): void`**
  - Format and display version comparison table using `@clack/prompts.log` [ref: ../02-design/05-usecases.md UC-3, terminal mockup]

  **`showUpdateReport(report: UpdateReport): void`**
  - Display available updates table [ref: ../02-design/05-usecases.md UC-4, terminal mockup]

  **`warnModified(files: FileStatus[]): void`**
  - Display warning about locally modified files that will be skipped [ref: ../02-design/05-usecases.md UC-4]

  **`showSuccess(message: string): void`** and **`showInfo(message: string): void`**
  - Thin wrappers around `@clack/prompts.log.success()` and `@clack/prompts.log.info()`

  External dependency: `@clack/prompts` isolated to this module only [ref: ../02-design/01-architecture.md §5].

### Task 3.2: Create `src/ui/wizard.ts`

- **File**: `src/ui/wizard.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Interactive wizard orchestration — entry point for `astp` with no arguments.
- **Details**:
  Implement the Wizard module [ref: ../02-design/01-architecture.md §4, Wizard row]:

  **`launchWizard(): Promise<void>`**
  - `intro('astp — MDA Manager')` [ref: ../02-design/05-usecases.md UC-1]
  - `selectAction()` → delegate to appropriate command handler [ref: ../02-design/02-dataflow.md §2]
  - `outro('Done!')` after command completes
  - Handle cancellation at each step via `isCancel()` pattern

  Imports commands: `executeInstall`, `executeUpdate`, `executeCheck`.
  Imports prompts: `selectAction`, `intro`, `outro` from `./prompts.ts`.

### Task 3.3: Create `src/commands/install.ts`

- **File**: `src/commands/install.ts`
- **Action**: Create
- **Complexity**: High
- **Description**: Install command handler — orchestrates manifest fetch, bundle selection, download, and file installation.
- **Details**:
  Implement InstallCommand [ref: ../02-design/01-architecture.md §4, InstallCommand row]:

  **`executeInstall(options: { bundle?: string; target?: InstallTargetType }): Promise<void>`**
  - If `target` not provided → prompt via `selectTarget()` [ref: ../02-design/02-dataflow.md §3]
  - Fetch manifest via `fetchManifest()` [ref: ../02-design/02-dataflow.md §3]
  - If `bundle` provided → `resolveBundle()` (validates exists) [ref: ../02-design/05-usecases.md UC-2]
  - If `bundle` not provided → prompt via `selectBundles()` [ref: ../02-design/05-usecases.md UC-1]
  - Confirm installation via `confirmInstall()`
  - For each selected bundle: `downloadBundle()` → for each item: `installFile()` [ref: ../02-design/02-dataflow.md §3]
  - Show spinner during download/install using `@clack/prompts` spinner via prompts module
  - Display success with installed file count

  Depends on: `core/manifest`, `core/fetcher`, `core/installer`, `ui/prompts` [ref: ../02-design/01-architecture.md §5].

### Task 3.4: Create `src/commands/update.ts`

- **File**: `src/commands/update.ts`
- **Action**: Create
- **Complexity**: High
- **Description**: Update command handler — compares installed state against remote, handles modified file warnings.
- **Details**:
  Implement UpdateCommand [ref: ../02-design/01-architecture.md §4, UpdateCommand row]:

  **`executeUpdate(options: { force?: boolean; target?: InstallTargetType }): Promise<void>`**
  - Prompt for target via `selectTarget()` if not provided
  - `scanInstalled(installRoot)` → if empty, show "No astp-managed files found" and return [ref: ../02-design/02-dataflow.md §4]
  - `fetchManifest()` → `compareVersions()` → if no updates, show "All bundles up to date"
  - Show update report via `showUpdateReport()`
  - For each outdated bundle [ref: ../02-design/05-usecases.md UC-4]:
    - `downloadBundle()`
    - `detectModified()` → if modified files exist and NOT `--force`: `warnModified()`, skip modified files
    - If `--force`: warn about overwriting, then install all including modified [ref: ../02-design/02-dataflow.md §4]
    - `installFile()` for each non-skipped item
  - Show summary: "Updated N files, skipped M modified"

  Depends on: `core/manifest`, `core/version`, `core/fetcher`, `core/installer`, `ui/prompts` [ref: ../02-design/01-architecture.md §5].

### Task 3.5: Create `src/commands/check.ts`

- **File**: `src/commands/check.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Check command handler — read-only version comparison report.
- **Details**:
  Implement CheckCommand [ref: ../02-design/01-architecture.md §4, CheckCommand row]:

  **`executeCheck(options: { target?: InstallTargetType }): Promise<void>`**
  - Prompt for target via `selectTarget()` if not provided
  - `scanInstalled(installRoot)` → if empty, show "No astp-managed files found" [ref: ../02-design/02-dataflow.md §5]
  - `fetchManifest()` → `compareVersions(installed, manifest)`
  - `showCheckReport(report)` — display version comparison table [ref: ../02-design/05-usecases.md UC-3]
  - Read-only: only 1 HTTP request (manifest), no file writes [ref: ../02-design/02-dataflow.md §5]

  Depends on: `core/manifest`, `core/version`, `ui/prompts` [ref: ../02-design/01-architecture.md §5].

### Task 3.6: Create `src/cli.ts`

- **File**: `src/cli.ts`
- **Action**: Create
- **Complexity**: Low
- **Description**: CLI entry point — Commander.js program setup with shebang, command registration, default wizard action.
- **Details**:
  Implement Entry module [ref: ../02-design/01-architecture.md §4, Entry row]:

  - `#!/usr/bin/env node` shebang (first line) [ref: ../02-design/01-architecture.md §4]
  - Import and configure `Commander.program` [ref: ../02-design/04-decisions.md ADR-3]
  - `.name('astp')`, `.description('MDA file manager for AI coding agents')`, `.version(...)` [ref: ../02-design/07-docs.md]
  - Default action (no command): `launchWizard()` [ref: ../02-design/02-dataflow.md §2]
  - Register `install` command:
    - `.argument('[bundle]', 'Bundle name to install')`
    - `.option('--target <type>', 'Install target: project or user')`
    - `.action(...)` → `executeInstall()` [ref: ../02-design/05-usecases.md UC-2]
  - Register `update` command:
    - `.option('--force', 'Overwrite locally modified files')`
    - `.option('--target <type>', 'Install target: project or user')`
    - `.action(...)` → `executeUpdate()` [ref: ../02-design/06-testcases.md T41]
  - Register `check` command:
    - `.option('--target <type>', 'Install target: project or user')`
    - `.action(...)` → `executeCheck()`
  - Call `program.parseAsync()` [ref: ../02-design/05-usecases.md UC-1]

  External dependency: `commander` isolated to this module only [ref: ../02-design/01-architecture.md §5].

### Task 3.7: Create `src/commands/__tests__/install.test.ts`

- **File**: `src/commands/__tests__/install.test.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Integration tests for the install command handler with mocked core modules and prompts.
- **Details**:
  - **T40**: CLI argument parsing — `astp install rdpi --target user` → Commander parses correctly [ref: ../02-design/06-testcases.md T40]
  - Test `executeInstall()` with explicit arguments (no prompts) → delegates to `fetchManifest`, `downloadBundle`, `installFile` in correct order
  - Test `executeInstall()` without arguments → prompts for target and bundles
  - Test install with unknown bundle → error propagated from `resolveBundle()`
  - Mock: `core/manifest`, `core/fetcher`, `core/installer`, `ui/prompts`

### Task 3.8: Create `src/commands/__tests__/update.test.ts`

- **File**: `src/commands/__tests__/update.test.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Integration tests for the update command handler.
- **Details**:
  - **T41**: CLI argument parsing — `astp update --force` → Commander parses `options.force = true` [ref: ../02-design/06-testcases.md T41]
  - Test update with no installed files → "No astp-managed files found"
  - Test update with all up to date → "All bundles up to date"
  - Test update skips modified files (no `--force`) → correct file skip behavior
  - Test update with `--force` → modified files overwritten
  - Mock: `core/manifest`, `core/version`, `core/fetcher`, `core/installer`, `ui/prompts`

### Task 3.9: Create `src/commands/__tests__/check.test.ts`

- **File**: `src/commands/__tests__/check.test.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Integration tests for the check command handler.
- **Details**:
  - Test check with no installed files → "No astp-managed files found"
  - Test check with installed files → fetches manifest, compares, displays report
  - Test check with mixed states (up to date, update available, not in manifest)
  - Mock: `core/manifest`, `core/version`, `ui/prompts`

## Verification

- [ ] `npm run ts-check` passes (all source files compile)
- [ ] `npm run ts-check:tests` passes (all test files compile)
- [ ] `npm run test` passes (all unit + integration tests green)
- [ ] Test cases T40, T41 and command integration tests passing
- [ ] `src/cli.ts` registers all 3 commands + default wizard action
- [ ] `--help` output displays correctly for all commands
