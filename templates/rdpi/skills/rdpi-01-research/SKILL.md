---
name: "rdpi-01-research"
description: "ONLY for RDPI pipeline."
---

# Stage: 01-Research

Research stage gathers facts about the codebase and ecosystem. No solutions, no opinions - only verifiable information.

## Available Roles

| Role | Agent | Description | Default Limit              |
|------|-------|-------------|----------------------------|
| Codebase Analyst | `rdpi-codebase-researcher` | Traces code paths, maps dependencies, documents patterns in the repository | max 2 invocation, retry 2  |
| External Researcher | `rdpi-external-researcher` | Investigates ecosystem: comparable libraries, best practices, known pitfalls via web search | max 2 invocation, retry 1  |
| Problem Analyst | `rdpi-problem-analyst` | Analyzes explicit issue/problem statements from the task, validates reproduction evidence, and maps failing tests when they exist | max 10 invocation, retry 1 |
| Questions Synthesizer | `rdpi-questioner` | Formulates unresolved questions, trade-offs, ambiguities and constraints | max 2 invocation, retry 1  |
| Research Reviewer | `rdpi-research-reviewer` | Synthesizes all findings into README.md, verifies cross-references and consistency | max 2 invocation, retry 2  |

## Typical Phase Structure

| Phase | Agent | Output | Depends on | Parallelizable |
|-------|-------|--------|------------|----------------|
| 1 | `rdpi-codebase-researcher` | `01-codebase-analysis.md` | - | Yes (with 2) |
| 2 | `rdpi-external-researcher` | `02-external-research.md` | - | Yes (with 1) |
| 3 | `rdpi-codebase-researcher` or `rdpi-external-researcher` | `03-supporting-research.md` (optional) | 1 and/or 2 | Yes |
| 4 | `rdpi-problem-analyst` | `04-problem-analysis.md` (only when TASK contains explicit issue/problem statements) | 1, 2, optional 3 | No |
| 5 | `rdpi-questioner` | `05-open-questions.md` | 1, 2, optional 3, optional 4 | No |
| 6 | `rdpi-research-reviewer` | Updates `README.md` | all previous outputs | No |

Phases 1-2 are independent and SHOULD be parallelized. Phase 3 is an optional supporting-research slot when the task needs an additional factual slice before synthesis. Phase 4 is conditional and runs only when the task contains explicit bugs, regressions, incidents, failing scenarios, or issue statements. Phase 5 depends on all prior research outputs that actually exist. Phase 6 is sequential - it depends on every produced artifact.

## Phase Prompt Guidelines

### Phase 1 - Codebase Analysis

The prompt MUST specify:
- Entry points to start from (modules, files, or concepts relevant to the task)
- What aspects to trace: architecture, data flow, dependencies, patterns, public API surface
- Scope boundaries (which modules to include/exclude)

Do NOT ask the agent to propose solutions. Only facts.

### Phase 2 - External Research

The prompt MUST specify:
- What problem domain to research (the feature's domain, not the repo's tech stack)
- Which comparable libraries/frameworks to analyze
- What type of findings matter: patterns, pitfalls, performance, API ergonomics

Include a skepticism directive: cross-reference claims, annotate with confidence levels (High/Medium/Low), separate established practices from opinions.

### Phase 3 - Supporting Research

The prompt MUST specify:
- What additional factual slice is missing after phases 1-2
- Whether the work is codebase-focused or ecosystem-focused
- What concrete output the extra research must unlock for later phases

Do NOT use this phase for opinions, design, or speculative problem solving.

### Phase 4 - Problem Analysis

The prompt MUST specify:
- The exact reported bug/issue/problem statements from TASK.md that need analysis
- Paths to all relevant research outputs already produced (01, 02, and optional 03)
- Reproduction boundaries: commands, tests, environments, fixtures, or inputs that are in scope
- Whether the agent should inspect or run targeted tests, the app, or specific commands

The prompt MUST instruct the agent to stay evidence-first: explain expected vs actual behavior, reproduction status, failure path, and exact failing test case(s) or explicit absence of matching tests.

If the task does not contain an explicit issue/problem statement, omit this phase instead of creating filler analysis.

### Phase 5 - Open Questions

The prompt MUST specify:
- Context: brief feature description + what areas were researched
- Paths to all available research outputs (codebase analysis, external research, optional supporting research, optional problem analysis) - the questioner reads these to identify gaps
- What kind of questions to generate: technical constraints, API compatibility, performance trade-offs, scope ambiguities, risks
- Priority classification scheme (High/Medium/Low)

Each question must include: context, options (if applicable), risks, and researcher recommendation.

### Phase 6 - Research Review

The prompt MUST specify:
- Paths to all phase outputs present in the stage directory
- Instruction to write/update README.md with: summary, document links, key findings (5-7 bullets), contradictions and gaps, quality review checklist, next steps
- Quality review requirements: verify file existence, reference accuracy, source attribution with confidence levels, problem-analysis evidence quality, question actionability, no-solutions rule, frontmatter correctness, cross-reference consistency
- Cross-reference check: verify claims in one document against another

## Output Conventions

- Frontmatter fields: phase outputs use (title, date, stage, role); README.md uses (title, date, status, feature, astp-version)
- Reserve `04-problem-analysis.md` for issue analysis when needed; `05-open-questions.md` stays the canonical open-questions artifact even when phase 4 is omitted
- README.md structure: Summary, Documents, Key Findings, Contradictions and Gaps, Quality Review, Next Steps
- File paths referenced with `@/` alias (e.g., `@/signals/signals/State.ts`)
- Mermaid diagrams: titled, max 15-20 elements, clear node names

## Scaling Rules

- For trivial tasks (affecting < 3 files): phase 2 (external research) can be dropped; the questioner runs based on TASK.md + available codebase/problem analysis only
- For tasks with explicit bugs, regressions, incidents, or issue statements: add phase 4 (`rdpi-problem-analyst`) after factual research and before open questions
- For broad tasks (affecting > 3 modules): phase 1 or phase 3 can be split into multiple parallel codebase-researcher invocations scoped to different modules
- If phase 4 is omitted, keep `05-open-questions.md` as the output filename to preserve stable numbering across research runs
- Never exceed 6 total phases for research stage
