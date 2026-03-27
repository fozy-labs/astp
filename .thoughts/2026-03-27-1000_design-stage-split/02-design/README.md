---
title: "Design: Design Stage Split"
date: 2026-03-28
status: Approved
feature: "Split 02-design into per-document designer tiers with correction tracking, 00-short-design.md intro, and astp-version in stage README frontmatter"
research: "../01-research/README.md"
---

## Overview

This design restructures the `02-design` stage skill from a 2-phase architect model into per-document designer tiers (6 tiers ordered most-defining to least-defining), adds a cumulative in-place correction mechanism with `09-corrections.md`, introduces a structured `00-short-design.md` prologue produced by the first tier, expands the design-reviewer to two passes (general review + correction log verification), and propagates `astp-version` into all four stage skills' README.md frontmatter.

## Goals

- Replace grouped architect phases with per-document tiers for maximum correction granularity (user decision Q1)
- Enable later tiers to overwrite earlier documents in-place with a mandatory cumulative correction log (Q2, Q3)
- Introduce `00-short-design.md` as a structured design direction document produced by tier 1 (Q6, Q10)
- Ensure design-reviewer runs minimum 2 passes, one dedicated to correction log verification (Q7)
- Add `astp-version` field to all stage README.md frontmatter using existing naming convention (Q8, Q9, Q12, Q13)

## Non-Goals

- Modifying the stage creator agent (Q11)
- Adding implement-reviewer to the design stage (Q4)
- Changing downstream stage phase structures (only Output Conventions updated for astp-version)
- Runtime code or CLI changes (template-only modifications)

## Documents

- [Architecture](./01-architecture.md) — Per-document tier structure, correction mechanism, 00-short-design.md spec, scaling rules, reviewer integration
- [Data Flow](./02-dataflow.md) — Per-tier read/write/correct map, correction log accumulation, sequence diagrams for normal/correction/reviewer flows
- [Domain Model](./03-model.md) — Tier, DesignDocument, CorrectionEntry, ReviewPass, ShortDesign entities with TypeScript type definitions
- [Decisions](./04-decisions.md) — 7 ADRs: per-document tiers, overwrite+log, cumulative log, design-reviewer only, first-tier short-design, astp-version convention, phase cap resolution
- [Use Cases](./05-usecases.md) — 5 scenarios: simple feature, complex with correction, no corrections, cascading correction, astp-version propagation
- [Test Cases](./06-testcases.md) — 30 test cases + 5 edge cases covering tier ordering, correction mechanism, 00-short-design.md, reviewer integration, astp-version, scaling rules, backward compatibility
- [Documentation Impact](./07-docs.md) — 7 template files affected, migration path, backward compatibility assessment
- [Risks](./08-risks.md) — 6 risks with detailed mitigations for high-impact items (phase cap, cascading corrections, stage creator interpretation)

## Key Decisions

- **ADR-1**: Per-document tiers (6 designer phases) chosen over grouped tiers for maximum correction granularity — raises phase count from 4 to 9.
- **ADR-2**: In-place overwrite with mandatory correction log maintains a single source of truth while preserving an audit trail.
- **ADR-4**: Design-reviewer only (no implement-reviewer) in the design stage — reviewer expanded to two passes instead.
- **ADR-6**: `astp-version` field name (not `pipeline-version`) reuses the existing CLI injection convention across all 4 stage skills.
- **ADR-7**: Phase cap raised from 6 to 10 for the design stage — accommodates 9 full-feature phases plus 1 redraft buffer; scaling rules reduce to 4–5 phases for simple features.

## Quality Review

### Checklist

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Design decisions trace to research findings | PASS | All ADRs cite `[ref: ../01-research/...]` links. Architecture, dataflow, and model documents reference specific research sections. All 13 user decisions from Q1–Q13 correctly reflected. |
| 2 | ADRs have Status, Context, Options, Decision, Consequences | PASS | All 7 ADRs (ADR-1 through ADR-7) have complete sections. Options include pros/cons. |
| 3 | Mermaid diagrams present and conformant | PASS | 7 diagrams total: C4 Level 2 (~12 elements), correction flow sequence, 3 dataflow sequences, class diagram (~10 classes), state diagram. All titled, within element limits. |
| 4 | Test strategy covers identified risks | PASS | R1→T23/T25, R2→T7/T9/E2/E4/UC-4, R3→E4, R4→T1/T23-T25, R5→T27-T30, R6→T17. All risks mapped to test cases. |
| 5 | docs.md is concise and proportional to existing docs/demos | PASS | `docs/` is empty; no `apps/demos/` exists. 07-docs.md is a concise table-based inventory of 7 template file changes with migration notes — proportional to a template-system modification. |
| 6 | docs.md describes WHAT not HOW (no JSDoc, no full drafts) | PASS | Lists file names, change descriptions, and impact categories. No JSDoc proposals, no full-text content drafts. |
| 7 | No implementation details or code | PASS | TypeScript in 03-model.md is explicitly labeled as design artifacts modeling the skill structure. Markdown templates in 01-architecture.md define document formats, not implementation code. |
| 8 | Research open questions addressed or deferred | PASS | All 13 questions (Q1–Q13) addressed in design. No deferrals needed — every question had a user answer that was incorporated. |
| 9 | Risk analysis has actionable mitigations for high-impact risks | PASS | R1 (High): 4-step mitigation with cap buffer. R2 (High): 5-step mitigation with natural dampening analysis. R4 (High): 4-step mitigation focused on skill format preservation. |
| 10 | Internal consistency (arch/dataflow/model/usecases) | PASS | Phase count (9) consistent across all documents. Correction authority (tiers 2–6 only) consistent in architecture/dataflow/model. Reviewer two-pass structure consistent across architecture/dataflow/decisions. astp-version scope (all 4 stages) consistent across architecture/decisions/docs/usecases. |

### Documentation Proportionality

The `docs/` directory is empty and no `apps/demos/` directory exists. The project is a CLI tool with template files. `07-docs.md` is appropriately scoped — it lists 7 template files requiring changes in table format with brief change descriptions, migration impact, and backward compatibility notes. The document is ~80 lines including frontmatter. This is proportional to a template-system internal restructuring on a project with no existing user documentation.

### Issues Found

No issues found. Previous issues #1 and #2 were resolved in Redraft Round 1:

1. ~~Model diagram cardinality hardcoded~~ — **Resolved**: `03-model.md` class diagram now uses `"4..10"` cardinality (`DesignStage "1" *-- "4..10" Phase`), matching scaling rules and TypeScript type definition.
2. ~~UC-1 scaling: reviewer Pass 2 skip condition could be clearer~~ — **Resolved**: `05-usecases.md` UC-1 Reviewer Behavior section now explicitly states that both conditions must hold, and that if `09-corrections.md` exists — even on a simple feature — Pass 2 still runs. The conjunction is clearly emphasized.

## Next Steps

Proceeds to Plan stage after human review.
