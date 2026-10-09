# Template Author Guide

This directory contains the canonical template files for the `astp` CLI tool. Templates are organized into **bundles** — named, versioned collections of MDA (Markdown Agent) files.

## Directory Structure

```
templates/
├── manifest.json          ← central manifest (source of truth)
├── README.md              ← this file
├── astp/                  ← bundle: astp (claude-code)
│   └── skills/
│       └── astp/
├── fozy-labs/             ← bundle: fozy-labs (claude-code)
│   └── skills/
│       ├── fozy-labs-di/
│       ├── fozy-labs-fsd/
│       ├── fozy-labs-rx-api/
│       └── fozy-labs-signals/
├── docs/                  ← bundle: docs (claude-code)
│   └── skills/
│       ├── markdown-craft/
│       └── statechart-craft/
└── design/                ← bundle: design (claude-code)
    └── skills/
        └── design-derivation/
```

Each bundle directory's internal structure mirrors the install target structure. For example, `fozy-labs/skills/fozy-labs-di/SKILL.md` installs to `<install-root>/skills/fozy-labs-di/SKILL.md`.

## Manifest Schema

The `manifest.json` file defines all available bundles and their contents. It is the contract between the CLI and the template repository.

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `number` | Schema version (integer). CLI checks compatibility before processing. |
| `repository` | `string` | Source repository in `owner/repo` format. |
| `bundles` | `Record<string, Bundle>` | Available bundles, keyed by bundle name. |

### Bundle fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Bundle identifier (matches the key in `bundles`). |
| `version` | `string` | Semver version string (e.g., `"1.0.0"`). |
| `description` | `string` | Human-readable description for display in prompts. |
| `default` | `boolean` | Whether this bundle is pre-selected by default in the interactive wizard. |
| `platforms` | `Platform[]` *(optional)* | Coding agents this bundle supports — `"claude-code"` is the only value today. Defaults to all platforms when omitted. |
| `items` | `TemplateItem[]` | Files included in this bundle. |

### Platform values

| Value | Project root | User root |
|-------|--------------|-----------|
| `claude-code` | `./.claude/` | `$CLAUDE_CONFIG_DIR`, else `~/.claude/` |

The same `target` path lands under the platform's own root, so write bundle items as if they live directly under `skills/<name>/SKILL.md`, `agents/...`, etc.

### TemplateItem fields

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string` | Path relative to `templates/` (e.g., `fozy-labs/skills/fozy-labs-di/SKILL.md`). |
| `target` | `string` | Path relative to install root (e.g., `skills/fozy-labs-di/SKILL.md`). |
| `category` | `string` | MDA file category: `agent`, `skill`, or `rule`. |

### Path conventions

- `source` paths follow the pattern `<bundleName>/<category>/<filename>`.
- `target` paths equal `source` with the bundle name prefix stripped.

## How to Add a New Bundle

1. Create a new directory under `templates/` with the bundle name.
2. Add template files inside, organized by category (e.g., `agents/`, `skills/`, `rules/`).
3. Add a bundle entry to `manifest.json` with `name`, `version`, `description`, `default`, `platforms`, and `items`.
4. Each item needs `source` (relative to `templates/`), `target` (relative to install root), and `category`.
5. Set the initial version to `"1.0.0"`.
6. Declare the supported `platforms`, e.g. `["claude-code"]`.

## How to Add a File to an Existing Bundle

1. Add the file under the bundle's directory, in the appropriate category subdirectory.
2. Add a new item entry to the bundle's `items` array in `manifest.json`.
3. Bump the bundle's patch version (e.g., `"1.0.0"` → `"1.0.1"` for content fixes, `"1.1.0"` for new files).

## Versioning

Bundle versions follow semver:

- **Major**: Breaking changes — files renamed/removed, directory structure changes.
- **Minor**: New files added to the bundle.
- **Patch**: Content fixes to existing files.

## Blocks

Any `.md` template file can split its body into named blocks:

```md
---
description: Project map
---

<astp-block name="project_map">
## Project Map

<FILL_INSTRUCTION>
Describe the project file structure.
</FILL_INSTRUCTION>
</astp-block>

<astp-block name="code_style" optional>
Ready-made text.
</astp-block>
```

Rules:

- Block names match `[a-z][a-z0-9_]*`. Attributes: `name="…"` (required), `optional` (not selected by default), `required` (always installed, never shown in the wizard). `optional` and `required` cannot combine.
- Tags are whole lines at column 0 outside code fences; blocks do not nest. In a file with blocks, all text except the frontmatter lives inside blocks.
- `<FILL_INSTRUCTION>` tells the consumer's agent to fill the block in place; while one is present, the CLI keeps a `<SETUP_REQUIRED>` block at the top of the installed file.
- On install a block renders as `<project_map>…</project_map>` — the name becomes the tag. `SETUP_REQUIRED`/`FILL_INSTRUCTION` are CLI tags and are always uppercase.
- A skill containing a file with blocks is excluded from `.claude-plugin/marketplace.json` — only astp understands blocks. `npm run generate:skills` fails on block parse errors in any `.md` manifest item.

Lock state: a unit with blocks stores `blocks` (`<file>#<name>` → block hash) and `declinedBlocks` in `astp.lock`; the unit `hash` covers only the frontmatter.

| Action | Result |
|--------|--------|
| `install` | selected blocks render; deselected go to `declinedBlocks` (kept if locally changed, unless `--force`) |
| `update` | unchanged blocks get the new template; blocks changed on both sides get a `<FILL_INSTRUCTION>` wrapper with the new version; blocks removed upstream are removed unless locally changed |
| `delete` | keeps a file with locally changed blocks or consumer text outside blocks, unless `--force` |

## Install State

Files without blocks remain byte-identical to template sources. Files with blocks merge per block (see above). Install state is recorded in `astp.lock` at the target root.
