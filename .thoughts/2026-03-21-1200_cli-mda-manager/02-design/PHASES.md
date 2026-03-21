---
title: "Phases: 02-design"
date: 2026-03-21
stage: 02-design
---

# Phases: 02-design

## Phase 1: Core Architecture

- **Agent**: `rdpi-architect`
- **Output**: `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

You are designing the architecture for `astp` — a Node.js CLI tool that manages MDA files (skills, agents, instructions — markdown files readable by AI agents). The tool installs, updates, and checks for updates to template bundles and individual items.

**Read these files first:**
- TASK.md: `../TASK.md`
- Research README: `../01-research/README.md`
- Codebase analysis: `../01-research/01-codebase-analysis.md`
- External research: `../01-research/02-external-research.md`
- Open questions: `../01-research/03-open-questions.md`

**User decisions already locked (from open questions):**
- Q2: `src/templates/` is the canonical template source (Option 1)
- Q6: Interactive selection for install target — ask project vs user-level every time (Option 3)
- Q7: Version metadata embedded in frontmatter of each installed file (Option 3)
- Q8: Overwrite with warning on update, `--force` to confirm (Option 1)
- Q10: Interactive wizard by default + subcommands for CI/scripting (Option 3)
- Q11: v0.1.0 includes all three commands: install, update, check (Option 2)
- Q12: Node.js >= 22
- Q13: ESM (`"type": "module"`)

**You must make ADR decisions for these open questions:**
- Q1: Template distribution mechanism (giget vs GitHub API vs hybrid vs npm packages). Research recommends giget (Option 1).
- Q3: Versioning strategy for bundles and individual items (semver manifest vs git tags vs content hashes vs hybrid). Research recommends semver per bundle in manifest (Option 1). Note: user chose frontmatter-based metadata for local tracking (Q7) — your versioning strategy must be compatible with this.
- Q4: CLI framework selection (Commander.js vs Citty vs Yargs). Research recommends Commander.js or Citty.
- Q5: Interactive prompt library (@clack/prompts vs @inquirer/prompts vs prompts/terkelg). Research recommends @clack/prompts.
- Q9: Template-CLI decoupling contract (directory convention vs manifest-driven vs convention + override). Research recommends manifest-driven (Option 2).

**Produce these output files:**

**`01-architecture.md`** — System architecture:
- C4 Level 2 (container diagram): CLI process, template source (GitHub repo), local file system, user terminal
- C4 Level 3 (component diagram): internal modules of the CLI — command parser, interactive UI layer, template fetcher, version manager, file installer, manifest reader, config manager
- Module dependency diagram showing which modules depend on which
- Clear responsibility zones for each module
- How `src/templates/` is organized (bundle directories, manifest location, file categories)
- How installed files map to target directories (`.github/` structure for project-level, `~/.copilot/` structure for user-level)

**`02-dataflow.md`** — Data flow for all three commands:
- `astp` (no args — interactive wizard): user launches → select action → select target (project/user) → select bundles/items → confirm → execute
- `astp install <bundle> [--target project|user]`: fetch manifest → resolve bundle → download templates → inject frontmatter metadata → copy to target
- `astp update [--force]`: read local frontmatter metadata → fetch remote manifest → compare versions → report changes → apply (with warning for modified files) or skip
- `astp check`: read local frontmatter metadata → fetch remote manifest → compare versions → display report
- Sequence diagrams for each flow
- State diagram for file lifecycle: not installed → installed → outdated → updated / modified

**`03-model.md`** — Domain model:
- TypeScript interfaces/types for: Bundle, TemplateItem, Manifest (remote), InstalledFileMetadata (frontmatter fields), InstallTarget, UpdateReport, VersionInfo
- Entity relationships diagram (class/ER diagram in Mermaid)
- Explain how frontmatter metadata fields are structured — what fields are injected on install, how they're read on update/check
- Note: stage definition files (`.github/rdpi-stages/*.md`) currently have NO frontmatter — the design must handle adding frontmatter to them on install

**`04-decisions.md`** — Architecture Decision Records:
- ADR-1: Template distribution mechanism (Q1)
- ADR-2: Versioning strategy (Q3)
- ADR-3: CLI framework selection (Q4)
- ADR-4: Interactive prompt library (Q5)
- ADR-5: Template-CLI contract (Q9)
- Each ADR: Status, Context (cite research findings with relative links), Options (with pros/cons from research), Decision, Consequences
- Additional ADRs if needed for decisions that emerge during architecture work

**Constraints:**
- All design choices must reference research documents via relative links (e.g., `../01-research/02-external-research.md §3`)
- Use Mermaid diagrams (titled, max 15–20 elements per diagram, split if larger)
- The architecture must support the locked user decisions — don't contradict them
- Keep the design minimal for v0.1.0 scope (install + update + check) while noting extension points for future features

---

## Phase 2: Use Cases & Documentation Impact

- **Agent**: `rdpi-architect`
- **Output**: `05-usecases.md`, `07-docs.md`
- **Depends on**: 1
- **Retry limit**: 2

### Prompt

You are continuing the design for `astp` — a Node.js CLI tool that manages MDA files. Phase 1 produced the core architecture. Now design use cases and assess documentation impact.

**Read these files first:**
- TASK.md: `../TASK.md`
- Research README: `../01-research/README.md`
- Open questions (for user decisions): `../01-research/03-open-questions.md`
- Architecture: `./01-architecture.md`
- Data flow: `./02-dataflow.md`
- Domain model: `./03-model.md`
- Decisions: `./04-decisions.md`

**Produce these output files:**

**`05-usecases.md`** — Use cases with TypeScript code examples:

Primary use cases:
1. **First-time setup**: User runs `astp` for the first time in a project. Interactive wizard guides through bundle selection and install target. Show the terminal interaction flow and the resulting file structure.
2. **Install specific bundle via CLI**: `astp install rdpi --target project`. Non-interactive, scriptable. Show what files are created and what frontmatter metadata is injected.
3. **Check for updates**: `astp check`. Reads installed files' frontmatter, compares against remote manifest. Show example output with version comparison table.
4. **Update with modifications**: User has edited an installed agent file. `astp update` detects the modification, warns, skips modified file. `astp update --force` overwrites.
5. **CI/CD usage**: `astp install orchestrate --target project` in a GitHub Actions workflow. Non-interactive mode, exit codes for success/failure.

Edge cases:
- No network access (offline — how does the CLI behave?)
- Remote manifest fetch fails mid-operation
- Target directory doesn't exist yet (first install in a new project)
- Installed files have corrupted/missing frontmatter metadata
- User runs `astp update` when nothing is installed
- Bundle contains a file that already exists but wasn't installed by astp (no frontmatter metadata)
- User tries to install to user-level (`~/.copilot/`) — directory structure differences from project-level

For each use case: brief scenario description, TypeScript code example showing how the CLI modules interact internally (referencing the architecture from Phase 1), expected terminal output, and error handling behavior.

**`07-docs.md`** — Documentation impact assessment:

This is a CLI tool, not a library. Documentation needs are focused on user-facing guides:
- What README sections need to be created or updated (installation instructions, command reference, bundle catalog)
- Whether a `--help` output design is needed for each command
- Whether a configuration/manifest format needs to be documented for template authors

**IMPORTANT**: Keep `07-docs.md` SHORT and focused. Only list high-impact documentation items. Do NOT write the actual documentation — describe WHAT needs documenting and WHY, in a brief list. Large docs.md is an anti-pattern.

---

## Phase 3: QA Strategy & Risks

- **Agent**: `rdpi-qa-designer`
- **Output**: `06-testcases.md`, `08-risks.md`
- **Depends on**: 1, 2
- **Retry limit**: 1

### Prompt

You are designing the QA strategy and risk analysis for `astp` — a Node.js CLI tool that manages MDA files (skills, agents, instructions). The architecture and use cases have been designed. Now define the test strategy and risk mitigations.

**Read these files first:**
- TASK.md: `../TASK.md`
- Research README: `../01-research/README.md`
- Architecture: `./01-architecture.md`
- Data flow: `./02-dataflow.md`
- Domain model: `./03-model.md`
- Decisions (ADRs): `./04-decisions.md`
- Use cases: `./05-usecases.md`

**Produce these output files:**

**`06-testcases.md`** — Test strategy and test cases:

Test strategy overview:
- **Unit tests**: Pure logic modules — version comparison, manifest parsing, frontmatter injection/reading, file path resolution, bundle resolution. Use Vitest (already in project devDeps per research).
- **Integration tests**: Template fetching (mocked network), file installation to temp directories, update detection flow, frontmatter read/write cycle.
- **E2E tests**: Full CLI invocation via `execa` or Node.js `child_process` — test actual `astp install`, `astp check`, `astp update` commands against a fixture template source.
- **Interactive prompt tests**: Verify prompt flows using @clack/prompts testing approach or input injection.

Test case table format:

| ID | Category | Description | Input | Expected Output | Priority |
|----|----------|-------------|-------|-----------------|----------|

Include test cases for:
- All primary use cases from `05-usecases.md`
- All edge cases from `05-usecases.md`
- Manifest parsing (valid, malformed, missing fields)
- Frontmatter injection and reading (with and without existing frontmatter, stage files that lack frontmatter)
- Version comparison logic (newer, same, older, invalid)
- File conflict detection (modified vs unmodified)
- Install target resolution (project-level `.github/`, user-level `~/.copilot/`)
- CLI argument parsing for all commands and flags
- Error handling: network failures, permission errors, invalid paths

Minimum 25 test cases across all categories.

**`08-risks.md`** — Risk analysis:

Risk table format:

| ID | Risk | Probability | Impact | Strategy | Mitigation |
|----|------|-------------|--------|----------|------------|

Analyze risks in these categories:
- **Technical**: giget/dependency stability, frontmatter parsing edge cases, cross-platform path handling (Windows primary but OS-agnostic), Node.js 22 API availability
- **Security**: template source authentication (GitHub rate limits, dependency supply chain), file system permissions, command injection via template paths
- **Operational**: template-CLI version drift, breaking manifest changes, user modifications lost on update
- **Scope**: v0.1.0 feature creep, complexity of three commands (install/update/check) in first release

For each High-impact risk, provide a detailed mitigation plan (2–3 sentences).

---

## Phase 4: Design Review

- **Agent**: `rdpi-design-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1, 2, 3
- **Retry limit**: 2

### Prompt

You are reviewing the complete design for `astp` — a Node.js CLI tool that manages MDA files. All design documents have been produced. Perform a thorough review and update README.md.

**Read these files:**
- TASK.md: `../TASK.md`
- Research README: `../01-research/README.md`
- Open questions (user decisions): `../01-research/03-open-questions.md`
- All design documents in this directory:
  - `./01-architecture.md`
  - `./02-dataflow.md`
  - `./03-model.md`
  - `./04-decisions.md`
  - `./05-usecases.md`
  - `./06-testcases.md`
  - `./07-docs.md`
  - `./08-risks.md`

**Review criteria:**

1. **Research traceability**: Every design decision must trace to a research finding or user decision. Check that ADRs in `04-decisions.md` cite specific research sections. Check that user decisions from `03-open-questions.md` "User Answers" section are respected (Q2: src/templates/ canonical, Q6: interactive target selection, Q7: frontmatter metadata, Q8: overwrite with warning, Q10: interactive default + subcommands, Q11: all 3 commands, Q12: Node >= 22, Q13: ESM).
2. **Internal consistency**: Architecture, data flow, model, and use cases must be mutually consistent. Types referenced in use cases must exist in the model. Modules referenced in data flow must exist in architecture. ADR decisions must be reflected in all other documents.
3. **Completeness**: All five open questions left for design (Q1, Q3, Q4, Q5, Q9) must have ADR decisions. All three commands (install, update, check) must have data flow diagrams and use cases. The domain model must cover all entities referenced in data flow and use cases.
4. **Feasibility**: The design must be implementable within the stated constraints (TypeScript, ESM, Node >= 22, minimal dependencies). No architectural decisions that contradict TASK.md requirements.
5. **Mermaid conformance**: All diagrams must be valid Mermaid syntax, titled, max 15–20 elements.
6. **Test-risk coverage**: Test cases should cover identified risks. High-impact risks should have corresponding test cases.
7. **Docs proportionality**: `07-docs.md` should be SHORT — if it's large, flag it.
8. **No implementation code**: Design documents should describe WHAT, not implement HOW. TypeScript examples in use cases are for illustration, not production code.

**Output:**

Update `README.md` in this directory with:
- Overview (1–2 sentences)
- Goals and Non-Goals for the design
- Documents list with links to all design files
- Key Decisions summary (one line per ADR)
- Quality Review checklist table (same criteria as above, with PASS/FAIL and notes)
- Issues Found section (numbered, with severity and location)
- Next Steps

Set README.md status to `Approved` if all criteria pass, or `Not Approved` with issues listed.

---

# Redraft Round 1

## Phase 5: Fix issues #1, #4, #5

- **Agent**: `rdpi-redraft`
- **Output**: `01-architecture.md`, `03-model.md`, `05-usecases.md`
- **Depends on**: —
- **Retry limit**: 2
- **Review issues**: #1, #4, #5

### Prompt

Read REVIEW.md at `./REVIEW.md`.
Your assigned issues: #1, #4, #5.
Affected files: `./01-architecture.md`, `./03-model.md`, `./05-usecases.md`.

Additional context for issue #5 (User Feedback — base bundle concept):
The user clarified that `orchestrate` is NOT a separate bundle — it belongs to a **base bundle** that is offered by default during installation. The base bundle should be pre-selected (checked by default) in the interactive wizard, while other bundles (like `rdpi`) are optional and not pre-selected. This affects:

- **03-model.md**: The `Bundle` interface and class diagram need a `name: string` field (issue #1) AND a `default: boolean` field (or equivalent mechanism) to mark the base bundle as default. The `Manifest` type or `manifest.json` schema should reflect that one bundle is the base bundle. Review the class diagram and TypeScript interfaces for consistency.
- **05-usecases.md**: UC-1 (first-time setup wizard) must show the base bundle pre-selected by default. UC-2 (CLI install) should clarify behavior when installing the base bundle vs optional bundles. Update any code snippets that reference `bundle.name` — either add `name` to the interface or use the `Record` key (per issue #1).
- **01-architecture.md**: Add a `## Constraints` section listing: Node.js >= 22 (Q12), ESM with `"type": "module"` (Q13), TypeScript, minimal dependencies. Reference Q12 and Q13. Also update the template source organization section if the base bundle concept changes how `src/templates/` is structured.

Fix only your assigned issues. Do not modify other aspects of these documents.

---

## Phase 6: Fix issues #2, #3

- **Agent**: `rdpi-redraft`
- **Output**: `06-testcases.md`
- **Depends on**: —
- **Retry limit**: 1
- **Review issues**: #2, #3

### Prompt

Read REVIEW.md at `./REVIEW.md`.
Your assigned issues: #2, #3.
Affected file: `./06-testcases.md`.

Add the following missing test cases to the test case table in `06-testcases.md`:

**For issue #2 (path traversal validation — R9):**
- A unit test case for malicious `target` field with `..` traversal (e.g., `../../.bashrc`) — verify the installer rejects it.
- A unit test case for absolute path in `target` field (e.g., `/etc/passwd` or `C:\Windows\System32\...`) — verify rejection.
- A unit test case verifying that resolved install path cannot escape the install root directory.

**For issue #3 (cross-platform paths — R3):**
- A unit test case verifying that manifest `target` paths using `/` separators are correctly resolved on Windows via `node:path.join()` or `node:path.resolve()`.

Reference 08-risks.md for risk details: R9 (path traversal / command injection) and R3 (cross-platform path handling). Place the new test cases in the appropriate category section of the existing test table. Use the next available test case IDs following the existing numbering scheme.

Fix only your assigned issues. Do not modify other test cases or sections.

---

## Phase 7: Re-review after Redraft Round 1

- **Agent**: `rdpi-design-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 5, 6
- **Retry limit**: 2

### Prompt

Re-review the design documents modified in Redraft Round 1 of the 02-design stage.

**Read these files:**
- REVIEW.md: `./REVIEW.md` (original review with issues #1–#4 + user feedback)
- TASK.md: `../TASK.md`
- Research README: `../01-research/README.md`
- Open questions (user decisions): `../01-research/03-open-questions.md`

**Modified files to verify:**
- `./01-architecture.md` — should now have a `## Constraints` section (issue #4) and updated template organization reflecting base bundle concept (issue #5)
- `./03-model.md` — `Bundle` interface should have `name` field (issue #1), base bundle mechanism (issue #5), class diagram and TypeScript interfaces must be consistent
- `./05-usecases.md` — UC-1 should show base bundle pre-selected (issue #5), `bundle.name` references should be consistent with model (issue #1)
- `./06-testcases.md` — should have new test cases for path traversal validation (issue #2) and cross-platform paths (issue #3)

**Unmodified files to cross-check for consistency:**
- `./02-dataflow.md`
- `./04-decisions.md`
- `./07-docs.md`
- `./08-risks.md`

**Review criteria:**
1. Verify each of the 5 original issues (#1–#4 + user feedback #5) is resolved per REVIEW.md descriptions
2. Verify internal consistency between modified files and unmodified files
3. Verify the base bundle concept is coherent across architecture, model, and use cases
4. Verify new test cases reference correct risk IDs and follow existing table format
5. Run the full 10-item quality checklist from the original review — all items must PASS

Update `README.md` with the re-review results. If all issues are resolved and the checklist passes, set status to `Approved`. If issues remain, set status to `Not Approved` and document remaining issues.

---

# Redraft Round 2

## Phase 8: Fix issue #1

- **Agent**: `rdpi-redraft`
- **Output**: `07-docs.md`
- **Depends on**: —
- **Retry limit**: 1
- **Review issues**: #1

### Prompt

Read REVIEW.md at `./REVIEW.md`.
Your assigned issue: #1.
Affected file: `./07-docs.md`.

In `./07-docs.md` §5 (Bundles), replace the bundle name `orchestrate` with `base`. The `base` bundle contains the `orchestrate` skill — the bundle itself is called `base`, not `orchestrate`. The listing should read "`base`, `rdpi`" (or equivalent) instead of "`orchestrate`, `rdpi`".

Fix only this issue. Do not modify any other content in the file.

---

## Phase 9: Re-review after Redraft Round 2

- **Agent**: `rdpi-design-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 8
- **Retry limit**: 2

### Prompt

Re-review the design document modified in Redraft Round 2 of the 02-design stage.

**Read these files:**
- REVIEW.md: `./REVIEW.md` (review with issue #1: stale bundle name in 07-docs.md)
- TASK.md: `../TASK.md`
- Research README: `../01-research/README.md`
- Open questions (user decisions): `../01-research/03-open-questions.md`

**Modified file to verify:**
- `./07-docs.md` — §5 (Bundles) should now list `base` instead of `orchestrate` as the bundle name

**Cross-check for consistency:**
- `./01-architecture.md` — verify `base` bundle naming is consistent
- `./03-model.md` — verify `base` bundle naming is consistent
- `./05-usecases.md` — verify `base` bundle naming is consistent

**Review criteria:**
1. Verify issue #1 from Redraft Round 2 REVIEW.md is resolved — `07-docs.md` §5 says `base`, not `orchestrate`
2. Verify bundle naming consistency across all design documents — every document should refer to the default bundle as `base`
3. Run the full 10-item quality checklist — all items must PASS

Update `README.md` with the re-review results. If all issues are resolved and the checklist passes, set status to `Approved`. If issues remain, set status to `Not Approved` and document remaining issues.

---

# Redraft Round 3

## Phase 10: Fix issues #1, #2, #3

- **Agent**: `rdpi-redraft`
- **Output**: `02-dataflow.md`, `06-testcases.md`
- **Depends on**: 9
- **Retry limit**: 2
- **Review issues**: #1, #2, #3

### Prompt

Read REVIEW.md at `./REVIEW.md`.
Your assigned issues: #1, #2, #3.

All three issues are identical in nature: replace the stale bundle name `orchestrate` with `base` in illustrative examples.

**Affected files and locations:**

1. `./02-dataflow.md` — §5, code block after "Output format:". The check command output table shows `orchestrate 1.0.0 1.0.0 ✓ Up to date`. Replace `orchestrate` with `base` in the bundle name column.

2. `./06-testcases.md` — test case T19, Expected Output column. Says `Available: orchestrate, rdpi`. Replace with `Available: base, rdpi`.

3. `./06-testcases.md` — test case T32, Description and Input columns. Uses `astp install orchestrate --target project`. Replace `orchestrate` with `base` in both the Description and Input.

**Constraints:**
- Change ONLY the three locations described above. Do not modify anything else.
- Do not alter structure, formatting, or surrounding text.

---

## Phase 11: Re-review after Redraft Round 3

- **Agent**: `rdpi-design-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 10
- **Retry limit**: 2

### Prompt

Re-review the design documents modified in Redraft Round 3 of the 02-design stage. This is the FINAL redraft round — apply strict scrutiny.

**Read these files:**
- REVIEW.md: `./REVIEW.md` (3 Low-severity issues: stale `orchestrate` → `base` in examples)
- TASK.md: `../TASK.md`
- Research README: `../01-research/README.md`
- Open questions (user decisions): `../01-research/03-open-questions.md`

**Modified files to verify:**
- `./02-dataflow.md` — §5, check command output example must show `base`, not `orchestrate`
- `./06-testcases.md` — T19 Expected Output must say `Available: base, rdpi`, not `orchestrate, rdpi`
- `./06-testcases.md` — T32 Description and Input must say `astp install base`, not `astp install orchestrate`

**Cross-check for consistency:**
Scan ALL design documents for any remaining occurrence of `orchestrate` used as a bundle name (legitimate uses of "orchestrate" as a verb or the orchestrate skill name are fine — only the bundle name `orchestrate` is incorrect; it should be `base`):
- `./01-architecture.md`
- `./02-dataflow.md`
- `./03-model.md`
- `./04-decisions.md`
- `./05-usecases.md`
- `./06-testcases.md`
- `./07-docs.md`

**Review criteria:**
1. Verify all 3 issues from Redraft Round 3 REVIEW.md are resolved
2. Verify NO remaining occurrences of `orchestrate` as a bundle name across all design documents
3. Run the full 10-item quality checklist — all items must PASS

Update `README.md` with the re-review results. If all issues are resolved and the checklist passes, set status to `Approved`. If any issue remains, set status to `Not Approved` and document remaining issues.

---
