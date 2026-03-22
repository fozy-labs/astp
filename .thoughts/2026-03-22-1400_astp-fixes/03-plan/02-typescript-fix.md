---
title: "Phase 2: TypeScript Fix"
date: 2026-03-22
stage: 03-plan
role: rdpi-planner
---

## Goal

Add `hint` property to both `p.multiselect` calls in `prompts.ts` (Issue 3).

## Dependencies
- **Requires**: Phase 1 (for orderly verification only — no code dependency)
- **Blocks**: None

## Execution
Sequential

## Tasks

### Task 2.1: Add hint to selectBundles multiselect (Issue 3)
- **File**: `src/ui/prompts.ts`
- **Action**: Modify
- **Description**: Add `hint: "Space to toggle, Enter to confirm"` to the `p.multiselect` call in `selectBundles` (~line 65).
- **Details**:
  Find:
  ```ts
  const selected = await p.multiselect({
      message: "Select bundles to install:",
      options,
      initialValues,
      required: true,
  });
  ```
  Replace with:
  ```ts
  const selected = await p.multiselect({
      message: "Select bundles to install:",
      options,
      initialValues,
      required: true,
      hint: "Space to toggle, Enter to confirm",
  });
  ```
  [ref: ../02-design/01-architecture.md#issue-3]

### Task 2.2: Add hint to selectInstalledBundles multiselect (Issue 3)
- **File**: `src/ui/prompts.ts`
- **Action**: Modify
- **Description**: Add `hint: "Space to toggle, Enter to confirm"` to the `p.multiselect` call in `selectInstalledBundles` (~line 97).
- **Details**:
  Find:
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
  Replace with:
  ```ts
  const selected = await p.multiselect({
      message: "Select bundles to delete:",
      options: installed.map((bundle) => ({
          value: bundle.bundleName,
          label: `${bundle.bundleName} (${bundle.files.length} file${bundle.files.length === 1 ? "" : "s"})`,
      })),
      required: true,
      hint: "Space to toggle, Enter to confirm",
  });
  ```
  [ref: ../02-design/01-architecture.md#issue-3]

## Verification
- [ ] T3a: `grep "hint:" src/ui/prompts.ts` returns 2 matches, both with `"Space to toggle, Enter to confirm"`
- [ ] T3b: `npm run ts-check` passes (TypeScript compilation verification)
