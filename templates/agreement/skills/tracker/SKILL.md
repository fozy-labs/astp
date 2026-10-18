---
name: tracker
description: Working with a Git host (GitHub, GitLab and others) — issues, PRs/MRs, comments, labels and reviews. Use before any command that creates or changes something in the tracker.
---

<astp-block name="posting" description="Safety rules for posting to the issue tracker" required>
# Tracker

## Posting

- Anything posted to the tracker is visible to others and hard to take back: post only on a clear command from the user, and show the text first unless the user already approved it.
- Name the repository explicitly in every write command; do not rely on the current directory.
- Pass any multi-line body through a file, never inline: the shell needs extra escaping and the command line has a length cap.
- Before opening an issue or a PR/MR, search for an existing one and update it instead of opening a duplicate.
</astp-block>

<astp-block name="project" description="Tracker CLI, repository, default branch, merge strategy and CI">
## Project settings

<FILL_INSTRUCTION>
Describe what an agent cannot infer safely:
- the project's tracker, the CLI for it (e.g. `gh`, `glab` or a bot wrapper) and the account that posts; commands for the common actions: find issues and PRs/MRs, create them with a body from a file, list and set labels, types and fields; a fallback when the tool is missing;
- the default branch and the merge strategy (e.g. squash with the PR/MR title and body as the commit message verbatim — then filling them from commits, like `gh pr create --fill`, is wrong);
- whether CI exists or checks run locally, and plan limits such as refused branch protection.
</FILL_INSTRUCTION>
</astp-block>

<astp-block name="methodology" description="Project methodology for issues and PRs/MRs">
## Methodology

<FILL_INSTRUCTION>
Describe the project methodology to follow for issues and PRs/MRs. A version without a specific methodology is fine, e.g.: "Issues and PRs/MRs follow the project methodology. If none is set, ask the user, proposing an agile option."
</FILL_INSTRUCTION>
</astp-block>

<astp-block name="metadata" description="Setting labels, types and fields on new issues and PRs/MRs">
## Labels, types and fields

On every issue and PR/MR you open, set the labels, type and fields (e.g. priority, project status, milestone) the tracker supports for it — agents tend to skip types and fields. Use only existing values; if none fits, ask the user rather than creating one.
</astp-block>

<astp-block name="pull_requests" description="Rules for opening and formatting PRs/MRs">
## PRs/MRs

<FILL_INSTRUCTION>
Ask the user for the project's rules on opening PRs/MRs (for agents). The default rules:
```
- Open a PR/MR as a draft; mark it ready only after the project's checks and review gate pass.
- The title follows the repository's commit subject format.
- Write the body with the PR-body skill if one is installed; otherwise follow the repository's PR/MR template.
- Link the issue the PR/MR resolves with the tracker's closing keyword (`Closes #12`).
```
</FILL_INSTRUCTION>
</astp-block>
