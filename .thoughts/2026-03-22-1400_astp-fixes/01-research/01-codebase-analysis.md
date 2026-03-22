---
title: "ASTP Fixes — Codebase Analysis"
date: 2026-03-22
stage: 01-research
role: rdpi-codebase-researcher
---

## Summary

Six targeted fixes spanning template content (YAML frontmatter versions, agent instructions) and CLI UI (multi-select prompt hints). The affected files are concentrated in `src/templates/rdpi/` (agent markdown files, instructions) and `src/core/` (installer, frontmatter), with one UI file (`src/ui/prompts.ts`).

## Findings

---

### Issue 1 — Duplicate version fields in YAML frontmatter

The `thoughts-workflow.instructions.md` file tells agents to embed a "Workflow version" field in every `.thoughts/` markdown file:

- **Location**: `@/src/templates/rdpi/instructions/thoughts-workflow.instructions.md:25`
- **Quote**:
  ```
  - **Workflow version**: `{{ASTP_WORKFLOW_VERSION}}` (must be included in each md's file)
  ```

This instruction is ambiguous — it does not specify a YAML field name. The actual field name used in template frontmatter examples across agents is `rdpi-version`. These agents include `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` in their output format examples:

- **`@/src/templates/rdpi/agents/rdpi-stage-creator.agent.md:76`** — README.md template:
  ```yaml
  rdpi-version: {{ASTP_WORKFLOW_VERSION}}
  ```

- **`@/src/templates/rdpi/agents/rdpi-research-reviewer.agent.md:65`** — README.md template:
  ```yaml
  rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"
  ```

- **`@/src/templates/rdpi/agents/rdpi-design-reviewer.agent.md:78`** — README.md template:
  ```yaml
  rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"
  ```

- **`@/src/templates/rdpi/agents/rdpi-planner.agent.md:53`** — README.md template:
  ```yaml
  rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"
  ```

- **`@/src/templates/rdpi/agents/rdpi-implement-reviewer.agent.md:82`** — README.md template:
  ```yaml
  rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"
  ```

The `rdpi-codebase-researcher.agent.md` frontmatter template does NOT include any version field:

- **`@/src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md:29-35`**:
  ```yaml
  ---
  title: "<Topic> — Codebase Analysis"
  date: <YYYY-MM-DD>
  stage: 01-research
  role: rdpi-codebase-researcher
  ---
  ```

Meanwhile, the CLI injects `astp-version` (the bundle version from manifest) into every installed file's frontmatter via `injectAstpFields`:

- **`@/src/core/frontmatter.ts:39-48`**:
  ```ts
  export function injectAstpFields(content: string, metadata: Omit<InstalledFileMetadata, "hash">, hash: string): string {
      const astpBlock = [
          `astp-source: ${metadata.source}`,
          `astp-bundle: ${metadata.bundle}`,
          `astp-version: ${metadata.version}`,
          `astp-hash: ${hash}`,
      ].join("\n");
  ```

So installed MDA files get `astp-version` (bundle version, e.g. `1.0.0`) from the CLI, while the template content also contains `rdpi-version: {{ASTP_WORKFLOW_VERSION}}` (workflow version, e.g. `b0.5`). These are two different concepts. The TASK.md says to keep only `rdpi-version` and remove `workflow_version`.

The `thoughts-workflow.instructions.md` line 25 is the only place that uses the phrasing "Workflow version" without specifying the YAML field name `rdpi-version`.

**Affected files**:
- `@/src/templates/rdpi/instructions/thoughts-workflow.instructions.md` (line 25 — ambiguous "Workflow version" phrasing)

---

### Issue 2 — Version must come from manifest

The version flow:

1. **Manifest defines versions** — `@/src/templates/manifest.json:8-9` (for `rdpi` bundle):
   ```json
   "version": "1.0.0",
   "workflowVersion": "b0.5",
   ```

2. **Manifest is validated** — `@/src/core/manifest.ts:85-88`:
   ```ts
   if ("workflowVersion" in bundle && typeof bundle.workflowVersion !== "string") {
       throw new Error(`Invalid bundle '${key}': workflowVersion must be a string`);
   }
   ```
   `workflowVersion` is optional; `version` is required.

3. **Bundle type** — `@/src/types/index.ts:22-23`:
   ```ts
   /** Optional workflow version for templated bundle content (e.g., "b0.5"). */
   workflowVersion?: string;
   ```

