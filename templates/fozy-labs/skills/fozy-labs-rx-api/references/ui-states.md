# UI states — what to render per state

A recommended baseline for UX over `useResource` / agent state.
It is a starting point the implementer adapts to the place; the component set is the project's, not this document's.

**Contents:** [Inventory first](#inventory-first) · [Baseline per state](#baseline-per-state) · [Links: optimistic vs invalidate](#links-optimistic-vs-invalidate) · [Error loudness](#error-loudness) · [Profiles](#profiles) · [Pitfalls](#pitfalls)

---

## Inventory first

Before wiring flags to components, find what the project already has. Three common shapes:

| Shape                                                                                          | What it means for the code                                                                              |
|------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| One container that can dim, lock and show an error (`<QueryContainer state={state}>`)          | Pass the state through; do not branch by hand.                                                          |
| Separate parts — `Skeleton`, `ErrorBoundary`, `Dimmer`, `EmptyState`, toasts                   | Branch on the flags below; one part per state.                                                          |
| Router / framework owns pending and error UI (loaders, `errorElement`, Suspense boundaries)    | Leave initial load and hard errors to it; the component handles switching, reloading and refresh errors. |

Reuse the project's parts and intents; invent a component only when none exists.

---

## Baseline per state

Flags are the [state union](reading-in-react.md#the-state-union); `error` vs `refresh-error` is in
[error-handling.md](error-handling.md#where-a-failure-shows-up).

| State                                       | Condition                                            | Default                                                                                          | Common deviation                                                                                      |
|---------------------------------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| Initial load                                | `isInitialLoading` (or the Suspense fallback)        | Skeleton in the shape of the content; a spinner when the shape is unknown                        | Router pending UI already covers it → render nothing extra                                            |
| Switching — new args behind old data        | `isSwitching`                                        | Keep the data, lower its emphasis (dim / muted colours): the old result is visibly being replaced | Remount with `key={id}` → back to Skeleton; a search-as-you-type list may keep full emphasis          |
| Reloading — `refresh()`, `invalidate`, polling | `isRefreshing && !isSwitching`                    | Nothing — the data is still valid                                                                | A "live" widget: a faint spinner in a corner                                                          |
| Retrying                                    | `isRetrying`                                         | The same surface as the failure being retried, with a loading affordance inside; `error` still holds the failure | A list returns to Skeleton (`isInitialLoading` is also `true` for a retried initial load) |
| Error, no data                              | `isError && data === null`                           | By consequence — [Error loudness](#error-loudness). Always a retry affordance (`state.retry`)     | —                                                                                                     |
| Refresh error — data on screen              | `isRefreshError`                                     | Keep the data; a quiet inline notice ("could not refresh") with retry                            | Never a full error state                                                                              |
| Empty                                       | `isSuccess && data.length === 0` — **not** a library state | `EmptyState` with a *create* intent                                                        | Active filters → different copy plus a "reset filters" action                                         |

Empty and error often share a component; they never share copy, icon or primary action.

---

## Links: optimistic vs invalidate

Mechanics: [cache-and-invalidation.md](cache-and-invalidation.md#links--wiring-a-command-to-resources).

| Decision           | Baseline                                            | Choose otherwise when                                                                                                                                                                                             |
|--------------------|-----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `optimisticUpdate` | On — the UI changes the moment the user acts        | The patch cannot be derived on the client (the server computes the result)                                                                                                                                        |
| `invalidate`       | Depends on transport and load, not on habit         | REST-only B2B: **on** — the server is the only source of truth. High-load with a WS / event bus: **off** — the bus patches entries (`onCacheEntryAdded` subscription or a [stream query](stream-queries.md)); a refetch per mutation multiplies load |
| `retentionTime`    | Default 60 000 ms                                   | Short-lived, high-cardinality keys (search-as-you-type): 30 s or less — memory over cache hits                                                                                                                    |

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
| Refresh error  | Banner above the list: "could not refresh"                                                              |
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
| Refresh error   | Icon in the widget corner with a toast                                                               |
| Reloading       | Faint spinner in the corner                                                                          |
| Settings change | `invalidate` on the settings command — refetch at once                                               |
| Polling         | `onCacheEntryAdded` loop while the entry lives — [lifecycle-hooks.md](lifecycle-hooks.md#oncacheentryadded--once-per-cache-entry) |
| Switching       | Unreachable — the widget is remounted per id, so a new id is an initial load                         |

```tsx
<Widget key={id} widgetId={id} />
// inside Widget:
const state = widgetApi.getWidget.useResource({ widgetId });
```

---

## Pitfalls

- ❌ Branching on `isLoading` alone — it merges initial load, switching, reloading and retrying, which get four different treatments.
- ❌ A full error screen on `refresh-error` — the data on screen is still usable.
- ❌ Skeleton on every `isRefreshing` — invalidation and polling would flash the page.
- ❌ One `EmptyState` for "no results" and "request failed" — different intent, copy and primary action.
- ✅ Decide `invalidate` per product transport; a bus-fed cache does not need it.
