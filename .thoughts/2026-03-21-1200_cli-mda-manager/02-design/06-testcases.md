---
title: "Test Strategy: astp CLI"
date: 2026-03-21
stage: 02-design
role: rdpi-qa-designer
workflow: b0.5
---

# Test Strategy: astp CLI


## Approach

Testing follows a pyramid structure weighted toward unit tests, with integration and E2E layers validating cross-module behavior and real CLI invocation.

- **Unit tests** (~60%): Pure logic modules with no side effects — `core/frontmatter`, `core/version` (comparison logic), manifest schema validation, install target resolution, hash computation. Run with Vitest (already in project devDeps). Fast, no I/O.
- **Integration tests** (~25%): Multi-module flows with controlled I/O — file installation to temp directories, frontmatter inject/read round-trips, manifest fetch with mocked `fetch()`, update detection with fixture files. Use Vitest + `node:fs/promises` against temp dirs.
- **E2E tests** (~10%): Full CLI invocation via `node:child_process.execFile` or `execa` — test actual `astp install`, `astp check`, `astp update` commands against a local fixture template source (mocked GitHub endpoint or local file server). Validate exit codes, stdout output, and resulting file system state.
- **Interactive prompt tests** (~5%): Verify wizard and prompt flows. @clack/prompts does not have a built-in test injection mechanism like `prompts.inject()`. Strategy: extract prompt logic into thin wrapper functions in `ui/prompts.ts`, mock the wrapper module in command-level integration tests. Wizard flow tested at the E2E level with stdin injection where feasible.

All test files co-located with source: `src/core/__tests__/frontmatter.test.ts`, etc.


## Test Cases

