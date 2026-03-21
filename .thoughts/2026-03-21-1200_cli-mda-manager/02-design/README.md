---
title: "Design: CLI MDA Manager"
date: 2026-03-22
status: Approved
feature: "Node.js CLI tool (astp) for managing MDA files — skills, agents, instructions"
research: "../01-research/README.md"
rdpi-version: b0.5
---

## Overview

Full technical design for `astp` — a Node.js CLI tool that manages MDA files (skills, agents, instructions, stage definitions) by fetching versioned template bundles from GitHub and installing them to project-level (`.github/`) or user-level (`~/.copilot/`) targets. The design resolves five open research questions (Q1, Q3, Q4, Q5, Q9) via six ADRs, and respects all eight user decisions (Q2, Q6–Q8, Q10–Q13). The bundle model distinguishes a **base** bundle (pre-selected by default, contains the orchestrate skill) from optional add-on bundles (e.g., rdpi).

## Goals

- Define module architecture with clear component boundaries (entry → commands → core → UI layers)
- Resolve all high-priority open questions from research via traceable ADRs
- Specify data flows for all three commands (install, update, check) plus interactive wizard
- Define the domain model (manifest, bundles, installed file metadata) as the CLI↔template contract
- Provide test strategy and risk mitigations covering identified risks
- Keep documentation impact proportional to a greenfield CLI project

## Non-Goals

- Implementation code or build configuration details (deferred to Plan/Implement stages)
- Multi-agent support beyond VS Code Copilot (architecture extension point noted, not designed)
- Individual item install outside bundles (noted as future extension, not designed for v0.1.0)
- Offline-first mode or manifest caching (v0.1.0 requires network)

## Documents

- [Architecture](./01-architecture.md) — C4 diagrams (Level 2, Level 3), module responsibility zones, constraints, template source organization, install target mapping, extension points
- [Data Flow](./02-dataflow.md) — Sequence diagrams for wizard, install, update, check flows; file lifecycle state diagram; manifest fetch and template download details
- [Domain Model](./03-model.md) — Entity relationships (class diagram), TypeScript interfaces, frontmatter metadata schema, hash computation algorithm, manifest.json schema
- [Decisions](./04-decisions.md) — 6 ADRs: template distribution (giget), versioning (semver manifest), CLI framework (Commander.js), prompts (@clack/prompts), decoupling contract (manifest-driven), frontmatter metadata (astp-* prefixed fields)
- [Use Cases](./05-usecases.md) — 5 primary use cases (wizard, CLI install, check, update with modifications, CI/CD) + 7 edge cases, with terminal interaction mockups and illustrative TypeScript
- [Test Strategy](./06-testcases.md) — 46 test cases (unit/integration/E2E), edge case coverage, performance criteria, correctness verification plan
- [Documentation Impact](./07-docs.md) — README sections needed, --help text notes, template author documentation scope
- [Risk Analysis](./08-risks.md) — 15 risks with probability/impact/strategy/mitigation, detailed plans for 7 high-impact risks

## Key Decisions

- **ADR-1**: Template distribution via **giget** (tarball fetch) for bundles + native `fetch()` for manifest retrieval — decouples template versioning from CLI releases [ref: Q1]
- **ADR-2**: **Semver per bundle** in central `manifest.json` for remote versioning, with per-file SHA-256 content hashes in local frontmatter for modification detection [ref: Q3]
- **ADR-3**: **Commander.js** as CLI framework — stable (153M downloads, v14, 0 deps) over pre-1.0 Citty [ref: Q4]
- **ADR-4**: **@clack/prompts** for interactive UX — multiselect, spinner, intro/outro, group() in a single library [ref: Q5]
- **ADR-5**: **Manifest-driven** CLI↔template contract — `manifest.json` with `schemaVersion` is the sole contract; CLI hard-codes no file paths or bundle names [ref: Q9]
- **ADR-6**: **`astp-*` prefixed frontmatter fields** injected into each installed file (source, bundle, version, hash); files without frontmatter get a new block prepended [ref: Q7]

## Quality Review

> Final re-review after Redraft Round 3. All 3 requested fixes verified. Full consistency scan of all 8 design documents completed. One new Low-severity residual found in 04-decisions.md.

