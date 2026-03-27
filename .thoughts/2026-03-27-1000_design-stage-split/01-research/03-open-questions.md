---
title: "Open Questions: Design Stage Split"
date: 2026-03-27
stage: 01-research
role: rdpi-questioner
---

## High Priority

### Q1: How should "most defining to less defining" be concretely divided into designer tiers?

**Context**: The current design stage assigns the architect to phases 1–2 producing 6 documents (`01-architecture` through `05-usecases`, `07-docs`), QA designer to phase 3 (`06-testcases`, `08-risks`), and design reviewer to phase 4 (README.md). The task requires splitting this into sequential designers ordered from "most defining" to "less defining", but does not specify the tier boundaries. The architect currently handles both core structural documents (architecture, dataflow, model, decisions) and derivative documents (usecases, docs) in two phases.

**Options**:
1. **Two designer tiers** — Tier 1 (architect): `01-architecture`, `02-dataflow`, `03-model`, `04-decisions`; Tier 2 (architect or new role): `05-usecases`, `07-docs`. QA designer remains separate. — Pros: Aligns with existing phase 1/2 split; minimal restructuring / Cons: Only two tiers may not provide meaningful sequential correction opportunities
2. **Three designer tiers** — Tier 1: `01-architecture`, `03-model`; Tier 2: `02-dataflow`, `04-decisions`; Tier 3: `05-usecases`, `07-docs`. QA designer remains separate. — Pros: Finer granularity; more correction checkpoints / Cons: More phases → longer execution; unclear whether dataflow is truly "less defining" than model
3. **Per-document tiers** — Each design document is a separate tier (6 tiers total before QA). — Pros: Maximum correction granularity / Cons: Hits the hard cap of 6 phases from scaling rules; excessive overhead for simple features

**Risks**: Wrong tier boundaries create artificial splits where documents depend on each other within the same tier, forcing correction loops that wouldn't exist in a single-pass. The scaling rules cap at 6 total phases — too many tiers exceed this.

**Researcher recommendation**: Option 1 aligns most closely with the existing phase 1/2 data dependency structure (phase 2 depends on phase 1), and the research shows these are already treated as distinct work units. It also stays under the 6-phase cap with room for QA, review, and implement-reviewer phases.

**User Answer**: Option 3 — по-документно (каждый документ — отдельный тир).

---

### Q2: What happens to the original file when a later designer corrects an earlier design?

**Context**: The task specifies that if a subsequent designer sees inaccuracies in a previous design, they fix it and log the correction. The current pipeline has a strict one-directional data flow — later phases never modify earlier phases' outputs (`rdpi-design-reviewer.agent.md:17` explicitly states "Do NOT modify design documents"). Allowing later designers to edit earlier files is a fundamental change to the pipeline's data flow model.

**Options**:
1. **Overwrite in-place** — Later designer edits the original file directly, logs the change in the correction log. — Pros: Single source of truth; downstream consumers always read the corrected version / Cons: Loses original content; harder to audit what changed; potential for cascading overwrites
2. **Annotate in-place** — Later designer adds correction annotations (e.g., `[CORRECTED by Tier-2: ...]`) inline in the original file, logs in correction log. — Pros: Preserves history inline; reviewers see both versions / Cons: Clutters documents; annotations may confuse downstream agents that parse these files
3. **Leave original unchanged** — Original file stays as-is. Correction log describes what's wrong and what the correct version should be. Later consumers read both the original and the correction log. — Pros: No destructive edits; cleanest audit trail / Cons: Consumers must reconcile two sources; risk of reading stale original without consulting log

**Risks**: Option 1 can cause cascading edits where each tier rewrites prior work, potentially destabilizing the design. Option 3 creates a split-brain problem where some agents read the original and others read the correction log. Option 2 risks breaking file parsers or downstream agents that expect clean markdown.

**Researcher recommendation**: Option 1 (overwrite) with mandatory correction log entries provides the cleanest consumer experience. The correction log serves as the audit trail, while the file itself stays authoritative. This matches how real design processes work — you update the spec, not annotate it.

**User Answer**: Option 1 — перезаписать оригинал + лог коррекций.

---

### Q3: How should the inconsistency correction log file be structured?

