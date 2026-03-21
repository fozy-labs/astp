---
title: "Use Cases: astp CLI"
date: 2026-03-21
stage: 02-design
role: rdpi-architect
workflow: b0.5
---

# Use Cases: astp CLI


## UC-1: First-Time Setup (Interactive Wizard)

### Scenario

A developer has cloned a project from scratch and wants to set up AI agent configuration files. They run `astp` with no arguments. The interactive wizard guides them through bundle selection and install target.

### Terminal Interaction

```
$ astp

  ◆  astp — MDA Manager

  ◇  What would you like to do?
  │  ● Install bundles
  │  ○ Check for updates
  │  ○ Update installed files

  ◇  Install to:
  │  ● Project level (.github/)
  │  ○ User level (~/.copilot/)

  ◇  Select bundles to install:
  │  ◼ base — Base skill for VSCode Copilot agent orchestration (1 file)  [default]
  │  ◼ rdpi — Full RDPI pipeline — agents, instructions, and stage definitions (21 files)

  ◇  Install 2 bundles (22 files) to <project>/.github/?
  │  Yes

  ◐  Downloading base...
  ◐  Downloading rdpi...
  ◑  Installing 22 files...

  ◇  Installed 22 files to .github/
  │
  │  skills/orchestrate/SKILL.md
  │  agents/RDPI-Orchestrator.agent.md
  │  agents/rdpi-approve.agent.md
  │  agents/rdpi-architect.agent.md
  │  ... (18 more)
  │

  ◆  Done!
```

### Internal Module Interaction

```typescript
// cli.ts — default action triggers wizard
import { program } from 'commander';
import { launchWizard } from './ui/wizard.js';

program
  .name('astp')
  .description('MDA file manager for AI coding agents')
  .action(async () => {
    await launchWizard();
  });

await program.parseAsync();
```

```typescript
// ui/wizard.ts — orchestrates the interactive flow
import * as p from '@clack/prompts';
import { executeInstall } from '../commands/install.js';
import { executeUpdate } from '../commands/update.js';
import { executeCheck } from '../commands/check.js';

export async function launchWizard(): Promise<void> {
  p.intro('astp — MDA Manager');

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'install', label: 'Install bundles' },
      { value: 'check', label: 'Check for updates' },
      { value: 'update', label: 'Update installed files' },
    ],
  });

  if (p.isCancel(action)) { p.cancel('Cancelled.'); process.exit(0); }

  switch (action) {
    case 'install': await executeInstall({}); break;
    case 'update':  await executeUpdate({}); break;
    case 'check':   await executeCheck(); break;
  }

  p.outro('Done!');
}
```

```typescript
// commands/install.ts — install flow (called from wizard or CLI)
import { fetchManifest } from '../core/manifest.js';
import { downloadBundle } from '../core/fetcher.js';
import { installFile } from '../core/installer.js';
import { selectTarget, selectBundles, confirmInstall } from '../ui/prompts.js';
import type { InstallTarget, Manifest, Bundle } from '../types/index.js';

interface InstallOptions {
  bundle?: string;
  target?: 'project' | 'user';
}

export async function executeInstall(options: InstallOptions): Promise<void> {
  const target: InstallTarget = options.target
    ? resolveTarget(options.target)
    : await selectTarget();

  const manifest: Manifest = await fetchManifest();

  const selectedBundles: Bundle[] = options.bundle
    ? [resolveBundle(manifest, options.bundle)]
    : await selectBundles(manifest);

  const confirmed = await confirmInstall(selectedBundles, target);
  if (!confirmed) return;

  for (const bundle of selectedBundles) {
    const tempDir = await downloadBundle(manifest.repository, bundle.name);
    for (const item of bundle.items) {
      await installFile(tempDir, item, target, {
        source: manifest.repository,
        bundle: bundle.name,
        version: bundle.version,
      });
    }
  }
}
```

[ref: ./01-architecture.md §3, §4] — Command layer delegates to core layer modules.
[ref: ./02-dataflow.md §2, §3] — Wizard → command → core flow.

### Resulting File Structure

