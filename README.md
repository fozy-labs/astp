# astp

CLI tool for managing MDA files (skills, agents, instructions, stage definitions) used by AI coding agents. Supports **VS Code Copilot** (`.github/`, `~/.copilot/`) and **Claude Code** (`.claude/`, `~/.claude/`).

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
astp install rdpi --platform vscode --target project
astp install fozy-labs --platform claude-code --target project
```

## Commands

| Command | Description |
|---------|-------------|
| `astp` | Launch interactive wizard |
| `astp install [bundle]` | Install a bundle to the selected target |
| `astp update [--force]` | Update installed files to latest versions |
| `astp check` | Check for available updates |

All commands accept `--platform <vscode|claude-code>` and `--target <project|user>` to skip interactive prompts. Resolved roots:

| Platform | `--target project` | `--target user` |
|----------|--------------------|-----------------|
| `vscode` | `<cwd>/.github/` | `~/.copilot/` |
| `claude-code` | `<cwd>/.claude/` | `~/.claude/` |

### install

```bash
astp install [bundle] [--platform <vscode|claude-code>] [--target <project|user>]
```

Install template bundles. Without arguments, prompts for platform, target directory, and bundle selection. With `--platform` and `--target`, runs non-interactively. Bundles that don't support the requested platform are rejected with a clear error.

### update

```bash
astp update [--force] [--platform <vscode|claude-code>] [--target <project|user>]
```

Update installed files to the latest version from the manifest. Modified files are skipped by default — use `--force` to overwrite them.

### check

```bash
astp check [--platform <vscode|claude-code>] [--target <project|user>]
```

Compare installed file versions against the remote manifest and display a status report.

## Bundles

| Bundle | Files | Description | Platforms | Default |
|--------|-------|-------------|-----------|---------|
| `base` | 1 | Base skill for VSCode Copilot agent orchestration | `vscode` | Yes |
| `rdpi` | 22 | Full RDPI pipeline — agents, instructions, and stage definitions | `vscode` | No |
| `fozy-labs` | 14 | Fozy Labs stack skills (DI, FSD, rx-api, signals) | `vscode`, `claude-code` | No |

- **base** includes the orchestration skill (`skills/orchestrate/SKILL.md`) that enables multi-agent coordination.
- **rdpi** includes 17 specialized agents, 1 instruction file, and 4 stage definitions for the Research → Design → Plan → Implement workflow.
- **fozy-labs** ships four skills covering the `@fozy-labs` stack — `simplest-di`, Feature-Sliced Design v2.1, `rx-toolkit` server state, and `rx-toolkit` signals. The `di` and `fsd` skills use progressive disclosure: a short `SKILL.md` plus `references/*.md` loaded only when the situation calls for them. It installs identically under `.github/skills/` for VS Code Copilot or under `.claude/skills/` for Claude Code.

## CI/CD

For CI environments or scripted usage, pass `--platform` and `--target` to avoid interactive prompts:

```bash
# Install in CI (VS Code Copilot)
astp install rdpi --platform vscode --target project

# Install Fozy Labs skills for Claude Code
astp install fozy-labs --platform claude-code --target project

# Check for updates
astp check --platform vscode --target project

# Force-update all files
astp update --force --platform claude-code --target project
```

If you encounter GitHub API rate limits, set the `GIGET_AUTH` environment variable with a personal access token:

```bash
export GIGET_AUTH=ghp_your_token_here
astp install rdpi --platform vscode --target project
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
