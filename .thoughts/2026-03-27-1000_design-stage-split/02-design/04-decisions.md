---
title: "Architecture Decisions: Design Stage Per-Document Tiers"
date: 2026-03-27
stage: 02-design
role: rdpi-architect
---

# Architecture Decisions

## ADR-1: Per-Document Tiers vs. Grouped Tiers

### Status
Accepted

### Context
The current design stage assigns the architect to 2 phases producing 6 documents, with no cross-phase correction. The task requires splitting into sequential designer tiers ordered "most defining to less defining." Three options exist: 2 grouped tiers (matching current phase 1/2 split), 3 grouped tiers (finer grouping), or per-document tiers (each document is its own phase). [ref: ../01-research/01-codebase-analysis.md#1. Design Stage Skill] [ref: ../01-research/03-open-questions.md#Q1]

### Options Considered
1. **Two grouped tiers** — Tier 1: architecture, dataflow, model, decisions; Tier 2: usecases, docs. — Pros: Minimal restructuring, stays under 6-phase cap / Cons: Only two correction checkpoints; preserves the architect bottleneck
2. **Three grouped tiers** — Tier 1: architecture, model; Tier 2: dataflow, decisions; Tier 3: usecases, docs. — Pros: More correction checkpoints / Cons: Arbitrary groupings (dataflow isn't clearly "less defining" than model); unclear dependencies within tiers
3. **Per-document tiers** — Each design document is a separate tier (6 tiers). — Pros: Maximum correction granularity; clear ownership; each tier has a focused scope / Cons: 6 tiers + QA + 2 reviewers = 9 phases, exceeding the 6-phase cap

### Decision
**Option 3: Per-document tiers.** User decision Q1 explicitly chose this option. The maximum correction granularity ensures that each tier can catch and fix issues from any earlier tier before producing its own document. The focused scope per phase also simplifies phase prompts and makes retry behavior more predictable.

### Consequences
- **Positive**: Maximum correction opportunities (5 tiers can correct); clear document ownership; simpler phase prompts
- **Negative**: Phase count increases from 4 to 9; requires raising the 6-phase hard cap (see ADR-7)
- **Risks**: Longer execution time for full features; overhead may be excessive for simple features (mitigated by scaling rules that allow merging tiers)

---

## ADR-2: In-Place Overwrite + Correction Log vs. Alternatives

### Status
Accepted

### Context
The current pipeline has strictly one-directional data flow — later phases never modify earlier outputs. The design reviewer "does NOT modify design documents" and only logs issues in README.md. The task requires a correction mechanism. [ref: ../01-research/01-codebase-analysis.md#8. Cross-Phase Consistency Mechanisms] [ref: ../01-research/03-open-questions.md#Q2]

### Options Considered
1. **Overwrite in-place + correction log** — Later tier edits the original file directly, logs the change in `09-corrections.md`. — Pros: Single source of truth; downstream consumers always read corrected version / Cons: Loses original content in the file; potential for cascading overwrites
2. **Annotate in-place** — Add inline correction annotations (e.g., `[CORRECTED by Tier-2: ...]`) to the original file. — Pros: Preserves both versions inline / Cons: Clutters documents; may confuse downstream agents that parse markdown
3. **Leave original unchanged** — Original stays as-is; correction log describes what's wrong. — Pros: No destructive edits / Cons: Split-brain problem; consumers must reconcile two sources; risk of reading stale content

### Decision
**Option 1: Overwrite in-place with mandatory correction log.** User decision Q2. The correction log provides the audit trail while the file itself remains the single source of truth. This matches how real design processes work — you update the spec, not annotate it. The log entry captures the diff for traceability.

### Consequences
- **Positive**: No split-brain; downstream agents always read authoritative content; correction log provides audit trail
- **Negative**: Original text is lost from the file (preserved only in log summary); cascading overwrites possible
- **Risks**: A tier could make an incorrect correction, compounding the error. Mitigated by the reviewer's Pass 2 cross-referencing the log against current file state.

---

## ADR-3: Single Cumulative Correction Log vs. Per-Tier Logs

### Status
Accepted

### Context
The correction log can be structured as one file that grows across all tiers (cumulative) or as separate files per tier. The implement-reviewer (now design-reviewer per Q4) needs to verify corrections for internal consistency. [ref: ../01-research/03-open-questions.md#Q3]

### Options Considered
1. **Single cumulative log** (`09-corrections.md`) — One file with entries appended by each tier. Table format. — Pros: Single place to check; follows existing numbered file convention; easy to detect contradicting corrections / Cons: Can grow large on complex features
2. **Per-tier log files** (e.g., `corrections-tier-2.md`, `corrections-tier-3.md`) — Each tier writes its own file. — Pros: Clear ownership; parallel review possible / Cons: Reviewer must read 5 files; harder to see whether tier 4's correction contradicts tier 2's correction
3. **Structured YAML/JSON log** — Machine-readable format in a markdown file. — Pros: Parseable / Cons: Harder to write correctly; overkill; no agents currently parse YAML data blocks

### Decision
**Option 1: Single cumulative log.** User decision Q3. The table format (`| Tier | File Modified | Section | Original | Corrected | Rationale |`) fits the existing markdown-first convention. A single file makes it trivial for the reviewer to scan for contradicting corrections (e.g., tier 3 corrects X to Y, then tier 5 corrects the same section to Z).

### Consequences
- **Positive**: Single source for all corrections; easy contradiction detection; follows existing `NN-descriptor.md` naming
- **Negative**: File could grow large for complex features with many corrections
- **Risks**: Append-only semantics must be enforced — a later tier must not edit an earlier tier's log entry. Enforced via skill rules.

---

## ADR-4: Design Reviewer Only vs. Implement Reviewer Participation

### Status
Accepted

### Context
The original task considered adding `rdpi-implement-reviewer` to the design stage. Research found that the implement reviewer has zero design-awareness capabilities — its checklist checks plan compliance, code patterns, and TypeScript strictness, none of which apply to design documents. [ref: ../01-research/02-supporting-infrastructure.md#2. Implement Reviewer Agent] [ref: ../01-research/03-open-questions.md#Q4]

### Options Considered
1. **Reuse implement-reviewer with design-specific prompt** — Override behavior via phase prompt. — Pros: No new agent / Cons: Agent instructions conflict with prompt; misleading agent name
2. **Create a design-aware variant** — Fork or extend implement-reviewer. — Pros: Clear separation / Cons: More templates to maintain; still questionable scope overlap with design-reviewer
3. **Design-reviewer only** — Expand design-reviewer to include correction log checks. — Pros: Logical role alignment; no scope confusion / Cons: Design-reviewer does more work

### Decision
**Option 3: Design-reviewer only.** User decision Q4 explicitly excluded implement-reviewer from the design stage. The design-reviewer is expanded with a second pass dedicated to correction log verification (Pass 2). This keeps role naming logical — the design-reviewer reviews design, the implement-reviewer reviews implementation.

### Consequences
- **Positive**: Clean role boundaries; no misleading agent names; design-reviewer is the single authority on design quality
- **Negative**: Design-reviewer now has two passes (2 phases instead of 1), consuming more phase budget
- **Risks**: None significant — the reviewer was already reading all documents; the second pass is a focused extension of existing work

---

## ADR-5: 00-short-design.md Produced by First Tier vs. Stage Creator

### Status
Accepted

### Context
`00-short-design.md` is a new document that provides high-level design direction before detailed documents. The stage creator currently produces only `README.md` and `PHASES.md`. The first designer tier (architecture) is the natural place for design-level thinking. [ref: ../01-research/03-open-questions.md#Q6] [ref: ../01-research/02-supporting-infrastructure.md#1. Stage Creator Agent — README.md Generation]

### Options Considered
1. **Stage creator produces it** — Added as a third file alongside README.md and PHASES.md. — Pros: Available before any tier runs / Cons: Stage creator is a meta-agent with no design reasoning; quality would suffer
2. **First designer tier produces it** — Tier 1 creates `00-short-design.md` alongside `01-architecture.md`. — Pros: Design expertise applied; natural starting point / Cons: Produced alongside (not before) the architecture document
3. **Dedicated phase 0** — Separate lightweight architect invocation. — Pros: Clean separation / Cons: Extra phase; approaches phase cap

### Decision
**Option 2: First designer tier.** User decision Q6. The first tier has full access to research documents and applies architectural reasoning. Producing `00-short-design.md` alongside `01-architecture.md` is natural — the short design captures the direction, while the architecture provides the detail. No changes to the stage creator are needed (aligning with user decision Q11).

### Consequences
- **Positive**: Design-quality short design; no stage creator changes; tier 1 scope is clear (direction + architecture)
- **Negative**: `00-short-design.md` is produced simultaneously with architecture, not before it — subsequent tiers benefit, but tier 1 itself doesn't use it as input
- **Risks**: Tier 1 may produce a short design that's too closely aligned with architecture rather than providing independent high-level direction. Mitigated by the structured template format (Direction, Key Decisions, Scope Boundaries, Research References) which forces a different perspective.

---

## ADR-6: astp-version Field in Stage README.md

### Status
Accepted

### Context
The `research-reviewer` agent expects a `pipeline-version` field in README.md frontmatter, but nothing currently generates it. The CLI already injects `astp-version` into installed template files at install time. The question is what field name to use and how to populate it in `.thoughts/` stage README.md files. [ref: ../01-research/02-supporting-infrastructure.md#3. Manifest — Bundle Version] [ref: ../01-research/02-supporting-infrastructure.md#5. Stage Skills — README.md Frontmatter Comparison] [ref: ../01-research/03-open-questions.md#Q8, Q9, Q13]

### Options Considered
1. **`pipeline-version` with full semver** — New field name matching the research-reviewer's expectation. — Pros: Matches existing expectation / Cons: Different name from `astp-version` used in template frontmatter
2. **`astp-version` reusing existing convention** — Same field name the CLI already injects into templates. — Pros: Consistent naming across all frontmatter; single convention / Cons: Research-reviewer template needs update from `pipeline-version` to `astp-version`
3. **`rdpi-version`** — Bundle-specific naming. — Pros: Clear bundle scope / Cons: Yet another naming convention

### Decision
**Option 2: `astp-version` reusing existing convention.** User decision Q13 stated the version is injected at install time using the existing convention, and the field name is determined by the existing `astp-version` naming. The `research-reviewer` agent template (`rdpi-research-reviewer.agent.md:65`) will need a minor update to expect `astp-version` instead of `pipeline-version`.

All four stage skills' Output Conventions add `astp-version` to their README.md frontmatter field list. The value is read by the stage creator from its own installed file's frontmatter. [ref: ../01-research/03-open-questions.md#Q12]

### Consequences
- **Positive**: Single naming convention (`astp-version`) across template files and stage README.md; no new infrastructure needed
- **Negative**: Research-reviewer needs a minor update (field name change); this is a cross-cutting change across 4 skill files + 1 agent file
- **Risks**: If the stage creator cannot read its own frontmatter (agent runtime limitation), the value must be hardcoded in the phase prompt. User decision Q8 acknowledged this fallback.

---

## ADR-7: Reconciling 6-Phase Hard Cap with Per-Document Tiers

### Status
Accepted

### Context
The current scaling rules state "Never exceed 6 total phases for design stage" [ref: ../01-research/01-codebase-analysis.md#1. Design Stage Skill]. Per-document tiers (ADR-1) produce 6 designer phases + 1 QA + 2 reviewer passes = 9 phases for a full feature. Even with phase reduction for smaller features, the cap is routinely exceeded. This is a critical design tension identified in research. [ref: ../01-research/README.md#Key Findings — finding 5]

Each RDPI stage already has its own phase cap:
- 01-research: max 5 phases [ref: ../01-research/02-supporting-infrastructure.md#4. Workflow Instructions — implied by skill]
- 02-design: max 6 phases (current)
- 03-plan: max 3 phases [ref: ../01-research/02-supporting-infrastructure.md#5. Stage Skills — rdpi-03-plan]
- 04-implement: max 2x(plan phases)+1 [ref: ../01-research/02-supporting-infrastructure.md#6. 04-Implement Multi-Agent Pattern]

### Options Considered
1. **Raise the cap to 10 for design stage** — Simply increase the number. — Pros: Straightforward; accommodates full per-document tiers; preserves the cap concept / Cons: Large number may seem excessive; loses the forcing function that prevents bloated stages
2. **Make cap context-dependent** — Cap = `(number of design documents) + (number of non-designer phases)`. For full feature: 6+3=9. For reduced: fewer. — Pros: Self-adjusting / Cons: Complex formula; harder to reason about
3. **Group adjacent tiers** — Force some tiers to share phases (e.g., model+decisions in one phase). — Pros: Stays under 6 / Cons: Defeats the purpose of per-document tiers (ADR-1); reduces correction granularity that the user explicitly chose
4. **Remove the cap entirely** — Trust scaling rules to self-regulate. — Pros: Maximum flexibility / Cons: No upper bound; risk of runaway phase counts

### Decision
**Option 1: Raise the cap to 10 for design stage.** Rationale:

1. The 6-phase cap was set in a context where the architect handled 6 documents in 2 phases. Per-document tiers are a deliberate structural change that invalidates the original cap's assumptions.
2. Other stages already have different caps (research: 5, plan: 3, implement: formula-based). The cap is already stage-specific, not universal.
3. The scaling rules provide the real flexibility mechanism — they define when to merge tiers for simpler features. The cap is a safety net, not a design driver.
4. A cap of 10 accommodates the maximum configuration (6 tiers + QA + 2 reviewers = 9) with 1 slot buffer for redraft scenarios.

### Consequences
- **Positive**: Per-document tiers work without workarounds; scaling rules still reduce phases for simpler features; other stage caps unchanged
- **Negative**: Design stage can now have significantly more phases than before; longer execution for full features
- **Risks**: Feature creep — future changes might push toward even more phases. The cap of 10 provides a hard limit. Scaling rules ensure simple features use 4–5 phases regardless.
