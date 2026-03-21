---
title: "Architecture Decision Records: astp CLI"
date: 2026-03-21
stage: 02-design
role: rdpi-architect
workflow: b0.5
---

# Architecture Decision Records: astp CLI


## ADR-1: Template Distribution Mechanism

### Status
Proposed

### Context
TASK.md requires that "Updating MDA templates does NOT require a new CLI version." This eliminates pure embedding and mandates a remote fetch mechanism. The template set is small (22 markdown files, 2 bundles) and lives in the `fozy-labs/astp` GitHub repository under `src/templates/` [ref: ../01-research/03-open-questions.md Q2, user decision: Option 1].

External research evaluated five strategies: git-based tarball fetch (giget), GitHub API raw content, hybrid embedded+remote, npm sub-packages, and full embedding [ref: ../01-research/02-external-research.md §3]. Key constraints: minimize dependencies, support caching/offline use, avoid GitHub API rate limit issues.

### Options Considered

1. **giget (git-based tarball fetch)** — Download tarball of specific subdirectory from GitHub. Zero dependencies. Cache and offline support. Programmatic API. 6M weekly downloads. [ref: ../01-research/02-external-research.md §3]
   - Pros: Proven tooling (used by Nuxt/Nitro). Subdirectory support (`gh:user/repo/subdir#ref`). Auth support for private repos. Built-in cache with `--prefer-offline`. Decoupled versioning via git refs.
   - Cons: Pre-1.0 library. Downloads entire subdirectory tarball (not per-file). Requires network for first install.

2. **GitHub API raw content** — Fetch individual files via raw.githubusercontent.com or GitHub Contents API. No external dependencies.
   - Pros: No third-party library. Fine-grained per-file fetching. Simple implementation.
   - Cons: Rate limits (60/hr unauthenticated). No caching. Must manage file list manually. Multiple HTTP requests for bundles with many files (rdpi = 21 requests). [ref: ../01-research/02-external-research.md §3, Pitfalls §4]

3. **Hybrid: Embedded fallback + remote sync** — Templates bundled in npm package as baseline; CLI checks remote for newer versions.
   - Pros: Offline first install. Fast initial setup.
   - Cons: Two sources of truth. Complex sync logic. Embedded templates go stale. [ref: ../01-research/02-external-research.md §3]

4. **npm sub-packages** — Publish template bundles as separate npm packages.
   - Pros: Leverages npm versioning and caching.
   - Cons: Publishing overhead for markdown files. Breaks UX flow (npm install vs astp install). Multiple packages to maintain. [ref: ../01-research/02-external-research.md §3]

### Decision
**Option 1: giget** for bulk template downloads, combined with **native `fetch()`** for manifest retrieval.

- **Manifest fetch**: `fetch()` to `https://raw.githubusercontent.com/fozy-labs/astp/{ref}/src/templates/manifest.json`. Single HTTP request. No library needed (Node.js 22 has native fetch).
- **Template download**: `giget.downloadTemplate('gh:fozy-labs/astp/src/templates/{bundle}#{ref}')` for each selected bundle.

This two-step approach avoids downloading templates when only the manifest is needed (check command), and uses giget's tarball optimization for efficient bulk downloads during install/update.

### Consequences
- **Positive**: Decoupled template versioning. Single tarball download per bundle (efficient for 21-file rdpi bundle). Cache/offline support reduces repeated downloads. Auth support via `GIGET_AUTH` env variable for CI or rate limit avoidance.
- **Negative**: Runtime dependency on giget (pre-1.0 but stable per unjs ecosystem track record). Network required for first install (no fallback). Slight overhead from tarball extraction for the base bundle.
- **Risks**: GitHub raw content endpoint availability. giget API changes before 1.0 (mitigated by pinning version). Rate limits for unauthenticated users in CI (mitigated by `GIGET_AUTH` documentation).


---


## ADR-2: Versioning Strategy

### Status
Proposed

### Context
TASK.md requires independent versioning of bundles and individual items. The user chose frontmatter-based local tracking [ref: ../01-research/03-open-questions.md Q7, user decision: Option 3] — each installed file stores its version metadata in `astp-*` frontmatter fields. The remote versioning strategy must be compatible with this: it must provide a version per bundle that can be injected into file frontmatter and compared during update checks.

External research identified four approaches: semver manifest, git tags, content hashes, and hybrid [ref: ../01-research/02-external-research.md §4]. Key consideration: users need semantic meaning (is this update breaking?) to decide whether to apply updates [ref: ../01-research/03-open-questions.md Q3].

### Options Considered

