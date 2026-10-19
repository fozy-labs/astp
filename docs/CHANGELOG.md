# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-10-19

### Added

- [`description` attribute](../templates/README.md#blocks) on `<astp-block>` tags, shown in block selection prompts and `astp list`.
- [`optional` and `labels`](../templates/README.md#templateitem-fields) on bundle units and [`labels` attribute](../templates/README.md#blocks) on `<astp-block>` tags: optional units start unchecked on `install` and `update`, and labels show in selection prompts and `astp list`.
- [`use-when`](../templates/README.md#bundle-fields) on bundles and [`use-when` attribute](../templates/README.md#blocks) on `<astp-block>` tags, shown in `astp list` and omitted from interactive prompts.
- [`schemaVersion`](../templates/README.md#top-level-fields) `"major.minor"` manifest versions: a newer minor version warns and suggests `npm install -g @fozy-labs/astp`, and an unsupported major version fails with the same update command.

## [0.4.0] - 2026-10-12

Upgrading from 0.3.x: [migration steps](../README.md#upgrading-from-03x).

### Added

- Selective install: pick bundles, skills, agents, rules and their `<astp-block>` blocks in one
  tree prompt, or with `install --skill` / `--block` and `delete --skill`.
- `astp list`, with `--json` for scripts.
- `--source` reads bundles from another manifest; `astp.lock` keeps each bundle's source for
  `update` and `check`.
- `astp --help` describes every command and flag.
- The `astp` bundle (a skill for running the CLI from an agent) and the `agreement` bundle (a
  working-agreement rule).

### Changed

- **Breaking:** install state moves from `astp-*` frontmatter to `astp.lock` in the install root;
  0.3.x cannot manage migrated installs.
- **Breaking:** a skill is managed as a whole directory, including its references and assets.
- The license is MIT instead of GPL-3.0-or-later, for the CLI and the bundles in `templates/`.

### Removed

- **Breaking:** the VS Code Copilot platform (`--platform vscode`) and its `base` and `rdpi`
  bundles; Claude Code is the only platform.

### Fixed

- `install` overwrote locally modified files and files astp did not install. Now it skips them
  unless `--force`.
- `update` left files dropped from a bundle on disk. Now it removes them; modified ones stay on
  disk, out of `astp.lock`, unless `--force`.
- Without a terminal, a command missing arguments waited for a prompt forever. Now it fails with
  an error naming what to pass.

[Unreleased]: https://github.com/fozy-labs/astp/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/fozy-labs/astp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/fozy-labs/astp/compare/v0.3.1...v0.4.0