**Context**: The task requires a "separate file (a list of corrected inconsistencies)" but does not specify its format, naming, or location. This file serves two purposes: (a) audit trail of what was changed and why, (b) input for the implement-reviewer who checks that corrections didn't introduce new inconsistencies.

**Options**:
1. **Single cumulative log** — One file (e.g., `09-corrections.md`) with entries appended by each subsequent designer tier. Table format: `| Tier | File Modified | Section | Original | Corrected | Rationale |`. — Pros: Single place to check; implement-reviewer reads one file / Cons: Can grow large on complex features
2. **Per-tier log files** — Each tier writes its own correction file (e.g., `corrections-tier-2.md`, `corrections-tier-3.md`). — Pros: Clear ownership; parallel review possible / Cons: Implement-reviewer must read multiple files; harder to see cumulative picture
3. **Structured YAML/JSON log** — Machine-readable format embedded in a markdown file with code blocks. — Pros: Parseable by agents; structured queries possible / Cons: Harder to write correctly; overkill for a correction list

**Risks**: If the log is poorly structured, the implement-reviewer cannot meaningfully verify that corrections are self-consistent. If per-tier logs contradict each other, reconciliation becomes a separate problem.

**Researcher recommendation**: Option 1 (single cumulative log). It fits the existing pattern of numbered markdown files, is easy for both human and agent consumption, and gives the implement-reviewer a single input file. File naming should follow the existing `NN-descriptor.md` convention.

**User Answer**: Option 1 — один кумулятивный файл-таблица.

---

### Q4: What specific criteria should the implement-reviewer check at design stage?

**Context**: The implement-reviewer (`rdpi-implement-reviewer.agent.md`) is currently scoped exclusively to `04-implement`. Its checklist checks plan compliance, verification reports, code patterns, TypeScript strictness, etc. — none of which are relevant to design review. The task requires a "minimum number" of implement-reviewers in design, with one always dedicated to the correction log. The agent would need entirely new review criteria for the design context.

**Options**:
1. **Reuse existing agent with design-specific phase prompt** — The implement-reviewer agent stays unchanged, but the phase prompt overrides its behavior to check design-specific criteria (consistency, correction log validity, architecture feasibility). — Pros: No new agent needed / Cons: Agent instructions conflict with phase prompt; agent identity is misleading ("implement-reviewer" checking design)
2. **Create a design-aware variant** — Fork or extend `rdpi-implement-reviewer` with a design-stage mode that has its own checklist: design traceability, correction log consistency, cross-document references, feasibility. — Pros: Clear separation of concerns; agent name still relevant if framed as "can this design be implemented?" / Cons: More template files to maintain
3. **Use the existing design-reviewer instead** — Expand `rdpi-design-reviewer` to run after each tier (not just at the end) and add correction log checks. — Pros: Keeps role naming logical / Cons: Contradicts the task requirement which specifically names `rdpi-implement-reviewer`

**Risks**: The implement-reviewer has zero design-awareness capabilities per the research. Applying it to design without a clear checklist produces vacuous reviews. If criteria overlap too much with the design-reviewer, the roles become redundant.

**Researcher recommendation**: Option 1 is the simplest path. The implement-reviewer's value at design stage is its "implementability" perspective — checking whether the design is feasible to implement, not whether it's internally consistent (that's the design-reviewer's job). The phase prompt should define a focused checklist: implementability, correction log consistency, and absence of contradictions introduced by corrections.

**User Answer**: В дизайне может быть только `design-reviewer` (не implement-reviewer). Implement-reviewer не участвует в design stage.

---

### Q5: Should the implement-reviewer run after each designer tier or only at the end of the design stage?

**Context**: The task says "minimum number of `rdpi-implement-reviewer` for design stage 2" with one dedicated to the correction log. This is ambiguous: it could mean reviewers run after each tier (catching issues early but increasing phase count) or once at the end (efficient but late feedback). The 6-phase hard cap constrains this — with 2 designer tiers + QA + design-reviewer, there are at most 2 phases left for implement-reviewers.

