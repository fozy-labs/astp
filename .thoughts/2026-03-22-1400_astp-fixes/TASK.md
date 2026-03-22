# ASTP Fixes

A batch of fixes and improvements to the astp tool.

## Issues

### 1. Duplicate version fields in YAML frontmatter
Currently, generated files contain two version fields:
```yaml
workflow_version: b0.5
rdpi-version: b0.5
```
There should be only ONE version field: `rdpi-version`.

### 2. Version must come from manifest
The version value in all MDA files and `.thoughts/` derivative files (README.md, etc.) must be sourced from the manifest (`manifest.json`). A single source of truth: `rdpi-version: <manifest_version>`.

### 3. Hint for multi-select prompts (space vs enter)
When the user selects bundles/sets in the interactive prompt, add a hint explaining what **Space** does (toggle selection) and what **Enter** does (confirm). 

### 4. Remove redraft limit from orchestrator
The RDPI orchestrator agent currently has a hardcoded limit of 3 redrafts per stage. Remove this limit from the orchestrator so it does not know about any redraft cap.

### 5. Set auto-redraft limit on approve agent
The `rdpi-approve` agent should have an auto-redraft limit of **2** for critical issues (issues it can auto-redraft without human confirmation).

### 6. Orchestrator distorts task meaning in TASK.md
The orchestrator currently does extra research/rephrasing when writing TASK.md, which can distort the original task meaning. Slightly adjust the orchestrator instructions so it passes the user's task description into TASK.md as-is (with translation to English if needed), without adding extra interpretation or research.

## Constraints
- Do NOT bloat existing files. Extra tokens = worse results.
