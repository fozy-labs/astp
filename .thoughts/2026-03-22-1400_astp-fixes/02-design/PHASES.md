---
title: "Phases: 02-design"
date: 2026-03-22
stage: 02-design
---

# Phases: 02-design

## Phase 1: Change Specification & Decisions

- **Agent**: `rdpi-architect`
- **Output**: `01-architecture.md`, `04-decisions.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

You are designing a batch of 6 targeted fixes for the astp CLI tool. All fixes are small and well-scoped — keep your output concise and actionable. No Mermaid diagrams needed. No bloat.

**Read these files first:**
- Task: `../TASK.md`
- Research codebase analysis: `../01-research/01-codebase-analysis.md`
- Research open questions: `../01-research/02-open-questions.md`
- Research summary: `../01-research/README.md`

**Produce `01-architecture.md`:**

For each of the 6 issues, write a short change specification block containing:
- **Issue number and title** (from TASK.md)
- **Affected files** (exact paths from research, use `@/` workspace-root notation)
- **What changes** — describe the exact modification: what text/code to add, remove, or replace. Be specific enough that a coder can implement without ambiguity.
- **Research reference** — cite the research finding that supports this change.

Issues to cover:
1. Duplicate version fields — fix `thoughts-workflow.instructions.md` line ~25 to use only `rdpi-version` (research says the ambiguous "Workflow version" phrasing is the root cause).
2. Version from manifest — fix `rdpi-codebase-researcher.agent.md` to include `rdpi-version` in its output format (research confirms it's the only agent template missing it).
3. Multi-select hints — add `hint` property to both multi-select prompts in `src/ui/prompts.ts` (lines ~64, ~98) explaining Space=toggle, Enter=confirm.
4. Remove redraft limit from orchestrator — remove references in `RDPI-Orchestrator.agent.md` at lines ~74-75 (steps 5b-5c) and ~132 (constraints section).
5. Auto-redraft limit on approve agent — reword the "2+ redraft rounds" guardrail in `rdpi-approve.agent.md` (~line 184) to be the explicit auto-redraft cap of 2, with clear LLM-friendly wording.
6. Orchestrator TASK.md wording — add explicit "pass as-is" guardrails to orchestrator's "New Task Setup" section (~lines 56-62), allowing only English translation, no interpretation.

Keep each change spec to 5-15 lines. No prose padding.

**Produce `04-decisions.md`:**

Write 2 ADRs in standard format (Status, Context, Options, Decision, Consequences):
- **ADR-1**: Issue 4+5 interaction — removing orchestrator redraft limit while relying solely on approve agent as the infinite-loop safeguard. Research found this acceptable (open questions Q1) but it's an architectural choice worth documenting.
- **ADR-2**: Issue 6 approach — passing task description as-is vs. allowing minimal restructuring. Research found the orchestrator currently over-interprets; decide on the exact guardrail strength.

Keep each ADR to 10-20 lines. No padding.

Use this frontmatter for both files:
```yaml
---
title: "<file title>"
date: 2026-03-22
stage: 02-design
role: rdpi-architect
---
```

---

## Phase 2: Test Cases & Risks

- **Agent**: `rdpi-qa-designer`
- **Output**: `06-testcases.md`
- **Depends on**: 1
- **Retry limit**: 1

### Prompt

You are designing verification criteria for a batch of 6 targeted fixes to the astp CLI tool. Keep it concise — these are small changes, not a new feature.

**Read these files first:**
- Task: `../TASK.md`
- Architecture/change spec: `./01-architecture.md`
- Decisions: `./04-decisions.md`
- Research codebase analysis: `../01-research/01-codebase-analysis.md`

**Produce `06-testcases.md`:**

Create a test case table covering all 6 issues. Format:

| ID | Issue | Description | Verification Method | Priority |
|----|-------|-------------|-------------------|----------|

For each issue, define 1-3 test cases. Verification methods should be concrete: "grep for `workflow_version` in all template files — expect 0 matches", "check `prompts.ts` multi-select calls include `hint` property", etc.

After the table, add a short **Risks** section (5-10 lines max) covering:
- Issue 4+5 interaction risk: approve agent becomes sole loop guard. Mitigation: explicit `MUST NOT` wording + auto-redraft cap of 2.
- Any regression risks from removing orchestrator redraft references.

No performance tests needed. No elaborate mitigation plans. These are surgical fixes.

Use this frontmatter:
```yaml
---
title: "Test Cases & Risks: ASTP Fixes"
date: 2026-03-22
stage: 02-design
role: rdpi-qa-designer
---
```

---

## Phase 3: Design Review

- **Agent**: `rdpi-design-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1, 2
- **Retry limit**: 2

### Prompt

Review all design documents for the ASTP Fixes batch.

**Read these files:**
- Task: `../TASK.md`
- Research summary: `../01-research/README.md`
- Research codebase analysis: `../01-research/01-codebase-analysis.md`
- Research open questions: `../01-research/02-open-questions.md`
- Architecture/change spec: `./01-architecture.md`
- Decisions: `./04-decisions.md`
- Test cases & risks: `./06-testcases.md`

**Review criteria:**
1. **Research traceability** — every change spec cites a research finding; no design choices contradict research.
2. **Completeness** — all 6 issues from TASK.md have change specifications, decisions where needed, and test cases.
3. **Specificity** — change specs are precise enough for a coder to implement without ambiguity. File paths and locations are correct.
4. **ADR quality** — decisions have clear rationale and consequences.
5. **Test coverage** — every issue has at least one verification criterion.
6. **Conciseness** — no bloat, no unnecessary documents. This is a batch of small fixes, not a new feature.

**Update `README.md`** with:
- Overview (1-2 sentences)
- Goals / Non-Goals
- Document links
- Key decisions summary (1 line per ADR)
- Quality review checklist (table with criteria above)
- Next steps

Keep README.md compact — match the scope of the fixes.

---
