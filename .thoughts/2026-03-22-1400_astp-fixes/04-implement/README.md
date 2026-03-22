---
title: "Implementation: ASTP Fixes"
date: 2026-03-22
status: Approved
feature: "Batch of 6 targeted fixes to astp CLI tool templates and code"
plan: "../03-plan/README.md"
rdpi-version: "b0.5"
---

## Status
- Phases completed: 2/2
- Verification: all passed (11/11 checks)
- Issues: none

## Quality Review

### Checklist
| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | All plan phases implemented | PASS | Phase 1 (5 template tasks) and Phase 2 (2 TypeScript tasks) both completed — all 7 tasks across 6 issues done |
| 2 | Verification passed for each phase | PASS | 11/11 checks passed per `verification-1-2.md` |
| 3 | No files outside plan scope modified | PASS | `git diff --name-only HEAD` shows exactly 5 files, all planned: `thoughts-workflow.instructions.md`, `rdpi-codebase-researcher.agent.md`, `RDPI-Orchestrator.agent.md`, `rdpi-approve.agent.md`, `prompts.ts` |
| 4 | Code follows project patterns | PASS | Template edits maintain existing markdown formatting; TypeScript change uses existing `message` string pattern |
| 5 | Barrel exports updated correctly | N/A | No new files created — only modifications to existing files |
| 6 | TypeScript strict mode maintained | PASS | `npm run ts-check` (`tsc --noEmit`) passes with 0 errors after Phase 2 changes |
| 7 | Documentation proportional to existing docs/demos | N/A | No documentation changes — `docs/` is empty, no `apps/demos/` exists. Internal template fixes only |
| 8 | No security vulnerabilities | PASS | Changes are template text edits and a UI hint string — no security surface affected |

### Design Deviation — Phase 2 (Issue 3)

The plan specified adding a `hint:` property to `p.multiselect()` calls. However, `@clack/prompts` does not support a top-level `hint` parameter on `multiselect`. The implementer adapted by appending the hint text to the `message` property:

- Plan: `hint: "Space to toggle, Enter to confirm"`
- Actual: `message: "Select bundles to install:\n(Space = toggle, Enter = confirm)"`

This achieves the same UX goal (user sees the Space/Enter guidance), compiles without errors, and is the idiomatic approach for `@clack/prompts`. The slight formatting difference (`=` instead of `to`) is cosmetic and acceptable.

### Documentation Proportionality

No documentation changes were planned or made. The `docs/` directory is empty and no `apps/demos/` exists. All changes are internal template text edits and one CLI prompt string — no external documentation impact. Proportional.

### Issues Found

No issues found.

## Post-Implementation Recommendations
- [ ] Full build: `npm run build`
- [ ] Full test run: `npm run test`
- [ ] Manual testing: run `astp install` and `astp delete` interactively to verify the `(Space = toggle, Enter = confirm)` hint displays correctly in the terminal

## Change Summary

- **`src/templates/rdpi/instructions/thoughts-workflow.instructions.md`** — Replaced vague "Workflow version" prose with exact YAML field name `rdpi-version` (Issue 1)
- **`src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md`** — Added `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` to output frontmatter template (Issue 2)
- **`src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`** — Merged steps 5b–5c into unconditional 5b, removed "Maximum 3 redraft rounds" constraint (Issue 4); added as-is guardrail to TASK.md creation steps 3–4 (Issue 6)
- **`src/templates/rdpi/agents/rdpi-approve.agent.md`** — Replaced ambiguous "2+" auto-redraft rule with explicit "after 2 redraft rounds" hard cap wording (Issue 5)
- **`src/ui/prompts.ts`** — Added `(Space = toggle, Enter = confirm)` hint to both multiselect prompt messages (Issue 3)

## Recommended Commit Message

```
fix(templates,ui): apply 6 targeted fixes to RDPI templates and CLI prompts

- fix version field phrasing in thoughts-workflow instructions (Issue 1)
- add rdpi-version to codebase-researcher output frontmatter (Issue 2)
- add Space/Enter hint to multiselect prompts (Issue 3)
- remove hardcoded redraft limit from orchestrator (Issue 4)
- clarify auto-redraft cap wording in approve agent (Issue 5)
- add as-is guardrail to orchestrator TASK.md creation (Issue 6)
```
