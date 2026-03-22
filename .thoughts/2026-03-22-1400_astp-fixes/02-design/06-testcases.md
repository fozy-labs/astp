---
title: "Test Cases & Risks: ASTP Fixes"
date: 2026-03-22
stage: 02-design
role: rdpi-qa-designer
---

## Test Cases

| ID | Issue | Description | Verification Method | Priority |
|----|-------|-------------|---------------------|----------|
| T1a | 1 — Duplicate version fields | `thoughts-workflow.instructions.md` uses exact field name `rdpi-version` | Grep line 25 of `thoughts-workflow.instructions.md` — expect `` **`rdpi-version`**: `` phrasing, no "Workflow version" prose | High |
| T1b | 1 — No `workflow_version` anywhere | No template file introduces a `workflow_version` YAML field | `grep -ri "workflow_version" src/templates/` — expect 0 matches | High |
| T2 | 2 — Codebase-researcher version gap | `rdpi-codebase-researcher.agent.md` frontmatter template includes `rdpi-version` | Read lines 29–35 of the file — expect `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` in the YAML block | High |
| T3a | 3 — Hint on install prompt | `selectBundles` multiselect includes hint | Grep `prompts.ts` for `hint:` inside `selectBundles` — expect `"Space to toggle, Enter to confirm"` | Medium |
| T3b | 3 — Hint on delete prompt | `selectInstalledBundles` multiselect includes hint | Grep `prompts.ts` for `hint:` inside `selectInstalledBundles` — expect same hint string | Medium |
| T4a | 4 — Redraft limit removed from orchestrator steps | Steps 5b/5c merged into one unconditional step | Read `RDPI-Orchestrator.agent.md` step 5b — expect no `redraft count < 3` condition, no step 5c | High |
| T4b | 4 — Redraft constraint line removed | No "Maximum 3 redraft" constraint | `grep -i "maximum.*redraft\|redraft.*limit\|redraft count" RDPI-Orchestrator.agent.md` — expect 0 matches | High |
| T5 | 5 — Approve agent auto-redraft cap | Clear "after 2 redraft rounds" hard cap rule | Read `rdpi-approve.agent.md` last rules — expect `MUST stop auto-rejecting` after 2 rounds, "hard cap" wording, no ambiguous "2+" phrasing | High |
| T6a | 6 — TASK.md as-is guardrail | Orchestrator step 4 forbids rephrasing | Read `RDPI-Orchestrator.agent.md` step 4 — expect `Do NOT rephrase, summarize, expand, research, or interpret` | High |
| T6b | 6 — Only-translation rule | Step 3 marks translation as the ONLY allowed transformation | Read step 3 — expect `This is the ONLY transformation allowed` | Medium |

## Risks

**Issue 4 + 5 interaction — approve agent as sole loop guard.**
After removing the orchestrator's redraft limit (Issue 4), the approve agent's 2-round cap (Issue 5) becomes the only mechanism preventing infinite auto-redraft loops. If the LLM ignores the `MUST stop` rule, no backstop exists. Mitigation: the reworded rule uses explicit `MUST` prohibition + "hard cap" language; the cap of 2 is low enough that even a missed trigger results in at most one extra round before semantic drift makes the LLM unlikely to keep cycling. [ref: ./04-decisions.md#ADR-1]

**Regression from orchestrator redraft removal.**
Removing steps 5b–5c and the constraint line must not accidentally delete adjacent orchestration steps or break markdown list numbering in `RDPI-Orchestrator.agent.md`. Verification: read the full orchestration flow after edit and confirm steps 1–5b remain coherent and sequentially numbered.

**Issue 6 — over-constraining the orchestrator.**
The strict "as-is" rule could pass through poorly structured user input. Acceptable risk — research agents can request clarification downstream. No mitigation needed beyond the current design.
