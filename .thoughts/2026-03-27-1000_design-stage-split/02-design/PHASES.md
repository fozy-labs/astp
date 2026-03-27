---
title: "Phases: 02-design"
date: 2026-03-27
stage: 02-design
---

# Phases: 02-design

## Phase 1: Core Architecture

- **Agent**: `rdpi-architect`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

You are designing changes to the RDPI pipeline's `02-design` stage template files. This is a **meta-task**: the "codebase" is the template system in `templates/rdpi/`, not application code. All design decisions must trace back to research at `../01-research/`.

Read these files before starting:
- Research README: `../01-research/README.md`
- Codebase analysis: `../01-research/01-codebase-analysis.md`
- Supporting infrastructure: `../01-research/02-supporting-infrastructure.md`
- Open questions with user answers: `../01-research/03-open-questions.md`
- Current design skill: `@/templates/rdpi/skills/rdpi-02-design/SKILL.md`
- Current architect agent: `@/templates/rdpi/agents/rdpi-architect.agent.md`
- Current design reviewer agent: `@/templates/rdpi/agents/rdpi-design-reviewer.agent.md`
- Current stage creator agent: `@/templates/rdpi/agents/rdpi-stage-creator.agent.md`

Design the following, producing `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`:

**Architecture** (`01-architecture.md`):
- New phase structure for `rdpi-02-design/SKILL.md` where each design document is a separate designer tier (per-document tiers, user decision Q1). Tier ordering: most-defining documents first (architecture → dataflow → model → decisions → usecases → docs), with QA and design-reviewer after all tiers.
- The first designer tier produces `00-short-design.md` alongside its main document. Format: structured template with sections Direction, Key Decisions, Scope Boundaries, Research References (1–2 pages max, user decision Q10).
- Correction mechanism: each tier after the first may overwrite earlier tier outputs in-place when finding inaccuracies, plus append to a single cumulative correction log `09-corrections.md` in table format: `| Tier | File Modified | Section | Original | Corrected | Rationale |` (user decisions Q2, Q3).
- Design-reviewer integration: minimum 2 invocations at the end — one general review of all design documents, one dedicated to verifying the correction log for internal consistency (user decisions Q4, Q5, Q7). No implement-reviewer in design stage.
- `astp-version` field added to all stage README.md frontmatter Output Conventions across all four stage skills, not just design (user decisions Q8, Q9, Q12, Q13). The value is injected at install time, same mechanism as existing `astp-version` in template files.
- Mermaid diagrams: C4 component diagram of the redesigned design stage, sequence diagram of tier-to-tier correction flow.

**Data Flow** (`02-dataflow.md`):
- Map the data flow between per-document tiers: which files each tier reads, writes, and may correct.
- Show how the correction log accumulates across tiers.
- Show how the design-reviewer reads all outputs including the correction log.
- Sequence diagrams for: (a) normal tier execution (no corrections needed), (b) tier finding and correcting an earlier document, (c) design-reviewer discovering correction log inconsistency.

**Domain Model** (`03-model.md`):
- Model the entities in the redesigned skill file: Tier, DesignDocument, CorrectionEntry, ReviewPass, ShortDesign.
- Define relationships: which tiers own which documents, correction log entry structure, reviewer scope.
- TypeScript-style type definitions for the conceptual model (these are design artifacts, not runtime code).

**Decisions** (`04-decisions.md`):
- ADR-1: Per-document tiers vs. grouped tiers (decided: per-document, Q1). Document consequences: phase count increases, 6-phase cap must be addressed.
- ADR-2: In-place overwrite + correction log vs. annotation or leave-unchanged (decided: overwrite + log, Q2).
- ADR-3: Single cumulative correction log vs. per-tier logs (decided: single cumulative, Q3).
- ADR-4: Design-reviewer only vs. implement-reviewer participation (decided: design-reviewer only, Q4).
- ADR-5: 00-short-design.md produced by first tier vs. stage creator (decided: first tier, Q6).
- ADR-6: astp-version field in stage README.md using existing naming convention (decided: Q8, Q9, Q13).
- ADR-7: How the 6-phase hard cap is reconciled with per-document tiers (6+ tiers + QA + 2 reviewers > 6 phases). This is a critical design tension — propose a resolution (e.g., raising the cap for design stage, grouping adjacent tiers, or making the cap context-dependent).