**Options**:
1. **After each designer tier** — One implement-reviewer phase after each tier. — Pros: Early feedback; corrections caught before they propagate / Cons: May exceed 6-phase cap depending on tier count; significantly longer execution
2. **Once at the end, before design-reviewer** — Single implement-reviewer phase after all designer tiers and QA, just before the design-reviewer. — Pros: Full picture available; fits within phase cap / Cons: Late feedback; corrections at this point require re-running earlier tiers
3. **Once at the end, parallel with design-reviewer** — Implement-reviewer and design-reviewer run as the same phase (both read-only). — Pros: Saves a phase slot; both reviews happen simultaneously / Cons: Can't coordinate findings; implement-reviewer correction log check may conflict with design-reviewer's quality checklist

**Risks**: Running after each tier (Option 1) with 2 tiers → 2 extra phases → 4 designer phases + QA + design-reviewer = 6, hitting the cap with no room for scaling. Running only at the end (Option 2) means corrections found late are expensive.

**Researcher recommendation**: Option 2 — once at the end, before the design-reviewer. This ensures the implement-reviewer's findings feed into the design-reviewer's final synthesis. With the 6-phase cap, this is the only option that works with 2+ designer tiers unless the cap is raised.

**User Answer**: В конце, но только design-reviewer (не implement-reviewer).

---

### Q6: Who produces `00-short-design.md` and what is its scope?

**Context**: The task introduces `00-short-design.md` as "where the work starts" in the design stage. This could be a high-level design summary that guides subsequent tiers, or a condensed version of research findings scoped to design. The stage creator currently produces only `README.md` and `PHASES.md` — adding a third file changes its responsibilities. Alternatively, the first designer tier could produce it.

**Options**:
1. **Stage creator produces it** — The stage creator generates `00-short-design.md` as part of its README.md + PHASES.md generation, synthesizing research into design-scoped guidance. — Pros: Available before any designer runs; consistent with "where the work starts" / Cons: Stage creator is a meta-agent that plans work, not a designer; may produce a low-quality summary without design expertise
2. **First designer tier produces it** — The first architect phase creates `00-short-design.md` as its first output, then proceeds to its assigned documents. — Pros: Design expertise applied; natural starting point / Cons: First tier has extra work; other tiers wait for it; it's produced alongside, not before, the main design
3. **Dedicated phase 0** — A new agent or a lightweight architect invocation that produces only `00-short-design.md` before tier 1 starts. — Pros: Clean separation; focused output / Cons: Extra phase; approaches the phase cap

**Risks**: If `00-short-design.md` is too vague, it doesn't guide subsequent designers. If too detailed, it duplicates the architecture document. If the stage creator produces it, quality may suffer because the stage creator has no design reasoning capability.

**Researcher recommendation**: Option 2 — the first designer tier produces it as part of phase 1. It should be a concise (~1 page) high-level design direction document that precedes the detailed architecture. This keeps the stage creator's scope unchanged and ensures design-level thinking.

**User Answer**: Option 2 — первый дизайнер создаёт 00-short-design.md.

---

## Medium Priority

### Q7: What is the minimum number of implement-reviewers for the design stage?

**Context**: The task says "minimum number of `rdpi-implement-reviewer` for design stage 2" — this could mean a literal minimum count (e.g., at least 2) or that Stage 2 has its own minimum scaling rule. Current implement-reviewer in 04-implement has max 2 invocations. One must always be dedicated to the correction log.

**Options**:
1. **Minimum 2** — One for general design review, one for correction log. — Pros: Matches the task's "one always dedicated to correction log" requirement / Cons: May be unnecessary for simple features
2. **Minimum 1** — Single implement-reviewer that checks both design and correction log. — Pros: Simpler; fewer phases / Cons: Contradicts "one always dedicated to correction log"
3. **Scaling rule** — Minimum 2 for complex features, 1 for simple features (following the existing scaling pattern). — Pros: Flexible / Cons: How to define the threshold?

**Risks**: Too many reviewers per design stage run → phase cap exceeded. Too few → corrections go unchecked.

**Researcher recommendation**: Option 1 (minimum 2) is the safest interpretation of the task. The "one always dedicated" language implies at least two. For simple features where the correction log may be empty, the dedicated reviewer can still validate that no corrections were needed.

**User Answer**: Option 1 — минимум 2 вызова design-reviewer (один обязательно по логу коррекций).

---

### Q8: How does the stage creator access the manifest version at runtime for README.md frontmatter?

