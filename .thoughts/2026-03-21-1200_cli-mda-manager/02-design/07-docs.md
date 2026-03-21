---
title: "Documentation Impact: astp CLI"
date: 2026-03-21
stage: 02-design
role: rdpi-architect
workflow: b0.5
---

# Documentation Impact: astp CLI

## README.md

The project currently has no README. The following sections are needed:

1. **What is astp** — one-paragraph description of the tool and its purpose (MDA file management for AI agents).
2. **Installation** — `npm install -g astp` and Node.js >= 22 requirement.
3. **Quick start** — single command example (`astp` for interactive wizard, `astp install rdpi --target project` for scripted).
4. **Commands** — brief reference table: `install`, `update`, `check`, and default interactive wizard.
5. **Bundles** — list of available bundles (`base`, `rdpi`) with one-line descriptions and file counts.
6. **CI/CD** — example GitHub Actions snippet with `GIGET_AUTH` env variable.
7. **How it works** — brief explanation: fetches templates from GitHub, injects `astp-*` frontmatter for tracking.

## --help Output

Each command needs a clear `--help` description. Commander.js generates these from `.description()` and `.option()` calls. Design the help text during implementation — no separate document needed, just ensure:
- `astp --help` — lists all commands + interactive wizard default.
- `astp install --help` — documents `[bundle]` argument, `--target` option.
- `astp update --help` — documents `--force` option.
- `astp check --help` — no options beyond target selection.

## Template Author Documentation

The `manifest.json` schema needs a short reference for anyone adding new bundles or items to `src/templates/`:
- Manifest schema fields (`schemaVersion`, `bundles`, `items`, `source`/`target` path conventions).
- How to add a new bundle (create directory, add manifest entry, bump version).
- Frontmatter conventions — which `astp-*` fields the CLI injects and why.

This can be a `CONTRIBUTING.md` section or a short `src/templates/README.md`.
