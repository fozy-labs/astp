---
name: git
description: Git work on the user's command — commit, push, switch to an up-to-date branch, do a task in an isolated worktree, guard against destructive git commands, or any other git task in free text.
disable-model-invocation: true
argument-hint: "commit | push | develop <branch> | isolation <task> [ide] | guard | <free text>  [--fast] [--one]"
allowed-tools: Bash(git status *) Bash(git worktree list *) PowerShell(git status *) PowerShell(git worktree list *)
---

<astp-block name="commands" required>
# Git

Request: $ARGUMENTS

Repository state when the command started:

- Status: !`git status --short --branch`
- Worktrees: !`git worktree list`

If a line above shows a command instead of its output, run that command yourself.

## Route

Pick the command the request names; for free text, pick the command it means, or treat it as an ad-hoc git task under [Safety](#safety). State the pick and the plan in one line, then act.

| Command                           | Does                                                                                                                         |
|-----------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `commit [--fast] [--one]`         | [Commit](#commit) all uncommitted changes                                                                                    |
| `push [--fast] [--one]`           | [Commit](#commit) if the tree is dirty, then [push](#push)                                                                  |
| `develop <branch>`                | [Switch](#develop) to the branch and fast-forward it to origin                                                               |
| `isolation <task> [ide]`          | Do the task in a separate worktree, finish with a PR or a merge — load [references/isolation.md](references/isolation.md)    |
| `isolation cleanup [task]`        | Remove finished isolation worktrees — same reference                                                                         |
| `guard`                           | Make destructive git commands need the user's approval — load [references/guard.md](references/guard.md)                     |

## Before any command

- Detached HEAD, a merge, rebase, cherry-pick or bisect in progress, or a repository other than the one the user works in: stop and report.
- Project facts come from the project, not from defaults: commit format from `CLAUDE.md` and rules, commitlint config, `CONTRIBUTING`, then `git log`; the default branch, merge strategy and host CLI from the tracker skill, else `git symbolic-ref refs/remotes/origin/HEAD`; the Project overrides section below, when present, wins.

## Safety

Never without the user's explicit approval in this conversation:

- push to the default branch, or force in any form — and force only as `--force-with-lease`, only when the user wrote "force";
- `reset --hard`, `clean`, `checkout -- <path>`, `restore` of the working tree, `stash drop` / `clear` — anything that discards uncommitted work;
- delete a branch that is not merged — a branch whose PR the tracker shows merged counts as merged;
- rewrite commits that are already pushed (amend, rebase, squash);
- `--no-verify`.

Always:

- Stage named paths only — never `git add -A`, `git add .` or `commit -a`.
- Never run what opens an editor or a pager: no `rebase -i`, no `add -p`, no `commit` without a message; use `git --no-pager` or `GIT_PAGER=cat` for output and `GIT_EDITOR=true` where git may ask for a message.
- Pass a multi-line commit message with `-F <file>`, the file outside the working tree (e.g. `git rev-parse --git-path ASTP_MSG`).
- A failing hook: show its output; fix the cause if it is in the changes being committed, re-stage and commit again. Files a hook reformatted get re-staged.
- PRs, issues and anything else on the Git host go through the tracker skill.

## Commit

1. Read `git status` and the diff. Files that look like secrets (`.env`, keys, credentials) are never staged: stop and ask.
2. Group the changes into logical commits by file — a file mixing concerns stays in one commit, and the plan says so. `--one`: a single commit.
3. Show the plan — per commit the subject and files — and wait for approval when it has more than one commit or touches files you did not edit in this session. `--fast` skips the wait.
4. Per commit: `git add -- <paths>`, then commit with the message in the project's format.

## Push

- Upstream set: `git push`. No upstream: `git push -u origin <branch>`.
- Rejected as non-fast-forward: stop, report how far the branch and its upstream diverged, and offer a rebase onto the upstream; never force on your own.

## Develop

1. `git fetch origin`.
2. Switch: `git switch <branch>` — it creates a tracking branch from `origin/<branch>` when only that exists. Neither exists: report and offer to create it from the updated default branch.
3. Uncommitted changes that block the switch: stay on the current branch, list the files, and offer `git stash push -u -m "<current> before develop <branch>"`; after the stash, switch.
4. Fast-forward: `git merge --ff-only @{upstream}`. Diverged: stop and report the ahead / behind counts.

## Report

End with what changed — branch, commits (short hash and subject), pushes — and what was left: stash entries, skipped files, worktrees kept.
</astp-block>

<astp-block name="project_overrides" optional>
## Project overrides

<FILL_INSTRUCTION>
Fill only what differs from the defaults above and in references/isolation.md, then delete the rest of this instruction:
- branch naming (e.g. `feat/<task>`);
- the install command for a fresh worktree;
- the worktree root instead of `../.tmp/<repo>/`;
- gitignored files to copy into a worktree when the repo has no `.worktreeinclude`;
- extra actions that need the user's approval.
</FILL_INSTRUCTION>
</astp-block>