1. **Semver per bundle in a central manifest** — `manifest.json` declares version per bundle. CLI compares local frontmatter `astp-version` vs manifest version.
   - Pros: Semantic meaning (major = breaking). Users understand semver. Simple comparison. Single source of truth for remote versions. Compatible with frontmatter tracking (inject bundle version as `astp-version`).
   - Cons: Requires discipline to bump versions correctly. Individual items outside bundles need separate entries.

2. **Git tags per bundle** — Each bundle release tagged (e.g., `rdpi-v1.0.0`). CLI fetches at specific tag.
   - Pros: Immutable releases. Works natively with giget `#tag` syntax.
   - Cons: Multiple tag streams in one repo. Releasing one bundle still tags the entire repo. Individual items awkward. [ref: ../01-research/03-open-questions.md Q3]

3. **Content hashing per file** — SHA-256 per file in remote manifest. Update = hash mismatch.
   - Pros: Detects any change. No manual version bumping.
   - Cons: No semantic information. Every whitespace change triggers update. Noisy. User can't assess impact. [ref: ../01-research/02-external-research.md §4]

4. **Hybrid: Semver + content hashes** — Bundles have semver, files have hashes.
   - Pros: Semantic bundle info, precise per-file detection.
   - Cons: Most complex. Two mechanisms.

### Decision
**Option 1: Semver per bundle in a central manifest**, with per-file content hashes stored locally in frontmatter (`astp-hash`) for modification detection.

- **Remote**: `manifest.json` declares `version` per bundle (semver string). This is the source of truth for "is an update available?"
- **Local**: Each installed file's frontmatter contains `astp-version` (the bundle version at install time) and `astp-hash` (SHA-256 of template content, for detecting local modifications).
- **Git ref**: Templates are fetched from a configurable ref (default: `main`). No git tags required for v0.1.0. Version bumps happen by editing `manifest.json`.

This combines semver semantics for user-facing update detection with content hashing for internal modification tracking.

### Consequences
- **Positive**: Users see meaningful version changes. Frontmatter is self-contained (no external state file). Hash enables modification detection without a separate lock file. Manifest version bumps are a simple JSON edit.
- **Negative**: Version bumping requires manual discipline (mitigated by CI checks in future). No immutable release snapshots (mitigated by git history). Per-file version tracking is limited to bundle granularity.
- **Risks**: Forgetting to bump manifest version after template changes → users don't see updates (mitigated by future CI validation). Hash collision (SHA-256, negligible probability).


---


## ADR-3: CLI Framework Selection

### Status
Proposed

### Context
The CLI needs ~3 commands (install, update, check) plus a default interactive wizard mode [ref: ../01-research/03-open-questions.md Q10, user decision: Option 3]. It must support TypeScript, async action handlers, and subcommand routing. External research narrowed the field to Commander.js and Citty after eliminating Oclif (overkill) and Yargs (heavier, external types) [ref: ../01-research/02-external-research.md §1].

### Options Considered

1. **Commander.js (v14.0.3)** — Most popular CLI framework. 153M weekly downloads. Zero dependencies. Built-in TypeScript declarations. Fluent `.command().action()` API.
   - Pros: Battle-tested, massive adoption. Stable API (major versions are rare). Extensive documentation and community examples. `@commander-js/extra-typings` for inferred option types. `.parseAsync()` for async handlers. Requires Node.js v20+ (compatible with our >=22). [ref: ../01-research/02-external-research.md §1]
   - Cons: No built-in prompt integration (need separate prompt library). Slightly more boilerplate than Citty's `defineCommand`.

2. **Citty (v0.2.1)** — Minimal unjs ecosystem CLI framework. 9.2M weekly downloads. Zero dependencies. 24.4 kB unpacked. `defineCommand()` API.
   - Pros: Smallest footprint. TypeScript-first. Lazy/async command loading. Same ecosystem as giget (unjs). [ref: ../01-research/02-external-research.md §1]
   - Cons: Pre-1.0 (v0.2.1) — API may change. Smaller community. Fewer standalone resources and examples. No prompt integration.

3. **Yargs (v18.0.0)** — Flexible CLI framework. 80M weekly downloads. Built-in bash/zsh completion.
   - Pros: Powerful argument parsing. Completion generation.
   - Cons: 6 dependencies. External TypeScript types (`@types/yargs`). More verbose API. [ref: ../01-research/02-external-research.md §1]

### Decision
**Option 1: Commander.js**.

For a production CLI tool published to npm, stability and community support outweigh minimalism. Commander's mature API, zero dependencies, and 153M weekly downloads make it the lowest-risk choice. The pre-1.0 status of Citty introduces unnecessary API stability risk for a tool that will be distributed to users.

The ecosystem alignment between Citty and giget (both unjs) does not provide meaningful integration benefits — giget is used as an independent library via its programmatic API, not through shared framework conventions.

