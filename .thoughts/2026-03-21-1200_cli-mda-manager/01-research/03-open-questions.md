---
title: "Open Questions: CLI MDA Manager"
date: 2026-03-21
stage: 01-research
role: rdpi-questioner
workflow: b0.5
---

# Open Questions: CLI MDA Manager

## High Priority

### Q1: Template Distribution Mechanism — Embedded vs Remote Fetch

**Context**: TASK.md explicitly requires that "Updating MDA templates does NOT require a new CLI version." This eliminates pure embedding. However, the external research identifies five distribution strategies with different trade-offs for offline support, complexity, and update speed. The choice here is foundational — it shapes the entire CLI architecture, versioning model, and update flow.

**Options**:
1. **Git-based tarball fetch (giget)** — CLI downloads template tarball from the `astp` GitHub repo at a specific tag/ref. Uses giget's programmatic API (`downloadTemplate()`).
   - Pros: Proven approach (6M weekly downloads), cache/offline support (`--prefer-offline`), subdirectory support, zero dependencies, auth support for private repos.
   - Cons: Requires network for first install. GitHub API rate limits (60/hr unauthenticated). Depends on a third-party library (giget is pre-1.0 but stable in unjs ecosystem).

2. **GitHub API raw content fetch** — CLI fetches individual files via GitHub's raw content API or Contents API, guided by a remote manifest.
   - Pros: Fine-grained file-level fetching. No dependency on external tools. Easy to implement for small file sets (22 files total).
   - Cons: Rate limits (60/hr unauthenticated). No built-in caching. Must build file list management manually.

3. **Hybrid: Embedded fallback + remote sync** — Templates ship embedded in the npm package as a baseline; CLI checks remote for newer versions and fetches updates.
   - Pros: Works offline on first install. Fast initial setup. Remote sync for updates satisfies decoupling requirement.
   - Cons: Two sources of truth. Sync logic is complex. Embedded templates go stale between CLI releases.

4. **Templates as separate npm package(s)** — Publish `@astp/templates-orchestrate`, `@astp/templates-rdpi` as npm packages. CLI installs them via npm.
   - Pros: Leverages npm versioning, caching, and `npm outdated`. Familiar model.
   - Cons: Publishing overhead for markdown files. Users interact with npm directly for updates (breaks UX flow). Multiple packages to maintain.

**Risks**: Choosing an overly complex strategy delays v0.1.0. Choosing pure embedding violates the core decoupling requirement. Rate limits on GitHub API could break CI/CD usage if unauthenticated.

**Researcher recommendation**: Option 1 (giget) provides the best balance — decoupled versioning, proven tooling, cache/offline support, and low complexity. Option 2 is viable but reinvents what giget already does. Options 3 and 4 are overengineered for 22 markdown files.

---

### Q2: Where Do Templates Live in the Repository?

**Context**: Currently `src/templates/` is empty and `.github/` contains the live MDA files used by this project. TASK.md says templates live in `src/templates/`, but it's unclear whether `.github/` continues to be the source of truth (with `src/templates/` being a copy) or whether `src/templates/` becomes the canonical location (with `.github/` being an install target populated by the CLI itself).

**Options**:
1. **`src/templates/` is the canonical source** — Move all template MDA files into `src/templates/`. The `.github/` versions in this repo become install targets (populated by running `astp install` on this project itself or via symlinks/copy scripts).
   - Pros: Clean separation. Templates are clearly "the product" in `src/`. `.github/` is just one install target.
   - Cons: Duplicated files in the repo (or need a build/sync step). Changing a template requires editing in `src/templates/` and then updating `.github/`.

2. **`.github/` remains the canonical source** — `src/templates/` is a build artifact or pointer (manifest referencing `.github/` paths). The CLI fetches from `.github/` subdirectories in the repo.
   - Pros: No duplication. Dogfooding — the repo uses its own templates directly.
   - Cons: Blurs the line between "this project's config" and "distributable product." fetching logic must target `.github/` subdirectories.

3. **Separate repository for templates** — Templates live in a dedicated `astp-templates` repo. This repo only has the CLI code.
   - Pros: Clean decoupling. Independent release cycles. No confusion between project config and templates.
   - Cons: Two repos to maintain. Cross-repo coordination for testing. Complicates initial development.

