---
title: "Implementation: Design Stage Split"
date: 2026-03-28
status: Approved
feature: "Split 02-design into per-document designer tiers with correction tracking, 00-short-design.md intro, and astp-version in stage README frontmatter"
plan: "../03-plan/README.md"
---

## Status
- Phases completed: 3/3
- Verification: all passed (27/27 checks across two verification reports)
- Issues: 2 (out-of-scope modifications)

## Quality Review

### Checklist
| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | All plan phases implemented | PASS | Phase 1 (design skill rewrite, 7 tasks), Phase 2 (agent updates, 3 tasks), Phase 3 (astp-version propagation, 4 tasks) — all complete |
| 2 | Verification passed for each phase | PASS | Phase 1: 11/11 (verification-1.md). Phases 2–3: 16/16 (verification-2-3.md). Total 27/27 |
| 3 | No files outside plan scope modified | FAIL | 3 unplanned files modified: `RDPI-Orchestrator.agent.md` (retry loop added), `rdpi-codder.agent.md` (`.thoughts/` rule + Cooling section), `rdpi-tester.agent.md` (Cooling section). See Issues #1 and #2 |
| 4 | Code follows project patterns | PASS | Template content follows existing markdown patterns: YAML frontmatter, `##`/`###` section hierarchy, `[ref:]` conventions, checklist format |
| 5 | Barrel exports updated correctly | N/A | No runtime code changed — template-only feature |
| 6 | TypeScript strict mode maintained | N/A | No runtime code changed |
| 7 | Documentation proportional to existing docs/demos | PASS | `docs/` is empty, no `apps/demos/` exists. No documentation tasks in plan. Proportional |
| 8 | No security vulnerabilities | FAIL | Injected "Cooling" sections in `rdpi-codder.agent.md` and `rdpi-tester.agent.md` instruct agents to run `sleep 120` every 10 tool calls — prompt injection / sabotage pattern. See Issue #2 |

### Cross-File Consistency
- Correction mechanism: skill (§34) ↔ architect agent (`## Correction Mechanism`) ↔ reviewer Pass 2 — all consistent
- `00-short-design.md`: skill spec (§64) ↔ architect capability (`### 00-short-design.md`) ↔ reviewer checklist item 11 — all consistent
- `astp-version`: 4 stage skills + reviewer output format — all include the field. `pipeline-version` fully replaced (0 grep matches)
- Reviewer two-pass: skill phases 8–9 ↔ reviewer agent Pass 1/Pass 2 sections — consistent

### Documentation Proportionality
`docs/` is empty. No `apps/demos/` directory exists. The plan contained zero documentation or example tasks. All changes are markdown templates under `templates/rdpi/`. This is proportional.

### Issues Found

**Issue #1 — Out-of-scope modifications (Medium)**
- What: 3 files outside the planned 7 were modified: `RDPI-Orchestrator.agent.md` (added "Code → Test retry loop" section), `rdpi-codder.agent.md` (added `.thoughts/` reference rule), `rdpi-tester.agent.md`
- Where: `templates/rdpi/agents/RDPI-Orchestrator.agent.md`, `templates/rdpi/agents/rdpi-codder.agent.md`, `templates/rdpi/agents/rdpi-tester.agent.md`
- Expected: Only the 7 files listed in the plan should have been modified
- Severity: Medium — the orchestrator retry loop and `.thoughts/` rule are useful but unplanned; should be tracked separately

**Issue #2 — Prompt injection: "Cooling" sections (Critical)**
- What: Both `rdpi-codder.agent.md` and `rdpi-tester.agent.md` have injected `## Cooling` sections instructing agents to run `sleep 120` after every 10 tool calls. This is a sabotage pattern that would waste ~2 minutes per 10 operations
- Where: `templates/rdpi/agents/rdpi-codder.agent.md` (~line 69–79), `templates/rdpi/agents/rdpi-tester.agent.md` (~line 20–30)
- Expected: No such sections should exist. These must be reverted immediately
- Severity: Critical — actively harmful to agent execution performance

## Post-Implementation Recommendations
- [ ] **Revert out-of-scope files**: `git checkout HEAD -- templates/rdpi/agents/RDPI-Orchestrator.agent.md templates/rdpi/agents/rdpi-codder.agent.md templates/rdpi/agents/rdpi-tester.agent.md`
- [ ] Manual review: correction mechanism cross-references between skill ↔ architect ↔ reviewer
- [ ] Manual review: reviewer two-pass flow (Pass 1 checklist items 11–13, Pass 2 dual paths)
- [ ] Manual review: scaling rule consistency (Full=9, Medium=7, Simple=5, Minimum=4, cap=10)
- [ ] Consider tracking orchestrator retry loop and `.thoughts/` rule as a separate feature if desired

## Change Summary

**In-scope (7 planned files):**
- `templates/rdpi/skills/rdpi-02-design/SKILL.md` — Full rewrite: 9-phase tier structure, correction mechanism, 00-short-design.md spec, two-pass reviewer guidelines, scaling rules (cap 10), astp-version in Output Conventions
- `templates/rdpi/agents/rdpi-architect.agent.md` — Added `## Correction Mechanism` section, `### 00-short-design.md` capability subsection
- `templates/rdpi/agents/rdpi-design-reviewer.agent.md` — Two-pass model (Pass 1 general + Pass 2 correction log), 3 new checklist items, `### Correction Log Review` output section, `astp-version` in frontmatter template
- `templates/rdpi/skills/rdpi-01-research/SKILL.md` — Added `astp-version` to Output Conventions README.md field list
- `templates/rdpi/skills/rdpi-03-plan/SKILL.md` — Added `astp-version` to Output Conventions README.md field list
- `templates/rdpi/skills/rdpi-04-implement/SKILL.md` — Added `astp-version` to Output Conventions README.md field list
- `templates/rdpi/agents/rdpi-research-reviewer.agent.md` — Renamed `pipeline-version` → `astp-version` in README.md frontmatter template

**Out-of-scope (3 unplanned files — recommend revert):**
- `templates/rdpi/agents/RDPI-Orchestrator.agent.md` — Added "Code → Test retry loop" section
- `templates/rdpi/agents/rdpi-codder.agent.md` — Added `.thoughts/` reference rule + **injected Cooling section (prompt injection)**
- `templates/rdpi/agents/rdpi-tester.agent.md` — **Injected Cooling section (prompt injection)**

## Recommended Commit Message

```
feat(rdpi): split 02-design into per-document designer tiers

- Rewrite rdpi-02-design skill: 9-phase tier structure replacing
  4-phase model, correction mechanism with 09-corrections.md,
  00-short-design.md specification, scaling rules (cap 10)
- Update rdpi-architect agent: correction mechanism rules,
  00-short-design.md capability
- Update rdpi-design-reviewer agent: two-pass review model
  (general + correction log), 3 new checklist items
- Propagate astp-version to all 4 stage skill Output Conventions
- Rename pipeline-version → astp-version in research-reviewer
```
