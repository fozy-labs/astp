---
title: "Architecture Decisions: ASTP Fixes"
date: 2026-03-22
stage: 02-design
role: rdpi-architect
---

## ADR-1: Sole reliance on approve agent for redraft loop prevention

### Status
Proposed

### Context
Issue 4 removes the orchestrator's hardcoded redraft limit (3 rounds). Issue 5 clarifies the approve agent's auto-redraft cap (2 rounds). After both changes, the approve agent is the **only** mechanism preventing infinite auto-redraft loops. [ref: ../01-research/02-open-questions.md#q1]

### Options Considered
1. **Approve agent as sole safeguard** — Simpler orchestrator, no redundant limits. Single point of failure if the LLM ignores the `MUST` rule.
2. **Soft warning in orchestrator** (no hard limit, just a note after N rounds) — Defense-in-depth. Risk: adds tokens and may cause the orchestrator to re-impose a limit, recreating the original problem.

### Decision
Option 1. The task explicitly requires removing the orchestrator limit. The approve agent's rule uses `MUST` and is the final gate before any redraft — the failure mode requires the LLM to violate an explicit prohibition. Adding a soft note risks re-introducing the problem the task is trying to fix.

### Consequences
- **Positive**: Orchestrator is simpler and shorter (fewer tokens, less confusion).
- **Negative**: No backstop if the approve agent's rule is ignored.
- **Risk**: Low-probability infinite loop. Mitigated by the approve agent always involving the human after 2 rounds.

---

## ADR-2: Pass task description as-is into TASK.md

### Status
Proposed

### Context
The orchestrator currently has no explicit guardrails on how it writes TASK.md. Research found the vague "insert the task into it" wording allows over-interpretation — rephrasing, expanding, or adding research that distorts the original meaning. [ref: ../01-research/01-codebase-analysis.md#issue-6]

### Options Considered
1. **Strict as-is** — Only allow English translation, forbid all other transformations. Clear and simple.
2. **Allow minimal restructuring** (e.g., formatting into sections) — More flexible. Risk: "minimal" is subjective and the orchestrator already demonstrated over-interpretation.

### Decision
Option 1. Explicit `Do NOT rephrase, summarize, expand, research, or interpret` guardrail. The only allowed transformation is translation to English. The user's wording is authoritative — the research and design stages exist to refine scope, not the orchestrator.

### Consequences
- **Positive**: Task intent is preserved exactly. Downstream stages work from the user's actual words.
- **Negative**: Poorly structured user input passes through unimproved.
- **Risk**: Acceptable — research agents can ask clarifying questions if the task is unclear.
