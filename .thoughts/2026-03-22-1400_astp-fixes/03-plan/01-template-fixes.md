---
title: "Phase 1: Template Fixes"
date: 2026-03-22
stage: 03-plan
role: rdpi-planner
---

## Goal

Apply 5 text edits across 4 template files (Issues 1, 2, 4, 5, 6). No TypeScript compilation involved.

## Dependencies
- **Requires**: None
- **Blocks**: Phase 2

## Execution
Sequential

## Tasks

### Task 1.1: Fix version field phrasing (Issue 1)
- **File**: `src/templates/rdpi/instructions/thoughts-workflow.instructions.md`
- **Action**: Modify
- **Description**: Replace vague "Workflow version" prose with exact YAML field name `rdpi-version` on line 25.
- **Details**:
  Find:
  ```
  - **Workflow version**: `{{ASTP_WORKFLOW_VERSION}}` (must be included in each md's file)
  ```
  Replace with:
  ```
  - **`rdpi-version`**: `{{ASTP_WORKFLOW_VERSION}}` (must be included in each md file's YAML frontmatter)
  ```
  [ref: ../02-design/01-architecture.md#issue-1]

### Task 1.2: Add rdpi-version to codebase-researcher output frontmatter (Issue 2)
- **File**: `src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md`
- **Action**: Modify
- **Description**: Add `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` to the output frontmatter template block (after `role:` line ~34).
- **Details**:
  Find:
  ```yaml
  ---
  title: "<Topic> — Codebase Analysis"
  date: <YYYY-MM-DD>
  stage: 01-research
  role: rdpi-codebase-researcher
  ---
  ```
  Replace with:
  ```yaml
  ---
  title: "<Topic> — Codebase Analysis"
  date: <YYYY-MM-DD>
  stage: 01-research
  role: rdpi-codebase-researcher
  rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"
  ---
  ```
  [ref: ../02-design/01-architecture.md#issue-2]

### Task 1.3: Remove redraft limit from orchestrator (Issue 4)
- **File**: `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`
- **Action**: Modify
- **Description**: Two edits in the same file:
  1. Merge steps 5b–5c (lines 74–75) into one unconditional step 5b.
  2. Delete the constraint line "Maximum 3 redraft rounds per stage" (line 132).
- **Details — Edit A (steps 5b–5c)**:
  Find:
  ```
  5b. If the stage is not approved and redraft count < 3, spawn the `rdpi-stage-creator` again in `redraft` mode (it will read REVIEW.md and append fix phases to PHASES.md), then go to step #2 to execute the new phases.
  5c. If redraft count ≥ 3, stop and report to the user that the stage has exceeded the redraft limit.
  ```
  Replace with:
  ```
  5b. If the stage is not approved, spawn the `rdpi-stage-creator` again in `redraft` mode (it will read REVIEW.md and append fix phases to PHASES.md), then go to step #2 to execute the new phases.
  ```
- **Details — Edit B (constraint line)**:
  Find:
  ```
  - Maximum 3 redraft rounds per stage. After that, stop and escalate.
  ```
  Delete this line entirely.

  [ref: ../02-design/01-architecture.md#issue-4]

### Task 1.4: Reword approve agent auto-redraft cap (Issue 5)
- **File**: `src/templates/rdpi/agents/rdpi-approve.agent.md`
- **Action**: Modify
- **Description**: Replace the ambiguous "2+" rule (line 184) with explicit "after 2 redraft rounds" hard cap wording.
- **Details**:
  Find:
  ```
  - After 2+ redraft rounds on the same stage (determined in Step 2): you MUST NOT auto-reject even on Critical issues — always present to the user. This prevents infinite loops where review and redraft keep cycling without human intervention.
  ```
  Replace with:
  ```
  - Auto-redraft limit: after 2 redraft rounds on the same stage (determined in Step 2), you MUST stop auto-rejecting and present to the user — even if Critical issues remain. This is the hard cap on automatic redraft cycles.
  ```
  [ref: ../02-design/01-architecture.md#issue-5]

### Task 1.5: Add as-is guardrail to orchestrator TASK.md creation (Issue 6)
- **File**: `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`
- **Action**: Modify
- **Description**: Replace "New Task Setup" steps 3–4 (lines 59–61) with stricter wording that forbids rephrasing.
- **Details**:
  Find:
  ```
  3. If the user's task description is NOT in English, translate it to English preserving the original meaning.
  4. Create `TASK.md` in this directory, insert the task into it.
  ```
  Replace with:
  ```
  3. If the user's task description is NOT in English, translate it to English preserving the original meaning. This is the ONLY transformation allowed.
  4. Create `TASK.md` in this directory. Copy the user's task description into it **as-is** (or its English translation from step 3). Do NOT rephrase, summarize, expand, research, or interpret the text. The user's wording is authoritative.
  ```
  [ref: ../02-design/01-architecture.md#issue-6]

## Verification
- [ ] T1a: Line 25 of `thoughts-workflow.instructions.md` contains `` **`rdpi-version`**: `` — no "Workflow version" prose
- [ ] T1b: `grep -ri "workflow_version" src/templates/` returns 0 matches
- [ ] T2: `rdpi-codebase-researcher.agent.md` frontmatter block includes `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"`
- [ ] T4a: `RDPI-Orchestrator.agent.md` step 5b has no `redraft count < 3` condition, no step 5c exists
- [ ] T4b: `grep -i "maximum.*redraft\|redraft.*limit\|redraft count" src/templates/rdpi/agents/RDPI-Orchestrator.agent.md` returns 0 matches
- [ ] T5: `rdpi-approve.agent.md` contains `MUST stop auto-rejecting` and `hard cap`, no `2+` phrasing
- [ ] T6a: `RDPI-Orchestrator.agent.md` step 4 contains `Do NOT rephrase, summarize, expand, research, or interpret`
- [ ] T6b: Step 3 contains `This is the ONLY transformation allowed`
- [ ] Orchestration steps remain coherently numbered (1–5b) after edits
