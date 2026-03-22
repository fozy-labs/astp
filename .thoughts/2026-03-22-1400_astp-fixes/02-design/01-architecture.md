---
title: "Change Specification: ASTP Fixes"
date: 2026-03-22
stage: 02-design
role: rdpi-architect
---

## Issue 1 — Duplicate version fields in YAML frontmatter

**Affected files**: `@/src/templates/rdpi/instructions/thoughts-workflow.instructions.md`

**What changes**: Replace line 25:
```
- **Workflow version**: `{{ASTP_WORKFLOW_VERSION}}` (must be included in each md's file)
```
with:
```
- **`rdpi-version`**: `{{ASTP_WORKFLOW_VERSION}}` (must be included in each md file's YAML frontmatter)
```
This makes the instruction unambiguous — it names the exact YAML field (`rdpi-version`) instead of the vague "Workflow version" prose that agents interpret as a second field name.

**Research ref**: [ref: ../01-research/01-codebase-analysis.md#issue-1] — "This instruction is ambiguous — it does not specify a YAML field name." All other agents already use `rdpi-version` correctly.

---

## Issue 2 — Version must come from manifest (codebase-researcher gap)

**Affected files**: `@/src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md`

**What changes**: In the output frontmatter template (lines 31–35), add `rdpi-version` field. Replace:
```yaml
---
title: "<Topic> — Codebase Analysis"
date: <YYYY-MM-DD>
stage: 01-research
role: rdpi-codebase-researcher
---
```
with:
```yaml
---
title: "<Topic> — Codebase Analysis"
date: <YYYY-MM-DD>
stage: 01-research
role: rdpi-codebase-researcher
rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"
---
```

**Research ref**: [ref: ../01-research/01-codebase-analysis.md#issue-2] — "rdpi-codebase-researcher.agent.md is the only agent with a frontmatter template that does NOT include rdpi-version." [ref: ../01-research/02-open-questions.md#q2] — recommends Option 1 for consistency.

---

## Issue 3 — Hint for multi-select prompts

**Affected files**: `@/src/ui/prompts.ts`

**What changes**: Add `hint` property to both `p.multiselect` calls.

In `selectBundles` (~line 66), change:
```ts
const selected = await p.multiselect({
    message: "Select bundles to install:",
    options,
    initialValues,
    required: true,
});
```
to:
```ts
const selected = await p.multiselect({
    message: "Select bundles to install:",
    options,
    initialValues,
    required: true,
    hint: "Space to toggle, Enter to confirm",
});
```

In `selectInstalledBundles` (~line 100), change:
```ts
const selected = await p.multiselect({
    message: "Select bundles to delete:",
    options: installed.map((bundle) => ({
        ...
    })),
    required: true,
});
```
to:
```ts
const selected = await p.multiselect({
    message: "Select bundles to delete:",
    options: installed.map((bundle) => ({
        ...
    })),
    required: true,
    hint: "Space to toggle, Enter to confirm",
});
```

**Research ref**: [ref: ../01-research/01-codebase-analysis.md#issue-3] — both multiselect calls confirmed to have no `hint` property.

---

## Issue 4 — Remove redraft limit from orchestrator

**Affected files**: `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`

**What changes**: Two deletions:

1. Replace steps 5b–5c (lines ~74–75):
```
5b. If the stage is not approved and redraft count < 3, spawn the `rdpi-stage-creator` again in `redraft` mode (it will read REVIEW.md and append fix phases to PHASES.md), then go to step #2 to execute the new phases.
5c. If redraft count ≥ 3, stop and report to the user that the stage has exceeded the redraft limit.
```
with a single step:
```
5b. If the stage is not approved, spawn the `rdpi-stage-creator` again in `redraft` mode (it will read REVIEW.md and append fix phases to PHASES.md), then go to step #2 to execute the new phases.
```

2. Remove the constraint line (~line 132):
```
- Maximum 3 redraft rounds per stage. After that, stop and escalate.
```
Delete this line entirely.

**Research ref**: [ref: ../01-research/01-codebase-analysis.md#issue-4] — three locations confirmed. [ref: ../01-research/02-open-questions.md#q1] — approve agent as sole safeguard accepted as sufficient.

---

## Issue 5 — Auto-redraft limit on approve agent

**Affected files**: `@/src/templates/rdpi/agents/rdpi-approve.agent.md`

**What changes**: Replace the existing rule (~line 184):
```
- After 2+ redraft rounds on the same stage (determined in Step 2): you MUST NOT auto-reject even on Critical issues — always present to the user. This prevents infinite loops where review and redraft keep cycling without human intervention.
```
with:
```
- Auto-redraft limit: after 2 redraft rounds on the same stage (determined in Step 2), you MUST stop auto-rejecting and present to the user — even if Critical issues remain. This is the hard cap on automatic redraft cycles.
```

The change: removes ambiguous "2+" phrasing, states "after 2 redraft rounds" as an explicit cap, and uses "hard cap" language to reinforce this is the primary loop-prevention mechanism.

**Research ref**: [ref: ../01-research/02-open-questions.md#q3] — recommends rewording for clarity since this becomes the sole loop safeguard after Issue 4.

---

## Issue 6 — Orchestrator TASK.md wording

**Affected files**: `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`

**What changes**: Replace the "New Task Setup" steps (lines ~58–63):
```
1. Decide on the name of the task.
2. Create a new directory `.thoughts/<YYYY-MM-DD-HHmm>_<feature-name>/`.
3. If the user's task description is NOT in English, translate it to English preserving the original meaning.
4. Create `TASK.md` in this directory, insert the task into it.
```
with:
```
1. Decide on the name of the task.
2. Create a new directory `.thoughts/<YYYY-MM-DD-HHmm>_<feature-name>/`.
3. If the user's task description is NOT in English, translate it to English preserving the original meaning. This is the ONLY transformation allowed.
4. Create `TASK.md` in this directory. Copy the user's task description into it **as-is** (or its English translation from step 3). Do NOT rephrase, summarize, expand, research, or interpret the text. The user's wording is authoritative.
```

**Research ref**: [ref: ../01-research/01-codebase-analysis.md#issue-6] — "no guardrails preventing [rephrasing]." The phrase "insert the task into it" gives too much latitude.
