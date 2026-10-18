# astp

CLI tool for managing skills, agents and rules used by AI coding agents. Installs them for **Claude Code** (`.claude/`, `~/.claude/`).

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
| `astp install [bundle] [--source <spec>] [--skill <name>] [--block <name>] [--force]` | Install a bundle or selected units to the selected target |
| `astp update [--force]` | Update installed files to latest versions |
| `astp check` | Check for updates and bundles out of sync with the manifest |
| `astp delete [bundle] [--skill <name>] [--force]` | Remove an installed bundle or selected units |
| `astp list [bundle] [--source <spec>] [--json]` | List available and installed bundles or bundle units |

All commands accept `--platform <claude-code>` and `--target <project|user>`, which skip the platform and target prompts; in a terminal the other prompts of each command still run. Resolved roots:

| Platform | `--target project` | `--target user` |
|----------|--------------------|-----------------|
| `claude-code` | `<cwd>/.claude/` | `$CLAUDE_CONFIG_DIR`, else `~/.claude/` |

### Sources

By default bundles come from `gh:fozy-labs/astp` (`templates/manifest.json` on `main`). `--source <spec>` reads another manifest; `astp.lock` records each bundle's source, and `update` and `check` use it. A bundle switches source only when `--source` is passed again.

| `--source` | Reads |
|------------|-------|
| `./x.json`, `./dir` | a local manifest, or `<dir>/templates/manifest.json`; bundle `B` from `B/` next to the manifest |
| `owner/repo[/path][#ref]`, `gh:` `gitlab:` `bitbucket:` `sourcehut:` + the same | a git repo at a branch, tag or commit; no ref means the default branch; a bare `owner/repo` that is also a local path is rejected: write `./owner/repo` or `gh:owner/repo` |
| `https://github.com/owner/repo[/tree/<ref>/<dir> \| /blob/<ref>/<file>.json]` | the same, from a GitHub URL |
| `npm:<name>[@<version or tag>]` | `templates/manifest.json` in an npm package |
| `https://…/x.json` | a hosted manifest; each file is fetched next to it |
| `https://…` | a tarball |

Plain `http://` is accepted only for `localhost`. `GIGET_AUTH` is sent only to GitHub.

### install

```bash
astp install [bundle] [--source <spec>] [--skill <name>]... [--block <name>]... [--force] [--platform <claude-code>] [--target <project|user>]
```

Install template bundles. Locally modified or unmanaged files and skills are skipped by default (unmanaged ones are recorded as declined); use `--force` to overwrite them. Repeat `--skill` to add units by name or path, and `--block` to add blocks by name or by the `key` from `list --json`, installing the block's unit if needed; both keep the declined units and blocks, and scope `--force` to the named units and blocks. Without them, a non-interactive `install <bundle>` installs every unit, clears declined units, and re-selects every non-optional block. In a terminal, `install` asks to confirm; without `--skill` or `--block` it first opens a tree of bundles, units and blocks, listing every bundle when no name is given. Bundles that don't support the requested platform are rejected with a clear error.

### update

```bash
astp update [--force] [--platform <claude-code>] [--target <project|user>]
```

Update installed units to the latest version from each bundle's source in `astp.lock`. A non-interactive update also installs new units and keeps declined ones. Units and blocks dropped upstream are removed; modified ones are left in place and no longer tracked in `astp.lock`, unless `--force` is passed. Modified legacy units are kept unless `--force` is passed. In a terminal, it first asks which new units and blocks to install.

### check

```bash
astp check [--platform <claude-code>] [--target <project|user>]
```

Compare installed versions and unit state against each bundle's source in `astp.lock`. Out-of-sync bundles are reported and brought back in sync by `astp update`. Units changed locally are listed below the table; `astp update` keeps them.

### delete

```bash
astp delete [bundle] [--skill <name>]... [--force] [--platform <claude-code>] [--target <project|user>]
```

Remove the files of an installed bundle. Repeat `--skill` to select units by name or path. Without a bundle name, prompts to pick from the bundles found in the target. In a terminal, it asks to confirm. Modified files are kept by default — use `--force` to delete them too.

### list

```bash
astp list [bundle] [--source <spec>] [--json] [--platform <claude-code>] [--target <project|user>]
```

List bundles and installed unit state. Add a bundle name for per-unit status and descriptions, with each unit's blocks and their status; `--json` prints machine-readable output; units with blocks list each block's `name`, `key`, `status` (`selected`, `declined`, or `new`), `optional`, and `required`.

## Bundles

| Bundle | Contents | Description | Default |
|--------|----------|-------------|---------|
| `astp` | 1 skill | astp CLI skill — install, update and fill astp bundles from an agent | No |
| `fozy-labs` | 4 skills | Fozy Labs stack skills (DI, FSD, rx-api, signals) | No |
| `docs` | 2 skills | Markdown, Mermaid and Mermaid-authored statechart rules for agent-written documents and schemas | No |
| `design` | 1 skill | Design decision derivation — gated procedure for interface, layout, and visual design choices | No |
| `ponytail` | 4 skills | Ponytail skills — smallest complete changes, change reviews, repository audits and a shortcut debt ledger | No |
| `agreement` | 1 rule, 4 skills | Working agreement rule, communication and tracker skills and /retro and /git commands — how the agent decides, asks, scopes changes, writes for the user, works with the issue tracker and git, and reviews finished work | No |