**Risks**: Option 1 creates drift between `src/templates/` and `.github/` unless carefully synced. Option 2 makes `.github/` dual-purpose (project config + product), creating confusion about what's a template and what's project-specific. Option 3 adds maintenance overhead for a solo/small team.

**Researcher recommendation**: Option 1 is the cleanest long-term. The minor complexity of syncing `src/templates/` → `.github/` (or using the CLI on itself) is worth the clarity. But this needs a clear decision before design.

---

### Q3: Versioning Strategy for Bundles and Individual Items

**Context**: TASK.md requires independent versioning of bundles and individual items. External research identifies three approaches: semver tags, content hashing, and manifest-based tracking. The choice affects update detection, user communication ("what changed?"), and the metadata contract between CLI and templates.

**Options**:
1. **Semver per bundle, stored in a central manifest** — A `manifest.json` at the templates root declares version per bundle (e.g., `{ "orchestrate": "1.0.0", "rdpi": "1.2.0" }`). Individual items are versioned as part of their bundle. The CLI compares local manifest vs remote manifest.
   - Pros: Semantic meaning (major = breaking). Simple comparison. Users understand semver.
   - Cons: Requires discipline to bump versions correctly. Individual items outside bundles need their own version entries.

2. **Git tags per bundle** — Each bundle release is a git tag (e.g., `orchestrate-v1.0.0`, `rdpi-v2.0.0`). The CLI fetches templates at a specific tag.
   - Pros: Immutable releases. Works natively with giget (`repo#tag`). No custom manifest needed.
   - Cons: One repo with multiple tag streams gets noisy. Releasing bundle A doesn't require tagging bundle B, but both share a commit history. Individual items outside bundles are awkward.

3. **Content hashing per file** — SHA-256 hash per file in a remote manifest. Local install records hashes. Update = hash mismatch.
   - Pros: Detects any change. No manual version bumping. Precise per-file granularity.
   - Cons: No semantic information — user can't tell if an update is breaking. Every whitespace change triggers an update notification. Noisy for users.

4. **Hybrid: Semver for bundles + content hashes for individual files** — Bundles have semver. Individual files have hashes. Manifest contains both.
   - Pros: Semantic info for bundles, precise detection for files.
   - Cons: Most complex. Two tracking mechanisms.

**Risks**: Without semver, users can't assess update impact. Without per-file tracking, the CLI can't detect partial modifications. Over-engineering versioning delays v0.1.0.

**Researcher recommendation**: Option 1 (semver per bundle in a manifest) is the simplest viable approach for v0.1.0. Individual items can be deferred to a later version or treated as bundles of one. Option 2 is elegant but gets messy with multiple bundles in one repo.

---

### Q4: CLI Framework Selection

**Context**: External research compared four frameworks: Commander.js (153M downloads, 0 deps, mature), Yargs (80M, 6 deps, verbose), Oclif (118K, 24 deps, overkill), and Citty (9.2M, 0 deps, pre-1.0). The CLI needs ~3-4 commands (install, update, check), subcommand support, and TypeScript compatibility.

**Options**:
1. **Commander.js** — Most popular. Zero dependencies. Built-in TypeScript declarations. Fluent API.
   - Pros: Battle-tested. Largest ecosystem. Extensive documentation. Low learning curve. `@commander-js/extra-typings` for strong type inference.
   - Cons: No built-in prompt integration (needs separate prompt library). Slightly more boilerplate than Citty.

2. **Citty** — Smallest (24.4 kB). Zero dependencies. Modern unjs ecosystem. `defineCommand` API.
   - Pros: Minimal footprint. TypeScript-first. Lazy command loading. Pairs well with giget (same ecosystem).
   - Cons: Pre-1.0 (API may change). Smaller community. Fewer standalone resources/examples. No prompt integration.

3. **Yargs** — Flexible. Built-in bash/zsh completion.
   - Pros: Powerful argument parsing. Completion generation.
   - Cons: 6 dependencies. External TypeScript types. More verbose. Less modern API feel.