**Context**: The manifest version (`1.0.4`) lives in `templates/manifest.json`. The CLI injects `astp-version` into installed template files, but NOT into `.thoughts/` stage files. The stage creator reads installed template files (which contain the injected `astp-version` in their frontmatter). No direct mechanism exists for the stage creator to read `manifest.json` or extract `astp-version` from installed files.

**Options**:
1. **Read from installed template frontmatter** — Stage creator reads `astp-version` from any installed agent/skill file's frontmatter (e.g., its own `.agent.md` file). — Pros: Data already available in installed files; no new infrastructure / Cons: Agent must know to look at its own frontmatter; fragile if frontmatter injection changes
2. **Hardcode in stage creator prompt** — The orchestrator or phase prompt passes the version as a literal value. — Pros: Explicit; no file parsing needed / Cons: Not dynamic; version drift if manifest updates but prompt doesn't
3. **New CLI mechanism** — The CLI writes a `.astp-meta.json` or similar in `.thoughts/` that agents can read. — Pros: Clean separation; single source of truth for runtime metadata / Cons: Requires CLI changes; scope creep

**Risks**: If the version is wrong or out-of-date, the frontmatter is misleading. If it requires CLI changes, this feature depends on a separate code change outside the template system.

**Researcher recommendation**: Option 1. The research confirms that `astp-version` is already injected into installed template files' frontmatter. The stage creator can read it from any co-installed file. This requires only an instruction update in the stage creator agent, no tooling changes.

**User Answer**: Хардкодится при скачивании — эквивалентен `astp-version`, на случай если агент не сможет прочитать свой frontmatter.

---

### Q9: Which README.md files should include `pipeline-version`?

**Context**: The task says "README.md files created by agents in `.thoughts` should also contain the pipeline version." This could mean only stage-level README.md files (one per stage), or also the feature-level README.md (if one exists), or every README.md in `.thoughts/`. Currently, each stage has one README.md. The research-reviewer already expects a `pipeline-version` field (`rdpi-research-reviewer.agent.md:65`) but nothing generates it.

**Options**:
1. **Stage README.md only** — Each stage's README.md gets `pipeline-version` in frontmatter. — Pros: Consistent with current stage structure; 4 files affected / Cons: Feature-level README.md (if any) lacks version
2. **All README.md in `.thoughts/`** — Stage README.md and any feature-level README.md. — Pros: Complete traceability / Cons: Feature-level README.md may not exist in all workflows
3. **All stage outputs** — Every document in `.thoughts/` gets `pipeline-version` in frontmatter. — Pros: Maximum traceability / Cons: Massive template changes; overkill; clutters frontmatter

**Risks**: Too narrow (Option 1) may miss traceability needs. Too broad (Option 3) creates maintenance burden across all agents.

**Researcher recommendation**: Option 1. The task specifically says "README.md files", not all output files. Stage README.md files are the natural place for pipeline metadata since they're the stage summary documents. The existing `research-reviewer` expectation of `pipeline-version` confirms this is the intended level.

**User Answer**: Option 1 — только stage README.md.

---

### Q10: Does `00-short-design.md` need a standardized format?

**Context**: The task introduces it as a new file type that doesn't exist in the current pipeline. All other design documents have detailed format specifications in the architect agent definition (e.g., `01-architecture.md` must have Overview, Components, Interactions, Diagram sections). `00-short-design.md` has no existing specification.

**Options**:
1. **Minimal format** — Frontmatter + free-form markdown. Let the designer decide structure based on the feature. — Pros: Flexible; fast to produce / Cons: Inconsistent across features; may lack critical sections
2. **Structured template** — Required sections: Design Direction, Key Decisions (bullet list), Scope Boundaries, Research References. — Pros: Consistent; ensures essential content / Cons: May be too rigid for varied features
3. **Summary of subsequent documents** — An outline/table of contents for what the subsequent tiers will produce, with one-line summaries per document. — Pros: Acts as a design roadmap; helps subsequent tiers plan / Cons: Duplicates what PHASES.md already does

**Risks**: Without a clear format, the document may become either too verbose (duplicating `01-architecture.md`) or too vague (not guiding subsequent tiers).

**Researcher recommendation**: Option 2. A light structure ensures the document fulfills its role as design launchpad without becoming another full architecture document. Key constraint: must be short (1–2 pages max) to match the "short" in the filename.