Constraints:
- Do NOT propose changes to the stage creator logic (user decision Q11).
- Do NOT add implement-reviewer to the design stage (user decision Q4).
- All design choices must cite specific research findings or user decisions from open questions.

---

## Phase 2: Use Cases & Docs Impact

- **Agent**: `rdpi-architect`
- **Depends on**: 1
- **Retry limit**: 2

### Prompt

You are designing changes to the RDPI pipeline's `02-design` stage template files. This is a **meta-task**: the "codebase" is the template system in `templates/rdpi/`.

Read these files before starting:
- Research README: `../01-research/README.md`
- Open questions with user answers: `../01-research/03-open-questions.md`
- Phase 1 outputs: `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`

Produce `05-usecases.md` and `07-docs.md`:

**Use Cases** (`05-usecases.md`):
- UC-1: Simple feature (< 3 components) — how tiers scale down. Which tiers are skipped? Does the correction log still exist (even if empty)?
- UC-2: Complex feature (6+ components) — full per-document tier execution with corrections arising at tier 3 that fix a tier 1 output.
- UC-3: Feature where no corrections are needed — all tiers run but correction log stays empty. How does the dedicated correction-log reviewer handle this?
- UC-4: Feature where tier N overwrites a document from tier M, then tier N+1 finds the overwrite introduced a new inconsistency — cascading correction scenario.
- UC-5: pipeline-version propagation — how `astp-version` appears in README.md frontmatter across all four stages for a freshly installed template set.

For each use case: narrative walkthrough, file state at each tier, correction log state, and final reviewer behavior. Use concrete file names and content snippets.

