# Migrations — Query

The last two releases that require code changes. Read this only when working in a codebase written against an older
version, or when an unfamiliar name shows up in existing code.

**Contents:** [0.12.x → 0.13.0](#012x--0130--the-query-dictionary-and-the-state-shape) · [0.10.x → 0.11.x](#010x--011x--execute--prefetch) · [Name lookup](#name-lookup)

---

## 0.12.x → 0.13.0 — the Query dictionary and the state shape

Breaking release. Old names live on as `@deprecated` aliases until 0.14.0 — **except** the state shape, the removed
`Machine*` classes and the already-deprecated `trigger` / `signalize`, which are gone with no alias. This table is for
reading old code.

| Old (0.12.x) | Current | Notes |
|--------------|---------|-------|
| `createAgent()` | `createClutch()` | `IResourceAgent` / `ICommandAgent` → `IResourceClutch` / `ICommandClutch` |
| `agent.set(args)` / `set(args, true)` | `clutch.switch(args)` / `switch(args, { markPending: true })` | |
| `agent.setKey(key)` | `clutch.setEntryKey(entryKey)` | |
| `refresh()` everywhere — resource, entry, clutch, state, infinite feed | `invalidate()` | different semantics — see the traps below |
| `pack(args)` / `pack(args, key?)` | `bind(args)` / `bind(args, entryKey?)` | descriptor field `.key` → `.entryKey`, **no alias** — a missed read silently mints a fresh key per run |
| `composeHooks(a, b)` | `onQueryStarted: [a, b]` | falsy elements are skipped |
| `entry.machine$()` | `entry.state$()` — a **flat** `TQueryEntryState` | `.state$().state.status` → `.state$().status`, no alias |
| `instanceof MachineSuccess`, `initialMachine: Machine.fromSnapshot(...)` | `state.status === 'success'`, `initialState: { status, args, data, error, updatedAt, patchState }` | `Machine*` classes removed |
| `TPacked*` | `TBound*` | |
| `TResourceAgentState` / `TCommandAgentState` / `IResourceLiteState` | `TResourceClutchState` / `TCommandClutchState` / `TResourceEntryState` | |
| `command.trigger(args, key?)` | `command.execute(args, entryKey?)` | deprecated in 0.11, **removed** here |
| `resource.trigger(args)` | `prefetch(args)` / `prefetch(args, { force: true })` | removed |

Flags and statuses with **no alias** (a compile error in typed code, a silent `undefined` behind `any`):

| Old | Read it as |
|-----|------------|
| `isLoading` | `isPending` |
| `isRefreshing` | `isInvalidating \|\| isSwitching` |
| `isRefreshError`, `status === 'refresh-error'` | `status === 'error' && dataSource === 'current'` |
| `status === 'refreshing'` | `isPending && hasData` |
| `isSuccess` / `isError` | `status === 'success'` / `status === 'error'` — for rendering use `hasData` / `hasError` |
| `isRetrying` | `isPending && hasError` |
| `isFetchingNext` (infinite feed) | `isLoadingNext` |
| `data !== null` as the "loaded" check | `hasData` |

Two behavior traps a mechanical rename walks into:

1. **Invalidation is lazy now.** `refresh(args)` always sent the request; `invalidate(args)` refetches at once only
   a **held** entry and merely marks an unheld one (refetch on next hold). Cache warm-up after a mutation and timers
   over invisible data move to `fetch` / `prefetch(args, { force: true })`.
2. **`invalidate()` on a failed entry retries it** with the error cleared, where `refresh()` logged a warning and did
   nothing. A blind interval/focus invalidation now re-requests failed entries.

Also in this release: `placeholderData` (synthesized data for uncached args), `entry.hold()` + `isMelting` /
`isInvalidated`, `retentionTime` as a function, hook arrays, `augmentApi` for plugins, the `unstable_FormSignal`
forms module, snapshots v2. All covered by the skill's main files.

---

## 0.10.x → 0.11.x — `execute` / `prefetch`

The release unifies the vocabulary for "start this query": `trigger` used to mean three different contracts, so it is
gone from both primitives. (Both names were then removed for good in 0.13.0 — see above.)

| Level                          | Old (0.10.x)                           | Current                                 |
|--------------------------------|----------------------------------------|-----------------------------------------|
| `Command` (core)               | `trigger(args, key?)` → raw promise    | `execute(args, entryKey?)` — same contract |
| `CommandAgent` / `useCommand`  | `trigger(args)` → envelope             | unchanged (the clutch keeps the name `trigger`) |
| `Resource`                     | `trigger(args, doForce?)` → `void`     | `prefetch(args)` / `prefetch(args, { force: true })` |

### `Resource.trigger` → `prefetch`

Not a pure rename. The shared part: the entry is created synchronously and the returned `Promise<void>` never rejects.
The differences bite in two places.

| Entry state       | `trigger(args)` | `trigger(args, true)`                    | `prefetch(args)`      | `prefetch(args, { force: true })` |
|-------------------|-----------------|------------------------------------------|-----------------------|-----------------------------------|
| absent            | creates + runs  | creates + runs                           | creates + runs, waits | creates + runs, waits             |
| holds data        | no-op           | `refresh()`                              | resolves at once      | `invalidate()`, waits for fresh   |
| **`error`**       | **no-op**       | **no-op** + console warning              | **retries**           | **retries**                       |
| **`retentionTime`** | untouched     | untouched                                | **re-armed**          | **re-armed**                      |

1. **A failed entry is now retried.** Code that deliberately went quiet after an error — a periodic warm-up, say — will
   start repeating the request after a mechanical rename. Guard it:
   `if (!resource.getState(args).hasError) void resource.prefetch(args);`
2. **`prefetch` holds a keepalive subscription for the duration of the call, cache hits included**, and releasing it
   restarts the `retentionTime` countdown. A polling loop calling `prefetch(args)` more often than `retentionTime`
   therefore pins the entry forever and — without `force` — never refetches, where `trigger` let it expire and
   re-created it about once per retention window. Use `{ force: true }`, or an interval longer than `retentionTime`.

### Also in this release

- `getDevtoolsKey` was **removed** from the resource options. It was dead — nothing ever read it. Delete the option;
  entries are labelled `` `${resourceKey}:${entryKey}` `` with no override.

---

## Name lookup

| Name in old code                   | Read it as                                  |
|------------------------------------|---------------------------------------------|
| `createAgent` / `agent.set` / `agent.setKey` | `createClutch` / `clutch.switch` / `clutch.setEntryKey` |
| `refresh(...)` anywhere            | `invalidate(...)` — but see the lazy-invalidation trap |
| `pack(...)` / `.key` on a descriptor | `bind(...)` / `.entryKey`                    |
| `composeHooks(...)`                | an array in the option                       |
| `entry.machine$` / `Machine*`      | `entry.state$()` flat + `state.status`       |
| `command.trigger(args, key?)`      | `command.execute(args, entryKey?)`           |
| `resource.trigger(args)`           | `prefetch(args)` — but see the `error` row   |
| `resource.trigger(args, true)`     | `prefetch(args, { force: true })`            |
| `isLoading` / `isRefreshing` / `isRefreshError` / `isRetrying` | see the flags table above |
| `getDevtoolsKey`                   | removed, delete it                           |
| `await trigger(dto)` + `try/catch` | envelope check on `result.status`            |

---

## Pitfalls

- ❌ Renaming `refresh` → `invalidate` in a polling loop over invisible data — the entries are unheld, so nothing refetches; use `prefetch(args, { force: true })`.
- ❌ Grep-renaming `pack` → `bind` and forgetting the descriptor field — `.key` has no alias and silently gives `undefined`.
- ❌ Renaming `resource.trigger` → `prefetch` in a polling loop — it stops refetching and pins the entry.
- ❌ Renaming `resource.trigger` → `prefetch` on a path that must stay quiet after a failure — it now retries.
- ❌ Assuming `command.trigger` and the hook's `trigger` are the same method; only the former was renamed.
- ✅ Write the new names in new code; aliases exist only for compatibility and are removed in 0.14.0.
- ✅ After migrating off `trigger`, check `retentionTime` anywhere a warm-up runs on a timer.
