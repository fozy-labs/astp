---
name: release
description: Run the project's own release process — prepare and publish versions, changelogs, tags, host releases and package artifacts.
disable-model-invocation: true
argument-hint: "<release request>"
---

<astp-block name="process" description="Project-specific release process" use-when="The repository has a defined process for preparing and publishing releases" required>
# Release

Request: $ARGUMENTS

<FILL_INSTRUCTION>
Replace this instruction with either an exact step-by-step **procedure** for releasing this project or a **checklist** of what the agent must consider. Inspect the environment before asking questions. If agent-oriented tooling already defines a release cycle, ask the user what role this skill should play. Then offer the user the choice between **procedure** and **checklist**.

For a **procedure**, ask about every decision and command the project does not record. If the user cannot answer or their answer conflicts with project or accepted standards, offer to switch to a checklist or derive a procedure from one. Consider:
- release targets and their versioning, including independently published artifacts;
- preparation: branches and PRs/MRs, checks, build, changelog and files whose versions change;
- publication order: merges, commits, tags, Git-host releases and package registries;
- required approvals, protected-branch rules and the boundary between preparation and publication;
- verification of each published artifact and recovery from a partial publication without repeating completed steps.

For a **checklist**, record what the agent must consider during a release. For each item, ask the user, or explicitly accept or reject it when the answer is obvious. Cover:
- the version bump: major, minor, patch, release candidate or another project scheme;
- creating a `release/<version>` branch;
- creating a tag;
- updating `CHANGELOG.md` or other project files;
- publishing a release in the tracker, such as a GitHub Release;
- creating release PRs/MRs;
- external actions such as tracker comments, setting fields or moving a task on a Kanban board;
- how changes reach the `main` branch;
- manual and semi-automated checks, including review;
- who performs each step — the user, an automated system or one or more agents — with the necessary commands for user-performed steps;
- the sequence of all selected steps.

A checklist is a good default when no established process exists. Respect an existing repository or company pipeline; do not confuse its presence with a user who needs help designing one.
</FILL_INSTRUCTION>
</astp-block>
