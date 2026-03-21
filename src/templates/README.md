# Template Author Guide

This directory contains the canonical template files for the `astp` CLI tool. Templates are organized into **bundles** — named, versioned collections of MDA (Markdown Agent) files.

## Directory Structure

```
src/templates/
├── manifest.json          ← central manifest (source of truth)
├── README.md              ← this file
├── base/                  ← bundle: base
│   └── skills/
│       └── orchestrate/
│           └── SKILL.md
└── rdpi/                  ← bundle: rdpi
    ├── agents/
    ├── instructions/
    └── rdpi-stages/
```

Each bundle directory's internal structure mirrors the install target structure. For example, `rdpi/agents/rdpi-approve.agent.md` installs to `<install-root>/agents/rdpi-approve.agent.md`.

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
| `items` | `TemplateItem[]` | Files included in this bundle. |

### TemplateItem fields

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string` | Path relative to `src/templates/` (e.g., `rdpi/agents/rdpi-approve.agent.md`). |
| `target` | `string` | Path relative to install root (e.g., `agents/rdpi-approve.agent.md`). |
| `category` | `string` | MDA file category: `agent`, `skill`, `instruction`, or `stage-definition`. |

### Path conventions

- `source` paths follow the pattern `<bundleName>/<category>/<filename>`.
- `target` paths equal `source` with the bundle name prefix stripped.

## How to Add a New Bundle

1. Create a new directory under `src/templates/` with the bundle name.
2. Add template files inside, organized by category (e.g., `agents/`, `skills/`, `instructions/`).
3. Add a bundle entry to `manifest.json` with `name`, `version`, `description`, `default`, and `items`.
4. Each item needs `source` (relative to `src/templates/`), `target` (relative to install root), and `category`.
5. Set the initial version to `"1.0.0"`.

## How to Add a File to an Existing Bundle

1. Add the file under the bundle's directory, in the appropriate category subdirectory.
2. Add a new item entry to the bundle's `items` array in `manifest.json`.
3. Bump the bundle's patch version (e.g., `"1.0.0"` → `"1.0.1"` for content fixes, `"1.1.0"` for new files).

## Versioning

Bundle versions follow semver:

- **Major**: Breaking changes — files renamed/removed, directory structure changes.
- **Minor**: New files added to the bundle.
- **Patch**: Content fixes to existing files.

## Frontmatter Metadata

During installation, the CLI injects four `astp-*` fields into each installed file's YAML frontmatter:

| Field | Purpose |
|-------|---------|
| `astp-source` | Identifies the source repository (e.g., `fozy-labs/astp`). |
| `astp-bundle` | Identifies the bundle (e.g., `rdpi`). |
| `astp-version` | Bundle version at install/update time (e.g., `1.0.0`). |
| `astp-hash` | SHA-256 hash of template content for modification detection. |

These fields are managed by the CLI — do not add them to template source files.