**Risks**: Choosing a pre-1.0 framework (Citty) risks breaking changes. Choosing a heavyweight framework (Oclif) adds unnecessary complexity. Both Commander and Citty lack prompt integration — a prompt library is needed regardless.

**Researcher recommendation**: Commander.js or Citty are both strong choices. Commander is the safe bet (stable, massive adoption). Citty is appealing for its minimalism and ecosystem alignment with giget. The decision may hinge on whether the team values stability (Commander) or ecosystem cohesion with unjs (Citty).

---

### Q5: Interactive Prompt Library Selection

**Context**: The CLI needs interactive selection for bundles and individual items (TASK.md: "User-friendly way to choose what to install"). External research compared three libraries: @inquirer/prompts (active, many types), @clack/prompts (beautiful UI, spinners), and prompts/terkelg (unmaintained).

**Options**:
1. **@clack/prompts** — Polished UI with `intro`/`outro`, `spinner()`, `multiselect`, `groupMultiselect`, `tasks()`, `log` utilities. Used by `create-svelte`, `create-astro`.
   - Pros: Beautiful out-of-the-box UX. Built-in spinners and progress indicators (useful for template download feedback). `group()` for chained prompts with cancellation. TypeScript-first.
   - Cons: 244 kB unpacked (larger than @inquirer). Fewer prompt types than @inquirer. Opinionated styling — less customizable.

2. **@inquirer/prompts** — Complete rewrite of classic Inquirer. Modular, each prompt standalone. Largest prompt type selection.
   - Pros: Most prompt types (select, checkbox, search, expand, editor, etc.). Modular imports. AbortController support. Large plugin ecosystem.
   - Cons: No built-in spinners/progress. 10 dependencies. Requires additional library for non-prompt UX (spinners, styled logs).

3. **prompts (terkelg)** — Unified single library with `prompts.inject()` for testing.
   - Pros: Built-in test injection. Simple API.
   - Cons: Last published 4 years ago. No built-in TypeScript. Effectively unmaintained.

**Risks**: @clack/prompts is newer and has a smaller community — potential for undiscovered edge cases. @inquirer/prompts requires additional dependencies for spinners/UX. prompts/terkelg is a maintenance risk.

**Researcher recommendation**: @clack/prompts is the stronger fit for `astp`. Its bundled UX features (spinners for download feedback, `multiselect` for bundle/item selection, `intro`/`outro` for session framing) align closely with the CLI's interactive selection requirements. The `group()` utility simplifies prompt chaining with built-in cancellation handling.

---

## Medium Priority

### Q6: Install Target — Default Scope and Coexistence

**Context**: TASK.md defines two install targets: project-level (`.github/`) and user-level (`~/.copilot/`). VS Code GitHub Copilot supports both. The CLI needs a default and must handle the case where both are used.

**Options**:
1. **Project-level (`.github/`) as default** — Most common use case. Files are version-controlled with the project. User-level requires explicit `--global` flag.
   - Pros: Version-controlled. Team-shareable. Aligns with how the existing repo uses `.github/`.
   - Cons: Must install per-project. Doesn't cover user-level preferences.

2. **User-level (`~/.copilot/`) as default** — Install once, available across all projects.
   - Pros: Install once. Less per-project setup.
   - Cons: Not version-controlled. Not shareable with team. May conflict with project-level configs.

3. **Interactive choice (ask every time)** — CLI asks "Install to project or user level?" during install.
   - Pros: Explicit user intent. No ambiguity.
   - Cons: Extra step every time. Annoying for repeated use.

4. **Project-level default, remember preference** — Default to `.github/`, store preference in a local config (`~/.astp/config.json`), allow override via flag.
   - Pros: Sensible default. Remembers user intent. Flag for one-off overrides.
   - Cons: Config file adds state management to the CLI.

**Risks**: Wrong default annoys users on every install. Coexistence of project + user level can cause confusing behavior if Copilot merges or prioritizes one over the other. This depends on VS Code Copilot's resolution order, which may change across versions.

**Researcher recommendation**: Option 1 (project-level default with `--global` flag) is the simplest and aligns with the existing `.github/` convention. User-level support can be a v0.2+ feature unless there's a known demand.