| ID | Category | Description | Input | Expected Output | Priority |
|----|----------|-------------|-------|-----------------|----------|
| T01 | Unit | Parse frontmatter with existing fields + astp fields | Markdown string with `---\nname: foo\nastp-source: fozy-labs/astp\n---` | `InstalledFileMetadata { source: "fozy-labs/astp", bundle, version, hash }` extracted correctly | High |
| T02 | Unit | Parse file with no frontmatter — return null metadata | Markdown string `# Title\ncontent` (no `---` delimiters) | `null` (no metadata found) | High |
| T03 | Unit | Inject astp fields into existing frontmatter | Content with `---\nname: rdpi-approve\n---`, metadata object | Content with `---\nname: rdpi-approve\nastp-source: ...\nastp-bundle: ...\nastp-version: ...\nastp-hash: ...\n---` | High |
| T04 | Unit | Inject astp fields into file without frontmatter | Content `# Stage: 01-Research\n...` | `---\nastp-source: ...\nastp-bundle: ...\nastp-version: ...\nastp-hash: ...\n---\n# Stage: 01-Research\n...` | High |
| T05 | Unit | Strip astp fields from frontmatter (for hash comparison) | Content with mixed fields + astp fields | Only astp fields removed; other fields preserved. For astp-only frontmatter blocks, delimiters also removed. | High |
| T06 | Unit | Strip astp fields from astp-only frontmatter block | `---\nastp-source: ...\nastp-hash: ...\n---\n# Title` | `# Title` (frontmatter block fully removed) | High |
| T07 | Unit | SHA-256 hash computation of template content | Known template string | Known SHA-256 digest (deterministic) | High |
| T08 | Unit | Version comparison — newer available | Installed `1.0.0`, manifest `1.2.0` | `BundleUpdate` with `state: 'update'` | High |
| T09 | Unit | Version comparison — same version | Installed `1.0.0`, manifest `1.0.0` | Classified as `upToDate` | High |
| T10 | Unit | Version comparison — installed newer than manifest | Installed `2.0.0`, manifest `1.0.0` | Classified as `upToDate` (no downgrade) | Medium |
| T11 | Unit | Version comparison — invalid semver string | Installed `"not-a-version"`, manifest `1.0.0` | Treated as outdated or error logged, graceful handling | Medium |
| T12 | Unit | Manifest JSON parsing — valid schema | Valid `manifest.json` content with `schemaVersion: 1`, bundles | Parsed `Manifest` object with correct bundles and items | High |
| T13 | Unit | Manifest JSON parsing — missing required fields | JSON without `schemaVersion` | Validation error thrown with descriptive message | High |
| T14 | Unit | Manifest JSON parsing — unsupported schema version | `schemaVersion: 99` | Error: "Unsupported manifest schema version 99. Update astp CLI." | Medium |
| T15 | Unit | Manifest JSON parsing — malformed JSON | `{bundles: broken` | JSON parse error surfaced | Medium |
| T16 | Unit | Install target resolution — project | `resolveTarget('project')` with `cwd = /home/user/project` | `{ type: 'project', rootDir: '/home/user/project/.github' }` | High |
| T17 | Unit | Install target resolution — user | `resolveTarget('user')` | `{ type: 'user', rootDir: path.join(os.homedir(), '.copilot') }` | High |
| T18 | Unit | Bundle resolution — valid name | `resolveBundle(manifest, 'rdpi')` | Returns `Bundle` object for rdpi | High |
| T19 | Unit | Bundle resolution — unknown name | `resolveBundle(manifest, 'nonexistent')` | Error: "Bundle 'nonexistent' not found. Available: base, rdpi" | High |
| T20 | Unit | Modification detection — unmodified file | File content hash matches `astp-hash` | `FileState = 'unmodified'` | High |
| T21 | Unit | Modification detection — modified file | File content hash differs from `astp-hash` | `FileState = 'modified'` | High |
| T22 | Unit | Modification detection — missing astp-hash field | File has `astp-source` but no `astp-hash` | Treated as `modified` (conservative) | Medium |
| T23 | Integration | Install file to temp directory with frontmatter injection | Template file + metadata + temp dir as target | File written to correct path under temp dir, contains injected astp fields, original content preserved | High |
| T24 | Integration | Install creates nested directories | Template item with target `agents/rdpi-approve.agent.md`, target dir empty | `agents/` directory created, file written | High |
| T25 | Integration | Frontmatter inject → strip round-trip | Inject astp fields into template, then strip them | Result equals original template content (byte-for-byte) | High |
| T26 | Integration | Scan installed files from directory | Temp dir with 3 `.md` files (2 with astp metadata, 1 without) | Returns `InstalledBundle[]` with 2 files; non-managed file ignored | High |
| T27 | Integration | Update detection with mixed file states | Dir with installed bundle: 1 modified file, 1 unmodified, 1 new in manifest | `UpdateReport` classifies each correctly | High |
| T28 | Integration | Manifest fetch with mocked HTTP | Mock `fetch()` returning valid JSON | `Manifest` object parsed and returned | Medium |
| T29 | Integration | Manifest fetch — network error | Mock `fetch()` throwing `TypeError: fetch failed` | Error caught, user-friendly message | Medium |
| T30 | Integration | Manifest fetch — 404 response | Mock `fetch()` returning `Response { status: 404 }` | Error: manifest not found at ref | Medium |
| T31 | E2E | `astp install rdpi --target project` | CLI invocation in temp project dir | Exit code 0. 21 files created under `.github/`. Each file has `astp-*` frontmatter. | High |
| T32 | E2E | `astp install base --target project` | CLI invocation in temp project dir | Exit code 0. 1 file at `.github/skills/orchestrate/SKILL.md` with astp metadata. | High |
| T33 | E2E | `astp check` after install | Install rdpi first, then run `astp check` against same manifest | Exit code 0. Stdout contains `✓ Up to date` for rdpi. | High |
| T34 | E2E | `astp check` with no installed files | Empty project dir, run `astp check --target project` | Exit code 0. Stdout contains "No astp-managed files found." | Medium |
| T35 | E2E | `astp update` with newer manifest version | Install rdpi v1.0.0, swap manifest to v1.1.0 with updated template, run `astp update --target project` | Exit code 0. Files updated. `astp-version` in frontmatter = `1.1.0`. | High |
| T36 | E2E | `astp update` skips modified files | Install rdpi, manually edit one file, run `astp update --target project` | Modified file skipped. Stdout includes warning about skipped file. Other files updated. | High |
| T37 | E2E | `astp update --force` overwrites modified files | Install rdpi, manually edit one file, run `astp update --force --target project` | All files updated including modified one. `astp-hash` recalculated. | Medium |
| T38 | E2E | `astp install nonexistent --target project` | CLI invocation with invalid bundle name | Exit code 1. Stderr contains "Bundle 'nonexistent' not found." | Medium |
| T39 | E2E | `astp` (no args, wizard mode) — non-TTY | Invoke in non-TTY environment without flags | Graceful handling — either prompt failure message or usage help. | Low |
| T40 | Unit | CLI argument parsing — install command flags | `astp install rdpi --target user` | Commander parses: `bundle = 'rdpi'`, `options.target = 'user'` | Medium |
| T41 | Unit | CLI argument parsing — update with --force | `astp update --force` | Commander parses: `options.force = true` | Medium |
| T42 | Unit | Preserve existing frontmatter field order on injection | Frontmatter with `name`, `description`, `tools` fields | `astp-*` fields appended after existing fields, original field order unchanged | Medium |
| T43 | Unit | Reject manifest `target` with `..` path traversal (R9) | `validateTarget('../../.bashrc')` | Validation error thrown: path traversal detected. File is NOT written. | High |
| T44 | Unit | Reject manifest `target` with absolute path (R9) | `validateTarget('/etc/passwd')` and `validateTarget('C:\\Windows\\System32\\cmd.exe')` | Validation error thrown: absolute path rejected. File is NOT written. | High |
| T45 | Unit | Resolved install path cannot escape install root (R9) | `resolveInstallPath(installRoot, 'agents/../../../etc/passwd')` | Validation error thrown: resolved path is outside `installRoot`. | High |
| T46 | Unit | Manifest `target` with `/` separators resolves correctly on Windows (R3) | `resolveInstallPath(installRoot, 'skills/orchestrate/SKILL.md')` on Windows | Path resolved via `node:path.join()` to `installRoot\skills\orchestrate\SKILL.md` with OS-native separators | Medium |


