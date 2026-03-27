---
title: "Use Cases: Design Stage Per-Document Tiers"
date: 2026-03-27
stage: 02-design
role: rdpi-architect
---

# Use Cases

## UC-1: Simple Feature (< 3 Components)

### Scenario
A feature adds a single new CLI flag `--dry-run` to the `install` command. Research identified 2 components affected: the `installer` module and the `cli` entry point.

### Tier Execution — Scaled Down

Per the scaling rules in [01-architecture.md](./01-architecture.md#Scaling Rules Update), simple features (< 3 components) merge tiers 1–4 into 2 phases and omit tiers 5–6.

| Phase | Agent | Outputs | Notes |
|-------|-------|---------|-------|
| 1 | `rdpi-architect` | `01-architecture.md`, `02-dataflow.md`, `00-short-design.md` | Merged tiers 1–2 |
| 2 | `rdpi-architect` | `03-model.md`, `04-decisions.md` | Merged tiers 3–4 |
| 3 | `rdpi-qa-designer` | `06-testcases.md`, `08-risks.md` | Standard |
| 4 | `rdpi-design-reviewer` | `README.md` (general review) | Standard |

**Total: 4 phases.** Tiers 5 (`05-usecases.md`) and 6 (`07-docs.md`) are omitted — a single CLI flag does not warrant separate use case or documentation impact documents.

### Skipped Tiers
- **Tier 5 (Use Cases)**: Omitted. The feature is too small for dedicated use case analysis.
- **Tier 6 (Docs Impact)**: Omitted. Documentation changes are trivial and can be noted in the architecture document.

### Correction Log State
`09-corrections.md` **does not exist**. With only 2 merged phases, phase 2 has correction authority over phase 1 outputs. If phase 2 finds no issues (likely for a 2-component feature), no log is created.

If phase 2 does make a correction, `09-corrections.md` is created normally with a single entry.

### Reviewer Behavior
Only 1 reviewer pass (general review) runs. The correction log reviewer pass (Pass 2) is skipped because:
1. `09-corrections.md` does not exist, AND
2. The feature is classified as simple.

Both conditions must hold. If `09-corrections.md` exists — even on a simple feature — Pass 2 **still runs** to verify correction integrity. The skip is only valid when the conjunction is true.

This follows the scaling rule: "Correction log reviewer pass may be skipped if `09-corrections.md` does not exist AND feature is simple → minimum 4 phases." [ref: ./01-architecture.md#Scaling Rules Update]

### File State After Completion

```
02-design/
  README.md              ← reviewer output
  PHASES.md              ← stage creator (unchanged)
  00-short-design.md     ← phase 1
  01-architecture.md     ← phase 1
  02-dataflow.md         ← phase 1
  03-model.md            ← phase 2
  04-decisions.md        ← phase 2
  06-testcases.md        ← phase 3
  08-risks.md            ← phase 3
  (no 05-usecases.md, 07-docs.md, 09-corrections.md)
```

---

## UC-2: Complex Feature (6+ Components) with Tier 3 Correction

### Scenario
A feature redesigns the entire template installation pipeline: manifest parsing, fetcher, installer, frontmatter injection, CLI commands, and UI prompts — 6+ components. All design documents are needed.

### Tier Execution — Full 9 Phases

All 6 designer tiers execute per the full phase structure in [01-architecture.md](./01-architecture.md#New Phase Structure). [ref: ./02-dataflow.md#Per-Tier Data Flow Map]

**Phase 1 — Tier 1 (Architecture)**:
- Reads: `../01-research/*`
- Writes: `01-architecture.md`, `00-short-design.md`
- Correction log: does not exist yet

`00-short-design.md` captures the high-level direction:
```markdown
## Direction
The installation pipeline is redesigned around a streaming fetch-parse-install
sequence replacing the current batch model...

## Key Decisions
- Streaming fetch replaces batch download [ref: ../01-research/01-codebase-analysis.md#fetcher]
- Manifest validation moves to CLI layer...
```

**Phase 2 — Tier 2 (Data Flow)**:
- Reads: `../01-research/*`, `00-short-design.md`, `01-architecture.md`
- Writes: `02-dataflow.md`
- No corrections needed. `09-corrections.md` still does not exist.

**Phase 3 — Tier 3 (Domain Model)**:
- Reads: `../01-research/*`, `00-short-design.md`, `01-architecture.md`, `02-dataflow.md`
- Writes: `03-model.md`
- **Finds inaccuracy**: While modeling the `Template` entity, tier 3 discovers that `01-architecture.md` states the manifest uses a flat file list, but research doc `01-codebase-analysis.md` shows it uses a nested bundle structure.
- **Overwrites**: the "Manifest Structure" section in `01-architecture.md`.
- **Creates** `09-corrections.md`:

```markdown
| Tier | File Modified | Section | Original | Corrected | Rationale |
|------|--------------|---------|----------|-----------|-----------|
| 3 | 01-architecture.md | Manifest Structure | "flat file list" | "nested bundle structure with per-bundle entries" | Research §manifest shows bundles array, not flat list |
```

**Phases 4–6 — Tiers 4–6**:
- Execute normally. Each reads all prior outputs including the corrected `01-architecture.md` and `09-corrections.md`.
- No additional corrections in this scenario.
- `09-corrections.md` remains with 1 entry.

**Phase 7 — QA Designer**:
- Reads all design docs. No correction authority.
- Writes `06-testcases.md`, `08-risks.md`.

**Phase 8 — Design Reviewer Pass 1 (General Review)**:
- Reads all docs including `09-corrections.md`.
- Evaluates standard checklist + new items (short-design alignment, correction factuality).
- Writes `README.md` with quality review section.

**Phase 9 — Design Reviewer Pass 2 (Correction Log Review)**:
- Reads `09-corrections.md` and the corrected `01-architecture.md`.
- **Verification**: Checks that `01-architecture.md` § Manifest Structure now says "nested bundle structure" (matches log's "Corrected" column). ✓
- **Cross-reference**: Checks that the correction doesn't contradict `02-dataflow.md` or `03-model.md`. ✓
- Appends `### Correction Log Review` section to `README.md`:

```markdown
### Correction Log Review
- 1 correction entry verified
- Tier 3 → 01-architecture.md (Manifest Structure): correction verified, consistent with model and dataflow
- No cascading inconsistencies detected
```

### Final File State

```
02-design/
  README.md              ← phases 8–9
  PHASES.md              ← stage creator
  00-short-design.md     ← phase 1
  01-architecture.md     ← phase 1, corrected by phase 3
  02-dataflow.md         ← phase 2
  03-model.md            ← phase 3
  04-decisions.md        ← phase 4
  05-usecases.md         ← phase 5
  06-testcases.md        ← phase 7
  07-docs.md             ← phase 6
  08-risks.md            ← phase 7
  09-corrections.md      ← created phase 3 (1 entry)
```

---

## UC-3: Feature with No Corrections Needed

### Scenario
A feature adds a new `check` command to the CLI. The design is straightforward — all tiers execute, but each tier finds earlier documents accurate.

### Tier Execution

Full 9 phases execute. At each tier:
- Tier reads all prior outputs and `09-corrections.md` (which does not exist).
- Tier analyzes earlier documents for inaccuracies — finds none.
- Tier writes only its primary document.
- `09-corrections.md` is never created.

### Correction Log State

After all 6 designer tiers: `09-corrections.md` **does not exist**. This is the expected outcome for a well-aligned feature where research was thorough and tier 1's architecture was accurate.

### Reviewer Behavior

**Pass 1 (General Review)** — Phase 8:
- Notes absence of `09-corrections.md` in the quality review.
- No correction-related items to check.

**Pass 2 (Correction Log Review)** — Phase 9:
- `09-corrections.md` does not exist.
- Reviewer enters the "no corrections" path per [01-architecture.md](./01-architecture.md#Design Reviewer Integration):
  - Scans all design documents for obvious inconsistencies that should have been caught by earlier tiers.
  - Verifies that the absence of corrections is legitimate (aligned feature, not oversight).
- Appends to `README.md`:

```markdown
### Correction Log Review
- No correction log exists (09-corrections.md absent)
- Cross-document consistency spot-check: no inconsistencies found
- Absence of corrections is consistent with feature complexity and research alignment
```

**Key point**: Pass 2 still runs and still produces output — it does not short-circuit. The reviewer's job in this case is to confirm the absence of corrections is correct, not to rubber-stamp it.

---

## UC-4: Cascading Correction Scenario

### Scenario
A feature involves redesigning the reactive signal system. Tier 3 (Model) corrects an error in tier 1 (Architecture), but the correction introduces a new inconsistency with tier 2 (Data Flow) that tier 4 (Decisions) detects.

### Walkthrough

**Phase 1 — Tier 1 (Architecture)**:
- Writes `01-architecture.md`: states "signals use synchronous propagation."
- Writes `00-short-design.md`.

**Phase 2 — Tier 2 (Data Flow)**:
- Reads architecture. Based on "synchronous propagation," writes `02-dataflow.md` with sequence diagrams showing synchronous signal chains.
- No corrections.

**Phase 3 — Tier 3 (Model)**:
- While modeling signal entities, discovers research states signals are *asynchronous* (batched microtask).
- **Corrects** `01-architecture.md`: changes "synchronous propagation" → "asynchronous batched microtask propagation."
- **Creates** `09-corrections.md`:

```markdown
| Tier | File Modified | Section | Original | Corrected | Rationale |
|------|--------------|---------|----------|-----------|-----------|
| 3 | 01-architecture.md | Signal Propagation | "synchronous propagation" | "asynchronous batched microtask propagation" | Research §signals confirms microtask batching |
```

- Writes `03-model.md` (consistent with corrected architecture).

**Phase 4 — Tier 4 (Decisions)**:
- Reads all prior outputs. Reads `09-corrections.md` — sees tier 3 corrected the architecture.
- **Detects inconsistency**: `02-dataflow.md` still shows synchronous signal chains (written by tier 2 based on the original, uncorrected architecture). The correction by tier 3 made the architecture accurate, but `02-dataflow.md` is now stale.
- **Corrects** `02-dataflow.md`: updates sequence diagrams to show asynchronous batched propagation.
- **Appends** to `09-corrections.md`:

```markdown
| 4 | 02-dataflow.md | Signal Sequence Diagrams | "synchronous call chain A→B→C" | "async batch: A queued, B queued, microtask flush" | Cascading fix: Tier 3 corrected architecture to async, but dataflow still showed sync |
```

- Writes `04-decisions.md` (includes ADR about async vs sync decision).

### Correction Log State After All Tiers

```markdown
| Tier | File Modified | Section | Original | Corrected | Rationale |
|------|--------------|---------|----------|-----------|-----------|
| 3 | 01-architecture.md | Signal Propagation | "synchronous propagation" | "asynchronous batched microtask propagation" | Research §signals confirms microtask batching |
| 4 | 02-dataflow.md | Signal Sequence Diagrams | "synchronous call chain A→B→C" | "async batch: A queued, B queued, microtask flush" | Cascading fix: Tier 3 corrected architecture to async, but dataflow still showed sync |
```

### Reviewer Behavior

**Pass 2 (Correction Log Review)**:
- Sees 2 entries. Detects the cascading pattern: entry 2 references entry 1 as root cause.
- **Verifies entry 1**: `01-architecture.md` § Signal Propagation now says "asynchronous batched microtask propagation." ✓
- **Verifies entry 2**: `02-dataflow.md` § Signal Sequence Diagrams now shows async batch. ✓
- **Cross-references**: architecture (async) ↔ dataflow (async) ↔ model (async) — all consistent. ✓
- **Checks for further cascade**: Does the dataflow correction affect `03-model.md` or `04-decisions.md`? Both were written after the corrections, so they already account for async propagation. ✓

```markdown
### Correction Log Review
- 2 correction entries verified (cascading pattern detected)
- Tier 3 → 01-architecture.md: root correction, verified
- Tier 4 → 02-dataflow.md: cascading fix from Tier 3 correction, verified
- All documents now internally consistent post-corrections
- No further cascading inconsistencies detected
```

---

## UC-5: Pipeline-Version Propagation

### Scenario
A user installs the RDPI template set (version `1.0.5`) using `astp install`. They then create a new feature with `.thoughts/` stages. This use case traces how `astp-version` appears in README.md frontmatter across all four stages.

### Installation Step

The CLI reads `templates/manifest.json` (`"version": "1.0.5"`) and installs template files to the workspace. During installation, the CLI injects `astp-version: 1.0.5` into every installed template file's YAML frontmatter. [ref: ../01-research/02-supporting-infrastructure.md#3. Manifest — Bundle Version]

After installation, every agent, skill, and instruction file contains:
```yaml
astp-version: 1.0.5
```

### Stage 1 — Research

The stage creator reads its own installed agent file (`rdpi-stage-creator.agent.md`), extracts `astp-version: 1.0.5` from frontmatter, and includes it in the stage README.md it generates:

```yaml
---
title: "Research: Feature X"
date: 2026-03-27
status: Inprogress
feature: "Feature X description"
astp-version: "1.0.5"
---
```

This works because all four stage skills' Output Conventions now list `astp-version` as a README.md frontmatter field. [ref: ./01-architecture.md#astp-version in Stage README.md] The stage creator follows the skill's Output Conventions when generating README.md.

### Stage 2 — Design

Same mechanism. The stage creator generates:

```yaml
---
title: "Design: Feature X"
date: 2026-03-27
status: Inprogress
feature: "Feature X description"
research: "../01-research/README.md"
astp-version: "1.0.5"
---
```

The design reviewer (Pass 1) can verify the `astp-version` field is present and matches the installed template version.

### Stage 3 — Plan

```yaml
---
title: "Plan: Feature X"
date: 2026-03-27
status: Inprogress
feature: "Feature X description"
research: "../01-research/README.md"
design: "../02-design/README.md"
astp-version: "1.0.5"
---
```

### Stage 4 — Implement

```yaml
---
title: "Implement: Feature X"
date: 2026-03-27
status: Inprogress
feature: "Feature X description"
plan: "../03-plan/README.md"
astp-version: "1.0.5"
---
```

### Research-Reviewer Compatibility

The current `rdpi-research-reviewer.agent.md` expects `pipeline-version` (line 65). Per [ADR-6](./04-decisions.md#ADR-6), this agent template is updated to expect `astp-version` instead. After the update, the research reviewer validates:
- `astp-version` field exists in research README.md
- Value matches the installed template version

### Key Observation

The `astp-version` value is **identical** across all four stages for a single template installation. It only changes when the user runs `astp update` to install a newer template version. Stages created before the update retain the old version; stages created after reflect the new version.
