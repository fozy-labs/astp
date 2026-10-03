# UI states — what to render per state

A recommended baseline for UX over resource, feed and command state.
It is a starting point the implementer adapts to the place; the component set is the project's, not this document's.

**Contents:** [Inventory first](#inventory-first) · [Resource: baseline per state](#resource-baseline-per-state) · [Suspense](#suspense) · [Infinite feed](#infinite-feed) · [Mutations](#mutations) · [Links: optimistic vs invalidate](#links-optimistic-vs-invalidate) · [Error loudness](#error-loudness) · [Profiles](#profiles) · [Pitfalls](#pitfalls)

---

## Inventory first

Before wiring flags to components, find what the project already has. Common shapes:

- One container that can dim, lock and show an error (`<QueryContainer queries={state}>`);
- Separate parts — `Skeleton`, `ErrorBoundary`, `Dimmer`, `EmptyState`, toasts;
- Router / framework owns pending and error UI (loaders, `errorElement`, Suspense boundaries);
- Other forms, their combinations and associations.

---

## Resource: baseline per state

Flags are the [state shape](reading-in-react.md#the-state-shape); which failure sits in `error` is in
[error-handling.md](error-handling.md#where-a-failure-shows-up). The conditions cover every `useResource` / clutch
state and, except Empty, are mutually exclusive, so the rows can be checked in any order.

| State                                 | Condition                                       | "Default"                                                                                                                                        |
|---------------------------------------|-------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| Idle — args not ready (`SKIP`)        | `status === 'idle'`                             | Not a loading state: the prompt that supplies the args ("pick a project"), or no block at all. Never a skeleton                                  |
| Initial load                          | `dataSource === 'none' && isPending && !hasError` | Skeleton in the shape of the content                                                                                                           |
| Placeholder                           | `dataSource === 'placeholder' && !hasError`     | Render as content, marked as not final: actions that need the server's answer stay disabled. It is synthesized, never cached                     |
| Switching — new args behind old data  | `isSwitching && !hasError`                      | Keep the data, lower its emphasis (dim / muted colours); it belongs to `dataArgs`, not to `args`                                                  |
| Data                                  | `status === 'success'`                          | The content                                                                                                                                      |
| Empty                                 | `dataSource === 'current'` and the data is empty | Replaces the content in Data, Reloading and Invalidation error: `EmptyState` with a *create* intent; with filters active — other copy plus "reset filters" |
| Reloading — `invalidate`, polling     | `isInvalidating && !hasError`                   | Nothing — the data is still valid. A user-initiated reload shows progress on the control that started it (refresh button, pull-to-refresh)       |
| Error, no data                        | `hasError && dataSource === 'none'`             | By consequence — [Error loudness](#error-loudness). Always a retry affordance (`state.retry`)                                                    |
| Error, placeholder on screen          | `hasError && dataSource === 'placeholder'`      | Same as Error, no data — the placeholder is not an answer: hide it, or dim it behind the error                                                   |
| Error, previous args' data            | `hasError && dataSource === 'previous'`         | The error surface for `args`, as above; `data` belongs to `dataArgs`, not to the failed request: dimmed behind the error at most, never shown as the current result |
| Invalidation error — data on screen   | `hasError && dataSource === 'current'`          | Keep the data; a quiet inline notice ("could not refresh") with retry                                                                            |

**Retrying** is not a row of its own: a retry in flight is `isPending && hasError`, and the error rows above match it.
Keep the error surface while it runs and show the retry control as busy (disabled, spinner) — `retry()` keeps `error`
in state for exactly this, so a fast repeat failure does not flicker skeleton → error. `state.invalidate()` clears the
error instead, but only where data is on screen — on Error, no data it warns and does nothing.

"Empty" is the product's rule (`length === 0`, no rows on the page). Only `dataSource: 'current'` data is the answer
for `args`, so an empty placeholder or an empty previous result is not the Empty state.

---

## Suspense

`useSuspenseResource` moves two rows out of the component — the rest return in state and follow the
[resource baseline](#resource-baseline-per-state):

| State                                  | Where it renders                                                                                            |
|----------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Initial load, retry with nothing shown | `<Suspense fallback>` — the skeleton goes there                                                             |
| Error, no data                         | The nearest Error Boundary. `state.retry` is not reachable from it: the retry action is the boundary's reset — the remount refetches the entry instead of rethrowing the cached error |
| Error over placeholder / previous data | Returned in state (`hasError`) — the component renders the error rows itself                                |

Place the boundary pair at the block the error disables, not at the page root — see [Error loudness](#error-loudness).

---

## Infinite feed

`useInfiniteResource` flags are aggregates over pages, not a partition: `isInvalidating` and `isLoadingNext` can be
true at once. Fields — [projection-resource.md](projection-resource.md#infinite-feed-useinfiniteresource).

| State             | Condition                                   | "Default"                                                                                         |
|-------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------|
| Idle              | `isIdle`                                    | As the resource Idle row                                                                          |
| Initial load      | `isInitialLoading`                          | Skeleton for the first page                                                                       |
| First page failed | `hasError && !hasData`                      | Error surface with retry — `feed.invalidate()` retries a failed page keeping the error on screen  |
| Next page loading | `isLoadingNext`                             | A skeleton row / spinner at the tail; loaded pages stay as they are                               |
| A page failed     | `hasError && hasData`                       | Inline notice at the failing page (find it in `pages` — `error` is only the first in page order); retry via `fetchNext(sameArgs)` for the tail, `invalidate()` for the whole feed |
| Reloading         | `isInvalidating`                            | Nothing                                                                                           |
| End of list       | The caller's pager has no next ids          | An end marker or nothing; stop calling `fetchNext` — the hook has no `hasNext`                    |
| Empty             | `hasData && data.length === 0`              | `EmptyState`, as the resource Empty row                                                           |

---

## Mutations

`useCommand` / command clutch state — [writing-mutations.md](writing-mutations.md#command-state). A form built on
`unstable_FormSignal` adds field-level states on top — [forms.md](forms.md).

| State      | Condition                          | "Default"                                                                                                                          |
|------------|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Ready      | `status === 'idle'`                | The control enabled                                                                                                                |
| Running    | `isPending && !hasError`           | Busy state on the control that started it, disabled against a double submit. With `optimisticUpdate` the UI has already changed — no blocking spinner |
| Done       | `hasData` / envelope `success`     | The next step — navigate, close, reset the form. A toast only when the result is not visible otherwise                             |
| Failed     | `status === 'error'`               | Next to the control (form-level message), with retry. After an optimistic update the rollback is silent — tell the user what was undone (toast "could not save …") |
| Retrying   | `isPending && hasError`            | Keep the message, busy retry control; `retry()` reuses the request id, so the backend can deduplicate                              |

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
| Error          | `EmptyState` (error intent): icon, one line, retry; the retry button is busy while retrying             |
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

- ❌ Branching on `status` alone — `pending` merges initial load, placeholder, switching, reloading and retrying, which get different treatments.
- ❌ A full error screen when `hasError && dataSource === 'current'` — the data on screen is still usable.
- ❌ Skeleton on every `isPending` — invalidation and polling would flash the page.
- ❌ Skeleton or spinner for `idle` — nothing is coming until the args are supplied.
- ❌ Swapping the error for a skeleton while retrying — the user loses the context and a fast failure flickers.
- ❌ Treating a placeholder as the server's answer — enabling actions on it, or showing `EmptyState` for an empty one.
- ❌ One `EmptyState` for "no results" and "request failed" — different intent, copy and primary action.
- ❌ A mutation control left enabled while `isPending` — a double submit is a second entry with a new request id.
- ❌ A silent optimistic rollback — the UI reverts and the user believes the change was saved.
- ✅ Decide `invalidate` per product transport; a bus-fed cache does not need it.
