---
name: settup-git
description: Set up a project's Git conventions and persistent agent instructions for commits, branches, worktrees and approvals, with optional runtime guards for destructive commands.
disable-model-invocation: true
license: MIT
metadata:
  adapted-from: "/setup-matt-pocock-skills by Matt Pocock, https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/setup-matt-pocock-skills/SKILL.md"
---

# Set up Git

Establish the project's Git conventions where agents and contributors already look for them. Explore, propose, confirm, then write.

## Explore

Find existing rules and evidence, not only files with well-known names:

- agent instructions, rules and documentation for agents or contributors, including existing Git sections;
- commit-message configuration, hooks, recent history, contribution and release documentation;
- branch, remote, default-branch and integration conventions;
- worktree configuration, dependency manifests and lockfiles, and files a fresh worktree needs;
- runtime permissions and hooks that already guard destructive commands.

Distinguish explicit conventions from observations. A single commit or branch is not a convention. Identify gaps, overlapping instructions and conflicts between written rules and repository evidence.

## Propose

Summarize the findings and recommend defaults. Ask only about decisions the evidence leaves open; change nothing until the user approves the choices and drafts.

Cover the conventions the project needs:

- commit message format, scopes, attribution or signoff, and commit grouping;
- branch naming, base branches and integration strategy;
- isolation base and finish action, worktree root, dependency installation and gitignored files to copy;
- protected branches and approvals beyond the agent's baseline safety rules.

Prefer existing project conventions. Otherwise recommend the smallest explicit rules that fit the repository and explain each proposed default. Do not impose a commit or branching standard from a historical example alone.

Choose each rule's home from the project's existing conventions:

- Keep an existing compatible instruction or documentation file and its format. Update the existing owner of a rule instead of creating a second source of truth.
- Use always-loaded agent instructions for rules every run needs; use agent or contribution documentation for details, with a pointer from the instructions when the project already uses that pattern.
- Do not create parallel `CLAUDE.md` / `AGENTS.md` files or a competing rule system. With no established convention, propose a short `## Git` section in `CLAUDE.md` and let the user confirm it or choose another home.

Show every file to create or edit and the proposed additions. Reconcile overlapping instructions instead of appending contradictory rules.

Offer an optional runtime guard for destructive git commands. If the user selects it, load [references/guard.md](references/guard.md) and include its scope and form in the proposal; otherwise leave runtime settings and hooks unchanged.

## Write

Preserve existing content except the approved changes. Fit the project's language, documentation style and instruction format.

Write the confirmed conventions, including adopted defaults, as direct rules rather than exploration findings or a record of options. Record each project rule once. Do not copy a command's request routing, operational procedures or baseline safety rules into project files.

For worktrees, first offer to create a `.worktreeinclude` at the repository root (`.gitignore` syntax, also read by Claude Code). Keep an existing include mechanism when the project already has one; record a list of gitignored files in instructions only when the user declines an include file. On a repeated setup, update the chosen sections in place without overwriting surrounding content or unrelated settings.

When guard configuration was approved, follow the guard reference and merge with existing runtime configuration.

## Verify

Read the changed files. Check that every pointer resolves, each rule has one authoritative home, and the instructions do not contradict one another. Verify an installed guard as its reference directs. Report the chosen conventions, every file changed, and whether a guard was configured.