- **astp** ships the `astp` skill: how an agent runs the CLI without prompts, when to ask before `--force`, and how to fill `<SETUP_REQUIRED>` blocks.
- **fozy-labs** ships four skills covering the `@fozy-labs` stack — `simplest-di`, Feature-Sliced Design v2.1, `rx-toolkit` server state, and `rx-toolkit` signals. All four use progressive disclosure: a short `SKILL.md` plus `references/*.md` loaded only when the situation calls for them. It installs under `.claude/skills/`.
- **design** ships `design-derivation` — a gated procedure for deriving visual and interface decisions (frame, value, scenario → charge and sign → surface and accuracy) instead of picking a remembered look. It carries no styles, palettes, or component recipes; references are loaded on demand per gate.
- **docs** ships two skills. `markdown-craft` carries stack-agnostic rules for the Markdown an agent writes: one home per fact, one reader per document, diagram-first flows, and link hygiene, with references loaded on demand for Mermaid diagrams and for writing or reviewing a specification. `statechart-craft` covers the other kind of Mermaid an agent writes — a `.mmd` statechart schema: the `stateDiagram-v2` subset, the `%% @…` directives, the `statechart-convert` CLI and the typed file it emits, with references for the live visualizer and for the `toMermaid()` round trip.
- **ponytail** ships four [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) skills with their MIT license and pinned-source attribution to DietrichGebert: the smallest-complete-change mode, change review, whole-repository audit and a ledger for deliberate shortcuts.
- **agreement** ships the `working-agreement` rule, always loaded from `.claude/rules/`: how the agent fixes, ranks decisions, reads the user's messages and writes for the user; every section after the principles is a block you can deselect. Its `communication` skill, which the agent loads whenever it talks to the user, covers working out a request, asking questions, making offers and resolving dilemmas. The `tracker` skill covers posting to a Git host (GitHub, GitLab and others) — issues, PRs/MRs, labels, types and fields; its project settings, methodology and PR rules are blocks the consumer's agent fills in on install. The `/retro` command, run only by the user, reviews finished work and proposes changes to the agent's environment: `CLAUDE.md`, rules, skills, docs, checks and tools. The `/git` command, also user-only, commits, pushes, switches to an up-to-date branch, runs a task in a separate worktree, and installs approval prompts for destructive git commands; project overrides are an optional block.

## Installing skills with `npx skills`

The `agreement`, `astp`, `design`, `docs`, `fozy-labs` and `ponytail` bundles are also published for the [`skills` CLI](https://github.com/vercel-labs/skills), which installs Agent Skills into Claude Code, Cursor, Copilot and other agents:

```bash
npx skills add fozy-labs/astp                          # choose interactively
npx skills add fozy-labs/astp --list                   # preview what is available
npx skills add fozy-labs/astp --skill markdown-craft   # install one skill
```

Discovery is driven by `.claude-plugin/marketplace.json`, generated from `templates/manifest.json`. Only bundles that support `claude-code` **and** ship skills are published, and only their skills: `npx skills` installs the `communication` and `retro` skills of `agreement` without the `working-agreement` rule — the `tracker` and `git` skills carry astp blocks, so they are astp-only.

> **Pick one installer per project.** `npx skills` symlinks skills from its own cache and tracks them in `skills-lock.json`; `astp` writes real files and tracks them in `astp.lock`. Neither sees the other's installs: `astp check`, `astp update` and `astp delete` ignore skills added by `npx skills`, and installing the same skill both ways leaves a file and a symlink fighting over one path.


## CI/CD

Without a terminal astp never prompts: a missing `--target`, or a missing bundle name for `install` and `delete`, exits with code 1 and an error. Pass `--platform` and `--target` in CI and scripts.

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

`astp` fetches template files from the [`fozy-labs/astp`](https://github.com/fozy-labs/astp) GitHub repository using [giget](https://github.com/unjs/giget). A `manifest.json` file in the repository defines available bundles, their versions, and file mappings. Install state lives in `astp.lock`; commit it in projects. Installed files without blocks are byte-identical to their templates.

### Upgrading from 0.3.x

- Install state moved from `astp-*` frontmatter fields to `astp.lock`: `astp update` migrates unmodified units, and `astp update --force` replaces modified ones.
- The VS Code platform (`--platform vscode`) and the `base` and `rdpi` bundles are gone. astp no longer reads or changes `.github/` and `~/.copilot/` installs; remove those files by hand if you no longer need them.

## Maintaining

### Regenerating the skills marketplace

`.claude-plugin/marketplace.json` is generated — never edit it by hand:

```bash
npm run generate:skills        # rewrite it from templates/manifest.json
npm run generate:skills:check  # fail if the committed file is stale
```

Run it after any change to the skill entries of `templates/manifest.json`. The generator refuses to write when the manifest and `templates/` disagree — a skill listed without its `SKILL.md`, a `source` that does not mirror its `target`, a `SKILL.md` whose frontmatter `name` differs from its directory, or one skill name claimed by two bundles (the `skills` CLI keeps a single flat namespace and would silently drop the duplicate). Skill directories on disk that the manifest never mentions are reported as warnings.

`npm run check:all` includes the staleness check, and `tests/scripts/skills-marketplace.test.ts` fails if the committed file drifts from the manifest. The script runs on Node's TypeScript type stripping and needs Node >= 22.6.
