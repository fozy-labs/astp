---
title: "Risk Analysis: Design Stage Per-Document Tiers"
date: 2026-03-28
stage: 02-design
role: rdpi-qa-designer
---

# Risk Analysis

## Risk Matrix

| ID | Risk | Probability | Impact | Strategy | Mitigation |
|----|------|-------------|--------|----------|------------|
| R1 | Per-document tiers exceed 10-phase cap after ADR-7 resolution, especially with redraft scenarios | Low | High | Mitigate | Cap raised to 10 with 1-slot buffer; scaling rules reduce phases for simple features |
| R2 | Cascading corrections destabilize design documents — tier N corrects tier M, tier N+1 corrects the correction, producing oscillating content | Medium | High | Mitigate | Factual-only constraint + append-only log + reviewer Pass 2 cross-reference |
| R3 | Correction log grows unmanageably large on complex features with many inter-document dependencies | Low | Medium | Accept | Single cumulative file; agent context windows handle large tables; no structural limit needed |
| R4 | Stage creator misinterprets the new 9-phase structure when generating PHASES.md | Medium | High | Mitigate | Stage creator reads skill unchanged; skill must define phases unambiguously in its existing format |
| R5 | `astp-version` addition to non-design stage skills causes unexpected side effects on existing phase structures | Low | Medium | Mitigate | Change scoped to Output Conventions frontmatter list only; diff-verified backward compatibility |
| R6 | Design-reviewer Pass 2 (correction log) has nothing to review on simple features, producing vacuous output | High | Low | Accept | Reviewer still runs spot-check of cross-document consistency; documents the absence as legitimate |

## Detailed Mitigation Plans

### R1: Phase Cap Exceeded in Edge Cases

**Risk**: ADR-7 raised the cap from 6 to 10 for the design stage. The full configuration uses 9 phases (6 tiers + QA + 2 reviewers). A redraft scenario (orchestrator triggers a redo of a failed phase) could push to 10. If redraft happens on multiple phases, the cap is breached. [ref: ./04-decisions.md#ADR-7]

**Mitigation steps**:
1. The 10-phase cap includes a 1-slot buffer explicitly for redraft. The skill must state that a single redraft is within budget.
2. If multiple redrafts are needed (2+ phase failures), the orchestrator should fail the stage rather than retry indefinitely. This is existing orchestrator behavior — no change needed.
3. Scaling rules for simple features produce 4–5 phases, giving 5–6 slots of headroom for redraft. The cap is only tight for full 9-phase features.
4. **Verification**: Test case T23 validates the cap is 10. Test case T25 validates full features use exactly 9. The 1-slot margin is documented in ADR-7.

**Responsible**: Skill file implementation (scaling rules section).

### R2: Cascading Corrections Destabilize Documents

**Risk**: Tier 3 corrects `01-architecture.md`. This makes `02-dataflow.md` (written by tier 2 based on uncorrected architecture) stale. Tier 4 corrects `02-dataflow.md`. This could make `03-model.md` stale if model depends on dataflow details. Each correction potentially invalidates subsequent documents, creating a chain reaction. [ref: ./05-usecases.md#UC-4]

**Mitigation steps**:
1. **Factual-only constraint**: Corrections are limited to factual fixes (contradictions, incorrect references, stale assumptions). Stylistic rewrites are prohibited. This limits the blast radius of each correction — only genuinely wrong content is changed.
2. **Append-only log**: Later tiers cannot modify earlier log entries. If tier 5 disagrees with tier 3's correction, it makes its own correction and appends a new entry referencing tier 3. The reviewer sees both entries and can detect oscillation.
3. **Reviewer Pass 2 detects cascades**: The correction log review explicitly checks for cascading patterns (UC-4 demonstrates this). The reviewer verifies that all documents are consistent *after* all corrections, catching any that were missed.
4. **Natural dampening**: Later tiers read all prior outputs including the correction log. Tier 4 already sees tier 3's correction, so it writes `04-decisions.md` consistently with the corrected architecture. The cascade only affects documents written *before* the correction, not *after*. Since tiers execute sequentially, only documents from tiers earlier than the correcting tier are at risk.
5. **Maximum cascade depth**: With 6 tiers, the worst case is tier 6 correcting tier 1, which could affect tiers 2–5. But tier 6 is the last designer; no subsequently tier exists to detect secondary issues. Reviewer Pass 2 is the safety net.

**Responsible**: Skill file (correction rules), architect agent (correction discipline), reviewer agent (Pass 2 verification).

**Verification**: Test cases T7, T9; edge cases E2, E4; UC-4 walkthrough.

### R4: Stage Creator Misinterprets New Phase Structure

**Risk**: The stage creator reads the design skill to generate PHASES.md. The new skill has 9 phases (up from 4), per-document tier structure, and correction rules that don't exist in other stage skills. If the skill's phase structure is ambiguous or uses a format the stage creator doesn't expect, PHASES.md will be incorrect, and the entire stage execution will be wrong. [ref: ../01-research/02-supporting-infrastructure.md#1. Stage Creator Agent]

**Mitigation steps**:
1. **Preserve existing skill format**: The updated `rdpi-02-design/SKILL.md` must use the same structural conventions as other stage skills (phase table format, role assignments, Output Conventions section). The stage creator adapts from these conventions — novel formatting will be misinterpreted.
2. **Phase table must be unambiguous**: Each of the 9 phases must have a clear agent assignment, output list, and dependency chain. The stage creator generates PHASES.md from this table. No implicit phases or "see correction rules for details" indirection.
3. **Scaling rules must be explicit**: The skill must clearly state which tiers merge and which are omitted for simple vs. complex features, using the same conditional format as other skills. The stage creator uses scaling rules to decide how many phases to generate.
4. **No stage creator changes**: Per user decision Q11 and ADR-5, the stage creator agent is not modified. The burden is entirely on the skill file to be interpretable by the existing stage creator.

**Responsible**: Skill file implementation (phase table, scaling rules).

**Verification**: Test cases T1, T23, T24, T25. End-to-end: have the stage creator generate PHASES.md from the updated skill and verify it matches expected output for simple and complex features.

### R5: astp-version Side Effects on Non-Design Skills

**Risk**: Adding `astp-version` to the Output Conventions of `rdpi-01-research/SKILL.md`, `rdpi-03-plan/SKILL.md`, and `rdpi-04-implement/SKILL.md` could inadvertently change how the stage creator or reviewer agents interpret those skills. If the addition is in the wrong section or changes the field list format, existing phase structures could break. [ref: ./07-docs.md#Skills (4 files)]

**Mitigation steps**:
1. **Scoped change**: The addition is a single field name (`astp-version`) appended to the existing README.md frontmatter field list in each skill's Output Conventions section. No other sections are touched.
2. **Diff verification**: Test cases T27–T29 require that the only change is the `astp-version` addition. All other sections must be byte-identical to the current version.
3. **Field list format preserved**: The new field is added in the same format as existing fields (e.g., YAML list item or table row, matching the current convention of each skill). No structural change to the list.
4. **Research-reviewer update**: T30 verifies the `pipeline-version` → `astp-version` rename in `rdpi-research-reviewer.agent.md` is the only change to that file.

**Responsible**: Implementation (per-file diff review).

**Verification**: Test cases T18–T22, T27–T30.