## Edge Cases

### Files without frontmatter (stage definitions)

Stage definition files (`rdpi-stages/*.md`) have no YAML frontmatter [ref: ../01-research/01-codebase-analysis.md §4.5]. The FrontmatterHandler must prepend a new frontmatter block. Test strategy: T04, T06 cover inject and strip; T25 verifies the round-trip (inject → strip = original content).

### Partial astp metadata (corrupted frontmatter)

A file may have some `astp-*` fields but not all (user manually deleted `astp-hash`). Tests T22 and UC-Edge-4 [ref: ./05-usecases.md] verify conservative handling — treated as modified.

### Hash stability across platforms

SHA-256 of the same string must produce identical hashes on Windows and Linux. Node.js `crypto.createHash('sha256')` is deterministic across platforms for the same input bytes. Edge case: line endings (`\r\n` vs `\n`). Test strategy: verify hash stability by normalizing line endings before hashing, or document that templates use LF only (enforced by `.editorconfig`). Covered by T07 with explicit line-ending scenarios.

### Empty frontmatter block after stripping

If a file had only `astp-*` fields in its frontmatter (e.g., stage definitions), stripping them leaves `---\n---\n`. The strip function must detect this and remove the empty block entirely. Covered by T06.

### Concurrent installs

Not expected in v0.1.0 (single CLI process), but `installFile()` should use atomic write patterns (write to temp then rename) to avoid partial file content. Not a test priority for v0.1.0, noted for future consideration.

### Very large frontmatter

Unlikely for MDA files but possible. Frontmatter parsing should not have a size limit that breaks on large YAML blocks. Low priority — not explicitly tested.


## Performance Criteria

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Manifest fetch | < 3s on broadband | Single HTTP GET for a small JSON file (~1 KB). Based on GitHub raw content endpoint typical latency [ref: ../01-research/02-external-research.md §3]. |
| Bundle download (rdpi, 21 files) | < 10s on broadband | giget downloads a single tarball. 21 markdown files are small (~50 KB total). |
| Local scan (50 installed files) | < 500ms | Sequential file reads + frontmatter parse. No network. |
| Version comparison | < 10ms | In-memory semver comparison of a few bundle entries. |
| Full install flow (install rdpi to project) | < 15s total | Manifest fetch + download + 21 file writes. |
| Unit test suite | < 5s total | Pure logic, no I/O, no network. |
| Full test suite (unit + integration + E2E) | < 60s total | E2E tests involve file I/O and subprocess spawning. |


## Correctness Verification

End-to-end validation approach for confirming the feature works as designed:

1. **Install round-trip**: Run `astp install rdpi --target project` → verify 21 files exist at expected paths → verify each file has `astp-source`, `astp-bundle`, `astp-version`, `astp-hash` in frontmatter → verify original template content is preserved (non-astp fields unchanged).

2. **Check accuracy**: Install rdpi v1.0.0 → run `astp check` → confirm "Up to date" → swap manifest to v1.2.0 → run `astp check` again → confirm "Update available" with correct version numbers.

3. **Update integrity**: Install v1.0.0 → update manifest to v1.1.0 → run `astp update` → verify `astp-version` changed to `1.1.0` in all files → verify `astp-hash` recalculated for new content → verify original template content matches new version.

4. **Modification detection**: Install → manually edit one file → run `astp update` → verify modified file is skipped → run `astp update --force` → verify modified file is overwritten → verify `astp-hash` recalculated.

5. **Hash consistency**: For each installed file, strip `astp-*` fields → compute SHA-256 → compare with `astp-hash` value → must match if file was not user-modified.

6. **Idempotency**: Run `astp install rdpi --target project` twice → second run should produce identical files (no duplicate frontmatter fields, no changed hashes).
