---
title: "Research: Design Stage Split"
date: 2026-03-27
status: Approved
feature: "Split the 02-design stage into multi-designer phases with inconsistency tracking, short-design intro doc, implement-reviewer integration, and pipeline version in README frontmatter"
---

## Summary

This research stage investigated the current 02-design stage structure and its supporting infrastructure to gather every fact needed before redesigning it. The task requires splitting the single-architect design stage into multiple sequential designer tiers (ordered "most defining" to "less defining"), adding an inconsistency correction mechanism, introducing a new `00-short-design.md` starting document, integrating `rdpi-implement-reviewer` into the design stage, and propagating the pipeline version into `.thoughts/` README.md frontmatter.

The research found that the current design stage is a 4-phase sequential pipeline where the architect agent produces 6 out of 8 documents, with no mechanism for cross-phase correction — later phases never modify earlier outputs. The implement-reviewer is exclusively scoped to 04-implement with zero design-awareness. The `pipeline-version` frontmatter field is expected by the research-reviewer agent but nothing in the pipeline currently generates it. A 6-phase hard cap constrains how many designer tiers and reviewers can fit into the redesigned stage. These constraints — especially the phase cap and the absence of correction infrastructure — are the critical factors the design stage must address.

## Documents

- [Codebase Analysis](./01-codebase-analysis.md) — Current design stage internals: skill structure, architect/QA/reviewer agents, phase data flow, output conventions, and consistency mechanisms
- [Supporting Infrastructure](./02-supporting-infrastructure.md) — Stage creator, implement reviewer, manifest versioning, workflow instructions, and cross-stage README.md frontmatter comparison
- [Open Questions](./03-open-questions.md) — 13 questions covering tier boundaries, correction mechanics, `00-short-design.md` scope, implement-reviewer integration, pipeline version propagation, and compatibility

## Key Findings

1. **Architect bottleneck**: The architect agent handles phases 1–2 producing 6/8 documents; QA designer and design reviewer each occupy a single phase — work distribution is heavily front-loaded ([Codebase Analysis](./01-codebase-analysis.md) §1–2).
2. **No correction mechanism**: Data flow is strictly one-directional; later phases never modify earlier outputs and the design reviewer explicitly cannot modify design documents ([Codebase Analysis](./01-codebase-analysis.md) §8).
3. **Implement-reviewer has zero design awareness**: All 9 references to `rdpi-implement-reviewer` across templates are scoped to 04-implement; its checklist checks plan compliance and code patterns, not design traceability ([Supporting Infrastructure](./02-supporting-infrastructure.md) §2).
4. **`pipeline-version` is expected but never generated**: The research-reviewer agent expects `pipeline-version` in README.md frontmatter, yet no stage skill, stage creator, or workflow instruction defines or produces it ([Supporting Infrastructure](./02-supporting-infrastructure.md) §5).
5. **6-phase hard cap constrains the redesign**: Scaling rules cap total phases at 6; with 2 designer tiers + QA + design reviewer + implement-reviewers, the budget is tight ([Codebase Analysis](./01-codebase-analysis.md) §1, [Open Questions](./03-open-questions.md) Q5).
6. **`astp-version` already injected into installed templates**: The CLI injects the manifest version into template file frontmatter at install time, providing a runtime-accessible source for `pipeline-version` without tooling changes ([Supporting Infrastructure](./02-supporting-infrastructure.md) §3).
7. **Stage creator adapts from skill Output Conventions**: The stage creator reads the stage skill to determine README.md frontmatter fields — updating the design skill's Output Conventions is sufficient to propagate new fields ([Supporting Infrastructure](./02-supporting-infrastructure.md) §1).

## Contradictions and Gaps

No contradictions found between documents. All cross-references are consistent:

- Both codebase analyses agree on the one-directional data flow and absence of correction mechanisms.
- The implement-reviewer's scope is consistently documented as 04-implement-only across both analysis documents.
- The `pipeline-version` gap is confirmed from both the stage skill perspective (no field defined) and the infrastructure perspective (nothing generates it).

**Minor gap**: The open questions document recommends the first designer tier produce `00-short-design.md` (Q6, Option 2), but no research was done on what content this document should contain relative to the research summary. The design stage will need to define its format and relationship to `../01-research/README.md`.

## Quality Review

### Checklist

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | All phases produced output files | PASS | 3 phase outputs present: `01-codebase-analysis.md`, `02-supporting-infrastructure.md`, `03-open-questions.md` |
| 2 | Codebase analysis has exact file:line references | PASS | Both analysis docs use `@/templates/...:line-line` format consistently with specific line ranges |
| 3 | External research has source + confidence annotations | N/A | No external research phase defined in PHASES.md — all phases are codebase analysis or synthesis |
| 4 | Open questions are actionable (context, options, risks) | PASS | All 13 questions include Context, Options (2–3 each), Risks, and Researcher recommendation |
| 5 | No solutions or design proposals in research | PASS | Analysis docs contain only verifiable facts; open questions contain evidence-based leanings in recommendations (acceptable per rules) |
| 6 | YAML frontmatter present on all files | PASS | All three outputs have correct frontmatter with `title`, `date`, `stage`, `role` fields |
| 7 | Cross-references consistent between documents | PASS | Implement-reviewer scope, data flow direction, frontmatter field sets, and phase cap all align across documents |

### Issues Found

No issues found.

## Next Steps

Proceeds to Design stage after human review.
