---
title: "Phase 4: Templates + Manifest"
date: 2026-03-22
stage: 03-plan
role: rdpi-planner
rdpi-version: b0.5
---

## Goal

Populate `src/templates/` with the canonical template files and manifest. After this phase, the template repository structure matches the design specification — 22 template files across 2 bundles plus the manifest.json contract.

## Dependencies

- **Requires**: Phase 1 (project configured — though this phase creates no TypeScript, it depends on Phase 1 for consistent project state)
- **Blocks**: Phase 5 (E2E tests need template files to exist for local testing fixtures)

## Execution

Parallel with Phase 2 and Phase 3 (template files are markdown/JSON — no TypeScript compilation involved).

## Tasks

### Task 4.1: Create `src/templates/manifest.json`

- **File**: `src/templates/manifest.json`
- **Action**: Create
- **Complexity**: Medium
- **Description**: Central manifest defining all bundles, their versions, and file mappings. This is the CLI↔template contract (ADR-5).
- **Details**:
  Create the complete manifest following the schema in [ref: ../02-design/03-model.md §4.1]:

  ```json
  {
    "schemaVersion": 1,
    "repository": "fozy-labs/astp",
    "bundles": { ... }
  }
  ```

  **`base` bundle** (1 item, `default: true`):
  - `skills/orchestrate/SKILL.md` — source: `base/skills/orchestrate/SKILL.md`, target: `skills/orchestrate/SKILL.md`, category: `skill`

  **`rdpi` bundle** (21 items, `default: false`):
  - 16 agent files — source: `rdpi/agents/{filename}`, target: `agents/{filename}`, category: `agent`
    - `RDPI-Orchestrator.agent.md`
    - `rdpi-approve.agent.md`
    - `rdpi-architect.agent.md`
    - `rdpi-codder.agent.md`
    - `rdpi-codebase-researcher.agent.md`
    - `rdpi-design-reviewer.agent.md`
    - `rdpi-external-researcher.agent.md`
    - `rdpi-implement-reviewer.agent.md`
    - `rdpi-plan-reviewer.agent.md`
    - `rdpi-planner.agent.md`
    - `rdpi-qa-designer.agent.md`
    - `rdpi-questioner.agent.md`
    - `rdpi-redraft.agent.md`
    - `rdpi-research-reviewer.agent.md`
    - `rdpi-stage-creator.agent.md`
    - `rdpi-tester.agent.md`
  - 1 instruction file — source: `rdpi/instructions/thoughts-workflow.instructions.md`, target: `instructions/thoughts-workflow.instructions.md`, category: `instruction`
  - 4 stage definition files — source: `rdpi/rdpi-stages/{filename}`, target: `rdpi-stages/{filename}`, category: `stage-definition`
    - `01-research.md`, `02-design.md`, `03-plan.md`, `04-implement.md`

  Both bundles start at `version: "1.0.0"` [ref: ../02-design/03-model.md §4.1].
  Paths follow convention: `source` = `<bundleName>/<category>/<filename>`, `target` = `source` with bundle name prefix stripped [ref: ../02-design/03-model.md §4.3].

### Task 4.2: Create base bundle template

- **File**: `src/templates/base/skills/orchestrate/SKILL.md`
- **Action**: Create
- **Complexity**: Low
- **Description**: Copy the orchestrate skill from `.github/skills/orchestrate/SKILL.md` to the template source location.
- **Details**:
  Copy the file contents from the existing `.github/skills/orchestrate/SKILL.md` into `src/templates/base/skills/orchestrate/SKILL.md`. This is the canonical template source — the `.github/` version will eventually become an install target populated by running `astp install` on the project itself [ref: ../02-design/01-architecture.md §6].

  File count: 1 file [ref: ../02-design/01-architecture.md §6, base bundle].

### Task 4.3: Create rdpi bundle templates

- **Files**: 21 files under `src/templates/rdpi/`
- **Action**: Create
- **Complexity**: Low
- **Description**: Copy all rdpi bundle files from `.github/` to the template source location, preserving internal directory structure.
- **Details**:
  Copy files from `.github/` to `src/templates/rdpi/`, preserving the category-based directory structure [ref: ../02-design/01-architecture.md §6]:

  **Agents** (16 files) — from `.github/agents/` to `src/templates/rdpi/agents/`:
  - `RDPI-Orchestrator.agent.md`
  - `rdpi-approve.agent.md`
  - `rdpi-architect.agent.md`
  - `rdpi-codder.agent.md`
  - `rdpi-codebase-researcher.agent.md`
  - `rdpi-design-reviewer.agent.md`
  - `rdpi-external-researcher.agent.md`
  - `rdpi-implement-reviewer.agent.md`
  - `rdpi-plan-reviewer.agent.md`
  - `rdpi-planner.agent.md`
  - `rdpi-qa-designer.agent.md`
  - `rdpi-questioner.agent.md`
  - `rdpi-redraft.agent.md`
  - `rdpi-research-reviewer.agent.md`
  - `rdpi-stage-creator.agent.md`
  - `rdpi-tester.agent.md`

  **Instructions** (1 file) — from `.github/instructions/` to `src/templates/rdpi/instructions/`:
  - `thoughts-workflow.instructions.md`

  **Stage definitions** (4 files) — from `.github/rdpi-stages/` to `src/templates/rdpi/rdpi-stages/`:
  - `01-research.md`
  - `02-design.md`
  - `03-plan.md`
  - `04-implement.md`

  Note: `.github/copilot-instructions.md` is project-specific and NOT part of any bundle [ref: TASK.md Constraints]. `.github/dependabot.yml` and `.github/workflows/` are CI files, not MDA templates.

  Total: 21 files [ref: ../02-design/01-architecture.md §6, rdpi bundle].

### Task 4.4: Create `src/templates/README.md`

- **File**: `src/templates/README.md`
- **Action**: Create
- **Complexity**: Low
- **Description**: Template author guide — documents manifest schema, how to add bundles, and frontmatter conventions.
- **Details**:
  Short reference for template contributors [ref: ../02-design/07-docs.md, Template Author Documentation]:
  - Manifest schema fields: `schemaVersion`, `bundles`, each bundle's `name`/`version`/`description`/`default`/`items`
  - `source` and `target` path conventions [ref: ../02-design/03-model.md §4.3]
  - How to add a new bundle: create directory, add manifest entry, bump version
  - How to add a file to existing bundle: add file, add manifest item, bump bundle patch version
  - Note about `astp-*` frontmatter fields injected by CLI during install

## Verification

- [ ] `src/templates/manifest.json` is valid JSON (parseable)
- [ ] Manifest contains exactly 2 bundles: `base` (1 item) and `rdpi` (21 items)
- [ ] Total template files: 22 (1 in base + 21 in rdpi)
- [ ] Every `source` path in manifest references an existing file under `src/templates/`
- [ ] Every `target` path matches the expected install structure from [../02-design/01-architecture.md §7]
- [ ] Template file contents match the originals in `.github/` (no content modifications)
- [ ] `src/templates/README.md` documents manifest schema and contribution process
