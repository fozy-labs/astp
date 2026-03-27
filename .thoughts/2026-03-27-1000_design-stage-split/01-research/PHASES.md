---
title: "Phases: 01-research"
date: 2026-03-27
stage: 01-research
---

# Phases: 01-research

## Phase 1: Codebase Analysis — Design Stage Internals

- **Agent**: `rdpi-codebase-researcher`
- **Output**: `01-codebase-analysis.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

Read the task description at `.thoughts/2026-03-27-1000_design-stage-split/TASK.md`.

Analyze the current 02-design stage structure. Entry points:

1. **Design stage skill**: `templates/rdpi/skills/rdpi-02-design/SKILL.md` — document the full phase structure, available roles, scaling rules, output conventions, and phase prompt guidelines. Note how work is currently distributed across phases.
2. **Architect agent**: `templates/rdpi/agents/rdpi-architect.agent.md` — document the agent's role definition, capabilities, constraints, output format, and how it interacts with the stage skill.
3. **QA Designer agent**: `templates/rdpi/agents/rdpi-qa-designer.agent.md` — document the agent's role, what it produces, and its relationship to the architect's outputs.
4. **Design Reviewer agent**: `templates/rdpi/agents/rdpi-design-reviewer.agent.md` — document review criteria, quality checklist, and what it checks.

Aspects to trace:
- How the current design stage distributes work (single architect handling core + use cases + docs vs. multiple agents)
- Data flow between phases (what each phase reads and writes)
- The output file naming convention (`01-architecture.md`, `02-dataflow.md`, etc.) and how files reference each other
- What frontmatter fields are used in design stage outputs and README.md
- How the design reviewer synthesizes findings into README.md
- Any existing mechanisms for cross-phase consistency checking or correction

Scope: Only the design stage skill and its three associated agents. Do NOT analyze other stages or the stage creator.

Output only verifiable facts. No solutions, no proposals.

---

## Phase 2: Codebase Analysis — Supporting Infrastructure

- **Agent**: `rdpi-codebase-researcher`
- **Output**: `02-supporting-infrastructure.md`
- **Depends on**: —
- **Retry limit**: 2

### Prompt

Read the task description at `.thoughts/2026-03-27-1000_design-stage-split/TASK.md`.

Analyze the supporting infrastructure relevant to the design stage split. Entry points:

1. **Stage creator agent**: `templates/rdpi/agents/rdpi-stage-creator.agent.md` — document how it generates README.md files for stages, what frontmatter fields it uses, and where/how it references pipeline version. Track every place where README.md frontmatter is defined or generated.
2. **Implement reviewer agent**: `templates/rdpi/agents/rdpi-implement-reviewer.agent.md` — document the agent's role, review criteria, and capabilities. Note whether it is currently referenced in any stage other than 04-implement.
3. **Manifest**: `templates/manifest.json` — document the rdpi bundle version field location and format (currently `1.0.4`).
4. **Workflow instructions**: `templates/rdpi/instructions/thoughts-workflow.instructions.md` — document any rules about README.md structure, frontmatter, or stage output conventions.
5. **Other stage skills for comparison**: `templates/rdpi/skills/rdpi-01-research/SKILL.md`, `templates/rdpi/skills/rdpi-03-plan/SKILL.md`, `templates/rdpi/skills/rdpi-04-implement/SKILL.md` — document how each stage defines README.md frontmatter in its Output Conventions. Note any stage that already includes a pipeline version field.

Aspects to trace:
- All locations where README.md frontmatter schema is defined or enforced (stage skills, stage creator, workflow instructions)
- How pipeline version could propagate from manifest.json to README.md frontmatter (current mechanism, if any)
- The implement reviewer's current scope and whether it has any design-awareness capabilities
- Patterns from other stages that could inform the design stage restructuring (e.g., how 04-implement handles multiple sequential agents)

Scope: Stage creator, implement reviewer, manifest, workflow instructions, and other stage skills. Do NOT deeply analyze the design stage skill itself (that is Phase 1's scope).

Output only verifiable facts. No solutions, no proposals.

---

## Phase 3: Open Questions

- **Agent**: `rdpi-questioner`
- **Output**: `03-open-questions.md`
- **Depends on**: 1, 2
- **Retry limit**: 1

### Prompt

Read the task description at `.thoughts/2026-03-27-1000_design-stage-split/TASK.md`.

Read all research outputs:
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/01-codebase-analysis.md`
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/02-supporting-infrastructure.md`

The feature is splitting the 02-design stage so that multiple designers work sequentially from "most defining" to "less defining", with inconsistency correction logging, a new `00-short-design.md` starting document, implement-reviewer integration, and pipeline version in README.md frontmatter.

Generate questions covering:
- **Stage splitting**: How should "most defining to less defining" be concretely divided? Which current design outputs belong to which designer tier? What is the boundary between tiers?
- **Inconsistency correction**: How should the correction log file be structured? When a later designer fixes an earlier design, what happens to the original file — overwrite, annotate, or leave unchanged? How does the implement-reviewer verify corrections didn't introduce new inconsistencies?
- **`00-short-design.md`**: What should its scope and format be? Who produces it — the first designer or the stage creator? How does it relate to the research stage outputs?
- **Implement reviewer in design**: What is the minimum count? What specific criteria should they check at design stage (vs. at implement stage)? Should they review after each designer tier or only at the end?
- **Pipeline version in README.md**: How does the stage creator access the manifest version at runtime? Should it be a static field or dynamically resolved? Which README.md files are affected (stage README only, or also feature-level)?
- **Compatibility**: How do these changes affect the stage creator's PHASES.md generation logic? Do other stages need updates?

Classify each question as High / Medium / Low priority. Each question must include: context, options (if applicable), risks, and your recommendation.

---

## Phase 4: Research Review

- **Agent**: `rdpi-research-reviewer`
- **Output**: Updates `README.md`
- **Depends on**: 1, 2, 3
- **Retry limit**: 2

### Prompt

Read all research phase outputs:
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/01-codebase-analysis.md`
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/02-supporting-infrastructure.md`
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/03-open-questions.md`

