---
name: tracker
description: Working with a Git host (GitHub, GitLab and others) — issues, PRs/MRs, comments, labels and reviews. Use before any command that creates or changes something in the tracker.
---

<astp-block name="posting" description="Safety rules for posting to the issue tracker" use-when="The agent interacts with a shared issue tracker" required>
# Tracker

## Posting

- Anything posted to the tracker is visible to others and hard to take back: unless a rule below allows posting directly, post only on a clear command from the user and show the text first unless the user already approved it.
- Name the repository explicitly in every write command; do not rely on the current directory.
- Pass any multi-line body through a file, never inline: the shell needs extra escaping and the command line has a length cap.
- Before opening an issue or a PR/MR, search for an existing one and update it instead of opening a duplicate.
</astp-block>

<astp-block name="project" description="Tracker CLI, repository, default branch, merge strategy and CI" use-when="The repository uses an issue tracker and needs project-specific CLI, branch and CI settings">
## Project settings

<FILL_INSTRUCTION>
Describe what an agent cannot infer safely:
- the project's tracker, the CLI for it (e.g. `gh`, `glab` or a bot wrapper) and the account that posts; commands for the common actions: find issues and PRs/MRs, create them with a body from a file, reply to a review thread, list and set labels, types and fields; a fallback when the tool is missing;
- the default branch and the merge strategy (e.g. squash with the PR/MR title and body as the commit message verbatim — then filling them from commits, like `gh pr create --fill`, is wrong);
- whether CI exists or checks run locally, and plan limits such as refused branch protection.
</FILL_INSTRUCTION>
</astp-block>

<astp-block name="methodology" description="Project methodology for issues and PRs/MRs" use-when="Issues and PRs/MRs in the project follow a specific workflow or agile methodology">
## Methodology

<FILL_INSTRUCTION>
Describe the project methodology to follow for issues and PRs/MRs. A version without a specific methodology is fine, e.g.: "Issues and PRs/MRs follow the project methodology. If none is set, ask the user, proposing an agile option."
</FILL_INSTRUCTION>
</astp-block>

<astp-block name="metadata" description="Setting labels, types and fields on new issues and PRs/MRs" use-when="Issues and PRs/MRs in the tracker use labels, types or custom fields">
## Labels, types and fields

On every issue and PR/MR you open, set the labels, type and fields (e.g. priority, project status, milestone) the tracker supports for it — agents tend to skip types and fields. Use only existing values; if none fits, ask the user rather than creating one.
</astp-block>

<astp-block name="pull_requests" description="Rules for opening, reviewing and formatting PRs/MRs" use-when="The agent opens or updates pull/merge requests in the repository">
## PRs/MRs

<FILL_INSTRUCTION>
Ask the user for the project's rules on PRs/MRs (for agents), including:
- whether the agent waits for checks and review to pass before marking a draft ready (only worth waiting when review is automated and the agent has enough autonomy to act on it; with manual review or "always ask" autonomy, stop after opening or pushing);
- how the agent answers review threads and where the repository sits on the autonomy gradient: reply freely, reply with the fix commit hash directly but ask before declining or arguing a finding, or always show the text first.
The default rules:
```
- Open a PR/MR as a draft; mark it ready only after the project's checks and automated review pass and every review thread is answered.
- Answer every review thread: after a fix is pushed, reply with the commit hash directly; before declining or arguing a finding, get the user's approval.
- The title follows the repository's commit subject format.
- Write the body with the PR-body skill if one is installed; otherwise follow the repository's PR/MR template.
- Link the issue the PR/MR resolves with the tracker's closing keyword (`Closes #12`).
```
</FILL_INSTRUCTION>
</astp-block>
