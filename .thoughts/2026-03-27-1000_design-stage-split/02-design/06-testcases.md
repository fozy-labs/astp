---
title: "Test Cases: Design Stage Per-Document Tiers"
date: 2026-03-28
stage: 02-design
role: rdpi-qa-designer
---

# Test Cases

## Approach

**Unit tests** — validate individual template file structure: frontmatter correctness, section presence, table format, field completeness. Each modified template file gets structural validation.

**Integration tests** — validate cross-file consistency: tier ordering matches skill definition, correction log entries reference real documents and sections, design-reviewer checklist covers new artifacts, `astp-version` field appears consistently across all four stage skills.

**End-to-end tests** — validate full stage execution scenarios using use cases from [ref: ./05-usecases.md]: simple feature (scaled-down), complex feature (full 9-phase), cascading correction, no-correction path. These are manual/agent-run validation — the "system under test" is the template set, not compiled code.

## Test Cases

| ID | Category | Description | Input | Expected Output | Priority |
|----|----------|-------------|-------|-----------------|----------|
| T1 | Tier ordering | Skill file lists tiers 1–6 in most-defining to least-defining order | `rdpi-02-design/SKILL.md` phase table | Tier order: Architecture → Dataflow → Model → Decisions → UseCases → Docs. Each tier's `dependsOn` references only earlier phases. | High |
| T2 | Tier ordering | Tier dependency chain is strictly sequential | `rdpi-02-design/SKILL.md` phase table | Phase N `dependsOn` = [N-1] for all designer tiers 2–6. No circular or skip dependencies. | High |
| T3 | Tier ordering | Tier 1 has no dependencies and no correction authority | `rdpi-02-design/SKILL.md` tier 1 definition | Tier 1: dependsOn = [], correctionAuthority = false, outputs = [`01-architecture.md`, `00-short-design.md`] | High |
| T4 | Correction mechanism | Correction log table has all 6 required columns | `09-corrections.md` template/format in skill | Table header: `\| Tier \| File Modified \| Section \| Original \| Corrected \| Rationale \|` — all 6 columns present, no extras | High |
| T5 | Correction mechanism | Overwritten file remains valid markdown with correct frontmatter | Tier 3 overwrites a section in `01-architecture.md` | File retains YAML frontmatter (`title`, `date`, `stage`, `role`), valid markdown structure, only the targeted section changed | High |
| T6 | Correction mechanism | Correction entry references a real file and section heading | `09-corrections.md` entry: `Tier 3 \| 01-architecture.md \| Manifest Structure \| ...` | `01-architecture.md` exists in the stage directory AND contains a `## Manifest Structure` heading (or the heading referenced in the entry) | High |
| T7 | Correction mechanism | Correction log is append-only — later tiers do not modify earlier entries | Tier 4 appends after tier 3's entry | Tier 3 entry is byte-identical before and after tier 4 appends. Total entries = tier 3 entries + tier 4 entries. | Medium |
| T8 | Correction mechanism | `09-corrections.md` is not created when no tier makes corrections | Full 9-phase run with no inaccuracies (UC-3) | `09-corrections.md` does not exist in stage directory | Medium |
| T9 | Correction mechanism | Only factual corrections allowed — stylistic changes rejected | Tier 2 attempts to rephrase tier 1's wording without factual error | Correction rules in skill state "factual fixes only (contradictions, incorrect references, stale assumptions), NOT stylistic changes." Agent should not produce a correction entry for style-only changes. | Medium |
| T10 | 00-short-design.md | Document follows structured template | `00-short-design.md` produced by tier 1 | Contains exactly 4 sections: `## Direction`, `## Key Decisions`, `## Scope Boundaries` (with `### In Scope` and `### Out of Scope`), `## Research References`. YAML frontmatter has `title`, `date`, `stage: 02-design`, `role: rdpi-architect`. | High |
| T11 | 00-short-design.md | Document is ≤ 2 pages | `00-short-design.md` produced by tier 1 | Rough heuristic: ≤ 120 lines or ≤ 4000 characters (excluding frontmatter). Direction section is 2–3 paragraphs, Key Decisions has ≤ 7 items, Research References has 3–5 items. | Medium |
| T12 | 00-short-design.md | Produced only by tier 1, not by any other tier | Skill file phase definitions | Only phase 1 lists `00-short-design.md` as an output. Phases 2–9 do not produce or overwrite `00-short-design.md` (tiers 2–6 may correct it via correction mechanism, but do not produce it as primary output). | High |
| T13 | 00-short-design.md | Does not duplicate `01-architecture.md` content | Both files produced by tier 1 | `00-short-design.md` contains direction/decisions/scope; `01-architecture.md` contains component design/module boundaries/data flow. No section headings duplicated. Content overlap limited to cross-references. | Medium |
| T14 | Design-reviewer integration | Minimum 2 invocations defined in skill | `rdpi-02-design/SKILL.md` phase table, reviewer phases | Phases 8 and 9 both assign `rdpi-design-reviewer`. Phase 8 = general review, Phase 9 = correction log review. | High |
| T15 | Design-reviewer integration | One invocation is dedicated to correction log | Phase 9 prompt/definition in skill | Phase 9 scope = `correction-log`. Checklist includes: verify each log entry's Original/Corrected against file state, check for cascading inconsistencies, handle absent `09-corrections.md` case. | High |
| T16 | Design-reviewer integration | Reviewer cannot modify design documents | `rdpi-design-reviewer.agent.md` rules + skill rules | Reviewer writes only to `README.md`. No write permission to `00-*` through `09-*` design docs. Existing constraint preserved from current template. [ref: ../01-research/01-codebase-analysis.md#4. Design Reviewer Agent] | High |
| T17 | Design-reviewer integration | Pass 2 handles absent correction log | No `09-corrections.md` exists (UC-3 scenario) | Reviewer Pass 2 still executes: performs cross-document consistency spot-check, confirms absence is legitimate, appends `### Correction Log Review` to README.md with "no corrections" findings. | Medium |
| T18 | astp-version | Field present in `rdpi-01-research/SKILL.md` Output Conventions | Installed `rdpi-01-research/SKILL.md` | README.md frontmatter field list includes `astp-version` | High |
| T19 | astp-version | Field present in `rdpi-02-design/SKILL.md` Output Conventions | Installed `rdpi-02-design/SKILL.md` | README.md frontmatter field list includes `astp-version` | High |
| T20 | astp-version | Field present in `rdpi-03-plan/SKILL.md` Output Conventions | Installed `rdpi-03-plan/SKILL.md` | README.md frontmatter field list includes `astp-version` | High |
| T21 | astp-version | Field present in `rdpi-04-implement/SKILL.md` Output Conventions | Installed `rdpi-04-implement/SKILL.md` | README.md frontmatter field list includes `astp-version` | High |
| T22 | astp-version | Field name is `astp-version`, not `pipeline-version` | All 4 stage skills + `rdpi-research-reviewer.agent.md` | Consistent field name `astp-version` everywhere. `pipeline-version` does not appear in any updated file. | Medium |
| T23 | Scaling rules | Phase cap raised to 10 in design skill | `rdpi-02-design/SKILL.md` scaling rules section | Maximum phases stated as 10 (was 6). [ref: ./04-decisions.md#ADR-7] | High |
| T24 | Scaling rules | Simple feature scales down to ≤ 5 phases | Skill scaling rules for < 3 components | Merged tiers: phases 1–2 (tiers 1–2 merged), phase 3 (tiers 3–4 merged), phase 4 (QA), phase 5 (reviewer general). Tiers 5–6 omitted. Pass 2 reviewer optional. Total ≤ 5. | High |
| T25 | Scaling rules | Full feature uses exactly 9 phases | Skill phase table for 6+ component feature | 6 designer tiers + 1 QA + 2 reviewer passes = 9 phases. No phase exceeds cap of 10. | Medium |
| T26 | Scaling rules | Merged tiers preserve correction authority | Simple feature: tiers 1–2 merged into phase 1, tiers 3–4 merged into phase 2 | Phase 2 (merged tiers 3–4) has correction authority over phase 1 outputs. Correction log rules still apply to merged phases. | Medium |
| T27 | Backward compat | `rdpi-01-research/SKILL.md` retains all existing phase structure | Current vs. updated `rdpi-01-research/SKILL.md` | Only change: `astp-version` added to Output Conventions README.md frontmatter. All other sections (phases, roles, scaling rules, phase prompts) byte-identical. | High |
| T28 | Backward compat | `rdpi-03-plan/SKILL.md` retains all existing phase structure | Current vs. updated `rdpi-03-plan/SKILL.md` | Only change: `astp-version` added to Output Conventions. All other sections unchanged. | High |
| T29 | Backward compat | `rdpi-04-implement/SKILL.md` retains all existing phase structure | Current vs. updated `rdpi-04-implement/SKILL.md` | Only change: `astp-version` added to Output Conventions. All other sections unchanged. | High |
| T30 | Backward compat | `rdpi-research-reviewer.agent.md` field rename only | Current vs. updated agent file | Only change: `pipeline-version` → `astp-version` in README.md validation checklist. All other content unchanged. | Medium |

## Edge Cases

### E1: Tier corrects `00-short-design.md`
Tiers 2–6 have correction authority over `00-short-design.md` (it's a tier 1 output). Correction log must reference `00-short-design.md` as the file modified. The structured template (Direction/Decisions/Scope/Refs) must remain intact after the correction — only content within sections changes, not the section structure.

**Test strategy**: Verify in skill correction rules that `00-short-design.md` is listed as a correctable file. Verify the reviewer's Pass 1 checklist re-checks `00-short-design.md` alignment after corrections.

### E2: Two tiers correct the same section of the same file
Tier 3 corrects `01-architecture.md § Component X`, then tier 5 corrects the same section again. The correction log has two entries for the same file+section. Both entries must be valid — tier 5's "Original" should reflect tier 3's corrected version, not the original tier 1 version.

**Test strategy**: Verify correction log allows multiple entries for the same file+section. Verify tier 5's "Original" column matches the current state of the file (which is tier 3's corrected version).

### E3: Simple feature with unexpected correction
A feature classified as simple (< 3 components, scaled-down to 4 phases) where the merged phase 2 finds an inaccuracy in phase 1. `09-corrections.md` is created even though scaling rules skipped Pass 2 reviewer.

**Test strategy**: Verify scaling rule states Pass 2 "may be skipped if `09-corrections.md` does not exist AND feature is simple." If corrections exist, Pass 2 must run. The scaling rule's conjunction (AND) prevents skipping when corrections are present.

### E4: All 5 tiers make corrections (maximum correction log size)
Tiers 2–6 each correct one or more earlier documents. The correction log may have 5+ entries. The reviewer's Pass 2 must handle a log of arbitrary length.

**Test strategy**: No hard limit on correction log entries in the skill. Reviewer Pass 2 checklist says "each entry" — iterative verification. No performance concern since this is a markdown table read by an agent.

### E5: `astp-version` value not available at runtime
The stage creator cannot read its own frontmatter (agent runtime limitation). Fallback: version is hardcoded at install time per user decision Q8.

**Test strategy**: Verify the skill's Output Conventions section specifies `astp-version` as a required field. The value source (frontmatter or hardcoded) is an agent runtime concern, not a template structure concern. The template must define the field; population is the agent's responsibility.

## Performance Criteria

Not applicable. The system under test is a set of markdown template files, not runtime software. There are no latency, throughput, or memory benchmarks.

Execution time is bounded by the phase count (max 9 phases). ADR-7 sets the hard cap at 10 phases, which is the upper bound for design stage execution. [ref: ./04-decisions.md#ADR-7]

## Correctness Verification

End-to-end validation approach:

1. **Template structural diff**: After implementation, diff each modified template file against its current version. Verify only the intended sections changed (T27–T30 for non-design skills).
2. **Skill self-consistency**: Parse the updated `rdpi-02-design/SKILL.md` and verify the phase table, scaling rules, correction rules, and Output Conventions are internally consistent (no contradictions between sections).
3. **Agent cross-reference**: Verify that `rdpi-architect.agent.md` correction rules match `rdpi-02-design/SKILL.md` correction rules. Verify `rdpi-design-reviewer.agent.md` checklist items reference artifacts defined in the skill.
4. **UC walkthrough**: Manually trace UC-1 (simple), UC-2 (complex with correction), UC-3 (no corrections), and UC-4 (cascading correction) from [ref: ./05-usecases.md] through the updated skill to confirm the phase structure supports each scenario.
5. **Field name audit**: grep all modified files for `pipeline-version` (should not exist) and `astp-version` (should exist in all 4 skill Output Conventions + research-reviewer agent).
