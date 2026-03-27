---
title: "Phases: 04-implement"
date: 2026-03-28
stage: 04-implement
---

# Phases: 04-implement

## Phase 1: Design Skill Rewrite (Plan Phase 1)

- **Agent**: `rdpi-codder`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

Read the plan phase file at `../03-plan/01-design-skill-rewrite.md`. It contains 7 tasks (1.1–1.7) that all target the same file: `templates/rdpi/skills/rdpi-02-design/SKILL.md`.

Read the current file at `templates/rdpi/skills/rdpi-02-design/SKILL.md` first to understand the existing structure.

For design context, read:
- `../02-design/01-architecture.md` (new phase structure, correction mechanism, 00-short-design.md spec, scaling rules)
- `../02-design/02-dataflow.md` (correction entry lifecycle, reviewer data flow)
- `../02-design/04-decisions.md` (ADR-7 for phase cap)

Implement all 7 tasks in order (1.1 through 1.7):
1. Rewrite Available Roles table with new invocation limits
2. Replace 4-phase table with 9-phase per-document tier table
3. Add Correction Mechanism section (after Typical Phase Structure, before Phase Prompt Guidelines)
4. Add 00-short-design.md Specification section (after Correction Mechanism, before Phase Prompt Guidelines)
5. Rewrite Phase Prompt Guidelines for all 9 phases
6. Update Output Conventions (astp-version in README.md frontmatter, add 00-short-design.md and 09-corrections.md conventions)
7. Rewrite Scaling Rules (cap 10, full/medium/simple/minimum tiers)

Constraints:
- Preserve YAML frontmatter (`name`, `description`, and all `astp-*` fields) unchanged.
- Preserve existing conventions: Mermaid rules, ADR numbering format, research cross-reference conventions.
- Remove all references to the old 4-phase structure.
- Do NOT modify any files outside `templates/rdpi/skills/rdpi-02-design/SKILL.md`.

---

## Phase 2: Verify Design Skill Rewrite (Plan Phase 1)

- **Agent**: `rdpi-tester`
- **Depends on**: 1
- **Retry limit**: 1

### Prompt

Verify that the changes to `templates/rdpi/skills/rdpi-02-design/SKILL.md` satisfy the plan phase 1 verification checklist. Read the plan at `../03-plan/01-design-skill-rewrite.md` — its `## Verification` section has 11 items.

Run the following content checks against `templates/rdpi/skills/rdpi-02-design/SKILL.md`:
1. Valid YAML frontmatter with `name`, `description` fields
2. Phase structure table lists exactly 9 phases with correct agent assignments (`rdpi-architect` ×6, `rdpi-qa-designer` ×1, `rdpi-design-reviewer` ×2) and dependencies
3. Correction Mechanism section contains all 6 rules and `09-corrections.md` format template with table header
4. `00-short-design.md` specification present with format template, section list, and 1–2 page constraint
5. Phase Prompt Guidelines cover all 9 phases (tiers 1–6, QA, reviewer pass 1, reviewer pass 2)
6. Reviewer Pass 1 checklist includes the original items plus 3 new items (short-design, correction factuality, correction accuracy)
7. Reviewer Pass 2 handles both "corrections exist" and "no corrections" paths
8. Output Conventions include `astp-version` in README.md frontmatter fields
9. Scaling rules specify cap of 10 and define full (9) / medium (7) / simple (5) / minimum (4) phase counts
10. All preserved content from original file (Mermaid rules, ADR numbering, research cross-ref conventions) is intact
11. No references to old 4-phase structure remain (search for "4-phase", "4 phases", "Phase 4:" as the last phase)

Do NOT run `npm run ts-check` — this is a markdown template file. Verification is content-based only.

Save the verification report to `04-implement/verification-1.md`.

---

## Phase 3: Agent Updates (Plan Phase 2)

- **Agent**: `rdpi-codder`
- **Depends on**: 2
- **Retry limit**: 2

### Prompt

Read the plan phase file at `../03-plan/02-agent-updates.md`. It contains 3 tasks (2.1–2.3) targeting two agent files.