```
<project>/
└── .github/
    ├── agents/
    │   ├── RDPI-Orchestrator.agent.md    ← astp-bundle: rdpi, astp-version: 1.0.0
    │   ├── rdpi-approve.agent.md
    │   ├── rdpi-architect.agent.md
    │   └── ... (13 more agent files)
    ├── skills/
    │   └── orchestrate/
    │       └── SKILL.md                  ← astp-bundle: base, astp-version: 1.0.0
    ├── instructions/
    │   └── thoughts-workflow.instructions.md
    └── rdpi-stages/
        ├── 01-research.md                ← frontmatter block prepended (had none)
        ├── 02-design.md
        ├── 03-plan.md
        └── 04-implement.md
```

Each installed file contains injected `astp-*` frontmatter fields [ref: ./03-model.md §3].

### Error Handling

| Scenario | Behavior |
|----------|----------|
| User presses Ctrl+C during prompts | `p.isCancel()` catches it → `p.cancel('Cancelled.')` → `process.exit(0)` |
| Manifest fetch fails (network error) | Spinner stops → error message with connectivity suggestion → exit code 1 |
| Target directory doesn't exist | FileInstaller creates directories recursively via `fs.mkdir({ recursive: true })` |


---


## UC-2: Install Specific Bundle via CLI

### Scenario

A developer wants to install the `rdpi` bundle to the project level in a CI-friendly, scriptable manner. They pass all options as flags — no interactive prompts.

### Terminal Interaction

```
$ astp install rdpi --target project

  ◐  Fetching manifest...
  ◐  Downloading rdpi...
  ◑  Installing 21 files...

  ✓  Installed rdpi v1.0.0 (21 files) to .github/

```

### Internal Module Interaction

```typescript
// cli.ts — install subcommand with arguments
program
  .command('install')
  .argument('[bundle]', 'Bundle name to install')
  .option('--target <type>', 'Install target: project or user')
  .action(async (bundle: string | undefined, options: { target?: string }) => {
    await executeInstall({
      bundle,
      target: options.target as 'project' | 'user' | undefined,
    });
  });
```

When both `bundle` and `--target` are provided, `executeInstall` skips all prompts [ref: ./01-architecture.md §4 — "All command modules depend on ui/prompts for interactive input when flags are omitted"]. The flow is:

1. `fetchManifest()` → HTTP GET `raw.githubusercontent.com/.../manifest.json` [ref: ./02-dataflow.md §7].
2. `resolveBundle(manifest, 'rdpi')` → validates bundle exists → returns `Bundle` object.
3. `downloadBundle('fozy-labs/astp', 'rdpi')` → giget `gh:fozy-labs/astp/src/templates/rdpi#main` → temp dir [ref: ./02-dataflow.md §8].
4. For each `TemplateItem` in `bundle.items`:
   - `installFile()` reads template content from temp dir.
   - `injectAstpFields()` appends `astp-source`, `astp-bundle`, `astp-version`, `astp-hash` to frontmatter.
   - `writeFile()` writes to `path.join(installRoot, item.target)`.

### Injected Frontmatter Example

An agent file (`rdpi-approve.agent.md`) after install:

```yaml
---
name: rdpi-approve
description: "ONLY for RDPI pipeline."
user-invocable: false
tools: [search, read, edit, web, execute, vscode]
astp-source: fozy-labs/astp
astp-bundle: rdpi
astp-version: 1.0.0
astp-hash: e3b0c44298fc1c149afbf4c8996fb924
---
```

