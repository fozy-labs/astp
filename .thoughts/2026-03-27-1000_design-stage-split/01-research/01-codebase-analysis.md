---
title: "Design Stage Internals — Codebase Analysis"
date: 2026-03-27
stage: 01-research
role: rdpi-codebase-researcher
---

## Summary

The 02-design stage is structured as a 4-phase sequential pipeline with three agent roles: architect (phases 1–2), QA designer (phase 3), and design reviewer (phase 4). The architect agent handles the bulk of design work — producing 6 out of 8 possible output documents across two phases — while QA and review each occupy a single phase. There is no mechanism for cross-phase consistency correction or inconsistency logging; the only consistency check is the final design review in phase 4, which is read-only and cannot modify design documents.

## Findings

### 1. Design Stage Skill (`rdpi-02-design`)

- **Location**: `@/templates/rdpi/skills/rdpi-02-design/SKILL.md:1-119`
- **What it does**: Defines the full structure, roles, phase sequence, output conventions, scaling rules, and phase prompt guidelines for the 02-design stage.
- **Three roles defined** (line 13–18):
  - `rdpi-architect` — max 2 invocations, retry 2
  - `rdpi-qa-designer` — max 2 invocations, retry 1
  - `rdpi-design-reviewer` — max 2 invocations, retry 2
- **Phase structure** (lines 21–30): 4 sequential phases, no parallelization by default.
  - Phase 1: architect → `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`
  - Phase 2: architect → `05-usecases.md`, `07-docs.md` (depends on phase 1)
  - Phase 3: QA designer → `06-testcases.md`, `08-risks.md` (depends on phases 1, 2)
  - Phase 4: design reviewer → updates `README.md` (depends on phases 1, 2, 3)
- **Scaling rules** (lines 109–119):
  - Simple features (< 3 components): phases 1 and 2 can be merged
  - No external API changes: `05-usecases.md` may be minimal, `07-docs.md` omittable
  - Purely internal refactoring: `08-risks.md` and `06-testcases.md` combinable
  - Hard cap: never exceed 6 total phases
- **File numbering gap**: There is no `06` in phase 2 outputs — numbering jumps from `05-usecases.md` to `07-docs.md`. `06-testcases.md` is produced by QA designer in phase 3.
- **Frontmatter conventions** (lines 101–103):
  - Phase outputs: `title`, `date`, `stage`, `role`
  - README.md: `title`, `date`, `status`, `feature`, `research`
- **No pipeline version field** in any frontmatter definition.

### 2. Architect Agent (`rdpi-architect`)

- **Location**: `@/templates/rdpi/agents/rdpi-architect.agent.md:1-131`
- **What it does**: Transforms research findings into design documents. Produces up to 7 document types depending on the phase prompt.
- **Key constraints** (lines 14–19):
  - Every decision must reference research via `[ref: ../01-research/<file>#<section>]`
  - Research gaps → mark as `[DEFERRED]` in ADR documents
  - No implementation code (illustrative TypeScript snippets for API design allowed)
  - Must address or defer all research open questions
  - Must maintain consistency with existing project patterns
- **Document capabilities** (lines 24–103): Can produce `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`, `05-usecases.md`, `07-docs.md`. Each has detailed content requirements.
- **docs.md critical rule** (lines 95–101): Must be SHORT and focused. Large docs.md is an anti-pattern. Describes WHAT not HOW. No JSDoc. Must be proportional to existing documentation.
- **Output frontmatter** (lines 107–112): `title`, `date`, `stage: 02-design`, `role: rdpi-architect`.
- **Reference convention**: `[ref: ../01-research/<file>#section]` for research, relative links within design stage.
- **Interaction with skill**: The skill assigns the architect to phases 1 and 2. The architect does not self-assign — the phase prompt specifies which documents to produce.
- **Tools** (line 5): `search, read, edit, web, execute, vscode`
- **Not user-invocable** (line 4): `user-invocable: false`

### 3. QA Designer Agent (`rdpi-qa-designer`)

- **Location**: `@/templates/rdpi/agents/rdpi-qa-designer.agent.md:1-95`
- **What it does**: Designs test strategy and risk analysis based on architecture and research.
- **Key constraints** (lines 14–19):
  - Test strategy based on architecture (what components exist)
  - Risk analysis based on research + design decisions
  - Test cases must be concrete (specific inputs/outputs)
  - Risk mitigation must be actionable
  - Does NOT write test code
  - Does NOT repeat architecture content — references it
- **Produces** (lines 24–70):
  - `06-testcases.md` — test pyramid, test case table (ID/Category/Description/Input/Expected Output/Priority), edge cases, performance criteria, correctness verification
  - `08-risks.md` — risk matrix table (ID/Risk/Probability/Impact/Strategy/Mitigation), detailed mitigation plans for high-impact risks
- **Dependencies**: Reads architecture documents and research documents. References via `[ref: ./01-architecture.md#section]` and `[ref: ../01-research/<file>#section]`.
- **Output frontmatter** (lines 75–80): `title`, `date`, `stage: 02-design`, `role: rdpi-qa-designer`.
- **Relationship to architect**: QA designer depends on architect's outputs but has no write-back mechanism. It cannot modify architecture documents.

### 4. Design Reviewer Agent (`rdpi-design-reviewer`)

- **Location**: `@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:1-147`
- **What it does**: Reviews all design documents for quality and traceability, then produces/updates `README.md` with structured review results.
- **Two tasks** (line 7): quality review AND synthesis.
- **Key constraints** (lines 12–17):
  - Must read ALL design documents before writing
  - Verifies every design decision traces to research
  - Checks internal consistency across architecture, dataflow, model, usecases
  - ADR decisions must have clear rationale
  - Documentation proportionality check against existing `docs/` and `apps/demos/`
  - **Does NOT modify design documents** — only writes/updates `README.md`
