---
title: "CLI MDA Manager — Node.js CLI for AI Agent Configuration Files"
date: 2026-03-21
workflow: b0.5
---

# CLI MDA Manager

## Summary

Build a Node.js CLI tool (`astp`) that manages MDA (Markdown files readable by AI agents) — skills, agents, instructions, and other `.md` configuration files used by AI coding assistants.

## Requirements

### Core

- **CLI Node.js tool** published as an npm package.
- **Manages MDA files**: skills (`.github/skills/`), agents (`.github/agents/`), instructions (`.github/instructions/`), and other markdown files consumed by AI agents.
- **Template-driven**: MDA files are NOT hardcoded in the CLI binary. They live in `src/templates/` within the repository.
- **Decoupled updates**: Updating MDA templates does NOT require a new CLI version (unless there are breaking changes). The CLI fetches/syncs templates from the repository.

### Supported AI Agents

- **VSCode GitHub Copilot** (primary, current user):
  - Project-level: `.github/` directory inside the project.
  - User-level: `~/.copilot/` directory in the user's home folder.
- **Others**: Architecture should allow adding more agent types later.

### Supported OS

- **Windows** (primary, current user).
- Architecture should be OS-agnostic (no OS-specific code expected if done correctly).

### Template Organization

- **Bundles**: Named sets of related MDA files (e.g., "RDPI pipeline" = agents + instructions + stage definitions).
- **Individual items**: Standalone skills, agents, instructions not tied to any bundle.
- **Independent versioning**: Bundles and individual items are versioned separately.

### CLI Features

- **Interactive selection**: User-friendly way to choose what to install (bundles and/or individual items). npm packages for interactive prompts are allowed (after security/freshness review).
- **Install**: Copy selected MDA templates to the target location (project-level or user-level).
- **Update**: Check for and apply updates to installed MDA files.
- **Update check**: Report whether newer versions of installed items are available.

### Initial Bundles (from existing AI setup in this repo)

1. **`orchestrate` (base bundle for VSCode)**: The orchestrate skill (`skills/orchestrate/SKILL.md`). Installed by default when setting up VSCode support.
2. **`rdpi` (optional bundle)**: The full RDPI pipeline — 16 agent files (`agents/*.agent.md`), workflow instructions (`instructions/thoughts-workflow.instructions.md`), 4 stage definitions (`rdpi-stages/*.md`), and the RDPI-Orchestrator agent. This is an optional add-on.

### Existing State

- Repository is initialized with `package.json`, basic folder structure (`src/templates/`), and the full AI agent setup copied into `.github/`.
- No CLI code exists yet — only the AI setup and project scaffolding.

## Constraints

- Use TypeScript for the CLI source code.
- Follow existing project conventions (see `package.json` scripts, `.editorconfig`, prettier config).
- Minimize dependencies — only add well-maintained, secure npm packages.
- The `copilot-instructions.md` at `.github/copilot-instructions.md` is project-specific and should NOT be part of any template bundle.