### Checklist

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Design decisions trace to research findings | PASS | All 6 ADRs cite specific research sections with `[ref: ...]` links. ADR-1→external-research §3; ADR-2→external-research §4, Q3; ADR-3→external-research §1; ADR-4→external-research §2; ADR-5→Q9; ADR-6→Q7, Q8, codebase-analysis §4. User decisions (Q2, Q6–Q8, Q10–Q13) reflected in architecture, dataflow, and use cases. Constraints section (arch) traces to Q12, Q13. |
| 2 | ADRs have Status, Context, Options, Decision, Consequences | PASS | All 6 ADRs (04-decisions.md) follow the full template: Status (Proposed), Context (with problem statement and research refs), Options Considered (2–4 each with pros/cons), Decision (specific choice with rationale), Consequences (positive/negative/risks). |
| 3 | Mermaid diagrams present and conformant | PASS | 10 diagrams total: 3 in architecture (C4 L2, C4 L3, module imports), 5 in dataflow (4 sequence + 1 state), 1 in model (class diagram with `default` field on Bundle). All have titles via `---\ntitle:` syntax. Element counts: C4 L3 ≈ 16 elements (borderline, acceptable), all others ≤ 12. Valid Mermaid syntax throughout. |
| 4 | Test strategy covers identified risks | PASS | All High-impact risks have dedicated test cases. R9→T43,T44,T45; R3→T46; R2→T01-T06,T25; R4→T29-T30; R5→T13-T14; R6→T36-T37; R12→T39; R13→T12-T15; R14→T07. R7/R8/R10/R11/R15 are process/acceptance risks not directly testable. |
| 5 | docs.md is concise and proportional to existing docs/demos | PASS | `docs/` is empty, no `apps/demos/` exists. 07-docs.md is ~40 lines covering 3 sections (README plan, --help notes, template author docs). Proportional to a greenfield project. Correctly references `base` bundle. |
| 6 | docs.md describes WHAT not HOW (no JSDoc, no full drafts) | PASS | Lists section headings and bullet-point scope for README and CONTRIBUTING. No JSDoc proposals, no full-text drafts, no code documentation specifics. |
| 7 | No implementation details or actual code | PASS | TypeScript in use cases (05-usecases.md) is illustrative — shows module interaction patterns with pseudocode comments. Interface definitions in model (03-model.md) are design-level contracts, not implementation. No build scripts, no config files, no production code. |
| 8 | Research open questions addressed or deferred | PASS | All 5 design-deferred questions have ADRs: Q1→ADR-1, Q3→ADR-2, Q4→ADR-3, Q5→ADR-4, Q9→ADR-5. All 8 user decisions respected: Q2→arch §6; Q6→dataflow §2-5; Q7→ADR-6; Q8→dataflow §4; Q10→dataflow §2, UC-1; Q11→dataflow §1; Q12→arch Constraints; Q13→arch Constraints. |
| 9 | Risk analysis has actionable mitigations for high-impact risks | PASS | 15 risks identified. All High-impact risks (R1, R2, R5, R6, R7, R9) have detailed mitigation plans in 08-risks.md with specific actions. R9 mitigation backed by T43-T45 test cases. |
| 10 | Internal consistency (arch/dataflow/model/usecases) | PASS | Full consistency scan completed across all 8 design documents. All Redraft Round 3 fixes verified. Architecture, dataflow, model, and usecases are structurally consistent. One cosmetic residual noted in Issues Found (04-decisions.md ADR-1 Consequences — does not affect design logic or interfaces). |

### Redraft Round 3 — Issue Resolution

| # | Original Issue | Status | Verification |
|---|---------------|--------|-------------|
| 1 | 02-dataflow.md §5 check output uses `orchestrate` instead of `base` | ✅ Resolved | §5 code block now shows `base 1.0.0 1.0.0 ✓ Up to date`. Confirmed via full-text search — zero occurrences of `orchestrate` as bundle name in 02-dataflow.md. |
| 2 | 06-testcases.md T19 error message uses `orchestrate` instead of `base` | ✅ Resolved | T19 Expected Output now reads `Available: base, rdpi`. Confirmed. |
| 3 | 06-testcases.md T32 CLI command uses `orchestrate` instead of `base` | ✅ Resolved | T32 Description and Input now use `astp install base --target project`. Output path `skills/orchestrate/SKILL.md` correctly retained (skill directory, not bundle name). |

### Redraft Round 2 — Issue Resolution

| # | Original Issue | Status | Verification |
|---|---------------|--------|-------------|
| 1 | 07-docs.md uses old bundle name `orchestrate` instead of `base` | ✅ Resolved | 07-docs.md now lists bundles as `base`, `rdpi`. Zero occurrences of `orchestrate` in 07-docs.md. |

### Redraft Round 1 — Issue Resolution

| # | Original Issue | Status | Verification |
|---|---------------|--------|-------------|
| 1 | `Bundle` interface missing `name` field | ✅ Resolved | 03-model.md §3.1 `Bundle` interface now has `name: string`. Consistent with class diagram (§2), manifest schema (§4.1), and use case references. |
| 2 | No test case for path traversal (R9) | ✅ Resolved | 06-testcases.md: T43, T44, T45 — all High priority, all reference R9. |
| 3 | Cross-platform path test missing (R3) | ✅ Resolved | 06-testcases.md: T46 — Medium priority, references R3. |
| 4 | Constraints not consolidated | ✅ Resolved | 01-architecture.md `## Constraints` section present with Node.js >= 22, ESM, TypeScript, minimal deps. |
| 5 | Base bundle concept (user feedback) | ✅ Resolved | Bundle renamed from "orchestrate" to "base" in architecture, model, use cases, and docs. |

### Documentation Proportionality

The project has an empty `docs/` directory and no `apps/demos/` folder — it is a greenfield CLI project with zero existing documentation. The planned documentation in 07-docs.md is minimal and appropriate: a README.md with 7 sections, brief `--help` guidance, and a short template author reference (CONTRIBUTING.md section or `src/templates/README.md`). Proportional — not over-specified for a small CLI tool, not under-specified given that the project has no docs at all.

### Issues Found

1. **04-decisions.md ADR-1 Consequences uses `orchestrate bundle` instead of `base bundle`**
   - **What's wrong**: ADR-1 Consequences (Negative) says "Slight overhead from tarball extraction for the 1-file orchestrate bundle" — should say "1-file base bundle".
   - **Where**: 04-decisions.md, ADR-1, Consequences section, Negative bullet
   - **What's expected**: Replace "orchestrate bundle" with "base bundle".
   - **Severity**: **Low** — single word in an ADR Consequences sentence; does not affect the decision, architecture, or any interface. The sentence correctly describes the overhead concern; only the bundle name label is stale.

## Next Steps

Proceeds to Plan stage after human review. All 10 checklist items pass. 9 issues across 3 redraft rounds resolved. 1 new Low-severity cosmetic residual documented (04-decisions.md ADR-1 — stale bundle name in consequences text).
