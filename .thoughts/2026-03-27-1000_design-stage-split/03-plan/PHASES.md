---
title: "Phases: 03-plan"
date: 2026-03-28
stage: 03-plan
---

# Phases: 03-plan

## Phase 1: Implementation Planning

- **Agent**: `rdpi-planner`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

Read the task description at `.thoughts/2026-03-27-1000_design-stage-split/TASK.md`.

Read ALL research outputs:
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/README.md`
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/01-codebase-analysis.md`
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/02-supporting-infrastructure.md`

Read ALL design outputs:
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/README.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/01-architecture.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/02-dataflow.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/03-model.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/04-decisions.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/05-usecases.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/06-testcases.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/07-docs.md`
- `.thoughts/2026-03-27-1000_design-stage-split/02-design/08-risks.md`

Before writing any plan, perform analysis:
1. Map every design component to concrete template files (create/modify/delete). The design identifies 7 affected files — verify each path against the actual repository using search. Key template paths to verify under `templates/rdpi/`:
   - `skills/rdpi-02-design/SKILL.md` — main redesign target (tiers, correction mechanism, 00-short-design.md, scaling rules, phase cap to 10)
   - `skills/rdpi-01-research/SKILL.md` — astp-version in Output Conventions
   - `skills/rdpi-03-plan/SKILL.md` — astp-version in Output Conventions
   - `skills/rdpi-04-implement/SKILL.md` — astp-version in Output Conventions
   - `agents/rdpi-stage-creator.agent.md` — astp-version in README.md template
   - `instructions/thoughts-workflow.instructions.md` — astp-version mention in workflow rules
   - Also check if any other files reference design stage structure that might need updates
2. Identify dependencies between changes (which files must be modified first)
3. Determine which tasks can be parallelized
4. Estimate per-task complexity (Low/Medium/High)
5. Define per-phase verification criteria (minimum: `npm run ts-check` is not applicable here since all changes are markdown templates — define appropriate verification instead, such as internal consistency checks and frontmatter validation)
6. Verify ALL file paths against actual repository before referencing them

Output structure:
- `README.md` in `.thoughts/2026-03-27-1000_design-stage-split/03-plan/` with: phase dependency graph (Mermaid), summary table, parallelization rules, execution rules
- Individual `NN-phase.md` files with task-level detail

Task format requirements:
- Each task specifies exact file path, action (Create/Modify), and detailed description of what changes
- Each task references the design document section it implements (e.g., `[ref: ../02-design/01-architecture.md §3]`)
- Verification checklist per phase

Constraints:
- The project has no runtime code changes — all modifications are to markdown/JSON template files under `templates/rdpi/`
- No `docs/` or `apps/demos/` impact (docs/ is empty, no demos exist)
- Do not split trivial changes (e.g., adding a single frontmatter field to 3 similar files) into separate phases — group them
- The major work is the `rdpi-02-design/SKILL.md` rewrite; astp-version propagation across other files is a smaller coordinated change

---

## Phase 2: Plan Review

- **Agent**: `rdpi-plan-reviewer`
- **Depends on**: 1
- **Retry limit**: 2

### Prompt

Review all plan outputs in `.thoughts/2026-03-27-1000_design-stage-split/03-plan/`:
- `README.md`
- All `NN-phase.md` files present in the directory

Cross-reference against ALL design documents in `.thoughts/2026-03-27-1000_design-stage-split/02-design/`:
- `README.md` (key decisions summary and document list)
- `01-architecture.md` (tier structure, correction mechanism, 00-short-design.md spec, scaling rules, reviewer integration)
- `02-dataflow.md` (per-tier read/write/correct map, correction log accumulation)
- `03-model.md` (entities and relationships)
- `04-decisions.md` (7 ADRs — especially ADR-1 per-document tiers, ADR-6 astp-version, ADR-7 phase cap)
- `07-docs.md` (7 affected template files inventory)
- `08-risks.md` (6 risks — verify plan mitigates high-impact risks R1, R2, R4)

Review criteria:
1. Every design component from the architecture and decisions is mapped to at least one plan task
2. File paths are concrete and verified against the repository (not placeholders)
3. Dependencies between phases are correct (no phase reads an output not yet produced)
4. Each phase has verification criteria
5. No vague tasks — all tasks specify exact changes to exact files
6. Each task references the design section it implements
7. Parallelizable vs. sequential tasks correctly marked
8. Per-task complexity estimates present (Low/Medium/High)
9. Documentation tasks proportional (docs/ is empty — no doc tasks expected)
10. Mermaid dependency graph present in README.md
11. Phase summary table complete in README.md
12. The 7 affected files from `07-docs.md` are all accounted for in the plan
13. High-impact risks (R1: phase cap, R2: cascading corrections, R4: stage creator interpretation) have corresponding plan mitigations or verification steps

Update README.md: add `## Quality Review` section with checklist results, set status to `Draft`.

---
