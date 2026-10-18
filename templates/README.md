# Template Author Guide

This directory contains the canonical template files for the `astp` CLI tool. Templates are organized into **bundles** — named, versioned collections of skills, agents and rules.

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
├── thinking/              ← bundle: thinking (claude-code)
│   └── skills/
│       ├── analysis/
│       ├── design-derivation/
│       ├── software-architecture/
│       └── testing/
├── ponytail/              ← bundle: ponytail (claude-code)
│   └── skills/
│       ├── ponytail/
│       ├── ponytail-review/
│       ├── ponytail-audit/
│       └── ponytail-debt/
└── agreement/             ← bundle: agreement (claude-code)
    ├── rules/
    │   └── working-agreement.md
    └── skills/
        ├── communication/
        ├── git/
        ├── retro/
        └── tracker/
```

Each bundle directory's internal structure mirrors the install target structure. For example, `fozy-labs/skills/fozy-labs-di/SKILL.md` installs to `<install-root>/skills/fozy-labs-di/SKILL.md`.

## Manifest Schema

The `manifest.json` file defines all available bundles and their contents. It is the contract between the CLI and the template repository.

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `number \| string` | Schema version (positive integer `N` or `"major.minor"` string, e.g. `1` or `"1.1"`). A newer minor version on a supported major version warns to update `astp`; an unsupported major version fails. |
| `repository` | `string` | Source repository in `owner/repo` format. |
| `bundles` | `Record<string, Bundle>` | Available bundles, keyed by bundle name. |

### Bundle fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Bundle identifier (matches the key in `bundles`). |
| `version` | `string` | Semver version string (e.g., `"1.0.0"`). |
| `description` | `string` | Human-readable description for display in prompts. |
| `use-when` | `string` *(optional)* | Non-empty guidance on when to install or use the bundle; shown in `astp list`, omitted from interactive prompts. |
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
| `category` | `string` | Category: `agent`, `skill`, or `rule`. |
| `optional` | `boolean` *(optional)* | Unchecked by default on `install` and `update`. For a skill, set on its `SKILL.md` item only. |
| `labels` | `string[]` *(optional)* | Distinct `[a-z][a-z0-9_-]*` tags (e.g. `["experimental"]`, `["deprecated"]`) shown in prompts and `astp list`. For a skill, set on its `SKILL.md` item only. |

### Path conventions

- `source` paths follow the pattern `<bundleName>/<category>/<filename>`.
- `target` paths equal `source` with the bundle name prefix stripped.
- Bundle names and every `/`-separated `target` segment must be valid file names on Windows, macOS and Linux: at most 255 UTF-8 bytes, no `\ : * ? " < > |`, control or bidi characters, no trailing dot or space, no reserved device names (`con`, `nul`, `com1`…) or short names like `NAME~1`. No two bundle names, and no two targets or folders in a bundle, may differ only in letter case or Unicode normalization. A `target` may not end in an OS clutter file name (`.DS_Store`, `Thumbs.db`, `desktop.ini`); astp ignores such files inside skills.

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
3. Bump the bundle's minor version (e.g., `"1.0.0"` → `"1.1.0"`); see [Versioning](#versioning).

## Versioning

Bundle versions follow semver:

- **Major**: Breaking changes — files renamed/removed, directory structure changes.
- **Minor**: New files added to the bundle.
- **Patch**: Content fixes to existing files.

## Blocks

Any template file can split its body into named blocks; a file with an `<astp-block>` or `</astp-block>` line is a block file:

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

<astp-block name="code_style" description="Code formatting and naming conventions" optional>
Ready-made text.
</astp-block>
```

Rules:

- Block names match `[a-z][a-z0-9_]*`. Attributes: `name="…"` (required), `description="…"` (optional non-empty description shown in prompts and `astp list`), `use-when="…"` (optional non-empty guidance shown in `astp list`, omitted from interactive prompts), `labels="…"` (optional comma-separated distinct `[a-z][a-z0-9_-]*` tags, e.g. `labels="experimental"`), `optional` (not selected by default), `required` (always installed, never shown in the wizard). `optional` and `required` cannot combine. Write the opening tag with `name`, `description`, `use-when` and `labels` in double quotes, no spaces around `=`.
- Tags are whole lines at column 0 outside code fences; blocks do not nest. In a file with blocks, all text except the frontmatter lives inside blocks. Outside a code fence, no line inside a block may equal an installed tag (`<name>` or `</name>`) of any block in the file.
- `<FILL_INSTRUCTION>` tells the consumer's agent to fill the block in place; while one is present, the CLI keeps a `<SETUP_REQUIRED>` block at the top of the installed file.
- On install a block renders as `<project_map>…</project_map>` — the name becomes the tag. `SETUP_REQUIRED`/`FILL_INSTRUCTION` are CLI tags and are always uppercase.
- A skill containing a file with blocks is excluded from `.claude-plugin/marketplace.json` — only astp understands blocks. `npm run generate:skills` fails on block parse errors in any manifest item that is `.md` or has blocks.

Lock state: a unit with blocks stores `blocks` (`<file>#<name>` → block hash) and `declinedBlocks` in `astp.lock`; a block file adds only its frontmatter to the unit `hash`.

| Action | Result |
|--------|--------|
| `install` | selected blocks render; deselected go to `declinedBlocks` (kept if locally changed, unless `--force`) |
| `update` | unchanged blocks get the new template; blocks changed on both sides get a `<FILL_INSTRUCTION>` wrapper with the new version; blocks removed upstream are removed unless locally changed; `--force` restores locally changed blocks, except filled `<FILL_INSTRUCTION>` blocks |
| `delete` | keeps a file with locally changed blocks or consumer text outside blocks, unless `--force` |

## Install State

Files without blocks remain byte-identical to template sources. Files with blocks merge per block (see above) and are written with LF line endings. A skill directory is one unit: its hash covers every file in it, and install, update and delete handle it as a whole. Install state is recorded in `astp.lock` at the target root.
