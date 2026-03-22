---
title: "Research: ASTP Fixes"
date: 2026-03-22
status: Approved
feature: "Batch of 6 targeted fixes to astp CLI tool templates and code"
rdpi-version: b0.5
---

## Summary

Research covered six targeted fixes: duplicate YAML version fields, version sourcing from manifest, multi-select prompt hints, orchestrator redraft limit removal, approve agent auto-redraft limit, and orchestrator TASK.md wording. The codebase analysis mapped every affected file with code quotes, and the open questions phase surfaced three genuine ambiguities (interaction between Issues 4+5, missing `rdpi-version` in codebase-researcher template, and wording clarity of existing approve-agent rule). All issues are well-scoped and localized — most touch 1–3 files each, with Issues 1+2 having the widest blast radius across template agents and core installer code.

## Documents

- [Codebase Analysis](./01-codebase-analysis.md)
- [Open Questions](./02-open-questions.md)

## Key Findings

- **Issue 1**: The ambiguous "Workflow version" phrasing in `thoughts-workflow.instructions.md:25` is the root cause of duplicate version fields; all other agent templates already use `rdpi-version` correctly (01-codebase-analysis.md, Issue 1).
- **Issue 2**: The version pipeline (manifest → installer token replacement → installed file content) is already correct; `rdpi-codebase-researcher.agent.md` is the only agent template missing `rdpi-version` in its output format (01-codebase-analysis.md, Issue 2; 02-open-questions.md, Q2).
- **Issue 3**: Both multi-select prompts in `src/ui/prompts.ts` (lines 64, 98) lack a `hint` property — straightforward addition (01-codebase-analysis.md, Issue 3).
- **Issue 4**: Orchestrator redraft limit appears in three places: orchestration steps 5b–5c (line 74–75) and constraints section (line 132) of `RDPI-Orchestrator.agent.md` (01-codebase-analysis.md, Issue 4).
- **Issue 5**: The approve agent already has a "2+ redraft rounds" guardrail (line 184), but its wording may be ambiguous to LLMs — rewording for clarity is recommended since it becomes the sole loop safeguard after Issue 4 (02-open-questions.md, Q3).
- **Issues 4+5 interaction**: Removing the orchestrator limit makes the approve agent the only infinite-loop prevention mechanism; accepted as sufficient given the explicit `MUST NOT` rule (02-open-questions.md, Q1).
- **Issue 6**: Orchestrator "New Task Setup" (line 56–62) lacks explicit "pass as-is" guardrails — only translation is mentioned (01-codebase-analysis.md, Issue 6).

## Contradictions and Gaps

- **Line number inaccuracies in codebase analysis**: Several `@/` references have line numbers off by 2–24 lines (e.g., orchestrator redraft limit cited as lines 68-70/108, actual 74-75/132; `injectAstpFields` cited as line 39, actual 35; approve agent "2+ redraft" cited as line 179-180, actual 184). Content quotes are accurate — only the line numbers drift. Impact: Low, quotes are correct so the design phase won't be misled.
- No contradictions between documents. The open questions correctly build on the codebase analysis findings.

## Quality Review

### Checklist
| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | All phases produced output files | PASS | `01-codebase-analysis.md` and `02-open-questions.md` both present per PHASES.md |
| 2 | Codebase analysis has exact file:line references | PARTIAL | All file paths verified to exist; content quotes are accurate; several line numbers are off by 2–24 lines (see Contradictions) |
| 3 | External research has source + confidence annotations | N/A | No external research phase per PHASES.md (batch of internal fixes) |
| 4 | Open questions are actionable (context, options, risks) | PASS | All 3 questions have context, options, risks, and researcher recommendation |
| 5 | No solutions or design proposals in research | PASS | Both documents are facts-only; open questions contain evidence-based leanings in "Researcher recommendation" sections which is acceptable |
| 6 | YAML frontmatter present on all files | PASS | Both files have correct YAML frontmatter with title, date, stage, and role |
| 7 | Cross-references consistent between documents | PASS | Open questions reference the same files/lines as codebase analysis; no contradictions |

### Issues Found

1. **Inaccurate line numbers in codebase analysis** — Multiple `@/` references cite wrong line numbers (e.g., `RDPI-Orchestrator.agent.md:68-70` should be `:74-75`, `:108` should be `:132`; `frontmatter.ts:39` should be `:35`; `rdpi-approve.agent.md:179-180` should be `:184`). Content quotes are correct. **Severity: Low** — design phase uses quoted text, not line numbers for navigation.

## Next Steps

Proceeds to Design stage after human review.
