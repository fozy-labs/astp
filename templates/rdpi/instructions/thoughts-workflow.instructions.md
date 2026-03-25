---
name: "thoughts-workflow"
description: "Use when working with .thoughts/ feature development workflow files. Covers document formatting and stage structure for the Research → Design → Plan → Implement pipeline."
applyTo: ".thoughts/**"
---

# .thoughts/ Workflow Guidelines

## Directory Structure

```
.thoughts/
└── <YYYY-MM-DD-HHmm>_<feature-name>/
    ├── TASK.md
    └── <stage_number>-<stage_name>/
        ├── README.md
        ├── PHASES.md
        ├── REVIEW.md          (created by rdpi-approve)
        └── <phase_number>-<phase_name>.md
```


## Document Conventions

- **Language**: English. (all files inside `.thoughts`)
- **User Language**: Russian (all user I/O must be in Russian)
- **Front matter**: Each file must have a front matter section.
- **Stage guidance skill**: `rdpi-<stage-identifier>`
- **Status**: README.md contains "Status" field:
    - Inprogress: work in progress, not ready for review,
    - Draft: ready for review, awaiting feedback,
    - Review: under review, awaiting decision,
    - Approved: passed review, ready for implementation,
    - Redraft: needs significant changes, check REVIEW.md for feedback.
- **Cross-references**: reference links between documents (`../01-research/README.md`).
- **File paths**: links to source files with alias (`@/signals/signals/State.ts`).


## Mermaid Diagrams

Rules:
- Each diagram must have a meaningful title.
- Use clear node names, not abbreviations.
- For complex diagrams, add a description before the code block.
- Limit diagrams to 15–20 elements — split large ones into multiple diagrams.


## Stages

- `01-research` — gathering facts, analyzing the codebase and ecosystem.
- `02-design` — designing a solution based on the facts.
- `03-plan` — decomposing the design into implementation phases.
- `04-implement` — executing the plan.

## Subagents roles

Base:
- `rdpi-stage-creator`: Creates an initial directory (with `README.md` and `PHASES.md` files) for each stage. Allocates resources to the task and defines the necessary roles. Operates in three modes: `initial` (new stage), `redraft` (appending fix phases after Not Approved verdict), and `resume` (recovering an interrupted stage — determines what was already completed).
- `rdpi-approve`: Compiles the stage reviewer's findings, performs a lightweight sanity check, and presents the combined results to the user for an approval decision. Human-in-the-loop gate.
- `rdpi-redraft`: Re-drafts specific documents within a stage based on review feedback (used as a phase agent within redraft rounds).

01-Research:
- `rdpi-codebase-researcher`: Traces code paths, maps dependencies, documents patterns with exact file references.
- `rdpi-external-researcher`: Research external sources for the feature.
- `rdpi-questioner`: Formulates open-ended questions.
- `rdpi-research-reviewer`: Reviews the research findings and summarizes them.

02-Design:
- `rdpi-architect`: Designs the overall architecture of the feature.
- `rdpi-qa-designer`: Designs the quality assurance strategy for the feature.
- `rdpi-design-reviewer`: Reviews the design and summarizes it.

03-Plan:
- `rdpi-planner`: Creates a detailed implementation plan for the feature.
- `rdpi-plan-reviewer`: Reviews the plan for design traceability, task concreteness, and dependency correctness.

04-Implement:
- `rdpi-codder`: Implements the feature according to the plan.
- `rdpi-tester`: Tests the implemented feature and reports results.
- `rdpi-implement-reviewer`: Reviews the implementation and summarizes it.
