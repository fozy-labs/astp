---
name: "rdpi-02-design"
description: "ONLY for RDPI pipeline."
---

# Stage: 02-Design

Design stage transforms research findings into a comprehensive, reviewable technical design. Every decision must trace back to facts from `01-research/`.

## Available Roles

| Role | Agent | Description | Default Limit |
|------|-------|-------------|---------------|
| Architect | `rdpi-architect` | Designs architecture, data flow, domain model, decisions, use cases, and documentation impact | max 6 invocations, retry 2 |
| QA Designer | `rdpi-qa-designer` | Designs test strategy, verification criteria, and risk analysis | max 2 invocation, retry 1 |
| Design Reviewer | `rdpi-design-reviewer` | Reviews all design documents for consistency, completeness, and research traceability | max 3 invocation, retry 2 |

## Typical Phase Structure

| Phase | Agent | Primary Output | Additional Outputs | Depends on |
|-------|-------|---------------|-------------------|------------|
| 1 | `rdpi-architect` | `01-architecture.md` | `00-short-design.md` | — |
| 2 | `rdpi-architect` | `02-dataflow.md` | corrections (if any) | 1 |
| 3 | `rdpi-architect` | `03-model.md` | corrections (if any) | 2 |
| 4 | `rdpi-architect` | `04-decisions.md` | corrections (if any) | 3 |
| 5 | `rdpi-architect` | `05-usecases.md` | corrections (if any) | 4 |
| 6 | `rdpi-architect` | `07-docs.md` | corrections (if any) | 5 |
| 7 | `rdpi-qa-designer` | `06-testcases.md`, `08-risks.md` | — | 6 |
| 8 | `rdpi-design-reviewer` | Updates `README.md` (general review) | — | 7 |
| 9 | `rdpi-design-reviewer` | Updates `README.md` (correction log review) | — | 8 |

Phases are sequential. Each designer tier (1–6) produces one primary document and may correct earlier tier documents. See Correction Mechanism and Scaling Rules for phase reduction.

## Correction Mechanism

1. **Tier 1** cannot correct anything (nothing precedes it).
2. **Tiers 2–6** MAY overwrite earlier tier documents in-place when they discover inaccuracies.
3. Every overwrite MUST be logged in `09-corrections.md` with a table row: `| Tier | File Modified | Section | Original | Corrected | Rationale |`.
4. Corrections must be factual fixes (contradictions, incorrect references, stale assumptions), NOT stylistic changes or opinion-based rewrites.
5. If a tier has no corrections to make, it does not touch `09-corrections.md`.
6. `09-corrections.md` is created by the first tier that needs to make a correction. If no corrections occur across all tiers, the file does not exist.

### 09-corrections.md Format

```markdown
---
title: "Correction Log"
date: <YYYY-MM-DD>
stage: 02-design
role: rdpi-architect
---

# Correction Log

| Tier | File Modified | Section | Original | Corrected | Rationale |
|------|--------------|---------|----------|-----------|-----------|
| 3 | 01-architecture.md | Component X | "uses sync API" | "uses async API" | Model analysis revealed async lifecycle |
```

### Append-Only Rule

Correction log entries are append-only. A later tier MUST NOT modify or delete an earlier tier's correction log entries. If a later tier disagrees with an earlier correction, it makes its own correction to the file and appends a new entry referencing the earlier one.

## 00-short-design.md Specification

Produced by tier 1 (`rdpi-architect`) alongside `01-architecture.md`. 1–2 pages maximum. Must not duplicate `01-architecture.md` content — provides direction, not component details.

### Format

```markdown
---
title: "Short Design: <Feature Name>"
date: <YYYY-MM-DD>
stage: 02-design
role: rdpi-architect
---

## Direction
<2–3 paragraphs: high-level design direction. What approach was chosen and why.
Must reference research findings.>

## Key Decisions
- <Decision 1 — one sentence + research ref>
- <Decision 2>
- <Decision 3>
<Up to 7 decisions. These are preliminary — ADR-level detail comes in 04-decisions.md.>

## Scope Boundaries
### In Scope
- <item>
### Out of Scope
- <item>

## Research References
- [Research summary](../01-research/README.md) — <what was found>
- [Key finding](../01-research/01-codebase-analysis.md#section) — <relevance>
<Brief list linking to research documents that inform this design. 3–5 refs max.>
```

## Phase Prompt Guidelines

### Phase 1 — Architecture + Short Design

Tier 1. No correction authority (nothing precedes it).

The prompt MUST specify:
- Path to all research documents (`../01-research/`)
- What to design: system architecture (C4 Level 2-3), component boundaries, module responsibility zones
- Produce `01-architecture.md` with: architecture diagrams, component boundaries, module responsibility zones, ADR decisions
- Produce `00-short-design.md` per the 00-short-design.md Specification section above
- Mermaid diagrams required: C4 container/component, module dependency, class/interface hierarchy, sequence diagrams, state diagrams
- ADR format: Status, Context, Options (with pros/cons), Decision, Consequences
- Reference: design choices must cite research findings

### Phases 2–6 — Designer Tiers

Generic guideline for tiers 2–6. Each tier reads all research documents (`../01-research/`), all previously produced design documents, `00-short-design.md`, and `09-corrections.md` (if exists). Each tier produces its primary document and has correction authority over all earlier tier documents. Corrections must be logged per the Correction Mechanism section.

