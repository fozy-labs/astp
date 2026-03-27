---
title: "Phase 1: Design Skill Rewrite"
date: 2026-03-28
stage: 03-plan
role: rdpi-planner
---

## Goal

Rewrite `templates/rdpi/skills/rdpi-02-design/SKILL.md` to replace the current 4-phase architect model with the per-document tier structure (9 phases), correction mechanism, `00-short-design.md` specification, two-pass reviewer, updated scaling rules (cap 10), and `astp-version` in Output Conventions.

## Dependencies

- **Requires**: None
- **Blocks**: Phase 2 (Agent Updates), Phase 3 (astp-version Propagation)

## Execution

Sequential — must complete before any other phase.

## Tasks

### Task 1.1: Rewrite Available Roles table

- **File**: `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- **Action**: Modify
- **Description**: Update the roles table to reflect the new invocation limits needed for per-document tiers.
- **Details**:
  - `rdpi-architect`: change from `max 2 invocations` to `max 6 invocations, retry 2` (one per designer tier)
  - `rdpi-qa-designer`: keep `max 2 invocation, retry 1` (unchanged)
  - `rdpi-design-reviewer`: change from `max 2 invocation, retry 2` to `max 3 invocation, retry 2` (two passes + 1 buffer for redraft)
  - [ref: ../02-design/01-architecture.md#New Phase Structure]

### Task 1.2: Rewrite Typical Phase Structure table

- **File**: `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- **Action**: Modify
- **Description**: Replace the current 4-phase table with the 9-phase per-document tier table.
- **Details**:
  - Phase 1: `rdpi-architect` → `01-architecture.md`, `00-short-design.md` (depends: —)
  - Phase 2: `rdpi-architect` → `02-dataflow.md` (depends: 1)
  - Phase 3: `rdpi-architect` → `03-model.md` (depends: 2)
  - Phase 4: `rdpi-architect` → `04-decisions.md` (depends: 3)
  - Phase 5: `rdpi-architect` → `05-usecases.md` (depends: 4)
  - Phase 6: `rdpi-architect` → `07-docs.md` (depends: 5)
  - Phase 7: `rdpi-qa-designer` → `06-testcases.md`, `08-risks.md` (depends: 6)
  - Phase 8: `rdpi-design-reviewer` → Updates `README.md` general review (depends: 7)
  - Phase 9: `rdpi-design-reviewer` → Updates `README.md` correction log review (depends: 8)
  - Add "corrections (if any)" as additional output for phases 2–6
  - Update the descriptive paragraph below the table: "Phases are sequential. Each designer tier (1–6) produces one primary document and may correct earlier tier documents. See Correction Mechanism and Scaling Rules for phase reduction."
  - [ref: ../02-design/01-architecture.md#New Phase Structure]

### Task 1.3: Add Correction Mechanism section

- **File**: `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- **Action**: Modify
- **Description**: Add a new `## Correction Mechanism` section after the Typical Phase Structure section (before Phase Prompt Guidelines).
- **Details**:
  This section encodes the 6 correction rules from the architecture:
  1. Tier 1 cannot correct anything (nothing precedes it).
  2. Tiers 2–6 MAY overwrite earlier tier documents in-place when discovering inaccuracies.
  3. Every overwrite MUST be logged in `09-corrections.md` with table row: `| Tier | File Modified | Section | Original | Corrected | Rationale |`.
  4. Corrections must be factual fixes (contradictions, incorrect references, stale assumptions), NOT stylistic changes or opinion-based rewrites.
  5. If a tier has no corrections, it does not touch `09-corrections.md`.
  6. `09-corrections.md` is created by the first tier that makes a correction. If no corrections occur, the file does not exist.

  Include the `09-corrections.md` format template (frontmatter + table header) from [ref: ../02-design/01-architecture.md#09-corrections.md Format].

  Include the append-only rule: later tiers MUST NOT modify earlier tier correction entries. If a later tier disagrees, it makes its own correction and appends a new entry referencing the earlier one. [ref: ../02-design/02-dataflow.md#Correction Entry Lifecycle]

### Task 1.4: Add 00-short-design.md Specification section

- **File**: `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- **Action**: Modify
- **Description**: Add a `## 00-short-design.md` section (after Correction Mechanism, before Phase Prompt Guidelines) specifying the document format and constraints.
- **Details**:
  Include the format template from [ref: ../02-design/01-architecture.md#00-short-design.md Specification]:
  - Frontmatter: `title`, `date`, `stage: 02-design`, `role: rdpi-architect`
  - Sections: `## Direction` (2–3 paragraphs), `## Key Decisions` (up to 7 items), `## Scope Boundaries` (`### In Scope`, `### Out of Scope`), `## Research References` (3–5 refs)
  - Constraints: 1–2 pages max. Must not duplicate `01-architecture.md` content — provides direction, not component details.
  - Produced only by tier 1 alongside `01-architecture.md`.

### Task 1.5: Rewrite Phase Prompt Guidelines

- **File**: `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- **Action**: Modify
- **Description**: Replace the current 4-phase prompt guidelines with guidelines for all 9 phases.
- **Details**:
  Replace subsections:
  - **Phase 1 — Architecture + Short Design**: Tier 1. Reads research. Produces `01-architecture.md` + `00-short-design.md`. No correction authority.
  - **Phases 2–6 — Designer Tiers**: Generic guideline for tiers 2–6. Each reads all research + all prior design docs + `00-short-design.md` + `09-corrections.md` (if exists). Produces its primary document. Has correction authority over earlier documents. Must log corrections.
    - Phase 2: `02-dataflow.md`
    - Phase 3: `03-model.md`
    - Phase 4: `04-decisions.md`
    - Phase 5: `05-usecases.md`
    - Phase 6: `07-docs.md` (with existing anti-bloat `<critical>` rule preserved)
  - **Phase 7 — QA Strategy & Risks**: QA designer. Reads all design docs. No correction authority. Produces `06-testcases.md`, `08-risks.md`. (Preserve existing content from current Phase 3 guideline)
  - **Phase 8 — General Design Review**: Reviewer Pass 1. Reads all docs. Existing 10-item checklist + 3 new items: `00-short-design.md` exists/aligned/sized, correction log entries are factual, corrected documents reflect logged corrections. Writes `README.md`.
  - **Phase 9 — Correction Log Review**: Reviewer Pass 2. Dedicated to `09-corrections.md` verification. If exists: cross-reference each entry against file state, check for cascading inconsistencies, verify rationale. If absent: spot-check cross-document consistency, confirm absence is legitimate. Appends `### Correction Log Review` subsection to `README.md`.
  - [ref: ../02-design/01-architecture.md#Design Reviewer Integration]
  - [ref: ../02-design/02-dataflow.md#Design Reviewer Data Flow]

### Task 1.6: Update Output Conventions

- **File**: `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- **Action**: Modify
- **Description**: Update Output Conventions to include `astp-version` in README.md frontmatter and add `09-corrections.md` and `00-short-design.md` to the document conventions.
- **Details**:
  - Change README.md frontmatter fields from `(title, date, status, feature, research)` to `(title, date, status, feature, research, astp-version)`
  - Add: "`00-short-design.md` frontmatter: `(title, date, stage, role)` — structured per 00-short-design.md Specification section"
  - Add: "`09-corrections.md` frontmatter: `(title, date, stage, role)` — created on-demand per Correction Mechanism section"
  - Preserve existing conventions (ADR numbering, Mermaid rules, research cross-references)
  - [ref: ../02-design/01-architecture.md#astp-version in Stage README.md]

### Task 1.7: Rewrite Scaling Rules

- **File**: `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- **Action**: Modify
- **Description**: Replace the current scaling rules (including the 6-phase cap) with the new rules from the design.
- **Details**:
  Replace with:
  - **Full feature** (all design documents needed): 9 phases (6 designer tiers + QA + 2 reviewer passes)
  - **Medium feature** (no usecases or docs needed): omit tiers 5 and 6 → 7 phases (4 designer tiers + QA + 2 reviewer passes)
  - **Simple feature** (< 3 components): merge tiers 1–4 into 2 phases (architecture+dataflow, model+decisions), omit tiers 5–6 → 5 phases (2 merged tiers + QA + 2 reviewer passes)
  - **Correction log reviewer pass** may be skipped if `09-corrections.md` does not exist AND feature is simple → minimum 4 phases
  - **Never exceed 10 total phases** for design stage (replaces the 6-phase cap)
  - [ref: ../02-design/01-architecture.md#Scaling Rules Update]
  - [ref: ../02-design/04-decisions.md#ADR-7]

## Verification

- [ ] File `templates/rdpi/skills/rdpi-02-design/SKILL.md` has valid YAML frontmatter (`name`, `description`)
- [ ] Phase structure table lists exactly 9 phases with correct agent assignments and dependencies
- [ ] Correction Mechanism section contains all 6 rules and `09-corrections.md` format template
- [ ] `00-short-design.md` specification present with format template and constraints
- [ ] Phase Prompt Guidelines cover all 9 phases (tiers 1–6, QA, reviewer pass 1, reviewer pass 2)
- [ ] Reviewer Pass 1 checklist includes original 10 items + 3 new items
- [ ] Reviewer Pass 2 handles both present and absent `09-corrections.md`
- [ ] Output Conventions include `astp-version` in README.md frontmatter fields
- [ ] Scaling rules specify cap of 10, define full/medium/simple/minimum phase counts
- [ ] All preserved content from original file (Mermaid rules, ADR numbering, research cross-ref conventions) is intact
- [ ] No references to old 4-phase structure remain