### Consequences
- **Positive**: Stable, well-documented API. Extensive community resources for troubleshooting. `@commander-js/extra-typings` provides strong type inference for options and arguments. Zero dependencies. Active maintenance (v14.0.3 released recently).
- **Negative**: Slightly more boilerplate than Citty for command definitions. No built-in prompt integration (addressed by ADR-4).
- **Risks**: Commander major version upgrades (rare, well-documented migration paths).


---


## ADR-4: Interactive Prompt Library

### Status
Proposed

### Context
The CLI's interactive wizard needs: action selection (select), target selection (select), bundle selection (multiselect), confirmation (confirm), and progress feedback during downloads (spinner). The user chose interactive wizard by default [ref: ../01-research/03-open-questions.md Q10, user decision: Option 3] and interactive target selection every time [ref: ../01-research/03-open-questions.md Q6, user decision: Option 3].

External research compared three libraries [ref: ../01-research/02-external-research.md §2]. Key requirement: built-in multiselect (for bundle selection) and spinner (for download progress) in a single library.

### Options Considered

1. **@clack/prompts (v1.1.0)** — Polished, pre-styled prompt library. Built-in multiselect, spinner, intro/outro, log utilities. 3.6M weekly downloads. 2 dependencies.
   - Pros: Beautiful out-of-the-box UX. `multiselect` and `groupMultiselect` (ideal for bundle/item selection). `spinner()` for async download feedback. `intro()`/`outro()` for wizard session framing. `group()` for chained prompts with cancellation. TypeScript-first. Used by create-svelte, create-astro. [ref: ../01-research/02-external-research.md §2]
   - Cons: 244 kB unpacked (larger than @inquirer). Fewer prompt types than @inquirer. Opinionated styling — less customizable.

2. **@inquirer/prompts (v8.3.2)** — Complete rewrite of classic Inquirer. Most prompt types. 9.2M weekly downloads. 10 dependencies.
   - Pros: Most prompt types (select, checkbox, search, expand, editor, etc.). Modular imports. AbortController support. Large plugin ecosystem. [ref: ../01-research/02-external-research.md §2]
   - Cons: No built-in spinners or progress indicators. 10 dependencies. Would need additional library (e.g., `ora`) for download progress.

3. **prompts (terkelg, v2.4.2)** — Unified single library. Built-in test injection via `prompts.inject()`. 20.6M weekly downloads.
   - Pros: Simple API. Built-in test injection.
   - Cons: Last published 4 years ago. External TypeScript types. Effectively unmaintained. [ref: ../01-research/02-external-research.md §2]

### Decision
**Option 1: @clack/prompts**.

The built-in combination of `multiselect` + `spinner` + `intro/outro` + `group()` covers all wizard requirements in a single library with zero additional dependencies for UX. The `group()` utility simplifies prompt chaining with automatic cancellation handling — directly matching the wizard's sequential flow (action → target → bundles → confirm).

### Consequences
- **Positive**: Single library covers all interactive UX needs (prompts + spinners + session framing). Polished visual output. `group()` simplifies wizard implementation with built-in Ctrl+C handling. Actively maintained (v1.1.0).
- **Negative**: Opinionated styling limits visual customization. Unpacked size (244 kB) larger than @inquirer (though tree-shaking may reduce this). Fewer prompt types than @inquirer (sufficient for v0.1.0 needs).
- **Risks**: Smaller community than @inquirer — fewer resources for edge cases. Styling changes in future versions could alter CLI appearance.


---


## ADR-5: Template-CLI Decoupling Contract

### Status
Proposed

### Context
TASK.md requires that updating templates doesn't require a new CLI version. This means the CLI must have a stable contract with the template structure. The contract must be loose enough that template reorganization doesn't break the CLI, but strict enough that the CLI can reliably find and process templates [ref: ../01-research/03-open-questions.md Q9].

### Options Considered

1. **Directory convention contract** — CLI expects templates in a fixed directory structure (`templates/<bundle>/<category>/`). Metadata in per-bundle `manifest.json`.
   - Pros: Simple. Directory structure rarely changes.
   - Cons: Adding a new category requires CLI to know the new directory mapping. Rigid structure.

2. **Manifest-driven contract** — A top-level `manifest.json` describes everything: bundles, items, file paths, versions. CLI reads manifest and follows instructions. Template structure can change freely as long as manifest is updated.
   - Pros: Maximum decoupling — CLI is a "dumb executor" of the manifest. New categories, bundles, install paths all expressible via manifest. Schema versioned via `schemaVersion` field. [ref: ../01-research/03-open-questions.md Q9]
   - Cons: Manifest schema becomes the critical contract. Complex manifest = complex parse logic.