- **5-step process** (lines 21–55):
  1. Read all documents + research README.md
  2. Quality review against 10-item checklist
  3. Documentation proportionality check (reads `docs/` and `apps/demos/`)
  4. Synthesize: traceability, consistency, completeness, feasibility
  5. Write README.md
- **Quality checklist** (lines 26–37): 10 criteria:
  1. Design decisions trace to research findings
  2. ADRs have required sections (Status, Context, Options, Decision, Consequences)
  3. Mermaid diagrams present and conformant
  4. Test strategy covers identified risks
  5. docs.md concise and proportional
  6. docs.md WHAT not HOW
  7. No implementation details or code
  8. Research open questions addressed or deferred
  9. Risk analysis has actionable mitigations
  10. Internal consistency (arch/dataflow/model/usecases)
- **README.md output structure** (lines 73–127):
  - Frontmatter: `title`, `date`, `status`, `feature`, `research`
  - Sections: Overview, Goals, Non-Goals, Documents (links to all 8), Key Decisions, Quality Review (checklist table + documentation proportionality + issues found), Next Steps
  - Issues format: numbered list with what's wrong, where, what's expected, severity (Critical/High/Medium/Low)
- **Issues escalation**: Issues are recorded in README.md for `rdpi-approve` to compile for the user. The reviewer itself does not fix anything.

### 5. Data Flow Between Phases

- **Phase 1 reads**: `../01-research/` (all research documents)
- **Phase 1 writes**: `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`
- **Phase 2 reads**: Phase 1 outputs + `../01-research/`
- **Phase 2 writes**: `05-usecases.md`, `07-docs.md`
- **Phase 3 reads**: Phase 1 + Phase 2 outputs + `../01-research/`
- **Phase 3 writes**: `06-testcases.md`, `08-risks.md`
- **Phase 4 reads**: ALL design documents (01–08) + `../01-research/README.md`
- **Phase 4 writes**: `README.md` only

Data flow is strictly one-directional: later phases read earlier phases' outputs but never modify them. There is no feedback loop or correction mechanism.

### 6. Output File Naming Convention

- Design documents: numbered `01` through `08`, with a descriptive suffix:
  - `01-architecture.md`, `02-dataflow.md`, `03-model.md`, `04-decisions.md`, `05-usecases.md`, `06-testcases.md`, `07-docs.md`, `08-risks.md`
- `README.md`: stage summary with review results
- Cross-references use relative links: `[ref: ../01-research/<file>#section]` for research, `[ref: ./01-architecture.md#section]` within design stage

### 7. Frontmatter Fields

- **Design document outputs** (`@/templates/rdpi/agents/rdpi-architect.agent.md:107-112`, `@/templates/rdpi/agents/rdpi-qa-designer.agent.md:75-80`):
  ```yaml
  title: "<Document Title>"
  date: <YYYY-MM-DD>
  stage: 02-design
  role: rdpi-architect | rdpi-qa-designer
  ```
- **README.md** (`@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:73-79`):
  ```yaml
  title: "Design: <Feature Name>"
  date: <YYYY-MM-DD>
  status: Draft
  feature: "<brief feature description>"
  research: "../01-research/README.md"
  ```
- **No `pipeline-version` field** exists in any design stage frontmatter definition.

### 8. Cross-Phase Consistency Mechanisms

- **Existing mechanism**: The design reviewer (phase 4) performs a 10-item quality checklist that includes internal consistency checks (criterion #10). This is read-only — issues are logged in README.md but not corrected.
- **No correction mechanism**: No agent in the current design stage can modify another agent's output. The reviewer explicitly states "Do NOT modify design documents" (`@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:17`).
- **No inconsistency log**: There is no dedicated file for tracking inconsistencies or corrections between phases.
- **No implement-reviewer involvement**: The `rdpi-implement-reviewer` is not referenced anywhere in the design stage skill or its three associated agents.

## Code References

- `@/templates/rdpi/skills/rdpi-02-design/SKILL.md:13-18` — Available roles table (architect, QA designer, design reviewer)
- `@/templates/rdpi/skills/rdpi-02-design/SKILL.md:21-30` — Typical phase structure table (4 phases)
- `@/templates/rdpi/skills/rdpi-02-design/SKILL.md:32-76` — Phase prompt guidelines (phases 1–4)
- `@/templates/rdpi/skills/rdpi-02-design/SKILL.md:101-103` — Output conventions (frontmatter fields)
- `@/templates/rdpi/skills/rdpi-02-design/SKILL.md:109-119` — Scaling rules
- `@/templates/rdpi/agents/rdpi-architect.agent.md:14-19` — Architect rules and constraints
- `@/templates/rdpi/agents/rdpi-architect.agent.md:24-103` — Architect capabilities (7 document types)
- `@/templates/rdpi/agents/rdpi-architect.agent.md:95-101` — docs.md critical anti-bloat rule
- `@/templates/rdpi/agents/rdpi-architect.agent.md:107-112` — Architect output frontmatter
- `@/templates/rdpi/agents/rdpi-qa-designer.agent.md:14-19` — QA designer rules
- `@/templates/rdpi/agents/rdpi-qa-designer.agent.md:24-70` — QA designer capabilities (testcases + risks)
- `@/templates/rdpi/agents/rdpi-qa-designer.agent.md:75-80` — QA designer output frontmatter
- `@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:12-17` — Reviewer rules (read-only, no modifications)
- `@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:21-55` — Reviewer 5-step process
- `@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:26-37` — 10-item quality checklist
- `@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:73-79` — README.md frontmatter schema
- `@/templates/rdpi/agents/rdpi-design-reviewer.agent.md:73-127` — README.md full output structure