#### Phase 2 — Data Flow

The prompt MUST specify:
- Path to research documents and all prior design outputs
- Data flow for key scenarios, sequence diagrams, state transitions
- Mermaid diagrams: sequence diagrams, state diagrams, data flow diagrams

#### Phase 3 — Domain Model

The prompt MUST specify:
- Path to research documents and all prior design outputs
- Domain model: entities, types, relationships, class/interface hierarchy
- Mermaid diagrams: class diagrams, entity-relationship diagrams

#### Phase 4 — Architecture Decisions

The prompt MUST specify:
- Path to research documents and all prior design outputs
- ADR format: Status, Context, Options (with pros/cons), Decision, Consequences
- Formalize decisions already implicit in architecture, dataflow, and model

#### Phase 5 — Use Cases

The prompt MUST specify:
- Path to research documents and all prior design outputs
- Use cases with TypeScript code examples and React integration patterns
- Edge cases and migration paths

#### Phase 6 — Documentation Impact

The prompt MUST specify:
- Path to research documents and all prior design outputs
- Documentation impact: what concepts need docs, what existing docs need updates, what examples to create
- Strict scope: describe WHAT needs documentation, not HOW. No JSDoc. Match existing project doc style.

<critical>
Warn the agent explicitly: docs.md must be SHORT and focused. Large docs.md is an anti-pattern. Only high-impact documentation changes.
</critical>

### Phase 7 — QA Strategy & Risks

QA designer. No correction authority. Reads all design documents.

The prompt MUST specify:
- Path to all design outputs (`00-*` through `07-*`) and research documents
- Test strategy: unit, integration, e2e approach
- Test case table format: ID, Category, Description, Input, Expected Output, Priority
- Risk analysis table: ID, Risk, Probability (H/M/L), Impact (H/M/L), Strategy (Accept/Mitigate/Avoid), Mitigation
- Detailed mitigation plans for high-impact risks
- Performance test criteria (if applicable)
- Produces `06-testcases.md` and `08-risks.md`

### Phase 8 — General Design Review

Reviewer Pass 1. Reads all documents including `09-corrections.md` (if exists).

The prompt MUST specify:
- Paths to ALL design documents (`00-*` through `09-*`)
- Path to research documents (for traceability check)
- Review criteria: research traceability, internal consistency, completeness, feasibility
- Quality review checklist:
  - [ ] Research traceability — all design choices cite research findings
  - [ ] ADR completeness — all decisions have Status, Context, Options, Decision, Consequences
  - [ ] Mermaid conformance — titled, max 15-20 elements, split large diagrams
  - [ ] Test-risk coverage — test cases cover identified risks
  - [ ] Docs proportionality — docs.md is short and focused
  - [ ] Docs describe WHAT not HOW — no implementation code
  - [ ] Research open questions addressed or deferred
  - [ ] Risk analysis has actionable mitigations
  - [ ] Internal consistency — no contradictions between documents
  - [ ] No implementation code in design documents
  - [ ] `00-short-design.md` exists, is within 1–2 pages, and aligns with architecture
  - [ ] Correction log entries (if any) are factual, not stylistic
  - [ ] Corrected documents reflect the logged corrections accurately
- Write/update README.md with: overview, goals, non-goals, document links, key decisions summary, quality review checklist, next steps

### Phase 9 — Correction Log Review

Reviewer Pass 2. Dedicated to `09-corrections.md` verification.

The prompt MUST specify:
- Path to `09-corrections.md` (if exists) and all design documents
- Path to `README.md` from Phase 8

If `09-corrections.md` exists:
- Cross-reference each entry against current file state — verify "Original" matches what was before and "Corrected" matches what is now
- Check for cascading inconsistencies — verify no correction introduced a new contradiction with other documents
- Verify rationale is grounded in research or earlier design documents

If `09-corrections.md` does not exist:
- Spot-check cross-document consistency to verify no obvious inconsistencies were missed
- Confirm absence is legitimate (simple/aligned feature), not an oversight

Appends a `### Correction Log Review` subsection to the Quality Review section in `README.md`.

## Output Conventions

- Frontmatter fields: phase outputs use (title, date, stage, role); README.md uses (title, date, status, feature, research, astp-version)
- `00-short-design.md` frontmatter: (title, date, stage, role) — structured per 00-short-design.md Specification section
- `09-corrections.md` frontmatter: (title, date, stage, role) — created on-demand per Correction Mechanism section
- README.md structure: Overview, Goals, Non-Goals, Documents, Key Decisions, Quality Review, Next Steps
- ADR numbering: `ADR-1`, `ADR-2`, etc.
- Mermaid diagrams: titled, max 15-20 elements, split large diagrams
- All design choices must reference research documents via relative links

## Scaling Rules

- **Full feature** (all design documents needed): 9 phases (6 designer tiers + QA + 2 reviewer passes)
- **Medium feature** (no usecases or docs needed): omit tiers 5 and 6 → 7 phases (4 designer tiers + QA + 2 reviewer passes)
- **Simple feature** (< 3 components): merge tiers 1–4 into 2 phases (architecture+dataflow, model+decisions), omit tiers 5–6 → 5 phases (2 merged tiers + QA + 2 reviewer passes)
- **Correction log reviewer pass** may be skipped if `09-corrections.md` does not exist AND feature is simple → minimum 4 phases
- Never exceed 10 total phases for design stage