3. **Convention + override** — Default directory conventions with optional per-bundle config for overrides.
   - Pros: Convention handles 90% of cases. Config handles exceptions.
   - Cons: Two mechanisms. Edge cases accumulate.

### Decision
**Option 2: Manifest-driven contract**.

The `manifest.json` at `src/templates/manifest.json` is the single contract between the CLI and the template repository. The CLI requires only:
1. Ability to fetch `manifest.json` from a known URL pattern.
2. Understanding of the manifest schema (versioned by `schemaVersion: 1`).
3. Ability to download files listed in the manifest via giget.

The CLI does NOT hard-code bundle names, file paths, categories, or directory structures. All of this is declared in the manifest. Adding a new bundle or reorganizing files requires only updating the manifest — zero CLI changes.

### Consequences
- **Positive**: Maximum decoupling. New bundles, new categories, file renames — all handled via manifest edits. `schemaVersion` allows manifest evolution without breaking older CLI versions. Clean separation of concerns: manifest maintainer controls structure, CLI controls execution.
- **Negative**: Manifest errors can cause silent failures (wrong file paths, missing items). Manifest must be manually maintained (mitigated by future validation tooling).
- **Risks**: Manifest schema version bump requires CLI update for new features (but not for template content changes). Manifest becoming too complex over time (mitigated by keeping schema minimal for v0.1.0).


---


## ADR-6: Frontmatter Metadata Schema

### Status
Proposed

### Context
The user chose to store version metadata in each installed file's YAML frontmatter [ref: ../01-research/03-open-questions.md Q7, user decision: Option 3]. This requires defining: which fields are injected, how they're named, and how files without existing frontmatter (stage definitions [ref: ../01-research/01-codebase-analysis.md §4.5]) are handled.

Key constraints:
- AI agent parsers must not be confused by additional frontmatter fields [ref: ../01-research/01-codebase-analysis.md §4].
- All four MDA file types must be supported: agents (have frontmatter), skills (have frontmatter), instructions (have frontmatter), stage definitions (no frontmatter).
- Modification detection requires a content hash [ref: ../01-research/03-open-questions.md Q8, user decision: Option 1].

### Options Considered

This ADR emerged during architecture work — there were no pre-existing options in the research. The decision is about the specific field naming and frontmatter handling strategy.

1. **`astp-` prefixed fields, appended to existing frontmatter** — Add `astp-source`, `astp-bundle`, `astp-version`, `astp-hash` at the end of the frontmatter block. For files without frontmatter, create a new block.
   - Pros: Clear namespace (`astp-` prefix). Non-intrusive — appended, not interleaved. Self-documenting field names. Easy to grep for managed files (`astp-source`).
   - Cons: Adds 4 lines to every file. AI agents may log warnings for unknown fields (unlikely given YAML flexibility).

2. **Single `astp` object field** — Add `astp: { source, bundle, version, hash }` as a single structured field.
   - Pros: Single field addition. Cleaner frontmatter.
   - Cons: Nested YAML structure is harder to parse with simple regex. Not all YAML frontmatter parsers handle nested objects well in markdown context.

3. **Comment-based metadata** — Inject metadata as YAML comments (`# astp-version: 1.0.0`).
   - Pros: Invisible to YAML parsers. Zero risk of interfering with AI agent parsers.
   - Cons: Not standard YAML field access. Must use regex parsing. Comments may be stripped by formatters.

### Decision
**Option 1: `astp-` prefixed fields, appended to existing frontmatter**.

Four fields are injected:
- `astp-source` — repository identifier (e.g., `fozy-labs/astp`).
- `astp-bundle` — bundle name (e.g., `rdpi`).
- `astp-version` — bundle semver version at install time (e.g., `1.0.0`).
- `astp-hash` — SHA-256 hash of the template content (without `astp-*` fields) for modification detection.

For files without frontmatter, a new frontmatter block containing only `astp-*` fields is prepended (delimited by `---`).

The `astp-` prefix avoids collisions with existing VS Code Copilot frontmatter fields (`name`, `description`, `tools`, `user-invocable`, `applyTo`, etc.) [ref: ../01-research/01-codebase-analysis.md §4].

### Consequences
- **Positive**: Self-contained metadata — no external state file needed. Each file independently declares its provenance and version. Easy to scan: `grep -r "astp-source" .github/`. Modification detection via `astp-hash` without a lock file.
- **Negative**: Modifying template content on install (adding fields). 4 extra lines per file. Files without frontmatter gain a frontmatter block they didn't originally have (stage definitions).
- **Risks**: AI agent parsers encountering unexpected `astp-*` fields — low risk given that VS Code Copilot ignores unknown frontmatter fields. Users deleting `astp-*` fields manually — file becomes "unmanaged" (not tracked by update/check). A removed `astp-hash` means no modification detection for that file.
