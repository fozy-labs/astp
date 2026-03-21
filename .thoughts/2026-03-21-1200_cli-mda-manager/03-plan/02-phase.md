---
title: "Phase 2: Core Layer"
date: 2026-03-22
stage: 03-plan
role: rdpi-planner
rdpi-version: b0.5
---

## Goal

Implement all 5 core modules and their unit tests. The core layer contains the project's business logic: frontmatter handling, manifest fetching/validation, template downloading, file installation with metadata injection, and version management. After this phase, all core logic is functional and tested.

## Dependencies

- **Requires**: Phase 1 (types, tsconfig, dependencies installed)
- **Blocks**: Phase 3 (commands and UI depend on core modules)

## Execution

Sequential after Phase 1.

## Tasks

### Task 2.1: Create `src/core/frontmatter.ts`

- **File**: `src/core/frontmatter.ts`
- **Action**: Create
- **Complexity**: High
- **Description**: Lowest-level core module — parses, injects, and strips `astp-*` YAML frontmatter fields. Provides hash computation. No internal dependencies.
- **Details**:
  Implement the FrontmatterHandler module [ref: ../02-design/01-architecture.md §4, FrontmatterHandler row]:

  **`extractAstpMetadata(content: string): InstalledFileMetadata | null`**
  - Parse YAML frontmatter from markdown content (only recognize `---` delimiters at the very start of the file — conservative approach per R2 mitigation) [ref: ../02-design/08-risks.md#r2]
  - Extract `astp-source`, `astp-bundle`, `astp-version`, `astp-hash` fields
  - Return `null` if no frontmatter or no `astp-*` fields found

  **`injectAstpFields(content: string, metadata: Omit<InstalledFileMetadata, 'hash'>, hash: string): string`**
  - If file has existing frontmatter: append `astp-*` fields at end of frontmatter block, preserving existing field order [ref: ../02-design/03-model.md §3.2, ADR-6]
  - If file has no frontmatter: prepend a new `---` block with only `astp-*` fields [ref: ../02-design/03-model.md §3.2, stage definition example]
  - Never modify, reorder, or remove existing non-astp fields [ref: ../02-design/03-model.md §5, invariant 6]

  **`stripAstpFields(content: string): string`**
  - Remove all `astp-*` fields from frontmatter
  - If stripping leaves an empty frontmatter block (only `astp-*` fields existed), remove the `---` delimiters entirely [ref: ../02-design/03-model.md §3.3, step 3]
  - Used for hash comparison during modification detection

  **`computeHash(content: string): string`**
  - Normalize line endings to LF before hashing (R14 mitigation) [ref: ../02-design/08-risks.md#r14]
  - Return SHA-256 hex digest using `node:crypto`
  - Hash is computed on template content before `astp-*` injection [ref: ../02-design/03-model.md §3.3]

### Task 2.2: Create `src/core/manifest.ts`

- **File**: `src/core/manifest.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Fetches and validates the remote manifest.json. Provides bundle resolution. No internal dependencies — uses only native `fetch()`.
- **Details**:
  Implement the ManifestReader module [ref: ../02-design/01-architecture.md §4, ManifestReader row]:

  **`fetchManifest(repository?: string, ref?: string): Promise<Manifest>`**
  - Default repository: `fozy-labs/astp`, default ref: `main`
  - URL: `https://raw.githubusercontent.com/{repository}/{ref}/src/templates/manifest.json` [ref: ../02-design/02-dataflow.md §3]
  - Fetch via native `fetch()` (Node.js 22 built-in) [ref: ../02-design/04-decisions.md ADR-1]
  - Handle HTTP errors: 404 → "Manifest not found at ref {ref}", network error → user-friendly message [ref: ../02-design/06-testcases.md T29-T30]
  - Parse JSON and validate

  **`validateManifest(data: unknown): Manifest`**
  - Check `schemaVersion` is present and equals `1` (supported version for v0.1.0) [ref: ../02-design/03-model.md §4.2]
  - If `schemaVersion > 1` → error: "Unsupported manifest schema version N. Update astp CLI." [ref: ../02-design/06-testcases.md T14]
  - Validate required fields: `repository`, `bundles` (non-empty object)
  - Validate each bundle has `name`, `version`, `items` array [ref: ../02-design/06-testcases.md T13]

  **`resolveBundle(manifest: Manifest, bundleName: string): Bundle`**
  - Look up `manifest.bundles[bundleName]`
  - If not found → error: "Bundle '{name}' not found. Available: {list}" [ref: ../02-design/06-testcases.md T19]

### Task 2.3: Create `src/core/fetcher.ts`

- **File**: `src/core/fetcher.ts`
- **Action**: Create
- **Complexity**: Low
- **Description**: Thin wrapper around giget's `downloadTemplate()`. Single module that imports giget — isolates the pre-1.0 dependency per R1 mitigation.
- **Details**:
  Implement the TemplateFetcher module [ref: ../02-design/01-architecture.md §4, TemplateFetcher row]:

  **`downloadBundle(repository: string, bundleName: string, ref?: string): Promise<string>`**
  - Compose giget source string: `gh:{repository}/src/templates/{bundleName}#{ref}` [ref: ../02-design/04-decisions.md ADR-1, Decision section]
  - Call `downloadTemplate()` from giget — returns path to temp directory
  - Default ref: `main`
  - Pass auth from `GIGET_AUTH` env variable if present [ref: ../02-design/08-risks.md#r4]
  - Return the temp directory path containing downloaded bundle files

  All giget usage is isolated here per R1 mitigation [ref: ../02-design/08-risks.md#r1].

### Task 2.4: Create `src/core/installer.ts`

- **File**: `src/core/installer.ts`
- **Action**: Create
- **Complexity**: High
- **Description**: Handles file installation with frontmatter metadata injection and path safety validation.
- **Details**:
  Implement the FileInstaller module [ref: ../02-design/01-architecture.md §4, FileInstaller row]:

  **`installFile(tempDir: string, item: TemplateItem, target: InstallTarget, meta: { source: string; bundle: string; version: string }): Promise<void>`**
  - Read template file from `path.join(tempDir, item.source)` (the source path relative to the bundle within the temp dir — since giget downloads the bundle subdirectory, the file path inside tempDir mirrors the bundle's internal structure: e.g., `agents/rdpi-approve.agent.md`)
  - Validate the target path via `validateTargetPath()` before writing [ref: ../02-design/08-risks.md#r9]
  - Compute hash of the template content via `computeHash()` [ref: ../02-design/03-model.md §3.3]
  - Inject `astp-*` frontmatter via `injectAstpFields()` [ref: ../02-design/02-dataflow.md §3, step 4]
  - Create target directories recursively via `fs.mkdir({ recursive: true })` [ref: ../02-design/05-usecases.md UC-1, Error Handling]
  - Write the final content to `path.join(target.rootDir, item.target)`

  **`validateTargetPath(installRoot: string, targetPath: string): void`**
  - Reject absolute paths (starts with `/` or drive letter) [ref: ../02-design/06-testcases.md T44]
  - Reject path traversal (`..` segments) [ref: ../02-design/06-testcases.md T43]
  - Resolve the full path and verify it starts with `installRoot` [ref: ../02-design/06-testcases.md T45]
  - Use `node:path.resolve()` for cross-platform resolution [ref: ../02-design/06-testcases.md T46]

  Internal dependency: imports `computeHash`, `injectAstpFields` from `./frontmatter.ts` [ref: ../02-design/01-architecture.md §5].

### Task 2.5: Create `src/core/version.ts`

- **File**: `src/core/version.ts`
- **Action**: Create
- **Complexity**: High
- **Description**: Scans installed files, groups by bundle, compares versions against manifest, detects local modifications via hash comparison.
- **Details**:
  Implement the VersionManager module [ref: ../02-design/01-architecture.md §4, VersionManager row]:

  **`scanInstalled(installRoot: string): Promise<InstalledBundle[]>`**
  - Recursively find all `.md` files under `installRoot` [ref: ../02-design/02-dataflow.md §4-§5]
  - For each file: parse frontmatter via `extractAstpMetadata()` — skip files without `astp-source` field
  - Group files by `astp-bundle` value → `InstalledBundle[]`
  - Use the `astp-version` from any file in the group as the bundle version (all files share the same version per invariant 2) [ref: ../02-design/03-model.md §5]

  **`compareVersions(installed: InstalledBundle[], manifest: Manifest): UpdateReport`**
  - For each installed bundle, find matching bundle in `manifest.bundles` by name
  - Compare semver: if manifest version > installed version → update available [ref: ../02-design/06-testcases.md T08]
  - If manifest version <= installed version → up to date (no downgrade) [ref: ../02-design/06-testcases.md T09-T10]
  - If bundle not in manifest → `notInManifest` [ref: ../02-design/05-usecases.md UC-3, Error Handling]
  - Handle invalid semver gracefully [ref: ../02-design/06-testcases.md T11]
  - Classify per-file status: `new` (in manifest but not local), `removed` (local but not in manifest), `unmodified`/`modified` (via hash check)

  **`detectModified(bundle: InstalledBundle, installRoot: string): Promise<FileStatus[]>`**
  - For each installed file: read content → strip `astp-*` fields → compute SHA-256 → compare with `astp-hash` [ref: ../02-design/02-dataflow.md §4, Modification detection]
  - Hash mismatch → `modified` state [ref: ../02-design/06-testcases.md T21]
  - Missing `astp-hash` field → treated as `modified` (conservative) [ref: ../02-design/06-testcases.md T22]

  Internal dependency: imports `extractAstpMetadata`, `stripAstpFields`, `computeHash` from `./frontmatter.ts` [ref: ../02-design/01-architecture.md §5].

### Task 2.6: Create `src/core/__tests__/frontmatter.test.ts`

- **File**: `src/core/__tests__/frontmatter.test.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Unit tests for the FrontmatterHandler module.
- **Details**:
  Implement test cases [ref: ../02-design/06-testcases.md]:
  - **T01**: Parse frontmatter with existing fields + astp fields → extract `InstalledFileMetadata` correctly
  - **T02**: Parse file with no frontmatter → return `null`
  - **T03**: Inject astp fields into existing frontmatter → appended at end, existing fields preserved
  - **T04**: Inject astp fields into file without frontmatter → new frontmatter block prepended
  - **T05**: Strip astp fields from mixed frontmatter → only astp fields removed
  - **T06**: Strip astp fields from astp-only frontmatter → entire block removed
  - **T07**: SHA-256 hash computation → deterministic, correct for known input; test with both LF and CRLF inputs
  - **T42**: Preserve existing frontmatter field order on injection → `astp-*` appended after existing fields
  - **T25** (integration): Inject → strip round-trip → result equals original template content

### Task 2.7: Create `src/core/__tests__/manifest.test.ts`

- **File**: `src/core/__tests__/manifest.test.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Unit and integration tests for the ManifestReader module.
- **Details**:
  Implement test cases [ref: ../02-design/06-testcases.md]:
  - **T12**: Valid manifest JSON → parsed `Manifest` object with correct bundles and items
  - **T13**: Missing required fields → validation error with descriptive message
  - **T14**: Unsupported schema version (99) → "Unsupported manifest schema version 99. Update astp CLI."
  - **T15**: Malformed JSON → JSON parse error surfaced
  - **T18**: `resolveBundle(manifest, 'rdpi')` → returns correct `Bundle` object
  - **T19**: `resolveBundle(manifest, 'nonexistent')` → error with available bundle names
  - **T28** (integration): Mock `fetch()` returning valid JSON → `Manifest` parsed correctly
  - **T29** (integration): Mock `fetch()` throwing TypeError → user-friendly error message
  - **T30** (integration): Mock `fetch()` returning 404 → error about manifest not found

### Task 2.8: Create `src/core/__tests__/installer.test.ts`

- **File**: `src/core/__tests__/installer.test.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Unit and integration tests for the FileInstaller module, including path safety validation.
- **Details**:
  Implement test cases [ref: ../02-design/06-testcases.md]:
  - **T16**: `resolveTarget('project')` → correct `.github` path under cwd
  - **T17**: `resolveTarget('user')` → correct `~/.copilot` path
  - **T23** (integration): Install file to temp directory → file written with injected astp fields, original content preserved
  - **T24** (integration): Install creates nested directories → `agents/` directory created
  - Security path validation tests [ref: ../02-design/08-risks.md#r9]:
  - **T43**: Reject `target` with `..` path traversal → validation error
  - **T44**: Reject absolute paths (`/etc/passwd`, `C:\Windows\...`) → validation error
  - **T45**: Resolved path escaping install root → validation error
  - **T46**: Windows path separator handling → `node:path.join()` resolves correctly

  Note: T16-T17 test `resolveTarget()` from `src/types/resolve-target.ts` (re-exported via barrel `src/types/index.ts`).

### Task 2.9: Create `src/core/__tests__/version.test.ts`

- **File**: `src/core/__tests__/version.test.ts`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Unit and integration tests for the VersionManager module.
- **Details**:
  Implement test cases [ref: ../02-design/06-testcases.md]:
  - **T08**: Version comparison — installed `1.0.0`, manifest `1.2.0` → update available
  - **T09**: Version comparison — same version → up to date
  - **T10**: Installed newer than manifest → up to date (no downgrade)
  - **T11**: Invalid semver string → graceful handling
  - **T20**: Modification detection — hash matches → `unmodified`
  - **T21**: Modification detection — hash differs → `modified`
  - **T22**: Missing `astp-hash` field → treated as `modified` (conservative)
  - **T26** (integration): Scan temp dir with mixed files → `InstalledBundle[]` with only astp-managed files
  - **T27** (integration): Update detection with mixed file states → correct classification

### Task 2.10: Create `src/core/__tests__/fetcher.test.ts`

- **File**: `src/core/__tests__/fetcher.test.ts`
- **Action**: Create
- **Complexity**: Low
- **Description**: Unit tests for the TemplateFetcher module with mocked giget.
- **Details**:
  Implement additional tests (not part of the design's T01-T46 test cases — fetcher wrapper logic is plan-level detail):
  - Mock `downloadTemplate()` → validate correct source string format (`gh:fozy-labs/astp/src/templates/{bundle}#{ref}`)
  - Mock giget throwing network error → error caught, user-friendly message
  - Mock giget timeout or failure → graceful error handling

  Mock `giget` module entirely — these tests validate the wrapper logic, not giget itself.

## Verification

- [ ] `npm run ts-check` passes (all 5 core modules compile)
- [ ] `npm run ts-check:tests` passes (all 5 test files compile)
- [ ] `npm run test` passes (all unit tests green)
- [ ] Test cases T01-T15, T16-T30, T42-T46 implemented and passing
- [ ] `src/core/frontmatter.ts` has inject→strip round-trip invariant verified (T25)
- [ ] Path validation rejects traversal and absolute paths (T43-T46)