Read the current files first:
- `templates/rdpi/agents/rdpi-architect.agent.md`
- `templates/rdpi/agents/rdpi-design-reviewer.agent.md`

For design context, read:
- `../02-design/01-architecture.md` (00-short-design.md spec, correction mechanism, design reviewer integration)
- `../02-design/02-dataflow.md` (correction entry lifecycle, reviewer data flow)

Also read the newly rewritten skill file for consistency:
- `templates/rdpi/skills/rdpi-02-design/SKILL.md`

Implement all 3 tasks:

**Task 2.1** — `templates/rdpi/agents/rdpi-architect.agent.md`:
- Add `### 00-short-design.md — Design Direction Prologue` capability subsection under existing `## Capabilities`
- Include: produced in tier 1 alongside architecture, structure requirements, 1–2 page constraint, frontmatter

**Task 2.2** — `templates/rdpi/agents/rdpi-architect.agent.md`:
- Add `## Correction Mechanism` section after existing `## Rules`
- Include: tier 1 no correction authority, tiers 2–6 correction rules, factual-only constraint, 09-corrections.md creation/append rules, append-only log rule

**Task 2.3** — `templates/rdpi/agents/rdpi-design-reviewer.agent.md`:
- Update introduction for two-pass model (Pass 1 general + Pass 2 correction log)
- Extend Pass 1 checklist with 3 new items (short-design, correction factuality, correction accuracy)
- Add `### Pass 2 — Correction Log Review` section with both "exists" and "absent" paths
- Update README.md output format to include `### Correction Log Review` subsection and `astp-version` in frontmatter

Constraints:
- Do NOT modify YAML frontmatter (`name`, `description`, `user-invocable`, `tools`) in either agent file.
- Preserve existing agent rules and constraints (architect `[ref:]` convention, reviewer "do NOT modify design documents" rule).
- Do NOT modify any files outside these two agent files.

---

## Phase 4: astp-version Propagation (Plan Phase 3)

- **Agent**: `rdpi-codder`
- **Depends on**: 2
- **Retry limit**: 2

### Prompt

Read the plan phase file at `../03-plan/03-astp-version-propagation.md`. It contains 4 tasks (3.1–3.4) targeting four separate files.

Implement all 4 tasks — each is a minimal, surgical text replacement:

**Task 3.1** — `templates/rdpi/skills/rdpi-01-research/SKILL.md`:
- In `## Output Conventions`, change `README.md uses (title, date, status, feature)` to `README.md uses (title, date, status, feature, astp-version)`
- No other changes to this file.

**Task 3.2** — `templates/rdpi/skills/rdpi-03-plan/SKILL.md`:
- In `## Output Conventions`, change `README.md uses (title, date, status, feature, research, design)` to `README.md uses (title, date, status, feature, research, design, astp-version)`
- No other changes to this file.

**Task 3.3** — `templates/rdpi/skills/rdpi-04-implement/SKILL.md`:
- In `## Output Conventions`, change `README.md uses (title, date, status, feature, plan)` to `README.md uses (title, date, status, feature, plan, astp-version)`
- No other changes to this file.

**Task 3.4** — `templates/rdpi/agents/rdpi-research-reviewer.agent.md`:
- Change `pipeline-version: "<preserve from existing README.md>"` to `astp-version: "<preserve from existing README.md>"`
- No other changes to this file.

Constraints:
- Each file change is exactly one line replacement. All other content must remain byte-identical.
- Do NOT modify any files outside these four files.

---

## Phase 5: Verify Agent Updates + astp-version Propagation (Plan Phases 2–3)

- **Agent**: `rdpi-tester`
- **Depends on**: 3, 4
- **Retry limit**: 1

### Prompt

Verify that the changes from plan phases 2 and 3 satisfy their verification checklists. Read:
- `../03-plan/02-agent-updates.md` — `## Verification` section (9 items)
- `../03-plan/03-astp-version-propagation.md` — `## Verification` section (6 items)

