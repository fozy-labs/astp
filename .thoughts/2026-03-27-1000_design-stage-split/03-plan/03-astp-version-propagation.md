---
title: "Phase 3: astp-version Propagation"
date: 2026-03-28
stage: 03-plan
role: rdpi-planner
---

## Goal

Add `astp-version` to the README.md frontmatter field lists in the Output Conventions of `rdpi-01-research`, `rdpi-03-plan`, and `rdpi-04-implement` stage skills, and rename `pipeline-version` to `astp-version` in the research-reviewer agent template.

## Dependencies

- **Requires**: Phase 1 (Design Skill Rewrite — confirms the `astp-version` convention established in `rdpi-02-design`)
- **Blocks**: None

## Execution

Parallel with Phase 2. All 4 file changes within this phase are independent.

## Tasks

### Task 3.1: Add astp-version to rdpi-01-research Output Conventions

- **File**: `templates/rdpi/skills/rdpi-01-research/SKILL.md`
- **Action**: Modify
- **Description**: In the `## Output Conventions` section (line 68), update the README.md frontmatter field list to include `astp-version`.
- **Details**:
  Current text (line 70): `README.md uses (title, date, status, feature)`
  Change to: `README.md uses (title, date, status, feature, astp-version)`
  No other changes to this file. All other sections must remain byte-identical.
  - [ref: ../02-design/01-architecture.md#astp-version in Stage README.md]
  - [ref: ../02-design/07-docs.md#Skills (4 files)]

### Task 3.2: Add astp-version to rdpi-03-plan Output Conventions

- **File**: `templates/rdpi/skills/rdpi-03-plan/SKILL.md`
- **Action**: Modify
- **Description**: In the `## Output Conventions` section (line 76), update the README.md frontmatter field list to include `astp-version`.
- **Details**:
  Current text (line 78): `README.md uses (title, date, status, feature, research, design)`
  Change to: `README.md uses (title, date, status, feature, research, design, astp-version)`
  No other changes to this file.
  - [ref: ../02-design/01-architecture.md#astp-version in Stage README.md]

### Task 3.3: Add astp-version to rdpi-04-implement Output Conventions

- **File**: `templates/rdpi/skills/rdpi-04-implement/SKILL.md`
- **Action**: Modify
- **Description**: In the `## Output Conventions` section (line 90), update the README.md frontmatter field list to include `astp-version`.
- **Details**:
  Current text (line 92): `README.md uses (title, date, status, feature, plan)`
  Change to: `README.md uses (title, date, status, feature, plan, astp-version)`
  No other changes to this file.
  - [ref: ../02-design/01-architecture.md#astp-version in Stage README.md]

### Task 3.4: Rename pipeline-version to astp-version in research-reviewer agent

- **File**: `templates/rdpi/agents/rdpi-research-reviewer.agent.md`
- **Action**: Modify
- **Description**: In the README.md frontmatter template (around line 65), rename `pipeline-version` to `astp-version`.
- **Details**:
  Current text: `pipeline-version: "<preserve from existing README.md>"`
  Change to: `astp-version: "<preserve from existing README.md>"`
  No other changes to this file.
  - [ref: ../02-design/04-decisions.md#ADR-6]
  - [ref: ../02-design/07-docs.md#Agents (1 file — field name fix)]

## Verification

- [ ] `templates/rdpi/skills/rdpi-01-research/SKILL.md` Output Conventions includes `astp-version` in README.md field list; all other sections unchanged
- [ ] `templates/rdpi/skills/rdpi-03-plan/SKILL.md` Output Conventions includes `astp-version` in README.md field list; all other sections unchanged
- [ ] `templates/rdpi/skills/rdpi-04-implement/SKILL.md` Output Conventions includes `astp-version` in README.md field list; all other sections unchanged
- [ ] `templates/rdpi/agents/rdpi-research-reviewer.agent.md` uses `astp-version` (not `pipeline-version`); all other content unchanged
- [ ] Grep for `pipeline-version` across all `templates/rdpi/` files returns 0 matches
- [ ] Grep for `astp-version` in Output Conventions of all 4 stage skills returns 4 matches (including `rdpi-02-design` from Phase 1)