---

### Q7: Local Metadata Format for Tracking Installed Versions

**Context**: The CLI needs to know what's installed locally to detect updates and avoid reinstalling. This requires some local metadata. The format and location of this metadata affect update detection, conflict handling, and user experience.

**Options**:
1. **`.astp.json` in the install target directory** — A JSON file next to the installed MDA files (e.g., `.github/.astp.json`). Records bundle versions, installed files, and timestamps.
   - Pros: Co-located with installed files. Easy to find. Version-controlled if in `.github/`.
   - Cons: Adds a non-MDA file to `.github/`. May confuse users. Version control means different team members' install state is shared (could be a pro or con).

2. **`~/.astp/state.json` in user home** — A global state file tracking all installations across projects.
   - Pros: Doesn't pollute project directories. Central tracking.
   - Cons: Not portable between machines. Lost if home directory is wiped. Can't be version-controlled with the project.

3. **Embed metadata in MDA file frontmatter** — Add `astp-version: 1.0.0` field to frontmatter of each installed file.
   - Pros: Self-contained — each file knows its version. No external metadata file.
   - Cons: Modifying template content on install. User might edit/remove the field. Not all MDA files have frontmatter (stage definitions don't).

4. **Lock file pattern (`.astp-lock.json`)** — Analogous to `package-lock.json`. Records exact versions, file hashes, and source refs.
   - Pros: Familiar pattern for Node.js developers. Precise state tracking. Enables reproducible installs.
   - Cons: Another lock file in the project. Possible merge conflicts.

**Risks**: No local metadata means no update detection — the CLI can't know what's installed. Over-complex metadata creates maintenance burden. Metadata in frontmatter breaks if AI agent parsers don't expect `astp-version` fields.

**Researcher recommendation**: Option 1 (`.astp.json` in the install directory) is the simplest and most discoverable. It follows the pattern of copier's `.copier-answers.yml`. Keep the schema minimal: bundle name, version, list of installed file paths.

---

### Q8: Handling User Modifications to Installed Templates

**Context**: Users may customize installed MDA files (e.g., adjusting agent descriptions, adding tools, modifying instructions). When `astp update` runs, the CLI must decide what to do with modified files. External research notes that giget/degit simply overwrite — they have no conflict detection. Copier uses git-based merging.

**Options**:
1. **Overwrite with warning** — Detect modifications (via content hash comparison against local metadata). Warn user and require `--force` to overwrite.
   - Pros: Simple to implement. User is informed. Modified files are safe by default.
   - Cons: User must manually merge changes. Modified files never get updated unless user explicitly accepts.

2. **Backup and overwrite** — Create `.bak` copies of modified files before overwriting.
   - Pros: User can recover their changes. Update always succeeds.
   - Cons: `.bak` files pollute the directory. User must manually diff and merge.

3. **Skip modified files** — Update only unmodified files. Report skipped files.
   - Pros: User modifications are always preserved. Non-destructive.
   - Cons: Modified files drift from upstream. User may miss important updates.

4. **Interactive per-file resolution** — For each modified file, ask: overwrite / skip / show diff.
   - Pros: Most flexible. User has full control.
   - Cons: Tedious for many files (rdpi bundle has 21 files). Complex to implement.

**Risks**: Overwriting without warning causes data loss. Never updating modified files means users miss security or functionality updates. Showing diffs of markdown files is less useful than for code.

**Researcher recommendation**: Option 1 (overwrite with warning, `--force` to confirm) for v0.1.0. It's the simplest non-destructive approach. Per-file interactive resolution (Option 4) is a good v0.2+ feature.

---

### Q9: Template-CLI Decoupling Contract

**Context**: TASK.md requires that updating templates doesn't require a new CLI version. This means the CLI must have a stable contract with the template structure. If the contract is too loose, the CLI can't reliably process templates. If too tight, template changes break the CLI.

**Options**:
1. **Directory convention contract** — The CLI expects templates in a fixed directory structure (`templates/<bundle-name>/<category>/`). Files within can change freely. Metadata is in a `manifest.json` per bundle. Breaking change = changed directory structure or manifest schema.
   - Pros: Simple. Directory structure rarely changes. Files can evolve freely.
   - Cons: Adding a new MDA category (a new directory) requires manifest update, not CLI update — but the CLI must know how to map categories to install paths.

2. **Manifest-driven contract** — A top-level `manifest.json` describes everything: bundles, items, file paths, install targets, versions. The CLI reads the manifest and follows instructions. Template structure can change freely as long as the manifest is updated.
   - Pros: Maximum decoupling. The CLI is a "dumb executor" of the manifest. New categories, new bundles, new install paths — all expressible via manifest without CLI changes.
   - Cons: Manifest schema becomes the critical contract. Complex manifest = complex parse logic.

3. **Convention + override** — Default directory conventions with optional per-bundle `config.json` for overrides (custom install paths, exclusions, etc.).
   - Pros: Convention handles 90% of cases. Config handles edge cases.
   - Cons: Two mechanisms to maintain. Edge cases may accumulate into complexity.

**Risks**: Too rigid a contract means every template reorganization requires a CLI release — violating the decoupling requirement. Too loose a contract means the CLI can't validate or reason about templates, leading to silent failures.

**Researcher recommendation**: Option 2 (manifest-driven) provides the strongest decoupling. The manifest schema becomes the versioned contract — it should be simple and extensible (JSON with a `schemaVersion` field). The CLI only needs to understand the manifest format, not the template file structure.

---

### Q10: Command Structure and UX Flow

**Context**: TASK.md defines three features: install, update, and update-check. How these map to CLI commands affects usability. The CLI also needs interactive bundle/item selection during install.

**Options**:
1. **Three top-level commands** — `astp install`, `astp update`, `astp check`.
   - Pros: Clear, one command per action. Standard CLI pattern.
   - Cons: `astp check` is ambiguous (check what?). `install` and `update` overlap conceptually.

2. **Two commands with flags** — `astp install` (interactive selection + install), `astp update [--check]` (update or just check).
   - Pros: Fewer commands. `--check` is a dry-run variant of update. Simpler mental model.
   - Cons: `--check` as a flag is unusual — usually it's a separate command or `--dry-run`.

3. **Single `astp` command (interactive by default)** — Running `astp` with no subcommand launches an interactive wizard (select action → select bundles/items → confirm → execute). Subcommands available for scripting: `astp install <bundle>`, `astp update`, `astp check`.
   - Pros: Friendly for first-time users. Scriptable for CI/automation.
   - Cons: Two UX paths to maintain (interactive + command-line). More complex implementation.

4. **Init-style flow** — `astp init` for first-time setup (interactive), `astp update` for subsequent updates, `astp status` to check.
   - Pros: Familiar pattern (`npm init`, `git init`). Clear distinction between first setup and updates.
   - Cons: `init` implies one-time use, but users may want to add bundles later.

**Risks**: Too many commands create confusion for a simple tool. Too few commands hide functionality behind flags.

**Researcher recommendation**: Option 1 (three commands) or Option 3 (interactive default + subcommands) both work. Option 3 has the best first-use experience but higher implementation cost. For v0.1.0, Option 1 is sufficient, with `astp install` launching interactive selection when no bundle is specified.

---

## Low Priority

### Q11: Scope Boundaries for v0.1.0

**Context**: TASK.md describes the full vision. Not everything needs to ship in v0.1.0. Scoping too broadly delays the first release; scoping too narrowly makes the tool unusable.

**Options for v0.1.0 scope**:

| Feature | Essential (v0.1.0) | Deferrable (v0.2+) | Rationale |
|---------|-------------------|--------------------|-----------| 
| `install` command | Yes | — | Core functionality |
| Interactive bundle/item selection | Yes | — | Required by TASK.md |
| Two initial bundles (orchestrate, rdpi) | Yes | — | Required by TASK.md |
| Project-level install (`.github/`) | Yes | — | Primary use case |
| `update` command | ? | ? | **Open question** |
| `check` command | ? | ? | **Open question** |
| User-level install (`~/.copilot/`) | — | Yes | Secondary target |
| Individual item install (outside bundles) | — | Yes | Bundles cover initial needs |
| Conflict detection on update | — | Yes | Depends on update existing |
| Multi-agent support (beyond Copilot) | — | Yes | Architecture concern only |

**Key decision**: Should `update` and `check` commands be in v0.1.0, or is `install` alone sufficient for the first release?

**Risks**: Shipping without `update` means users must manually re-run `install` to get new templates (acceptable if install is idempotent). Shipping with `update` adds complexity to v0.1.0 (metadata tracking, version comparison, conflict handling).

**Researcher recommendation**: v0.1.0 should include `install` with interactive selection and `check` (version comparison only — lightweight). `update` (with conflict handling) can be deferred to v0.2.0, as it has the highest complexity.

---

### Q12: Node.js Minimum Version

**Context**: The CI pipeline uses Node.js 22.x. Commander v14 requires Node.js v20+. The `@fozy-labs/js-configs` tsconfig targets ESNext. The `engines` field in `package.json` is not set.

**Options**:
1. **Node.js >= 20** — Matches Commander v14 requirement. LTS release.
   - Pros: Broad compatibility. LTS support until April 2026.
   - Cons: May miss newer APIs available in v22.

2. **Node.js >= 22** — Matches CI environment. Current LTS.
   - Pros: Access to latest stable APIs. Aligns with CI. LTS support until April 2027.
   - Cons: Excludes Node.js 20 users (still in LTS maintenance until April 2026).

**Risks**: Low stakes — target audience (developers using VS Code Copilot) likely runs Node.js 20+. Setting it too low may invite bug reports from unsupported environments.

**Researcher recommendation**: Node.js >= 20 for broadest compatibility. The CI can test on 22 while supporting 20+.

---

### Q13: ESM vs CJS Module Format

**Context**: The `@fozy-labs/js-configs` base tsconfig uses `"module": "ESNext"` and `"moduleResolution": "bundler"`. The project's `package.json` lacks a `"type"` field (defaults to CJS). External research notes that ESM is the standard for new Node.js projects in 2026. The `#!/usr/bin/env node` shebang works with both, but ESM requires `import.meta.url` instead of `__dirname`.

**Options**:
1. **ESM (`"type": "module"`)** — Modern standard. Matches tsconfig target.
   - Pros: Future-proof. Native top-level await. Aligns with `"module": "ESNext"` in tsconfig.
   - Cons: `__dirname` unavailable (use `import.meta.url`). Some npm packages may have CJS-only exports (rare in 2026).

2. **CJS (no `"type"` field)** — Legacy default.
   - Pros: Broader compatibility with older tooling.
   - Cons: Increasingly outdated. Conflicts with `"module": "ESNext"` tsconfig.

**Risks**: Minimal. ESM is the clear standard for new projects in 2026. The only risk is encountering a dependency with CJS-only exports, which is easily worked around.

**Researcher recommendation**: ESM. No reason to use CJS for a new project in 2026. Add `"type": "module"` to `package.json`.

---

## User Answers

### Q1: Template Distribution Mechanism
**Decision**: На усмотрение design-agent

### Q2: Canonical Template Location
**Decision**: Option 1 — `src/templates/` как канонический источник

### Q3: Versioning Strategy
**Decision**: На усмотрение design-agent

### Q4: CLI Framework
**Decision**: На усмотрение design-agent

### Q5: Prompt Library
**Decision**: На усмотрение design-agent

### Q6: Install Target Default
**Decision**: Option 3 — Interactive choice (спрашивать каждый раз)

### Q7: Local Metadata Format
**Decision**: Option 3 — Metadata in frontmatter каждого файла

### Q8: User Modifications
**Decision**: Option 1 — Overwrite with warning, --force для перезаписи

### Q9: Template-CLI Contract
**Decision**: На усмотрение design-agent

### Q10: Command Structure
**Decision**: Option 3 — Interactive default + subcommands for CI

### Q11: v0.1.0 Scope
**Decision**: Option 2 — Все три команды (install + update + check)

### Q12: Node.js Minimum Version
**Decision**: Option 2 — Node.js >= 22

### Q13: ESM vs CJS
**Decision**: Option 1 — ESM (`"type": "module"`)