**Documentation Impact** (`07-docs.md`):
- Which template files change: list every file in `templates/rdpi/` that needs modification (skills, agents, instructions).
- What changes in each file: brief description of the change (not the actual content — that's for the plan stage).
- Impact on existing installed pipelines: do users need to re-install templates? Is there a migration path?
- Keep this document SHORT — only high-impact documentation changes. No JSDoc. Match existing project README style.

Constraints:
- Use cases must reference the architecture and data flow from phase 1.
- Do NOT write implementation details or actual file diffs — describe WHAT changes, not HOW.

---

## Phase 3: QA Strategy & Risks

- **Agent**: `rdpi-qa-designer`
- **Depends on**: 1, 2
- **Retry limit**: 1

### Prompt

You are designing QA strategy for changes to the RDPI pipeline's `02-design` stage template files. This is a **meta-task**: the "system under test" is the template system in `templates/rdpi/`.

Read these files before starting:
- Research README: `../01-research/README.md`
- Open questions with user answers: `../01-research/03-open-questions.md`
- All phase 1–2 outputs: `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`, `05-usecases.md`, `07-docs.md`

Produce `06-testcases.md` and `08-risks.md`:

**Test Cases** (`06-testcases.md`):
Table format: `| ID | Category | Description | Input | Expected Output | Priority |`

Categories to cover:
- **Tier ordering**: Verify that the skill file defines tiers in most-defining to least-defining order.
- **Correction mechanism**: Verify correction log table format, that overwritten files remain valid markdown with correct frontmatter, that correction entries reference real file sections.
- **00-short-design.md**: Verify it follows the structured template (Direction/Decisions/Scope/Refs), is ≤ 2 pages, and is produced by the first tier only.
- **Design-reviewer integration**: Verify minimum 2 invocations, one general + one correction-log-dedicated. Verify reviewer cannot modify design documents (existing constraint preserved).
- **astp-version propagation**: Verify `astp-version` appears in README.md frontmatter Output Conventions for all four stage skills.
- **Scaling rules**: Verify the phase cap is correctly handled for per-document tiers (address ADR-7 resolution from architecture).
- **Backward compatibility**: Verify that changes to non-design stage skills (adding astp-version) don't break existing phase structures.

**Risks** (`08-risks.md`):
Table format: `| ID | Risk | Probability | Impact | Strategy | Mitigation |`

Risks to assess:
- Per-document tiers exceeding the 6-phase cap and how the chosen resolution handles edge cases.
- Cascading corrections destabilizing design documents (tier N corrects tier M, tier N+1 corrects the correction).
- Correction log growing unmanageably large on complex features.
- Stage creator misinterpreting the new phase structure in the redesigned skill.
- astp-version changes in non-design stage skills causing unexpected side effects.
- Design-reviewer dedicated to correction log having nothing to review on simple features.

Include detailed mitigation plans for all high-impact risks.

---

## Phase 4: Design Review

- **Agent**: `rdpi-design-reviewer`
- **Depends on**: 1, 2, 3
- **Retry limit**: 2

### Prompt

Review all design documents for the "Design Stage Split" feature.

Read these files:
- Research README: `../01-research/README.md`
- Research codebase analysis: `../01-research/01-codebase-analysis.md`
- Research supporting infrastructure: `../01-research/02-supporting-infrastructure.md`
- Open questions with user answers: `../01-research/03-open-questions.md`
- All design outputs: `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`, `05-usecases.md`, `06-testcases.md`, `07-docs.md`, `08-risks.md`

Review criteria:
1. **Research traceability**: Every design decision must trace to a research finding or user decision from open questions. Flag any unsupported claims.
2. **User decision compliance**: Verify all 13 user decisions from `03-open-questions.md` are correctly reflected in the design. Specifically check: per-document tiers (Q1), overwrite + log (Q2), single cumulative log (Q3), design-reviewer only (Q4), reviewer at end only (Q5), first tier produces 00-short-design.md (Q6), minimum 2 reviewer invocations (Q7), astp-version convention (Q8/Q13), stage README only (Q9), structured template (Q10), design skill only for stage creator (Q11), pipeline-version in all stages (Q12).
3. **Internal consistency**: Check that architecture, dataflow, model, and decisions don't contradict each other. Verify use cases align with the architecture. Verify test cases cover the architecture.
4. **ADR completeness**: All ADRs must have Status, Context, Options with pros/cons, Decision, Consequences.
5. **Phase cap resolution**: ADR-7 must propose a concrete resolution for the 6-phase cap vs. per-document tiers tension. Check feasibility.
6. **Mermaid conformance**: Diagrams titled, ≤ 15-20 elements, properly formatted.
7. **Docs proportionality**: `07-docs.md` should be short and focused — flag if bloated.
8. **Risk coverage**: Every architectural risk should appear in `08-risks.md` with actionable mitigations.

Write/update `README.md` with: Overview, Goals, Non-Goals, Documents (with links), Key Decisions summary, Quality Review checklist table, Next Steps.

---

# Redraft Round 1

## Phase 5: Fix issues #1, #2

- **Agent**: `rdpi-redraft`
- **Output**: `03-model.md`, `05-usecases.md`
- **Depends on**: 1, 2, 3, 4
- **Retry limit**: 1
- **Review issues**: 1, 2

### Prompt

Read REVIEW.md at `.thoughts/2026-03-27-1000_design-stage-split/02-design/REVIEW.md`.
Your assigned issues: #1, #2.
Affected files: `03-model.md`, `05-usecases.md`.
Fix only your assigned issues.

---

## Phase 6: Re-review after Redraft Round 1

- **Agent**: `rdpi-design-reviewer`
- **Depends on**: 5
- **Retry limit**: 2

### Prompt

Re-verify the files modified in Redraft Round 1 for the "Design Stage Split" feature.

Read these files:
- REVIEW.md: `.thoughts/2026-03-27-1000_design-stage-split/02-design/REVIEW.md`
- Modified files: `03-model.md`, `05-usecases.md`
- Architecture (for consistency check): `01-architecture.md`
- Original review criteria from Phase 4 apply — specifically check:
  - `03-model.md`: class diagram cardinality now uses variable notation (`"4..10"` or `"*"`) instead of hardcoded `"9"`, consistent with scaling rules and TypeScript type.
  - `05-usecases.md`: UC-1 skip condition explicitly states that corrections existing forces Pass 2 even on simple features.
- Verify no regressions were introduced in the modified files.

Update `README.md` Quality Review section to reflect the re-review outcome.
