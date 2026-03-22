---
title: "Phases: 01-research"
date: 2026-03-22
stage: 01-research
---

# Phases: 01-research

## Phase 1: Codebase Analysis — All 6 Issues

- **Agent**: `rdpi-codebase-researcher`
- **Output**: `01-codebase-analysis.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

Read the task file at `d:\Area\projects\fz\astp\.thoughts\2026-03-22-1400_astp-fixes\TASK.md`.

You need to locate every file affected by 6 fix issues. For each issue below, find the relevant files and document the current implementation (quote the relevant code/text snippets). Workspace root: `d:\Area\projects\fz\astp`.

**Issue 1 — Duplicate version fields in YAML frontmatter**
Search templates in `src/templates/` for files containing `workflow_version` or multiple version-related YAML fields. Also check `src/core/frontmatter.ts` and any code that generates/writes frontmatter to see where version fields are set.

**Issue 2 — Version must come from manifest**
Find where version values are currently hardcoded or sourced. Check `src/templates/manifest.json` for the version field. Trace how `src/core/manifest.ts` reads the manifest and whether the version is exposed. Check `src/core/installer.ts` and `src/core/frontmatter.ts` to see if/how version is injected into generated files.

**Issue 3 — Hint for multi-select prompts**
Look at `src/ui/prompts.ts` and `src/ui/wizard.ts` for multi-select/checkbox prompts. Document the current prompt configuration — specifically the `message` and `hint` properties (or lack thereof).

**Issue 4 — Remove redraft limit from orchestrator**
Read `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`. Find any mention of redraft limit (e.g., "3 redrafts", "redraft limit", "maximum redrafts"). Quote the exact text.

**Issue 5 — Set auto-redraft limit on approve agent**
Read `src/templates/rdpi/agents/rdpi-approve.agent.md`. Document current behavior around auto-redraft and whether there's an existing limit. Quote relevant sections.

**Issue 6 — Orchestrator distorts TASK.md wording**
In `src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`, find the section that instructs how to write TASK.md. Quote the exact instructions about task description, research, rephrasing, or interpretation.

Output format: for each issue, list affected file paths and quote the current relevant code/text. No solutions or opinions — facts only.

---

## Phase 2: Open Questions

- **Agent**: `rdpi-questioner`
- **Output**: `02-open-questions.md`
- **Depends on**: 1
- **Retry limit**: 1

### Prompt

Read the task at `d:\Area\projects\fz\astp\.thoughts\2026-03-22-1400_astp-fixes\TASK.md` and the codebase analysis at `d:\Area\projects\fz\astp\.thoughts\2026-03-22-1400_astp-fixes\01-research\01-codebase-analysis.md`.

These are 6 targeted fixes to astp. Identify any ambiguities, constraints, or risks that the design phase needs to resolve. Focus only on things that are genuinely unclear from the codebase analysis — do NOT invent problems.

For each question: state context, options if applicable, risk, and priority (High/Medium/Low).

Keep this short. If the codebase analysis already answers everything clearly, say so and list zero questions. Do not pad.

---

## Phase 3: Research Review

- **Agent**: `rdpi-research-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1, 2
- **Retry limit**: 2

### Prompt

Read all research outputs:
- Task: `d:\Area\projects\fz\astp\.thoughts\2026-03-22-1400_astp-fixes\TASK.md`
- Codebase analysis: `d:\Area\projects\fz\astp\.thoughts\2026-03-22-1400_astp-fixes\01-research\01-codebase-analysis.md`
- Open questions: `d:\Area\projects\fz\astp\.thoughts\2026-03-22-1400_astp-fixes\01-research\02-open-questions.md`

Update `d:\Area\projects\fz\astp\.thoughts\2026-03-22-1400_astp-fixes\01-research\README.md`: set status to the appropriate value, and fill in: Summary (2-3 sentences), Documents (links to phase outputs), Key Findings (5-7 bullets mapping issues to affected files), Contradictions and Gaps (if any), Quality Review checklist (verify file paths exist, no solutions proposed, frontmatter correct), Next Steps.

Keep it concise. This is a batch of small fixes — the README should be brief.

---
