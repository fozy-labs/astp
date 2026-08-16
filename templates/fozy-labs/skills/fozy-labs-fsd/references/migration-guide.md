# Migration guide

Moving an existing codebase to FSD v2.1 — either from FSD v2.0, or from no FSD at all. Target folder trees
live in `layer-structure.md`; this file covers the order of operations.

---

## Part 1 — FSD v2.0 → v2.1

v2.1 emphasizes *start simple, extract when needed*. The migration is non-breaking: it mostly moves
single-use code back to where it is consumed.

### Step 1 — audit existing slices

Find features and entities with exactly one consumer.

```bash
npm install -D @feature-sliced/steiger
npx steiger src

# Rules that matter here:
# - insignificant-slice: an entity/feature used by only one consumer
# - excessive-slicing:   too many slices in a layer
```

For each flagged slice: genuinely reused in 2+ places → keep it; used by one page → mark it for migration.

### Step 2 — move page-specific code back to pages

```text
// Before (v2.0) — a feature with one consumer
features/user-profile-form/
  ui/ProfileForm.tsx
  model/profile-form.store.ts
  api/profile.api.ts
  index.ts
pages/profile/
  ui/ProfilePage.tsx           ← thin wrapper, just composes

// After (v2.1) — the code lives in the page that owns it
pages/profile/
  ui/
    ProfilePage.tsx
    ProfileForm.tsx            ← moved from features
  model/
    profile.store.ts           ← form logic merged in
  api/
    profile.api.ts             ← moved from features
  index.ts
```

Per moved slice:

1. Copy the files into the consuming page.
2. Update the page's `index.ts` to export what other layers still need.
3. Repoint every import across the codebase.
4. Delete the emptied feature/entity directory.
5. Run the tests.

### Step 3 — move widget-specific code into widgets

A feature or entity used only inside one widget belongs to that widget.

```text
// Before
entities/notification-count/
  model/notification-count.types.ts

// After
widgets/header/
  model/notification-count.types.ts
```

### Step 4 — leave genuinely reused code alone

Confirmed 2+ consumers means the slice stays where it is. v2.1 is not an instruction to flatten everything.

### Step 5 — retire the `processes/` layer

`processes/` is deprecated in v2.1.

**Multi-page workflows** (checkout, onboarding wizard): move the orchestration into the page that starts the
workflow; if several pages share the workflow state, it becomes a feature.

**Background work** (polling, sync): `app/` if it is genuinely app-wide, otherwise the owning page or
feature.

```text
// Before
processes/
  checkout/
    model/checkout-flow.store.ts    ← multi-step orchestration
  sync/
    model/background-sync.service.ts

// After
features/checkout/
  model/checkout-flow.store.ts      ← now a feature (used by 2+ pages)
  index.ts
app/
  sync/
    background-sync.service.ts      ← global concern
```

### Verification

1. `npx steiger src` — no remaining `insignificant-slice` warnings.
2. No upward or same-layer cross-imports.
3. No empty layer directories left behind.

---

## Part 2 — non-FSD codebase → FSD

Migrate incrementally. A half-migrated tree is a normal intermediate state; a big-bang rewrite is not.

### Phase 1 — establish `shared/`

Move infrastructure that carries no business logic: the existing UI component library, utility functions,
API client setup, auth/session utilities, config, assets. Target layout: `layer-structure.md` → `shared/`.

- Only move code with zero business logic.
- Relocate, do not refactor.
- Set up the path aliases now (`segments-and-naming.md`), so later phases import correctly from day one.

### Phase 2 — create `pages/`

Turn route-level components into page slices.

```text
// Before — flat or component-grouped
src/
  components/
    Dashboard.tsx
    Profile.tsx
    Settings.tsx

// After — page slices with segments
src/
  pages/
    dashboard/
      ui/DashboardPage.tsx
      model/dashboard.store.ts
      api/dashboard.api.ts
      index.ts
    profile/
      ui/ProfilePage.tsx
      model/profile.store.ts
      api/profile.api.ts
      index.ts
```

- Each page owns its UI, state and API calls.
- Do not extract features or entities in this phase.
- Substantial page code is correct v2.1 behaviour, not debt.

### Phase 3 — set up `app/`

Move global providers, the router, global styles and the entry point into `app/`. Layout:
`layer-structure.md` → `app/`.

### Phase 4 — extract `features/` and `entities/` (ongoing)

Only when real reuse shows up and the team agrees:

```text
// Signal: the profile form is now needed by /profile and /settings
features/profile-form/
  ui/ProfileForm.tsx
  model/profile-form.store.ts
  index.ts
```

Criteria: 2+ actual consumers (not anticipated ones), a clear single responsibility, and a net reduction in
complexity. If any of the three is missing, leave it in the page.

---

## Common pitfalls

1. **Extracting too early.** Wait for real reuse, not planned reuse.
2. **Creating empty layers.** No `features/`, `entities/` or `widgets/` directory until something lives
   there.
3. **Refactoring while migrating.** Move files in one commit, improve them in another — a moved-and-rewritten
   file is unreviewable.
4. **Ignoring import direction.** Enforce it mechanically from the first phase, not at the end.
5. **Big-bang migration.** Module by module, verifying each step. Hybrid structure during the transition is
   fine.