4. **Install command passes both versions** — `@/src/commands/install.ts:40-44`:
   ```ts
   await installFile(tempDir, item, target, {
       source: manifest.repository,
       bundle: bundle.name,
       version: bundle.version,
       workflowVersion: bundle.workflowVersion,
   });
   ```

5. **Installer renders the template token** — `@/src/core/installer.ts:28-39`:
   ```ts
   const WORKFLOW_VERSION_TOKEN = "{{ASTP_WORKFLOW_VERSION}}";

   function renderTemplateContent(content: string, workflowVersion?: string): string {
       if (!content.includes(WORKFLOW_VERSION_TOKEN)) {
           return content;
       }

       if (!workflowVersion) {
           throw new Error("Template requires workflowVersion but the bundle does not define it in manifest.json");
       }

       return content.replaceAll(WORKFLOW_VERSION_TOKEN, workflowVersion);
   }
   ```

6. **Then injects `astp-version`** (bundle version) — `@/src/core/installer.ts:21-22`:
   ```ts
   const content = renderTemplateContent(sourceContent, meta.workflowVersion);
   const hash = computeHash(content);
   const finalContent = injectAstpFields(content, meta, hash);
   ```

The instructions in `thoughts-workflow.instructions.md:25` tell runtime agents to include `{{ASTP_WORKFLOW_VERSION}}` in generated `.thoughts/` files. But at runtime, these agents operate on already-installed files where the token was already replaced with the actual value (e.g. `b0.5`). The instructions text itself will read `b0.5` after installation. So the version in `.thoughts/` derivative files comes from whatever the instruction text says — which after installation is the literal `b0.5` value from manifest. The chain: manifest → installer token replacement → instructions text → agent reads instructions → agent writes `.thoughts/` files.

**Affected files**:
- `@/src/templates/manifest.json` (source of `workflowVersion`)
- `@/src/core/installer.ts` (renders `{{ASTP_WORKFLOW_VERSION}}` token)
- `@/src/core/frontmatter.ts` (injects `astp-version` CLI metadata)
- `@/src/commands/install.ts` (passes `workflowVersion` to installer)
- `@/src/types/index.ts` (defines `workflowVersion` on Bundle type)
- `@/src/core/manifest.ts` (validates `workflowVersion`)
- `@/src/templates/rdpi/instructions/thoughts-workflow.instructions.md` (runtime reference to version)
- All template agent files containing `{{ASTP_WORKFLOW_VERSION}}` (listed in Issue 1)

---

### Issue 3 — Hint for multi-select prompts

Two multi-select prompts exist in `@/src/ui/prompts.ts`:

1. **`selectBundles`** — `@/src/ui/prompts.ts:62-73`:
   ```ts
   const selected = await p.multiselect({
       message: "Select bundles to install:",
       options,
       initialValues,
       required: true,
   });
   ```
   No `hint` property is set.

2. **`selectInstalledBundles`** — `@/src/ui/prompts.ts:96-105`:
   ```ts
   const selected = await p.multiselect({
       message: "Select bundles to delete:",
       options: installed.map((bundle) => ({
           value: bundle.bundleName,
           label: `${bundle.bundleName} (${bundle.files.length} file${bundle.files.length === 1 ? "" : "s"})`,
       })),
       required: true,
   });
   ```
   No `hint` property is set.

The `wizard.ts` file (`@/src/ui/wizard.ts`) does not contain any multi-select prompts — it only calls the command executors.

**Affected files**:
- `@/src/ui/prompts.ts` (lines 62-73 and 96-105)

---

### Issue 4 — Remove redraft limit from orchestrator

In `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`, the redraft limit appears in three places:

1. **Orchestration step 5b-5c** — lines 68-70:
   ```
   5b. If the stage is not approved and redraft count < 3, spawn the `rdpi-stage-creator` again in `redraft` mode (it will read REVIEW.md and append fix phases to PHASES.md), then go to step #2 to execute the new phases.
   5c. If redraft count ≥ 3, stop and report to the user that the stage has exceeded the redraft limit.
   ```

2. **Constraints section** — last line of the file (line 108):
   ```
   - Maximum 3 redraft rounds per stage. After that, stop and escalate.
   ```

**Affected files**:
- `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md` (lines 68-70, 108)

---

### Issue 5 — Set auto-redraft limit on approve agent

