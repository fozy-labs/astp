---
name: astp
description: >-
  Install, update, check and delete Claude Code skills, agents and rules with the astp CLI
  (@fozy-labs/astp). Use when the user asks to add, update, list or remove astp bundles or
  skills, when `astp.lock` is involved, or when a file contains a <SETUP_REQUIRED> block.
---

# astp

Written for astp 0.4. Run `astp --help` and `astp <command> --help` for details and for flags of other versions.

Run `astp` if it is on PATH, otherwise `npx -y @fozy-labs/astp`.

## Commands

Without a terminal the CLI cannot prompt, so always pass `--target project` (`./.claude/`) or `--target user` (`~/.claude/`), and give `install` a bundle name. Ask the user which target when it is not clear.

| Goal | Command |
|------|---------|
| See bundles | `astp list --target project --json` |
| See units and blocks of a bundle | `astp list <bundle> --target project --json` |
| Install a whole bundle | `astp install <bundle> --target project` |
| Add units or blocks | `astp install <bundle> --skill <name> --block <name> --target project` |
| Check, then update | `astp check --target project`, then `astp update --target project` |
| Remove | `astp delete <bundle> [--skill <name>] --target project` |

- `install <bundle>` without `--skill` or `--block` installs every unit and clears what the user declined earlier; to add something, pass `--skill` or `--block`.
- Commit `astp.lock` with the installed files; never edit it by hand.

## Ask before `--force`

astp skips files the user changed and files it does not own. When the output reports skipped or kept files, tell the user which ones and run `--force` only with their OK: it overwrites or deletes them.

## Filling blocks

A file that starts with `<SETUP_REQUIRED>` needs filling: replace each `<FILL_INSTRUCTION>…</FILL_INSTRUCTION>` with the content it asks for, taken from the real project, then remove the `<SETUP_REQUIRED>` block. Keep the surrounding `<block_name>…</block_name>` tags: astp tracks blocks by them.

After `update`, a `<FILL_INSTRUCTION>` can hold the new template of a block the user changed: merge it into the block, keep the project-specific content, then remove the instruction.