Update `.thoughts/2026-03-27-1000_design-stage-split/01-research/README.md` with:
- **Summary**: concise description of what was researched and why
- **Documents**: links to all three research outputs with brief descriptions
- **Key Findings**: 5-7 bullet points capturing the most important facts discovered
- **Contradictions and Gaps**: any inconsistencies between documents or missing information
- **Quality Review**: checklist verifying — file existence, reference accuracy, source attribution with confidence levels, question actionability, no-solutions rule compliance, frontmatter correctness, cross-reference consistency between documents
- **Next Steps**: what the design stage needs to address based on findings

Verify cross-references: check that claims in the codebase analysis align with facts in the supporting infrastructure analysis. Flag any discrepancies.

Set README.md status to `Complete` when done. Preserve existing frontmatter fields.

---

# Redraft Round 1

## Phase 5: Fix issue #1

- **Agent**: `rdpi-redraft`
- **Output**: Updates `README.md`
- **Depends on**: 4
- **Retry limit**: 1
- **Review issues**: 1

### Prompt

Read REVIEW.md at `.thoughts/2026-03-27-1000_design-stage-split/01-research/REVIEW.md`.
Your assigned issues: #1.
Affected files: `.thoughts/2026-03-27-1000_design-stage-split/01-research/README.md`.
Fix only your assigned issues.

---

## Phase 6: Re-review after Redraft Round 1

- **Agent**: `rdpi-research-reviewer`
- **Depends on**: 5
- **Retry limit**: 2

### Prompt

Re-verify the README.md at `.thoughts/2026-03-27-1000_design-stage-split/01-research/README.md`.

Phase 5 addressed issue #1 from REVIEW.md (status field not set to `Complete`). Confirm:
1. The `status` field in README.md frontmatter is now `Complete`.
2. All other frontmatter fields and document content remain intact and correct.
3. Cross-references to research outputs (`01-codebase-analysis.md`, `02-supporting-infrastructure.md`, `03-open-questions.md`) are still valid.

Also read all research outputs to verify the full quality checklist:
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/01-codebase-analysis.md`
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/02-supporting-infrastructure.md`
- `.thoughts/2026-03-27-1000_design-stage-split/01-research/03-open-questions.md`

Set README.md status to `Complete` when done. Preserve existing frontmatter fields.
