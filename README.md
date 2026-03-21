# astp

CLI tool for managing MDA files (skills, agents, instructions, stage definitions) used by AI coding agents in VS Code.

## Installation

```bash
npm install -g @fozy-labs/astp
```

Requires **Node.js >= 22**.

## Quick start

**Interactive mode** — launches a wizard to guide you through bundle selection:

```bash
astp
```

**Scripted mode** — install a specific bundle directly:

```bash
astp install rdpi --target project
```

## Commands

| Command | Description |
|---------|-------------|
| `astp` | Launch interactive wizard |
| `astp install [bundle]` | Install a bundle to the selected target |
| `astp update [--force]` | Update installed files to latest versions |
| `astp check` | Check for available updates |

All commands accept `--target <project|user>` to skip the target selection prompt:

- `--target project` — installs to `<cwd>/.github/`
- `--target user` — installs to `~/.copilot/`

### install

```bash
astp install [bundle] [--target <project|user>]
```

Install template bundles. Without arguments, prompts for bundle selection and target directory. With a bundle name and `--target`, runs non-interactively.

### update

```bash
astp update [--force] [--target <project|user>]
```

Update installed files to the latest version from the manifest. Modified files are skipped by default — use `--force` to overwrite them.

### check

```bash
astp check [--target <project|user>]
```

Compare installed file versions against the remote manifest and display a status report.

## Bundles

| Bundle | Files | Description | Default |
|--------|-------|-------------|---------|
| `base` | 1 | Base skill for VSCode Copilot agent orchestration | Yes |
| `rdpi` | 21 | Full RDPI pipeline — agents, instructions, and stage definitions | No |

- **base** includes the orchestration skill (`skills/orchestrate/SKILL.md`) that enables multi-agent coordination.
- **rdpi** includes 16 specialized agents, 1 instruction file, and 4 stage definitions for the Research → Design → Plan → Implement workflow.

## CI/CD

For CI environments or scripted usage, pass `--target` to avoid interactive prompts:

```bash
# Install in CI
astp install rdpi --target project

# Check for updates
astp check --target project

# Force-update all files
astp update --force --target project
```

If you encounter GitHub API rate limits, set the `GIGET_AUTH` environment variable with a personal access token:

```bash
export GIGET_AUTH=ghp_your_token_here
astp install rdpi --target project
```

## How it works

`astp` fetches template files from the [`fozy-labs/astp`](https://github.com/fozy-labs/astp) GitHub repository using [giget](https://github.com/unjs/giget). A `manifest.json` file in the repository defines available bundles, their versions, and file mappings.

When files are installed, `astp` injects `astp-*` frontmatter fields into each file:

```yaml
---
astp-source: fozy-labs/astp
astp-bundle: rdpi
astp-version: 1.0.0
astp-hash: <sha256>
---
```

These fields enable version tracking, update detection, and local modification detection without requiring a separate lock file.
