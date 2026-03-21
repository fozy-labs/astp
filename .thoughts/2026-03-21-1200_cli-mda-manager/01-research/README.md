---
title: "Research: CLI MDA Manager"
date: 2026-03-21
status: Approved
feature: "Node.js CLI tool (astp) for managing MDA files — skills, agents, instructions"
rdpi-version: b0.5
---

## Summary

Research investigated two domains for the `astp` CLI: (1) the existing repository state — its 22 MDA files, directory conventions, frontmatter patterns, bundle composition, and project configuration gaps; and (2) the Node.js CLI ecosystem — frameworks, interactive prompt libraries, template distribution strategies, and versioning approaches.

The codebase is a blank slate for CLI code: `src/` contains only an empty `templates/` directory, while `.github/` holds a fully operational AI agent setup (16 agents, 1 skill, 1 instructions file, 4 stage definitions). Critical project configuration is missing (tsconfig, eslint config, vitest config, `bin` field, `type: "module"`). The ecosystem research narrowed choices to Commander.js or Citty for parsing, @clack/prompts for interactive UX, and giget for template distribution — all aligning with the TASK.md requirement that template updates must not require a CLI release.

The key architectural decisions ahead are: template distribution mechanism (giget vs GitHub API vs hybrid), canonical template location (`src/templates/` vs `.github/`), versioning strategy (semver manifest vs git tags vs content hashes), and the manifest contract between CLI and templates. Thirteen open questions are prioritized (5 high, 5 medium, 3 low) to guide design.

## Documents

- [Codebase Analysis](./01-codebase-analysis.md) — Repository structure, MDA file organization, frontmatter patterns, bundle mapping, and project configuration state.
- [External Research](./02-external-research.md) — CLI frameworks, interactive prompt libraries, template distribution tools, versioning strategies, and npm packaging best practices.
- [Open Questions](./03-open-questions.md) — 13 prioritized questions with options, risks, and researcher recommendations.

## Key Findings

1. **22 MDA files exist** across 4 categories (16 agents, 1 skill, 1 instructions, 4 stage definitions), mapping to 2 bundles: `orchestrate` (1 file) and `rdpi` (21 files) — codebase analysis §2, §5.
2. **No CLI source code exists** — `src/` is empty; critical config files (tsconfig, eslint, vitest, `bin` entry, `type: "module"`) must be created before development begins — codebase analysis §6.9, §7.
3. **giget is the strongest template distribution candidate** — zero dependencies, 6M weekly downloads, programmatic API, cache/offline support, subdirectory fetching, and decoupled versioning via git tags — external research §3.
4. **Commander.js and Citty are the two viable CLI frameworks** — Commander is the safe choice (153M downloads, 0 deps, stable); Citty is the minimal choice (24.4 kB, 0 deps, unjs ecosystem alignment with giget, but pre-1.0) — external research §1.
5. **@clack/prompts best fits the interactive UX needs** — built-in multiselect, spinners, progress indicators, and session framing (`intro`/`outro`), used by create-svelte and create-astro — external research §2.
6. **A manifest-based versioning system is needed** — semver per bundle in a central `manifest.json` with a local tracking file (`.astp.json`) enables update detection without coupling template versions to CLI releases — external research §4, open questions Q3, Q7.
7. **The canonical template location is unresolved** — `src/templates/` vs `.github/` as source of truth is a foundational decision that affects the entire build/sync workflow and dogfooding story — open questions Q2.

## Contradictions and Gaps

1. **Frontmatter field inconsistency across research documents**: The workflow version field uses different names — `rdpi-version: b0.5` in external research, `workflow: b0.5` in open questions, absent in codebase analysis. This is a minor metadata inconsistency across the research outputs themselves.
2. **RDPI-Orchestrator naming anomaly noted but not questioned**: Codebase analysis identifies that `RDPI-Orchestrator.agent.md` uses PascalCase while all other agents use lowercase (§3). Open questions do not raise this as a concern for template handling or file naming conventions.
3. **Stage definition files lack frontmatter**: Codebase analysis notes that `.github/rdpi-stages/*.md` files have no YAML frontmatter (§4.5). This creates an asymmetry — frontmatter-based metadata injection (open questions Q7, Option 3) would not work for these files. The gap is acknowledged but not explicitly addressed in open questions.
4. **`@clack/prompts` size claim inconsistency**: External research notes the "80% smaller" marketing claim with Low confidence, since the unpacked size (244 kB) is actually larger than @inquirer/prompts (23.4 kB). This is properly flagged in the external research document (§2) with the caveat about tree-shaking, but could be confusing if referenced without context.
5. **No research on VS Code Copilot's resolution order** for project-level vs user-level configs: Open questions Q6 raises coexistence risks but notes this depends on VS Code behavior that was not researched externally.

## Quality Review

### Checklist

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | All phases produced output files | PASS | All 3 phase outputs present: 01-codebase-analysis.md, 02-external-research.md, 03-open-questions.md |
| 2 | Codebase analysis has exact file:line references | PASS | Code References section lists 25+ entries with `@/file:line` format; inline references also use line numbers (e.g., `TASK.md:57`, `RDPI-Orchestrator.agent.md:1-8`) |
| 3 | External research has source + confidence annotations | PASS | Every factual claim has `**Confidence: High/Medium/Low**` annotation; Sources section lists 13 specific npm/doc URLs |
| 4 | Open questions are actionable (context, options, risks) | PASS | All 13 questions have structured Context, Options (2–4 each), Risks, and Researcher recommendation sections; priority levels (High/Medium/Low) assigned |
| 5 | No solutions or design proposals in research | PASS | Codebase analysis is facts-only. External research provides comparative analysis without prescribing solutions. Open questions contain "Researcher recommendation" sections with evidence-based leanings — acceptable per workflow rules |
| 6 | YAML frontmatter present on all files | PASS | All 3 phase outputs have YAML frontmatter with title, date, stage, and role fields. Minor inconsistency: version field name varies (`rdpi-version` vs `workflow`; absent in codebase analysis) |
| 7 | Cross-references consistent between documents | PASS | MDA file counts (22 total, orchestrate=1, rdpi=21) consistent across all documents. TASK.md requirements referenced accurately. External research findings correctly cited in open questions |

### Issues Found

1. **Frontmatter version field name inconsistency** — External research uses `rdpi-version: b0.5`, open questions uses `workflow: b0.5`, codebase analysis omits the field entirely. Expected: consistent field name across all documents. — Severity: **Low** (metadata only, does not affect content quality)

## Next Steps

Proceeds to Design stage after human review. Design should focus on:

1. **Template distribution mechanism** (Q1) — foundational architectural decision; giget is the leading candidate.
2. **Canonical template location** (Q2) — must resolve `src/templates/` vs `.github/` before any file structure design.
3. **Versioning strategy** (Q3) and **manifest contract** (Q9) — defines the CLI↔template interface.
4. **CLI framework selection** (Q4) — Commander vs Citty; decision may follow from distribution choice (Citty aligns with giget's unjs ecosystem).
5. **v0.1.0 scope boundaries** (Q11) — determine which commands ship in first release.
