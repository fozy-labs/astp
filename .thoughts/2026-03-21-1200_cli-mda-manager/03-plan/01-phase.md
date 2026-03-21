---
title: "Phase 1: Project Configuration + Types"
date: 2026-03-22
stage: 03-plan
role: rdpi-planner
rdpi-version: b0.5
---

## Goal

Establish the project's build toolchain, dependency set, and shared type definitions so all subsequent phases compile and verify correctly. After this phase, `npm install && npm run ts-check && npm run lint` must pass.

## Dependencies

- **Requires**: None (first phase)
- **Blocks**: Phase 2 (Core Layer), Phase 4 (Templates + Manifest)

## Execution

Sequential — must complete before any other phase.

## Tasks

### Task 1.1: Update `package.json`

- **File**: `package.json`
- **Action**: Modify
- **Complexity**: Medium
- **Description**: Add ESM module type, CLI binary entry, Node.js engine constraint, runtime dependencies, missing dev dependencies, and the `ts-check:tests` script required by CI.
- **Details**:
  Add the following top-level fields:
  - `"type": "module"` — required by design Constraints (ESM with `"type": "module"`) [ref: ../02-design/01-architecture.md#constraints]
  - `"engines": { "node": ">=22" }` — required by design Constraints (Node.js >= 22) [ref: ../02-design/01-architecture.md#constraints]
  - `"bin": { "astp": "./dist/cli.js" }` — CLI entry point [ref: ../02-design/01-architecture.md#4-module-responsibility-zones, Entry row]
  - `"files": ["dist"]` — npm publish whitelist

  Add runtime `dependencies`:
  - `commander` — CLI framework [ref: ../02-design/04-decisions.md#adr-3]
  - `@clack/prompts` — interactive prompts [ref: ../02-design/04-decisions.md#adr-4]
  - `giget` — template distribution [ref: ../02-design/04-decisions.md#adr-1]

  Add missing `devDependencies` (required by existing scripts in `package.json` and CI):
  - `typescript` — compiler (used by `tsc` in build/ts-check scripts)
  - `vitest` — test runner (used by `test` script)
  - `eslint` — linter (used by `lint` script)
  - `prettier` — formatter (used by `format` script)
  - `rimraf` — clean tool (used by `build` script)
  - `concurrently` — parallel runner (used by `build:watch` script)
  - `tsc-alias` — path alias resolution (used by `build` script)

  Add script:
  - `"ts-check:tests": "tsc --noEmit --project tsconfig.test.json"` — matches CI pipeline (`ci.yml` line 27)

### Task 1.2: Create `tsconfig.json`

- **File**: `tsconfig.json`
- **Action**: Create
- **Complexity**: Low
- **Description**: TypeScript configuration extending the shared base from `@fozy-labs/js-configs`.
- **Details**:
  Extend `@fozy-labs/js-configs/typescript` (which provides `target: ESNext`, `module: ESNext`, `strict: true`, `moduleResolution: bundler`, etc.).
  Override/add:
  - `"outDir": "./dist"` — compilation output directory (matches `.gitignore` pattern `**/dist`)
  - `"rootDir": "./src"` — source root
  - `"include": ["src"]` — scope to source files only
  - `"exclude": ["node_modules", "dist", "**/__tests__/**"]` — exclude tests from build output
  - Remove `"lib": ["DOM"]` override since this is a CLI tool, not browser code — set `"lib": ["ESNext"]`
  - Remove `"jsx"` since not needed for CLI

  [ref: ../01-research/01-codebase-analysis.md §6.9 — tsconfig.json is missing]

### Task 1.3: Create `tsconfig.test.json`

- **File**: `tsconfig.test.json`
- **Action**: Create
- **Complexity**: Low
- **Description**: TypeScript configuration for test files, extending the base tsconfig and adding Vitest globals.
- **Details**:
  Extend `tsconfig.json` as base, then merge settings from `@fozy-labs/js-configs/typescript/test` (which adds `"types": ["vitest/globals"]` and `"noEmit": true`).
  Override `"include"` to cover both source and test files: `["src", "tests"]`.
  This enables `npm run ts-check:tests` as required by CI (`ci.yml` line 27).

### Task 1.4: Create `eslint.config.js`

- **File**: `eslint.config.js`
- **Action**: Create
- **Complexity**: Low
- **Description**: ESLint flat config importing the shared configuration from `@fozy-labs/js-configs/eslint`.
- **Details**:
  Import and re-export the default config from `@fozy-labs/js-configs/eslint`. This is an ESM file (`.js` extension with `"type": "module"` in package.json). The shared config includes TypeScript-ESLint and prettier integration.
  [ref: ../01-research/01-codebase-analysis.md §6.9 — eslint config is missing]

### Task 1.5: Create `vitest.config.ts`

- **File**: `vitest.config.ts`
- **Action**: Create
- **Complexity**: Low
- **Description**: Vitest configuration importing the shared configuration from `@fozy-labs/js-configs/vitest`.
- **Details**:
  Import and use the base vitest config from `@fozy-labs/js-configs/vitest`. Configure test file patterns to include co-located tests (`src/**/__tests__/**/*.test.ts`) and E2E tests (`tests/**/*.test.ts`).
  [ref: ../01-research/01-codebase-analysis.md §6.9 — vitest config is missing]

### Task 1.6: Create `src/types/index.ts` and `src/types/resolve-target.ts`

- **Files**: `src/types/resolve-target.ts`, `src/types/index.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: All shared TypeScript interfaces, types, and the `resolveTarget` utility from the domain model. `index.ts` is a barrel file (re-exports only).
- **Details**:

  **`src/types/resolve-target.ts`** — utility function:
  - `resolveTarget(type: InstallTargetType): InstallTarget` — maps target type to absolute path: `project` → `path.join(process.cwd(), '.github')`, `user` → `path.join(os.homedir(), '.copilot')`. [ref: ../02-design/05-usecases.md UC-2, test cases T16-T17]

  **`src/types/index.ts`** — barrel file (re-exports only, no logic):
  Export all interfaces defined in [ref: ../02-design/03-model.md §3]:

  **Remote manifest types** (§3.1):
  - `Manifest` — `{ schemaVersion: number; repository: string; bundles: Record<string, Bundle> }`
  - `Bundle` — `{ name: string; version: string; description: string; default: boolean; items: TemplateItem[] }`
  - `TemplateItem` — `{ source: string; target: string; category: ItemCategory }`
  - `ItemCategory` — `'agent' | 'skill' | 'instruction' | 'stage-definition'`

  **Install target types** (§3.2):
  - `InstallTargetType` — `'project' | 'user'`
  - `InstallTarget` — `{ type: InstallTargetType; rootDir: string }`

  **Installed file metadata types** (§3.3):
  - `InstalledFileMetadata` — `{ source: string; bundle: string; version: string; hash: string }`
  - `InstalledFile` — `{ filePath: string; relativePath: string; metadata: InstalledFileMetadata }`
  - `InstalledBundle` — `{ bundleName: string; version: string; files: InstalledFile[] }`

  **Version comparison types** (§3.4):
  - `UpdateReport` — `{ updates: BundleUpdate[]; upToDate: InstalledBundle[]; notInManifest: InstalledBundle[] }`
  - `BundleUpdate` — `{ bundleName: string; installedVersion: string; availableVersion: string; files: FileStatus[] }`
  - `FileStatus` — `{ targetPath: string; state: FileState }`
  - `FileState` — `'unmodified' | 'modified' | 'new' | 'removed'`

  Re-export `resolveTarget` from `./resolve-target.ts`.

## Verification

- [ ] `npm install` completes without errors
- [ ] `npm run ts-check` passes (compiles `src/types/index.ts` without errors)
- [ ] `npm run ts-check:tests` passes
- [ ] `npm run lint` passes (eslint config loads correctly)
- [ ] `npm run format:check` passes (prettier config already in package.json)
- [ ] All TypeScript interfaces match the domain model in [../02-design/03-model.md §3]
