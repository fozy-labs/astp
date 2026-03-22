---
title: "Design: ASTP Fixes"
date: 2026-03-22
status: Approved
feature: "Batch of 6 targeted fixes to astp CLI tool templates and code"
research: "../01-research/README.md"
rdpi-version: "b0.5"
---

## Overview

Exact change specifications, architectural decisions, and verification criteria for 6 targeted fixes to astp CLI templates and code. Minimal scope — only architecture, decisions, and test cases documents produced per PHASES.md.

## Goals
- Precise, implementable change specs for all 6 issues from TASK.md
- Document key architectural choices (redraft loop safeguard, TASK.md wording)
- Define verification criteria for every issue

## Non-Goals
- New features, refactors, or scope expansion beyond the 6 listed fixes
- Dataflow, domain model, use-case, or documentation documents (not needed for surgical fixes)

## Documents
- [Change Specification](./01-architecture.md)
- [Decisions](./04-decisions.md)
- [Test Cases & Risks](./06-testcases.md)

## Key Decisions
- **ADR-1**: Approve agent is the sole redraft-loop safeguard after removing the orchestrator's hardcoded limit — accepted as sufficient given the explicit `MUST` rule and low cap of 2.
- **ADR-2**: Strict as-is rule for TASK.md — only English translation allowed; no rephrasing, summarizing, or interpreting the user's task description.

## Quality Review

### Checklist
| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Design decisions trace to research findings | PASS | All 6 change specs cite `[ref: ...]` to codebase analysis and/or open questions |
| 2 | ADRs have Status, Context, Options, Decision, Consequences | PASS | Both ADR-1 and ADR-2 have all required sections |
| 3 | Mermaid diagrams present and conformant | N/A | Omitted per PHASES.md — batch of small fixes, no architecture diagrams needed |
| 4 | Test strategy covers identified risks | PASS | 10 test cases cover all 6 issues; risks section addresses Issue 4+5 interaction and regression |
| 5 | docs.md is concise and proportional to existing docs/demos | N/A | No docs.md produced — appropriate since `docs/` is empty and these are internal fixes |
| 6 | docs.md describes WHAT not HOW | N/A | No docs.md produced |
| 7 | No implementation details or code | PASS | Change specs contain before/after text for template edits and single-property additions — this IS the design level for surgical fixes |
| 8 | Research open questions addressed or deferred | PASS | Q1 → ADR-1, Q2 → Issue 2 change spec, Q3 → Issue 5 change spec |
| 9 | Risk analysis has actionable mitigations for high-impact risks | PASS | Three risks identified with concrete mitigations (explicit `MUST` wording, post-edit flow verification, accepted downstream clarification) |
| 10 | Internal consistency (arch/dataflow/model/usecases) | PASS | Change specs, ADRs, and test cases are fully aligned; no contradictions |

### Documentation Proportionality
No `07-docs.md` produced. The `docs/` directory is empty and no `apps/demos/` exists. These are internal template and code fixes — no external documentation impact. Appropriate omission.

### Issues Found
No issues found.

## Next Steps
Proceeds to Plan stage after human review.
