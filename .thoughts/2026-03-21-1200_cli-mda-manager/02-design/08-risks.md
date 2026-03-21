---
title: "Risk Analysis: astp CLI"
date: 2026-03-21
stage: 02-design
role: rdpi-qa-designer
workflow: b0.5
---

# Risk Analysis: astp CLI


## Risk Matrix

| ID | Risk | Probability | Impact | Strategy | Mitigation |
|----|------|-------------|--------|----------|------------|
| R1 | giget pre-1.0 API breaking changes | Low | High | Mitigate | Pin version, isolate in wrapper module |
| R2 | Frontmatter parsing edge cases corrupt file content | Medium | High | Mitigate | Round-trip tests, conservative parser |
| R3 | Cross-platform path handling (Windows `\` vs POSIX `/`) | Medium | Medium | Mitigate | Use `node:path` consistently, CI on Windows |
| R4 | GitHub raw content endpoint rate limiting | Medium | Medium | Mitigate | Document GIGET_AUTH, minimal request count |
| R5 | Template-CLI version drift (manifest schema changes) | Low | High | Mitigate | `schemaVersion` field, forward compatibility |
| R6 | User modifications lost on `astp update --force` | Medium | High | Mitigate | Clear warning, skip-by-default behavior |
| R7 | Dependency supply chain attack (npm packages) | Low | High | Mitigate | Lockfile, minimal deps, audit |
| R8 | File system permission errors on install targets | Low | Medium | Accept | Catch and report with actionable message |
| R9 | Command injection via template paths in manifest | Low | High | Avoid | Validate/sanitize all paths from manifest |
| R10 | v0.1.0 feature creep — scope exceeds 3 commands | Medium | Medium | Avoid | Strict scope definition in plan stage |
| R11 | Node.js 22 native `fetch()` behavior differences from browser fetch | Low | Low | Accept | Test against Node.js 22; no polyfill needed |
| R12 | @clack/prompts rendering issues in non-TTY environments (CI) | Medium | Low | Accept | Document that CI must use explicit flags |
| R13 | Manifest JSON manually maintained — human error in file paths | Medium | Medium | Mitigate | Future: CI validation script for manifest |
| R14 | SHA-256 hash mismatch due to line ending differences (CRLF vs LF) | Medium | Medium | Mitigate | Normalize line endings before hashing |
| R15 | Stage definition files — frontmatter block injection changes AI agent parsing | Low | Medium | Mitigate | Verify Copilot ignores unknown frontmatter on non-agent files |


## Detailed Mitigation Plans


### R1: giget pre-1.0 API breaking changes

giget is at v0.x (pre-1.0) and its API may change without semver guarantees [ref: ../01-research/02-external-research.md §3]. The CLI's `core/fetcher.ts` is the single module that imports giget [ref: ./01-architecture.md §4]. **Mitigation**: Pin giget to an exact version in `package.json` (no caret/tilde range). Wrap all giget usage in `core/fetcher.ts` so that any API change requires updating only one file. Before upgrading giget, run the E2E test suite (T31–T37) to validate download behavior. Monitor giget's changelog via the unjs GitHub repository.


### R2: Frontmatter parsing edge cases corrupt file content

The FrontmatterHandler must correctly handle: files with existing frontmatter (agents, skills, instructions), files without frontmatter (stage definitions), files with multiple `---` delimiters in content (e.g., markdown horizontal rules), and files with non-standard YAML [ref: ../01-research/01-codebase-analysis.md §4]. Incorrect parsing could destroy file content. **Mitigation**: Use a conservative parsing approach — only recognize frontmatter delimiters at the very start of the file (`/^---\n/`). The inject/strip round-trip test (T25) serves as the primary safety net: for every template file, `inject(strip(inject(template))) === inject(template)` must hold. Add regression tests for each real MDA file in the template set as integration fixtures.


### R5: Template-CLI version drift (manifest schema changes)

As the template system evolves, the manifest schema may need new fields (e.g., `items` array at root for individual templates, agent-type-specific install roots) [ref: ./01-architecture.md §8]. An older CLI encountering a newer manifest schema could fail silently or crash. **Mitigation**: The `schemaVersion` field in `manifest.json` (ADR-5) is checked at parse time. If `schemaVersion > SUPPORTED_SCHEMA_VERSION`, the CLI exits with a clear message: "Manifest schema version N is not supported. Please update astp: npm update -g astp." The manifest schema should be designed for additive changes (new optional fields) to maintain backward compatibility within a schema version.


### R6: User modifications lost on `astp update --force`

Users may customize installed MDA files (e.g., add tools to an agent, edit instruction descriptions). Running `astp update --force` overwrites these changes without backup [ref: ./05-usecases.md UC-4]. **Mitigation**: The default `astp update` behavior skips modified files (hash mismatch detection), with a clear warning listing which files were skipped. The `--force` flag is opt-in and the CLI prints a warning naming each file being overwritten. v0.1.0 does not implement backup; users should rely on version control (`git diff`) for project-level installs. For user-level installs (`~/.copilot/`), the risk is higher since there's no VCS — document this clearly in CLI output and `--help`.


### R7: Dependency supply chain attack (npm packages)

The CLI depends on 3 external packages: `commander`, `@clack/prompts`, `giget` [ref: ./01-architecture.md §4]. A compromised dependency could execute arbitrary code during install or runtime. **Mitigation**: Use `npm audit` in CI. Pin all dependency versions with an exact lockfile (`package-lock.json` committed). Review dependency update PRs before merging. All three packages were selected for minimal transitive dependencies: commander (0 deps), @clack/prompts (2 deps), giget (0 deps) [ref: ../01-research/02-external-research.md §1–§3].


### R9: Command injection via template paths in manifest

The manifest contains file paths (`source`, `target`) that are used in `path.join()` and `fs.writeFile()` calls. A compromised manifest could contain path traversal payloads (e.g., `../../.bashrc`) to write files outside the intended install root [ref: ./03-model.md §4]. **Mitigation**: Validate all `target` paths from the manifest before use: reject absolute paths, reject paths containing `..`, and verify the resolved path starts with the expected install root (`installRoot`). This validation belongs in `core/installer.ts` and should be tested with malicious path inputs (path traversal unit tests).


### R14: SHA-256 hash mismatch due to line ending differences

Git on Windows may convert LF to CRLF on checkout. If the template source has LF but the installed file has CRLF (or vice versa due to `.gitattributes`), the hash will not match and the file will appear as "modified" even though the user didn't change it [ref: ./03-model.md §3.3]. **Mitigation**: Normalize line endings to LF before computing hashes — both at install time (hash of template content) and at check time (hash of installed content minus astp fields). The `.editorconfig` in the project enforces LF, but user environments may differ. Normalize in `core/frontmatter.ts` before any hash operation.
