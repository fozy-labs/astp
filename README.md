# astp

CLI tool for managing MDA files (skills, agents, instructions, stage definitions) used by AI coding agents. Installs them for **Claude Code** (`.claude/`, `~/.claude/`).

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
astp install fozy-labs --target project
```

## Commands

| Command | Description |
|---------|-------------|
| `astp` | Launch interactive wizard |
| `astp install [bundle] [--force]` | Install a bundle to the selected target |
| `astp update [--force]` | Update installed files to latest versions |
| `astp check` | Check for updates and bundles out of sync with the manifest |
| `astp delete [bundle] [--force]` | Remove an installed bundle |

All commands accept `--platform <claude-code>` and `--target <project|user>` to skip interactive prompts. Resolved roots:

| Platform | `--target project` | `--target user` |
|----------|--------------------|-----------------|
| `claude-code` | `<cwd>/.claude/` | `$CLAUDE_CONFIG_DIR`, else `~/.claude/` |

### install

```bash
astp install [bundle] [--force] [--platform <claude-code>] [--target <project|user>]
```

Install template bundles. Locally modified or unmanaged files and skills are skipped by default; use `--force` to overwrite them. Without arguments, prompts for target directory and bundle selection (the platform prompt is skipped while only one platform is supported). With `--platform` and `--target`, runs non-interactively. Bundles that don't support the requested platform are rejected with a clear error.

### update

```bash
astp update [--force] [--platform <claude-code>] [--target <project|user>]
```

Update installed units to the latest version from the manifest. Units dropped upstream are removed; modified or legacy units are kept unless `--force` is passed.

### check

```bash
astp check [--platform <claude-code>] [--target <project|user>]
```

Compare installed versions and unit state against the remote manifest. Out-of-sync bundles are reported and brought back in sync by `astp update`.

### delete

```bash
astp delete [bundle] [--force] [--platform <claude-code>] [--target <project|user>]
```

Remove the files of an installed bundle. Without a bundle name, prompts to pick from the bundles found in the target. Modified files are kept by default — use `--force` to delete them too.

## Bundles

| Bundle | Files | Description | Default |
|--------|-------|-------------|---------|
| `fozy-labs` | 34 | Fozy Labs stack skills (DI, FSD, rx-api, signals) | No |
| `docs` | 6 | Markdown, Mermaid and Mermaid-authored statechart rules for agent-written documents and schemas | No |
| `design` | 13 | Design decision derivation — gated procedure for interface, layout, and visual design choices | No |

- **fozy-labs** ships four skills covering the `@fozy-labs` stack — `simplest-di`, Feature-Sliced Design v2.1, `rx-toolkit` server state, and `rx-toolkit` signals. All four use progressive disclosure: a short `SKILL.md` plus `references/*.md` loaded only when the situation calls for them. It installs under `.claude/skills/`.
- **design** ships `design-derivation` — a gated procedure for deriving visual and interface decisions (frame, value, scenario → charge and sign → surface and accuracy) instead of picking a remembered look. It carries no styles, palettes, or component recipes; references are loaded on demand per gate.
- **docs** ships two skills. `markdown-craft` carries stack-agnostic rules for the Markdown an agent writes: one home per fact, one reader per document, diagram-first flows, and link hygiene, with references loaded on demand for Mermaid diagrams and for writing or reviewing a specification. `statechart-craft` covers the other kind of Mermaid an agent writes — a `.mmd` statechart schema: the `stateDiagram-v2` subset, the `%% @…` directives, the `statechart-convert` CLI and the typed file it emits, with references for the live visualizer and for the `toMermaid()` round trip.

## Installing skills with `npx skills`

The `design`, `docs` and `fozy-labs` bundles are also published for the [`skills` CLI](https://github.com/vercel-labs/skills), which installs Agent Skills into Claude Code, Cursor, Copilot and other agents:

```bash
npx skills add fozy-labs/astp                          # choose interactively
npx skills add fozy-labs/astp --list                   # preview what is available
npx skills add fozy-labs/astp --skill markdown-craft   # install one skill
```

Discovery is driven by `.claude-plugin/marketplace.json`, generated from `templates/manifest.json`. Only bundles that support `claude-code` **and** ship skills are published — all three current bundles qualify.

> **Pick one installer per project.** `npx skills` symlinks skills from its own cache and tracks them in `skills-lock.json`; `astp` writes real files and tracks them through `astp-*` frontmatter. Neither sees the other's installs: `astp check`, `astp update` and `astp delete` ignore skills added by `npx skills`, and installing the same skill both ways leaves a file and a symlink fighting over one path.


## CI/CD

For CI environments or scripted usage, pass `--platform` and `--target` to avoid interactive prompts:

```bash
# Install Fozy Labs skills
astp install fozy-labs --platform claude-code --target project

# Check for updates
astp check --platform claude-code --target project

# Force-update all files
astp update --force --platform claude-code --target project
```

If you encounter GitHub API rate limits, set the `GIGET_AUTH` environment variable with a personal access token:

```bash
export GIGET_AUTH=ghp_your_token_here
astp install fozy-labs --platform claude-code --target project
```

## How it works

`astp` fetches template files from the [`fozy-labs/astp`](https://github.com/fozy-labs/astp) GitHub repository using [giget](https://github.com/unjs/giget). A `manifest.json` file in the repository defines available bundles, their versions, and file mappings.

Agent and instruction files receive `astp-*` frontmatter. Skills store it only in the root `SKILL.md`, whose `astp-hash` covers every regular file in the skill directory. Legacy installs are reported by `astp check`; run `astp update --force` to migrate them.

```yaml
---
astp-source: fozy-labs/astp
astp-bundle: fozy-labs
astp-version: 1.0.0
astp-hash: <sha256>
---
```

These fields enable version tracking, update detection, and local modification detection without requiring a separate lock file.

## Maintaining

### Regenerating the skills marketplace

`.claude-plugin/marketplace.json` is generated — never edit it by hand:

```bash
npm run generate:skills        # rewrite it from templates/manifest.json
npm run generate:skills:check  # fail if the committed file is stale
```

Run it after any change to the skill entries of `templates/manifest.json`. The generator refuses to write when the manifest and `templates/` disagree — a skill listed without its `SKILL.md`, a `source` that does not mirror its `target`, a `SKILL.md` whose frontmatter `name` differs from its directory, or one skill name claimed by two bundles (the `skills` CLI keeps a single flat namespace and would silently drop the duplicate). Skill directories on disk that the manifest never mentions are reported as warnings.

`npm run check:all` includes the staleness check, and `tests/scripts/skills-marketplace.test.ts` fails if the committed file drifts from the manifest. The script runs on Node's TypeScript type stripping and needs Node >= 22.6.
