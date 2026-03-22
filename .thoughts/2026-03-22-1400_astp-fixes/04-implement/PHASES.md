---
title: "Phases: 04-implement"
date: 2026-03-22
stage: 04-implement
---

# Phases: 04-implement

## Phase 1: Template Fixes (Plan Phase 1)

- **Agent**: `rdpi-codder`
- **Output**: Code changes per ../03-plan/01-template-fixes.md
- **Depends on**: —
- **Retry limit**: 2

### Prompt

You are implementing Plan Phase 1: Template Fixes.

Read the plan file at `../03-plan/01-template-fixes.md` fully before starting.

Implement all 5 tasks in order (Tasks 1.1–1.5). Each task specifies an exact file path and a find/replace pair — apply them precisely:

1. **Task 1.1** (Issue 1): In `src/templates/rdpi/instructions/thoughts-workflow.instructions.md`, replace `**Workflow version**` phrasing with `` **`rdpi-version`** `` phrasing per the plan.
2. **Task 1.2** (Issue 2): In `src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md`, add `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` to the output frontmatter block after the `role:` line.
3. **Task 1.3** (Issue 4): In `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`, two edits: (A) merge steps 5b–5c into one unconditional step 5b, (B) delete the "Maximum 3 redraft rounds" constraint line.
4. **Task 1.4** (Issue 5): In `src/templates/rdpi/agents/rdpi-approve.agent.md`, replace the ambiguous "2+" rule with explicit "after 2 redraft rounds" hard cap wording per the plan.
5. **Task 1.5** (Issue 6): In `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`, replace steps 3–4 under "New Task Setup" with stricter as-is wording per the plan.

Rules:
- Use the exact find/replace text from the plan — do not rephrase.
- Do NOT modify any files outside this phase's scope.
- These are template files (Markdown), no TypeScript compilation needed.
- After all edits, briefly confirm each task was applied.

Design reference: `../02-design/01-architecture.md`

---

## Phase 2: TypeScript Fix (Plan Phase 2)

- **Agent**: `rdpi-codder`
- **Output**: Code changes per ../03-plan/02-typescript-fix.md
- **Depends on**: Phase 1
- **Retry limit**: 2

### Prompt

You are implementing Plan Phase 2: TypeScript Fix.

Read the plan file at `../03-plan/02-typescript-fix.md` fully before starting.

Implement both tasks:

1. **Task 2.1** (Issue 3): In `src/ui/prompts.ts`, add `hint: "Space to toggle, Enter to confirm"` to the `p.multiselect` call in `selectBundles` (the one with `message: "Select bundles to install:"`). Place the `hint` property after the `required: true` line.
2. **Task 2.2** (Issue 3): In the same file, add `hint: "Space to toggle, Enter to confirm"` to the `p.multiselect` call in `selectInstalledBundles` (the one with `message: "Select bundles to delete:"`). Place the `hint` property after the `required: true` line.

Rules:
- Match existing code style exactly (indentation, trailing commas).
- Do NOT modify any files outside `src/ui/prompts.ts`.
- After edits, run `npm run ts-check` to verify TypeScript compilation. If it fails, fix within this file (max 2 attempts).

Design reference: `../02-design/01-architecture.md`

---

## Phase 3: Verify All Changes

- **Agent**: `rdpi-tester`
- **Output**: `verification-1-2.md`
- **Depends on**: Phase 1, Phase 2
- **Retry limit**: 1

### Prompt

You are verifying the implementation of both plan phases (Phase 1: Template Fixes, Phase 2: TypeScript Fix).

Read both plan files for their verification checklists:
- `../03-plan/01-template-fixes.md` — Verification section
- `../03-plan/02-typescript-fix.md` — Verification section

Run every check listed below. For each, record pass/fail and any error details.

**Phase 1 checks (template fixes):**
- T1a: Line 25 area of `src/templates/rdpi/instructions/thoughts-workflow.instructions.md` contains `` **`rdpi-version`**: `` — no "Workflow version" prose
- T1b: `grep -ri "workflow_version" src/templates/` returns 0 matches (search for the literal string `workflow_version` — not the token `{{ASTP_WORKFLOW_VERSION}}`)
- T2: `src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md` frontmatter block includes `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"`
- T4a: `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md` step 5b has no `redraft count < 3` condition, no step 5c exists
- T4b: Searching `RDPI-Orchestrator.agent.md` for `maximum.*redraft` or `redraft.*limit` or `redraft count` returns 0 matches
- T5: `src/templates/rdpi/agents/rdpi-approve.agent.md` contains `MUST stop auto-rejecting` and `hard cap`, no `2+` phrasing remains
- T6a: `RDPI-Orchestrator.agent.md` step 4 contains `Do NOT rephrase, summarize, expand, research, or interpret`
- T6b: Step 3 contains `This is the ONLY transformation allowed`
- Orchestration steps remain coherently numbered after edits

**Phase 2 checks (TypeScript fix):**
- T3a: `grep "hint:" src/ui/prompts.ts` returns exactly 2 matches, both with `"Space to toggle, Enter to confirm"`
- T3b: `npm run ts-check` passes

Save the verification report to `04-implement/verification-1-2.md` with pass/fail per check and error details for any failures. If any test fails, report it — do not attempt fixes.

---

## Phase 4: Implementation Review

- **Agent**: `rdpi-implement-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: Phase 3
- **Retry limit**: 2

### Prompt

You are reviewing the completed implementation of all 6 ASTP fixes.

Read these files for full context:
- Task: `../TASK.md`
- Research summary: `../01-research/README.md`
- Design spec: `../02-design/01-architecture.md`
- Plan phases: `../03-plan/01-template-fixes.md`, `../03-plan/02-typescript-fix.md`
- Verification report: `04-implement/verification-1-2.md`

Then inspect the 5 changed files to confirm the edits match the plan:
- `src/templates/rdpi/instructions/thoughts-workflow.instructions.md`
- `src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md`
- `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`
- `src/templates/rdpi/agents/rdpi-approve.agent.md`
- `src/ui/prompts.ts`

Write the implementation record by replacing `04-implement/README.md` with:
- Frontmatter: title, date, status (Approved/Not Approved), feature, plan link
- Phase completion status (2/2 plan phases)
- Verification results summary (from `verification-1-2.md`)
- Quality review checklist: all plan tasks implemented, verification passed, no out-of-scope files modified, code follows project patterns, TypeScript strict mode OK, no security vulnerabilities
- List of all changed files with brief description of each change
- Post-implementation recommendations (manual testing areas if any)
- Recommended commit message in conventional commits format:
  ```
  ??(??): ??

  - ??
  - ??
  ```

---
