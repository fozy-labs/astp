# UI states — what to render per state

A recommended baseline for UX over `useResource` / clutch state.
It is a starting point the implementer adapts to the place; the component set is the project's, not this document's.

**Contents:** [Inventory first](#inventory-first) · [Baseline per state](#baseline-per-state) · [Links: optimistic vs invalidate](#links-optimistic-vs-invalidate) · [Error loudness](#error-loudness) · [Profiles](#profiles) · [Pitfalls](#pitfalls)

---

## Inventory first

Before wiring flags to components, find what the project already has. Three common shapes:

- One container that can dim, lock and show an error (`<QueryContainer queries={state}>`);
- Separate parts — `Skeleton`, `ErrorBoundary`, `Dimmer`, `EmptyState`, toasts;
- Router / framework owns pending and error UI (loaders, `errorElement`, Suspense boundaries);
- Other forms, their combinations and associations.

---

## Baseline per state

Flags are the [state shape](reading-in-react.md#the-state-shape); which failure sits in `error` is in
[error-handling.md](error-handling.md#where-a-failure-shows-up).

| State                                          | Condition                                     | "Default"                                                                                                                                                           |
|------------------------------------------------|-----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Initial load                                   | `isInitialLoading` (or the Suspense fallback) | Skeleton in the shape of the content                                                                                                                                |
| Placeholder                                    | `dataSource === 'placeholder'`                | Render as data; it is synthesized, never cached — do not treat it as a server response                                                                              |
| Switching — new args behind old data           | `isSwitching`                                 | Keep the data, lower its emphasis (dim / muted colours)                                                                                                             |
| Reloading — `invalidate`, polling              | `isInvalidating`                              | Nothing — the data is still valid                                                                                                                                   |
| Retrying                                       | `isPending && hasError`                       | Same as the state it is retrying in: Initial load, Switching or Reloading — the error stays in `error` until the run settles                                        |
| Error, no data                                 | `hasError && !hasData`                        | By consequence — [Error loudness](#error-loudness). Always a retry affordance (`state.retry`)                                                                       |
| Error, previous args' data                     | `hasError && dataSource === 'previous'`       | The error surface for `args`, as above; `data` belongs to `dataArgs`, not to the failed request: dimmed behind the error at most, never shown as the current result |
| Invalidation error — data on screen            | `status === 'error' && dataSource === 'current'` | Keep the data; a quiet inline notice ("could not refresh") with retry                                                                                            |
| Empty                                          | `hasData && data.length === 0`                | `EmptyState` with a *create* intent                                                                                                                                 |

---

## Links: optimistic vs invalidate

Mechanics: [cache-and-invalidation.md](cache-and-invalidation.md#links--wiring-a-command-to-resources).

| Decision           | Baseline                                            | Choose otherwise when                                                                                                                                                                                             |
|--------------------|-----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `optimisticUpdate` | On — the UI changes the moment the user acts        | The patch cannot be derived on the client (the server computes the result)                                                                                                                                        |
| `invalidate`       | Depends on transport and load, not on habit         | REST-only B2B: **on** — the server is the only source of truth. High-load with a WS / event bus: **off** — the bus patches entries (`onCacheEntryAdded` subscription or a [stream query](stream-queries.md)); a refetch per mutation multiplies load |
| `retentionTime`    | Default 60 000 ms                                   | Short-lived, high-cardinality keys (search-as-you-type): 30 s or less — memory over cache hits. A `(args, state) => number \| false` policy decides per entry (e.g. evict failed entries at once)                    |

---

## Error loudness

Pick by the consequence for the user's task, not by the exception type:

| Consequence                                                        | Surface                                                     |
|--------------------------------------------------------------------|-------------------------------------------------------------|
| Cosmetic — a secondary block is missing                            | Inline label / icon with retry, no interruption             |
| The block's task is blocked, the page is not                       | `EmptyState` with an error intent + retry, or a banner above the stale data |
| Something the user did not initiate failed (refresh, background sync) | Toast                                                    |
| The page cannot continue                                           | Modal / `ErrorBoundary` with retry or "reload the page"     |

Two classes need a different action than `retry()`: transport failures the HTTP layer handles itself (offline banner,
auth refresh) never reach the resource; contract errors (schema mismatch) are not retryable — offer a page reload.

---

## Profiles

Two real placements — the same flags, different decisions.

### Searchable list in a high-load messenger

| Decision       | Implementation                                                                                          |
|----------------|---------------------------------------------------------------------------------------------------------|
| Initial load   | `Skeleton` instead of the list                                                                          |
| Error          | `EmptyState` (error intent): icon, one line, retry; Skeleton again while retrying                        |
| Invalidation error | Banner above the list: "could not refresh"                                                          |
| Empty          | `EmptyState` (create intent); with filters active — other copy plus "reset filters"                     |
| Reloading      | Not shown                                                                                               |
| Switching      | The container's own `dimmed` flag on the list                                                           |
| Mutations      | Patch entries, never `invalidate` — the bus is the source of updates                                     |
| Live updates   | `onCacheEntryAdded`: subscribe to the topic on the WS client, patch the entry until `$cacheEntryRemoved` |
| Cache lifetime | `retentionTime: 30_000` — active search creates many keys                                               |

### KPI widget with group settings

| Decision        | Implementation                                                                                       |
|-----------------|------------------------------------------------------------------------------------------------------|
| Initial load    | `Skeleton`                                                                                           |
| Error           | `ErrorBoundary` with retry + toast                                                                   |
| Invalidation error | Icon in the widget corner with a toast                                                            |
| Reloading       | Faint spinner in the corner                                                                          |
| Settings change | `invalidate` on the settings command — the widget's entry is held, so the refetch fires at once      |
| Polling         | `onCacheEntryAdded` loop while the entry lives — [lifecycle-hooks.md](lifecycle-hooks.md#oncacheentryadded--once-per-cache-entry) |
| Switching       | Unreachable — the widget is remounted per id, so a new id is an initial load                         |

```tsx
<Widget key={id} widgetId={id} />
// inside Widget:
const state = widgetApi.getWidget.useResource({ widgetId });
```

---

## Pitfalls

- ❌ Branching on `status` alone — `pending` merges initial load, switching, reloading and retrying, which get four different treatments.
- ❌ A full error screen when `hasError && hasData` — the data on screen is still usable.
- ❌ Skeleton on every `isPending` — invalidation and polling would flash the page.
- ❌ One `EmptyState` for "no results" and "request failed" — different intent, copy and primary action.
- ✅ Decide `invalidate` per product transport; a bus-fed cache does not need it.
