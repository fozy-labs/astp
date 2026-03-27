---
title: "Phase 2: Agent Updates"
date: 2026-03-28
stage: 03-plan
role: rdpi-planner
---

## Goal

Update the architect and design-reviewer agent templates to support the new per-document tier structure: add `00-short-design.md` capability and correction mechanism rules to the architect, and add two-pass review model with correction log verification to the design reviewer.

## Dependencies

- **Requires**: Phase 1 (Design Skill Rewrite)
- **Blocks**: None

## Execution

Parallel with Phase 3. The two agent files within this phase are independent and may be edited in any order.

## Tasks

### Task 2.1: Add 00-short-design.md capability to architect agent

- **File**: `templates/rdpi/agents/rdpi-architect.agent.md`
- **Action**: Modify
- **Description**: Add a new capability subsection for `00-short-design.md` under the existing `## Capabilities` section, alongside the existing document subsections (`01-architecture.md`, `02-dataflow.md`, etc.).
- **Details**:
  Add a subsection `### 00-short-design.md — Design Direction Prologue` with content requirements:
  - Produced in tier 1 alongside `01-architecture.md`
  - Structure: Direction (2–3 paragraphs), Key Decisions (up to 7, one sentence each), Scope Boundaries (In Scope / Out of Scope), Research References (3–5 links)
  - Constraints: 1–2 pages max; must not duplicate architecture content; provides direction, not component details
  - Frontmatter: same as other design documents (`title`, `date`, `stage`, `role`)
  - [ref: ../02-design/01-architecture.md#00-short-design.md Specification]

### Task 2.2: Add correction mechanism rules to architect agent

- **File**: `templates/rdpi/agents/rdpi-architect.agent.md`
- **Action**: Modify
- **Description**: Add a new `## Correction Mechanism` section after the existing `## Rules` section, defining when and how the architect may correct earlier documents.
- **Details**:
  Add rules:
  - Tier 1 has no correction authority.
  - Tiers 2–6: when you find a factual inaccuracy in an earlier tier's document, overwrite the specific section in-place.
  - Every overwrite must be logged in `09-corrections.md` with table row: `| Tier | File Modified | Section | Original | Corrected | Rationale |`.
  - Corrections must be factual only: contradictions with research, incorrect cross-references, stale assumptions. Do NOT correct style, wording, or opinions.
  - If `09-corrections.md` does not exist, create it with proper frontmatter + table header before appending.
  - Do NOT modify earlier tiers' correction log entries — append-only.
  - Report corrections in the Conclusion section (e.g., "1 correction made").
  - [ref: ../02-design/01-architecture.md#Correction Mechanism]
  - [ref: ../02-design/02-dataflow.md#Correction Entry Lifecycle]

### Task 2.3: Add two-pass review model to design reviewer agent

- **File**: `templates/rdpi/agents/rdpi-design-reviewer.agent.md`
- **Action**: Modify
- **Description**: Restructure the reviewer to support two distinct passes (general review + correction log review), add new checklist items for `00-short-design.md` and correction quality, and define the Pass 2 verification process.
- **Details**:
  Changes to make:

  **A. Update introduction**: Add that the agent operates in two passes: Pass 1 (general review + synthesis) and Pass 2 (correction log verification). Each pass is a separate phase invocation.

  **B. Add Pass 1 checklist items**: Extend the existing quality review checklist (Step 2) with 3 new items:
  - `00-short-design.md` exists, is within 1–2 pages, and aligns with architecture direction
  - Correction log entries (if any) are factual, not stylistic
  - Corrected documents reflect the logged corrections accurately
  - [ref: ../02-design/01-architecture.md#Design Reviewer Integration — Pass 1]

  **C. Add Pass 2 process**: Add a new `### Pass 2 — Correction Log Review` section describing the dedicated correction log verification:
  - If `09-corrections.md` exists:
    - Each entry's "Original" matches what was actually in the file before correction
    - Each entry's "Corrected" matches current file state
    - No correction introduced a new inconsistency with other documents
    - Rationale is grounded in research or earlier design documents
  - If `09-corrections.md` does not exist:
    - Spot-check cross-document consistency for obvious issues that should have been caught
    - Confirm absence is legitimate (aligned feature) not an oversight
  - Output: Append `### Correction Log Review` subsection to Quality Review in README.md
  - [ref: ../02-design/01-architecture.md#Design Reviewer Integration — Pass 2]
  - [ref: ../02-design/02-dataflow.md#Design Reviewer Data Flow]

  **D. Update README.md output structure**: In the Output Format section, add `### Correction Log Review` as a subsection under `## Quality Review`, produced only in Pass 2. Ensure the `astp-version` field is included in the README.md frontmatter template.

## Verification

- [ ] `templates/rdpi/agents/rdpi-architect.agent.md` contains `### 00-short-design.md` capability subsection
- [ ] Architect agent has `## Correction Mechanism` section with factual-only constraint, append-only log rule, and `09-corrections.md` creation instructions
- [ ] `templates/rdpi/agents/rdpi-design-reviewer.agent.md` describes two-pass model (Pass 1 = general review, Pass 2 = correction log)
- [ ] Reviewer Pass 1 checklist has original items + 3 new items (short-design, correction factuality, correction accuracy)
- [ ] Reviewer Pass 2 process covers both "corrections exist" and "no corrections" paths
- [ ] Reviewer output format includes `### Correction Log Review` subsection
- [ ] README.md frontmatter template in reviewer includes `astp-version` field
- [ ] Existing agent constraints preserved: architect `[ref:]` convention, reviewer "do NOT modify design documents" rule
- [ ] No changes to agent YAML frontmatter (`name`, `description`, `user-invocable`, `tools`)