**Plan Phase 2 checks** against `templates/rdpi/agents/rdpi-architect.agent.md` and `templates/rdpi/agents/rdpi-design-reviewer.agent.md`:
1. Architect contains `### 00-short-design.md` capability subsection
2. Architect has `## Correction Mechanism` section with factual-only constraint, append-only log rule, and 09-corrections.md creation instructions
3. Reviewer describes two-pass model (Pass 1 = general review, Pass 2 = correction log)
4. Reviewer Pass 1 checklist has original items + 3 new items
5. Reviewer Pass 2 process covers both "corrections exist" and "no corrections" paths
6. Reviewer output format includes `### Correction Log Review` subsection
7. README.md frontmatter template in reviewer includes `astp-version` field
8. Existing agent constraints preserved: architect `[ref:]` convention, reviewer "do NOT modify" rule
9. No changes to agent YAML frontmatter (`name`, `description`, `user-invocable`, `tools`)

**Plan Phase 3 checks** across 4 files:
1. `templates/rdpi/skills/rdpi-01-research/SKILL.md` Output Conventions includes `astp-version`; all other sections unchanged
2. `templates/rdpi/skills/rdpi-03-plan/SKILL.md` Output Conventions includes `astp-version`; all other sections unchanged
3. `templates/rdpi/skills/rdpi-04-implement/SKILL.md` Output Conventions includes `astp-version`; all other sections unchanged
4. `templates/rdpi/agents/rdpi-research-reviewer.agent.md` uses `astp-version` (not `pipeline-version`); all other content unchanged
5. Search for `pipeline-version` across all `templates/rdpi/` files returns 0 matches
6. Search for `astp-version` in Output Conventions of all 4 stage skills returns 4 matches

**Cross-check**: Verify the design skill rewrite (Phase 1, already verified) is consistent with the agent updates — agent references to correction mechanism, 00-short-design.md, and reviewer passes match what the skill defines.

Do NOT run `npm run ts-check` — all changes are markdown template files. Verification is content-based only.

Save the verification report to `04-implement/verification-2-3.md`.

---

## Phase 6: Implementation Review

- **Agent**: `rdpi-implement-reviewer`
- **Depends on**: 2, 5
- **Retry limit**: 2

### Prompt

Review the complete implementation of the design-stage-split feature. Read all context:

**Plan phases:**
- `../03-plan/01-design-skill-rewrite.md` (7 tasks, 11 verification items)
- `../03-plan/02-agent-updates.md` (3 tasks, 9 verification items)
- `../03-plan/03-astp-version-propagation.md` (4 tasks, 6 verification items)

**Design documents (for traceability):**
- `../02-design/README.md`
- `../01-research/README.md`

**Verification reports:**
- `04-implement/verification-1.md`
- `04-implement/verification-2-3.md`

**Changed files (all 7):**
- `templates/rdpi/skills/rdpi-02-design/SKILL.md`
- `templates/rdpi/agents/rdpi-architect.agent.md`
- `templates/rdpi/agents/rdpi-design-reviewer.agent.md`
- `templates/rdpi/skills/rdpi-01-research/SKILL.md`
- `templates/rdpi/skills/rdpi-03-plan/SKILL.md`
- `templates/rdpi/skills/rdpi-04-implement/SKILL.md`
- `templates/rdpi/agents/rdpi-research-reviewer.agent.md`

Write `04-implement/README.md` (replacing the stage-creator's placeholder) with:
- Implementation record: date, status, plan link
- Phase completion status (3/3 plan phases)
- Verification results summary from both verification files
- Quality review checklist: all plan phases implemented, verification passed, no out-of-scope files modified, template content follows project patterns, cross-file references consistent, no security vulnerabilities
- List of all 7 changed files
- Post-implementation recommendations (manual review areas: correction mechanism cross-references, reviewer two-pass flow, scaling rule consistency)
- Recommended commit message

Note: No runtime code was changed — skip TypeScript/build/barrel-export checks. Focus on content correctness, cross-file consistency, and design traceability.
