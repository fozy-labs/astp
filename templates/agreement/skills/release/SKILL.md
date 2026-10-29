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
Replace this instruction with the project's exact release procedure by inspecting the repository. Ask the user about decisions and commands the project does not record. The result must be an executable sequence, not a generic checklist. Define only what this project actually uses:
- the release targets and their versioning, including artifacts published independently;
- preparation: branches and PRs/MRs, checks, build, changelog and files whose versions change;
- publication order: merges, commits, tags, Git-host releases and package registries;
- required approvals, protected-branch rules and the boundary between preparation and publication;
- verification of each published artifact and recovery from a partial publication without repeating completed steps.
Do not invent release targets or registries the project does not use.
</FILL_INSTRUCTION>
</astp-block>