In `@/src/templates/rdpi/agents/rdpi-approve.agent.md`, the current auto-redraft behavior:

1. **Early rejection** — Step 5 (lines 53-70):
   ```
   ### Step 5 — Early rejection (Critical issues only)

   If there are any **Critical** issues, you MAY return `"Not Approved"` immediately without asking the user.
   ```
   There is NO limit on how many times auto-rejection can happen.

2. **Existing redraft-round awareness** — the last rule in the Rules section (lines 179-180):
   ```
   - After 2+ redraft rounds on the same stage (determined in Step 2): you MUST NOT auto-reject even on Critical issues — always present to the user. This prevents infinite loops where review and redraft keep cycling without human intervention.
   ```
   This is a limit on auto-rejection (not auto-redraft count), triggered after 2+ redraft rounds already exist.

3. **Step 2 — Determine redraft round** (lines 33-35):
   ```
   ### Step 2 — Determine redraft round

   Read `PHASES.md` in the stage directory. Count the number of `# Redraft Round` headings. This is the current redraft round number (0 if no redraft rounds exist).
   ```

**Affected files**:
- `@/src/templates/rdpi/agents/rdpi-approve.agent.md` (lines 53-70, lines 179-180)

---

### Issue 6 — Orchestrator distorts TASK.md wording

In `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md`, the "New Task Setup" section (lines 52-57):

```
### New Task Setup

1. Decide on the name of the task.
2. Create a new directory `.thoughts/<YYYY-MM-DD-HHmm>_<feature-name>/`.
3. If the user's task description is NOT in English, translate it to English preserving the original meaning.
4. Create `TASK.md` in this directory, insert the task into it.
```

Step 3 says "translate it to English preserving the original meaning" and step 4 says "insert the task into it". There is no explicit instruction to pass the text as-is — only translation is mentioned. There is also no instruction to research or rephrase, but there are no guardrails preventing it either. The phrase "Decide on the name of the task" (step 1) similarly gives the orchestrator latitude in naming.

**Affected files**:
- `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md` (lines 52-57)

---

## Code References

- `@/src/templates/rdpi/instructions/thoughts-workflow.instructions.md:25` — "Workflow version" instruction with `{{ASTP_WORKFLOW_VERSION}}`
- `@/src/templates/rdpi/agents/rdpi-stage-creator.agent.md:76` — `rdpi-version: {{ASTP_WORKFLOW_VERSION}}` in README.md template
- `@/src/templates/rdpi/agents/rdpi-research-reviewer.agent.md:65` — `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` in output format
- `@/src/templates/rdpi/agents/rdpi-design-reviewer.agent.md:78` — `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` in output format
- `@/src/templates/rdpi/agents/rdpi-planner.agent.md:53` — `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` in output format
- `@/src/templates/rdpi/agents/rdpi-implement-reviewer.agent.md:82` — `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` in output format
- `@/src/templates/rdpi/agents/rdpi-codebase-researcher.agent.md:29-35` — frontmatter template without version field
- `@/src/core/frontmatter.ts:39-48` — `injectAstpFields` writes `astp-version`
- `@/src/core/installer.ts:28-39` — `renderTemplateContent` replaces `{{ASTP_WORKFLOW_VERSION}}`
- `@/src/core/installer.ts:21-22` — render → hash → inject flow
- `@/src/commands/install.ts:40-44` — passes `workflowVersion` to installer
- `@/src/templates/manifest.json:8-9` — `version` and `workflowVersion` fields for rdpi bundle
- `@/src/types/index.ts:22-23` — `workflowVersion` type definition
- `@/src/core/manifest.ts:85-88` — `workflowVersion` validation
- `@/src/ui/prompts.ts:62-73` — `selectBundles` multiselect (no hint)
- `@/src/ui/prompts.ts:96-105` — `selectInstalledBundles` multiselect (no hint)
- `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md:68-70` — redraft count < 3 / ≥ 3 logic
- `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md:108` — "Maximum 3 redraft rounds" constraint
- `@/src/templates/rdpi/agents/rdpi-approve.agent.md:53-70` — early rejection (no auto-redraft limit)
- `@/src/templates/rdpi/agents/rdpi-approve.agent.md:179-180` — "After 2+ redraft rounds" guardrail
- `@/src/templates/rdpi/agents/RDPI-Orchestrator.agent.md:52-57` — New Task Setup instructions