Existing fields preserved, `astp-*` appended at end [ref: ./03-model.md §3.2, ADR-6].

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Unknown bundle name | `resolveBundle()` throws → "Bundle 'foo' not found in manifest. Available: base, rdpi" → exit code 1 |
| Invalid `--target` value | Commander validation → "error: option '--target' must be 'project' or 'user'" |
| File already exists at target path (no astp metadata) | Overwrite — the file is not astp-managed, so no modification detection applies. See [UC-Edge-6](#uc-edge-6-existing-file-without-astp-metadata) |

**Note on base bundle**: When installing via CLI (e.g., `astp install base --target project`), the `default` flag has no effect — the specified bundle is installed unconditionally. The `default` field is only used by the interactive wizard (UC-1) to pre-select the base bundle in the multiselect prompt.


---


## UC-3: Check for Updates

### Scenario

A developer wants to see if newer versions of installed bundles are available, without modifying any files.

### Terminal Interaction

```
$ astp check

  ◇  Check:
  │  ● Project level (.github/)
  │  ○ User level (~/.copilot/)

  ◐  Scanning installed files...
  ◐  Fetching remote manifest...

  Bundle         Installed   Available   Status
  base           1.0.0       1.0.0       ✓ Up to date
  rdpi           1.0.0       1.2.0       ↑ Update available

```

### Internal Module Interaction

```typescript
// commands/check.ts
import { fetchManifest } from '../core/manifest.js';
import { scanInstalled, compareVersions } from '../core/version.js';
import { selectTarget, showCheckReport } from '../ui/prompts.js';

export async function executeCheck(): Promise<void> {
  const target = await selectTarget();

  const installed = await scanInstalled(target.rootDir);
  if (installed.length === 0) {
    p.log.info('No astp-managed files found.');
    return;
  }

  const manifest = await fetchManifest();
  const report = compareVersions(installed, manifest);

  showCheckReport(report);
}
```

```typescript
// core/version.ts — scanning and comparison logic
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractAstpMetadata } from './frontmatter.js';
import type { InstalledBundle, InstalledFile, UpdateReport, Manifest } from '../types/index.js';

export async function scanInstalled(installRoot: string): Promise<InstalledBundle[]> {
  // Recursively find all .md files under installRoot
  // For each file: parse frontmatter, check for astp-source field
  // Group files by astp-bundle value
  // Return InstalledBundle[] with files grouped by bundle
}

export function compareVersions(
  installed: InstalledBundle[],
  manifest: Manifest,
): UpdateReport {
  // For each installed bundle:
  //   - Find matching bundle in manifest by name
  //   - Compare semver: installed.version vs manifest.bundles[name].version
  //   - Classify as upToDate, update available, or notInManifest
  // Return UpdateReport
}
```

The check flow is read-only — only 1 HTTP request (manifest fetch) and local filesystem reads [ref: ./02-dataflow.md §5].

### Error Handling

| Scenario | Behavior |
|----------|----------|
| No astp-managed files found | "No astp-managed files found." → exit code 0 |
| Installed bundle not in remote manifest | Report shows it as "⚠ Not in manifest" — bundle may have been removed upstream |
| Manifest fetch fails | Error message → exit code 1 |


---


## UC-4: Update with Modified Files

### Scenario

A developer has installed the `rdpi` bundle and later edited `rdpi-approve.agent.md` (e.g., changed the `tools` list). A new version of `rdpi` is available. Running `astp update` detects the modification and skips the edited file. Running `astp update --force` overwrites it.

### Terminal Interaction — Default (skip modified)

```
$ astp update

  ◇  Update:
  │  ● Project level (.github/)
  │  ○ User level (~/.copilot/)

  ◐  Scanning installed files...
  ◐  Fetching remote manifest...

  Bundle   Installed   Available
  rdpi     1.0.0       1.2.0       ↑ Update available

  ◐  Downloading rdpi...

  ⚠  1 file modified locally — skipping:
  │  agents/rdpi-approve.agent.md

  ✓  Updated 20 files, skipped 1 modified file.
  │  Use --force to overwrite modified files.
```

### Terminal Interaction — Force overwrite

```
$ astp update --force

  ◇  Update:
  │  ● Project level (.github/)
  │  ○ User level (~/.copilot/)

  ◐  Scanning installed files...
  ◐  Fetching remote manifest...
  ◐  Downloading rdpi...

  ⚠  Overwriting 1 modified file (--force):
  │  agents/rdpi-approve.agent.md

  ✓  Updated 21 files.
```

### Internal Module Interaction

```typescript
// commands/update.ts
import { fetchManifest } from '../core/manifest.js';
import { scanInstalled, compareVersions, detectModified } from '../core/version.js';
import { downloadBundle } from '../core/fetcher.js';
import { installFile } from '../core/installer.js';
import { selectTarget, showUpdateReport, warnModified } from '../ui/prompts.js';

interface UpdateOptions {
  force?: boolean;
}

export async function executeUpdate(options: UpdateOptions): Promise<void> {
  const target = await selectTarget();

  const installed = await scanInstalled(target.rootDir);
  if (installed.length === 0) {
    p.log.info('No astp-managed files found.');
    return;
  }

  const manifest = await fetchManifest();
  const report = compareVersions(installed, manifest);

  if (report.updates.length === 0) {
    p.log.info('All bundles up to date.');
    return;
  }

  showUpdateReport(report);

  for (const update of report.updates) {
    const tempDir = await downloadBundle(manifest.repository, update.bundleName);

    const modified = await detectModified(update, target.rootDir);
    if (modified.length > 0 && !options.force) {
      warnModified(modified);
    }

    const bundle = manifest.bundles[update.bundleName];
    for (const item of bundle.items) {
      const isModified = modified.some(f => f.targetPath === item.target);
      if (isModified && !options.force) continue; // skip modified file

      await installFile(tempDir, item, target, {
        source: manifest.repository,
        bundle: bundle.name,
        version: bundle.version,
      });
    }
  }
}
```

### Modification Detection Logic

```typescript
// core/version.ts — detectModified
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripAstpFields } from './frontmatter.js';

export async function detectModified(
  update: BundleUpdate,
  installRoot: string,
): Promise<FileStatus[]> {
  const modified: FileStatus[] = [];

  for (const file of update.files) {
    if (file.state === 'new') continue; // not installed yet

    const content = await readFile(join(installRoot, file.targetPath), 'utf-8');
    const stripped = stripAstpFields(content);
    const currentHash = createHash('sha256').update(stripped).digest('hex');

    const metadata = extractAstpMetadata(content);
    if (metadata && currentHash !== metadata.hash) {
      modified.push({ targetPath: file.targetPath, state: 'modified' });
    }
  }

  return modified;
}
```

Hash comparison: strip `astp-*` fields → SHA-256 → compare with `astp-hash` [ref: ./03-model.md §3.3, ./02-dataflow.md §4].

### Error Handling

| Scenario | Behavior |
|----------|----------|
| All files are modified, `--force` not set | All files skipped → "Updated 0 files, skipped N modified." |
| `astp-hash` field missing from a file | File treated as modified (conservative — cannot verify integrity) |
| Download fails mid-update | Files already updated remain, unapplied files reported → partial update → exit code 1 |


---


## UC-5: CI/CD Usage

### Scenario

A GitHub Actions workflow installs the `base` bundle to ensure agent configuration is present in the project. Non-interactive mode, exit codes for pipeline feedback.

### GitHub Actions Workflow

```yaml
name: Setup AI Agents
on: [push]

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install astp globally
        run: npm install -g astp

      - name: Install base bundle
        run: astp install base --target project
        env:
          GIGET_AUTH: ${{ secrets.GITHUB_TOKEN }}

      - name: Verify installation
        run: test -f .github/skills/orchestrate/SKILL.md
```

### Non-Interactive Behavior

When both `bundle` (positional argument) and `--target` (flag) are provided, the CLI:
- Skips all interactive prompts (no `selectTarget()`, no `selectBundles()`, no `confirmInstall()`).
- Writes directly to stdout (no spinner animations — CI environments detect non-TTY stdout).
- Returns exit codes: `0` = success, `1` = failure.

```typescript
// commands/install.ts — non-interactive path
export async function executeInstall(options: InstallOptions): Promise<void> {
  // When bundle AND target are provided, no prompts are triggered
  const target: InstallTarget = options.target
    ? resolveTarget(options.target)
    : await selectTarget();  // only called if --target missing

  const manifest: Manifest = await fetchManifest();

  const selectedBundles: Bundle[] = options.bundle
    ? [resolveBundle(manifest, options.bundle)]
    : await selectBundles(manifest);  // only called if bundle arg missing

  // No confirmInstall() in non-interactive mode
  // ...install proceeds directly
}
```

[ref: ./01-architecture.md §4 — commands prompt only when flags are omitted]

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success — all requested operations completed |
| `1` | Failure — network error, invalid bundle, manifest parse error, file write error |

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `GIGET_AUTH` not set + rate limited | Error message: "GitHub API rate limit exceeded. Set GIGET_AUTH env variable." → exit 1 |
| Non-TTY stdout (CI) | @clack/prompts will not render spinner animations gracefully, but this is acceptable — output is textual. If prompts are triggered in non-TTY (missing flags), they may fail. CI usage must provide all flags. |


---


## Edge Cases


### UC-Edge-1: No Network Access (Offline)

**Scenario**: User runs `astp install` without network access.

**Behavior**:
- `fetchManifest()` → `fetch()` throws a network error.
- CLI catches → displays "Network error: unable to fetch manifest. Check your internet connection." → exit code 1.
- giget's cache (`--prefer-offline`) does NOT help for manifest fetch — manifest always uses native `fetch()`.
- If manifest was previously fetched and giget has cached the bundle tarball, giget's `preferOffline: true` may serve from cache — but the manifest fetch will still fail first.

**Design note**: v0.1.0 does not implement offline mode. The manifest fetch is the first network call in every flow and will fail without connectivity [ref: ./02-dataflow.md §7].


### UC-Edge-2: Remote Manifest Fetch Fails Mid-Operation

**Scenario**: Network drops during `astp update` — manifest was fetched, but giget download fails.

**Behavior**:
- `downloadBundle()` throws a network error during tarball download.
- No files have been modified yet (download precedes install).
- CLI displays "Download failed for bundle 'rdpi'. No files were changed." → exit code 1.

**Rationale**: The download-then-install sequence ensures atomicity per bundle — either all files are installed or none are [ref: ./02-dataflow.md §3, §4].


### UC-Edge-3: Target Directory Doesn't Exist

**Scenario**: First install in a new project — `<project>/.github/` doesn't exist yet.

**Behavior**:
- `installFile()` calls `fs.mkdir(targetDir, { recursive: true })` before writing.
- All necessary directories (`agents/`, `skills/orchestrate/`, `instructions/`, `rdpi-stages/`) are created automatically.
- Works for both project-level (`.github/`) and user-level (`~/.copilot/`).

```typescript
// core/installer.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function installFile(
  tempDir: string,
  item: TemplateItem,
  target: InstallTarget,
  metadata: Omit<InstalledFileMetadata, 'hash'>,
): Promise<void> {
  const targetPath = join(target.rootDir, item.target);
  await mkdir(dirname(targetPath), { recursive: true });
  // ... read template, inject frontmatter, write
}
```


### UC-Edge-4: Corrupted or Missing Frontmatter Metadata

**Scenario**: An installed file has `astp-bundle` but is missing `astp-hash` (user manually edited the frontmatter).

**Behavior**:
- `scanInstalled()` reads the file and finds partial `astp-*` fields.
- File is still recognized as astp-managed (has `astp-source`).
- Missing `astp-hash` → modification detection is impossible → file treated as **modified** (conservative assumption).
- `astp update` warns and skips the file (unless `--force`).
- `astp check` reports the file under its bundle, with a note that integrity cannot be verified.

```
  ⚠  1 file has incomplete metadata — treated as modified:
  │  agents/rdpi-approve.agent.md (missing astp-hash)
```


### UC-Edge-5: Nothing Installed

**Scenario**: User runs `astp update` or `astp check` when no astp-managed files exist.

**Behavior**:
- `scanInstalled()` finds zero files with `astp-*` frontmatter.
- CLI displays "No astp-managed files found." → exit code 0.
- No manifest fetch occurs (no need to compare against remote).

[ref: ./02-dataflow.md §4, §5 — early exit before manifest fetch]


### UC-Edge-6: Existing File Without astp Metadata

**Scenario**: User has a manually-created `agents/custom-agent.agent.md` in `.github/`. A bundle installation tries to write to the same path.

**Behavior**:
- The file exists at the target path but has no `astp-*` frontmatter.
- It is NOT recognized as astp-managed by `scanInstalled()`.
- `installFile()` will overwrite it — the CLI has no way to know this file is user-created.

**Mitigation**: The manifest's `target` paths are specific (e.g., `agents/rdpi-approve.agent.md`). Name collisions with user-created files are unlikely unless the user deliberately named their file the same as a template file. v0.1.0 does not address this — a future version could check for existing non-managed files and warn before overwriting.


### UC-Edge-7: User-Level Install (~/.copilot/)

**Scenario**: User selects "User level" as the install target.

**Behavior**:
- `resolveTarget('user')` returns `{ type: 'user', rootDir: path.join(os.homedir(), '.copilot') }`.
- The same FileInstaller logic applies — files are written under `~/.copilot/` instead of `<project>/.github/`.
- `~/.copilot/` is NOT version-controlled — the user is responsible for managing it.
- The directory structure mirrors project-level (same manifest `target` paths).

```
~/.copilot/
├── skills/
│   └── orchestrate/
│       └── SKILL.md           ← astp-bundle: base
├── agents/
│   └── RDPI-Orchestrator.agent.md
└── ...
```

**Key difference from project-level**: No `.gitignore` considerations. The `astp-*` frontmatter is still injected for tracking, but since the directory isn't version-controlled, `astp check` / `astp update` are the only ways to manage these files.