**User Answer**: Option 2 — структурированный шаблон (Direction/Decisions/Scope/Refs, 1–2 стр.).

---

## Low Priority

### Q11: How do these changes affect the stage creator's PHASES.md generation logic?

**Context**: The stage creator generates PHASES.md based on the stage skill's phase structure. The design skill currently defines 4 phases. Splitting designers into tiers adds more phases and potentially new agent roles. The stage creator reads the skill to determine phase count and agent assignments.

**Options**:
1. **Update design skill only** — Change the phase structure table in `rdpi-02-design/SKILL.md` to reflect new tiers, implement-reviewer phase, etc. Stage creator logic unchanged — it reads whatever the skill defines. — Pros: Minimal change surface; stage creator is generic / Cons: Relies on stage creator correctly interpreting more complex phase structures
2. **Update both skill and stage creator** — Modify stage creator to handle correction log phases, implement-reviewer at design stage, and `00-short-design.md` generation. — Pros: Explicit handling of new patterns / Cons: Stage creator changes may affect other stages

**Risks**: If the stage creator can't handle the new phase structure, PHASES.md generation breaks. The stage creator is a meta-agent — it's sensitive to skill structure changes.

**Researcher recommendation**: Option 1. The research shows the stage creator reads the skill and adapts. As long as the skill's phase structure table and guidelines are clear, the stage creator should handle it. Test with a dry run after skill update.

**User Answer**: Option 1 — только design skill.

---

### Q12: Do other stages (01-research, 03-plan, 04-implement) need updates for compatibility?

**Context**: The design stage split adds new output files (`00-short-design.md`, correction log), changes phase structure, and adds `pipeline-version` to README.md. Downstream stages (03-plan, 04-implement) read design outputs. If new files are added, their skills may need to reference them. The `pipeline-version` addition affects all stage skills' Output Conventions.

**Options**:
1. **Design stage only** — Only update `rdpi-02-design` skill and associated agents. Downstream stages ignore new files unless they explicitly need them. — Pros: Smallest change set; focused scope / Cons: 03-plan may miss correction context
2. **Design + downstream references** — Update 03-plan and 04-implement skills to reference `00-short-design.md` and the correction log as optional inputs. Add `pipeline-version` to all stage skills' Output Conventions. — Pros: Complete pipeline consistency / Cons: Larger change scope; may introduce regressions in working stages

**Risks**: If 03-plan doesn't know about corrections made during design, it may plan based on stale assumptions. If `pipeline-version` is only in design README.md but not others, the field is inconsistent across stages.

**Researcher recommendation**: Option 2 for `pipeline-version` (affects all stages uniformly) and Option 1 for design-specific files (downstream stages don't need to read the correction log directly — they read the corrected design documents).

**User Answer**: Option 2 — pipeline-version во всех стейджах; design-специфика только в design.

---

### Q13: Should the `pipeline-version` field be the full semantic version or a simplified identifier?

**Context**: The manifest currently holds `"version": "1.0.4"`. The CLI injects this as `astp-version` into template files. The field name in README.md could be `pipeline-version`, `astp-version`, or `rdpi-version`. The value could be the full semver or just the major version.

**Options**:
1. **Use `pipeline-version` with full semver** — `pipeline-version: "1.0.4"`. — Pros: Precise; matches manifest exactly / Cons: New field name different from existing `astp-version`
2. **Reuse `astp-version` field name** — `astp-version: "1.0.4"`. — Pros: Consistent with existing CLI injection convention / Cons: May conflate template version with pipeline version
3. **Use `rdpi-version`** — Bundle-specific naming. — Pros: Clear it's the rdpi bundle version / Cons: Another naming convention to maintain

**Risks**: Inconsistent naming across `.thoughts/` README.md and installed template frontmatter creates confusion. The research-reviewer already uses `pipeline-version` — diverging from that creates a conflict.

**Researcher recommendation**: Option 1. The research-reviewer already expects `pipeline-version` (`rdpi-research-reviewer.agent.md:65`), establishing precedent. Using the same name ensures compatibility with existing expectations.

**User Answer**: Версия не хранится в шаблоне — она вставляется при скачивании (без изменений) из манифеста. Имя поля определяется существующей конвенцией `astp-version`.
