# UI states — what to render per state

For every state a resource, feed, command or form can be in: the condition that detects it, what the user sees, and
what the user can do. Goal: no state leaves the user without an answer to "what is happening" and "what can I do now".

This file owns **UX decisions only**. Flags, method semantics and option shapes live in their reference — follow the
link, do not re-derive them here:

| Mechanics | Reference |
|-----------|-----------|
| State shape, `useResources`, Suspense, timing hooks | [reading-in-react.md](reading-in-react.md) |
| `retry` vs `invalidate`, `mapError`, where a failure surfaces | [error-handling.md](error-handling.md) |
| `links`, lazy invalidation, `invalidateOn` | [cache-and-invalidation.md](cache-and-invalidation.md) |
| Command state, request id | [writing-mutations.md](writing-mutations.md) |
| Feed fields | [projection-resource.md](projection-resource.md#infinite-feed-useinfiniteresource) |
| Form members | [forms.md](forms.md) |

Component names (`Skeleton`, `InlineNotice`, `EmptyState`, `BusyButton`) are placeholders for the project's own — this
document fixes behaviour, not looks.

**Contents:** [Inventory first](#inventory-first) · [Rendering obligations](#rendering-obligations) ·
[Resource](#resource) · [Timing](#timing) · [Making states not happen](#making-states-not-happen) ·
[Several resources](#several-resources) · [Search, filters, tabs](#search-filters-tabs) · [Suspense](#suspense) ·
[Infinite feed](#infinite-feed) · [Error kinds](#error-kinds) · [Error loudness](#error-loudness) ·
[Automatic recovery](#automatic-recovery) · [Mutations](#mutations) · [Forms](#forms) ·
[Optimistic vs invalidate](#optimistic-vs-invalidate) · [Profiles](#profiles) · [Pitfalls](#pitfalls)

---

## Inventory first

Before wiring flags to components, find what the project already has. Common shapes:

- One container that can dim, lock and show an error (`<QueryContainer queries={state}>`);
- Separate parts — `Skeleton`, `ErrorBoundary`, `Dimmer`, `EmptyState`, toasts;
- Router / framework owns pending and error UI (loaders, `errorElement`, Suspense boundaries);
- Other forms, their combinations and associations.

Missing a part the tables below need (an inline notice, a busy state on a button)? Add it to the project's kit once,
not inline per screen.

---

## Rendering obligations

Apply to every row of every table below.

| Concern          | Rule |
|------------------|------|
| Layout stability | A skeleton occupies the box of the content it stands for; a busy control keeps its width; an inline notice pushes content down once, it does not toggle per retry |
| What stays       | Data on screen is never removed by a pending or failed request — only replaced by newer data or an explicit user action |
| User input       | Never lost: a failed submit, a rollback or a remount keeps what the user typed |
| Busy region      | `aria-busy="true"` on the region while it waits for its first data or switches args |
| Announcements    | Background failures (refresh, sync) — `aria-live="polite"`; failure of what the user just did — `role="alert"`; never announce Reloading |
| Focus            | Stays where the user acted: a retry button keeps focus through the retry; after a failed submit — the first invalid field |
| Motion           | Shimmer and spinners respect `prefers-reduced-motion` |
| Copy             | What happened plus what the user can do ("Couldn't load orders. Retry"). Never `String(error)` — map by [kind](#error-kinds) |
| Disabled         | A busy control is `aria-disabled` and ignores activation, so focus is not dropped; a disabled control the user may wonder about carries the reason |

---

## Resource

Rows cover every `useResource` / clutch state and, except Empty, are mutually exclusive — check them in any order.

| State | Condition | Render | User can |
|-------|-----------|--------|----------|
| Idle — args not ready (`SKIP`) | `status === 'idle'` | The prompt that supplies the args ("pick a project"), or no block. Never a skeleton | Supply the args |
| Initial load | `dataSource === 'none' && isPending && !hasError` | Skeleton in the content's shape, after the [skeleton delay](#timing) | Leave — navigation aborts the request |
| Placeholder | `dataSource === 'placeholder' && !hasError` | Content marked as not final; actions needing the server's answer stay disabled | Read; act on nothing server-dependent |
| Switching | `isSwitching && !hasError` | Keep the data, dim it after the [dim delay](#timing); it belongs to `dataArgs`, not `args` | Keep changing args |
| Data | `status === 'success'` | The content | Everything |
| Empty | `dataSource === 'current'` and the data is empty by product rule | `EmptyState` with a *create* intent; with filters active — other copy plus "reset filters" | Create, reset filters |
| Reloading | `isInvalidating && !hasError` | Nothing. A user-initiated reload shows progress on its own control (refresh button, pull-to-refresh) | Everything |
| Error, no data | `hasError && dataSource === 'none'` | By [kind](#error-kinds) and [loudness](#error-loudness), in the content's box | `retry()` if the kind allows |
| Error over placeholder | `hasError && dataSource === 'placeholder'` | As Error, no data — a placeholder is not an answer: hide it or dim it behind the error | Retry |
| Error, previous args' data | `hasError && dataSource === 'previous'` | The error surface for `args`; old data dimmed behind it at most, never shown as the result | Retry, or go back to `dataArgs` |
| Invalidation error | `hasError && dataSource === 'current'` | Keep the data; one quiet notice ("Couldn't refresh · 2 min ago", age from `updatedAt`) with retry | Everything, plus retry |

- **Retrying** is not a row: it is `isPending && hasError`, matched by the error rows. Keep the error surface and make the
  retry control busy — `retry()` keeps `error` for exactly this, so a fast repeat failure does not flicker skeleton →
  error. On Error, no data the action is `retry()`, not `invalidate()` ([why](error-handling.md#retrying)).
- **Empty** is the product's rule (`length === 0`, `null` for "not found"). Only `current` data answers `args`: an empty
  placeholder or previous result is not Empty. A `queryFn` returning `null` gives `hasData: true` — render not-found
  from the data, not as an error.

---

## Timing

Fast responses must not flash intermediate states; slow ones must not look frozen. Starting points, tune per product.

| Moment | Rule | Starting point |
|--------|------|----------------|
| Initial load → skeleton | Nothing (or the empty box) until the load outlasts the delay | 150 ms |
| Skeleton shown → content | Once shown, keep the skeleton for a minimum | 400 ms |
| Switching → dim | Dim only after the delay; a fast switch swaps data without dimming | 150 ms |
| Busy control | Busy at once — proof the click landed | 0 ms |
| Long initial load | A line under the skeleton: "Taking longer than usual…" | 8 s |
| Search input → args | Debounce the args, never the input value | 250 ms |

```tsx
import { useDelayedFlag } from "@fozy-labs/rx-toolkit/react";

const state = orderApi.getOrders.useResource({ status });
const [showSkeleton, isDelaying] = useDelayedFlag(state.isInitialLoading && !state.hasError, { delay: 150, minDuration: 400 });
const [dimmed] = useDelayedFlag(state.isSwitching, { delay: 150 });
```

- A warm cache renders `success` on the first render, so the timers run only on real waits.
- While `isDelaying`, render the empty box — not the Empty branch and not the content.
- While `minDuration` holds the skeleton, the data has already arrived: keep the skeleton until `showSkeleton` drops.

Hook contracts — [reading-in-react.md](reading-in-react.md#timing-hooks).

---

## Making states not happen

The best Initial load is the one the user never sees:

| Lever | rx-toolkit tool | Turns |
|-------|-----------------|-------|
| Warm on intent | `void resource.prefetch(args)` on hover / focus / visible link — [reading-outside-react.md](reading-outside-react.md) | Initial load → Data |
| Detail from the list | `placeholderData` reading the list entry via `getState()` | Initial load → Placeholder |
| Args change | Built in — SWR keeps the previous args' data | Initial load → Switching |
| Back navigation | Entry survives `retentionTime`; raise it for routes users return to | Initial load → Data |
| Server render | SSR snapshot — [ssr-hydration.md](ssr-hydration.md) | Initial load → Data on first paint |
| Instant writes | `optimisticUpdate` — [below](#optimistic-vs-invalidate) | Running → nothing visible |
| Items shared across lists | Projection resource item cache | Initial load → Data for known ids |

A hovered-and-abandoned link costs one request: `prefetch` never rejects and holds the entry only while it waits.

---

## Several resources

One block per resource, each with its own [resource rows](#resource). A failed sidebar does not block the main list;
a slow widget does not hold the page behind one spinner.

| Relation | Render |
|----------|--------|
| Independent (widgets, sidebar) | Each block renders its own rows; the page frame renders at once |
| One needs the other's data for its args | The dependent read takes `SKIP` until the first has data; render its Idle as part of the first's skeleton, not as a prompt |
| One unit (header + body of a card) | `useResources`: any no-data error → error; any initial load → skeleton; else content plus a notice for an invalidation error |
| A list of rows, one request each | `useResources` over an array; each row renders its own `states[i]` — one failed row stays local |

The aggregate `status` is not a render switch ([why](reading-in-react.md#useresourcesslots--several-resources-in-one-hook)):
it is `error` while all data is on screen after one slot's refresh failed, and `pending` while a failed slot retries.
Branch like a single resource:

```tsx
const card = useResources({ user: userApi.getUser.bind({ id }), stats: statsApi.getStats.bind({ id }) });

if (card.hasData) return <Card {...card.data} notice={card.hasError ? card.error : undefined} />;
if (card.hasError) return <ErrorBox error={card.error} onRetry={card.retry} busy={card.isPending} />;
if (card.isPending) return <CardSkeleton />;
return null; // every slot SKIP
```

`error` is only the first failure; when the copy must name the failed part, read `card.states`.

---

## Search, filters, tabs

Args change → SWR: the previous result stays while the new one loads. Each element reads a different source:

| Element | Source | Rule |
|---------|--------|------|
| Input text, selected tab / chip | Local UI state → `args` | Updates on the keystroke / click; never disabled while pending |
| Result list | `data` (belongs to `dataArgs`) | Dimmed while `isSwitching` |
| Result caption ("12 results for …") | `dataArgs` | Describes what is on screen, not what was typed |
| Progress | `isDebouncing \|\| isSwitching` | Small indicator in the input / beside the tabs, not over the list |
| Superseded request | `AbortSignal` in `queryFn` | Forward it to `fetch` — each args change aborts the previous request |
| No results | Empty row, filters active | "Nothing matches 'abc'" plus "reset filters"; not while `isDebouncing` — it would describe the old query |
| Many short-lived keys | `retentionTime` | 30 s or less for search-as-you-type |

```tsx
const [search, setSearch] = useState("");
const q = search.trim();
const [args, isDebouncing, flush] = useDebouncedArgs(q ? { q } : SKIP, { delay: 250 });
const results = searchApi.search.useResource(args);
const [dimmed] = useDelayedFlag(results.isSwitching, { delay: 150 });

<SearchInput value={search} onChange={setSearch} onEnter={flush} busy={isDebouncing || results.isPending} />
{results.hasData && results.dataArgs && (
  <ResultList items={results.data.items} caption={`Results for “${results.dataArgs.q}”`} dimmed={dimmed} />
)}
```

Clearing the input applies `SKIP` at once — no debounce on the way back to the prompt.

---

## Suspense

`useSuspenseResource` / `useSuspenseResources` move two rows out of the component; the rest return in state and
follow [Resource](#resource):

| State | Where it renders |
|-------|------------------|
| Initial load, retry with nothing shown | `<Suspense fallback>` — the skeleton goes there |
| Error, no data | The nearest Error Boundary; its reset is the retry — the remount refetches the entry |
| Error over placeholder / previous data | Returned in state (`hasError`) — the component renders the error rows |

- Place the boundary pair at the block the error disables, not at the page root — see [loudness](#error-loudness). The
  fallback reads the thrown (mapped) error to pick copy and whether to offer the reset.
- A block reading several resources uses one `useSuspenseResources`, not several `useSuspenseResource` calls — those
  waterfall, each request starting only after the previous one resolves.

---

## Infinite feed

Feed flags are aggregates over pages: `isInvalidating` and `isLoadingNext` can be true at once.

| State | Condition | Render | User can |
|-------|-----------|--------|----------|
| Idle | `isIdle` | As the resource Idle row | Supply the args |
| Initial load | `isInitialLoading` | Skeleton for the first page | Leave |
| First page failed | `hasError && !hasData` | Error surface; `feed.invalidate()` retries keeping the error on screen | Retry |
| Next page loading | `isLoadingNext` | A skeleton row at the tail; loaded pages stay | Keep scrolling and reading |
| A page failed | `hasError && hasData` | Inline notice at the failing page (find it in `pages`; `error` is only the first) | `fetchNext(sameArgs)` for the tail, `invalidate()` for the feed |
| Reloading | `isInvalidating` | Nothing | Everything |
| End of list | The caller's pager has no next ids | An end marker or nothing; stop calling `fetchNext` — the hook has no `hasNext` | — |
| Empty | `hasData && data.length === 0` | As the resource Empty row | Create, reset filters |

An auto-loading sentinel (`IntersectionObserver` at the tail) must stop while the tail page is in error: there
`fetchNext` is a retry, so a visible sentinel becomes a retry loop. Resume on the user's retry.

---

## Error kinds

The kind decides the copy and whether retry is offered; [loudness](#error-loudness) decides where it shows. Kinds come
from a total `mapError` ([error-handling.md](error-handling.md)) with a literal `kind` the UI switches on. Example for
one REST api (not yours):

| Kind | Typical source | Retry | Copy and action |
|------|----------------|-------|-----------------|
| `offline` / `network` | `fetch` rejects with `TypeError` | Yes, and [automatically](#automatic-recovery) on reconnect | "You're offline — we'll retry when you're back" / "Couldn't reach the server" |
| `timeout`, `server` (5xx) | Timeout, 500–504 | Yes | "Something went wrong on our side" |
| `rate-limited` | 429 | After `Retry-After` — the control counts down | "Too many requests — retrying in 12 s" |
| `unauthenticated` | 401 | No — the transport refreshes auth or redirects, keeping the return location | Never a block error |
| `forbidden` | 403 | No | "You don't have access to …" plus who to ask; no retry button |
| `not-found` | 404, or `null` data | No | Not-found state with a way out |
| `conflict` | 409 on a mutation | No — reload the entity | "Changed by someone else" plus reload / review; keep the input to reapply |
| `validation` | 422 on a mutation | No — fix and resubmit | Into the form's fields — [Forms](#forms) |
| `contract` | Response fails the schema | No | "This page is out of date" plus reload; report it |
| `superseded` | `CacheEntryRemovedError` | — | Nothing: a newer run or a reset replaced it |

Aborted runs never reach the state. **Escalation:** after two failed manual retries in a row (starting point) keep
"Retry" and add a second path — reload, or contact support with a trace id carried on the mapped error. Report from
`onQueryError`, not from the component.

---

## Error loudness

Pick by the consequence for the user's task, not by the exception type:

| Consequence | Surface |
|-------------|---------|
| Cosmetic — a secondary block is missing | Inline label / icon with retry, no interruption |
| The block's task is blocked, the page is not | `EmptyState` with an error intent + retry, or a banner above the stale data |
| Something the user did not initiate failed (refresh, sync) | Nothing beyond the inline notice when data stays; a toast only when nothing on screen shows it |
| Something the user just did failed | Next to the control that did it — [Mutations](#mutations) |
| The page cannot continue | Modal / Error Boundary with retry or "reload the page" |

One failure, one surface: an inline notice and a toast for the same refresh is noise. Transport-level states (offline,
signing in again) use one app-wide banner, not a notice in every block.

---

## Automatic recovery

`invalidateOn` ([mechanics](cache-and-invalidation.md#automatic-revalidation--invalidateon)) refetches without the user.
A held failed entry is retried with the error kept on screen, so the error rows above stay valid while it runs.

| Data | Policy (starting point) |
|------|-------------------------|
| Dashboards, lists users come back to | api default `{ focus: 30_000, reconnect: true }` |
| Data that is stale within seconds (prices, statuses) | Resource `interval`; stop it at a final state: `interval: (_, s) => (s.hasData && s.data.done ? false : 5_000)` |
| Fed by a bus / stream | `invalidateOn: false` — events already patch it; a refetch per focus multiplies load |
| Expensive or rarely changing (settings, reference data) | Nothing, or an age rule: `focus: (_, s) => s.updatedAt === null \|\| Date.now() - s.updatedAt > 300_000` |

- `focus: true` fires on **every** `blur → focus` of the window — devtools, an iframe, a native file dialog. Prefer a
  threshold (ms away) or an `updatedAt` age rule over `true`.
- Every error kind is retried. Skip kinds retrying cannot fix: `reconnect: (_, s) => !s.hasError || RETRYABLE.has((s.error as AppError).kind)`.
- An unheld entry is only marked — it refetches when shown again; nothing loads for screens the user cannot see.
- The "Couldn't refresh · 2 min ago" notice reads `updatedAt`; an automatic refetch does not announce itself.

---

## Mutations

Command state — [writing-mutations.md](writing-mutations.md#command-state). A form on `unstable_FormSignal` has its own
table — [Forms](#forms).

| State | Condition | Render | User can |
|-------|-----------|--------|----------|
| Ready | `status === 'idle'` | The control enabled | Act |
| Running | `isPending && !hasError` | Busy on the control that started it, guarded against a double submit; every other control stays usable | Keep working elsewhere |
| Running, optimistic | `isPending`, link has `optimisticUpdate` | The result already on screen, no spinner. Mark it unconfirmed only where a refusal is meaningful (a sent message: "sending…") | Keep working |
| Done | envelope `success` | The next step — navigate, close, reset. A toast only when the result is not visible otherwise | Continue |
| Failed | `status === 'error'`, kind not `superseded` | Next to the control, by [kind](#error-kinds), with retry when retryable | Retry, edit, cancel |
| Failed after optimistic | as Failed, link had `optimisticUpdate` | The rollback is silent — say what was undone at the item ("Couldn't archive · Retry") | Retry |
| Retrying | `isPending && hasError` | Keep the message, busy retry control; `retry()` reuses the request id | Wait |
| Superseded | `error.kind === 'superseded'` | Nothing — the hook already follows the newer run | — |

| Control | Hook placement |
|---------|----------------|
| One action on the screen (save, pay) | `useCommand()` beside the control |
| Same action per row (archive, toggle) | `useCommand(\`archive/${id}\`)` inside the row — only that row goes busy |
| Started in one place, shown in another | A named `entryKey` shared by both hooks |

| Destructive action | Pattern |
|--------------------|---------|
| Reversible (archive, move, hide) | No confirmation; act at once, "Undo" in a toast; undo is the inverse command |
| Deferrable (delete with a grace period) | Hide locally, "Deleted · Undo" for the window, `execute` when it closes |
| Irreversible (permanent delete, payment) | Confirmation naming the object; the confirm button goes busy; the dialog closes on success, stays open with the error on failure |

A create action whose optimistic item disappears on rollback loses what the user wrote — put the input back, or keep
the failed item locally with "Not sent · Retry".

---

## Forms

Root and field members — [forms.md](forms.md).

| State | Condition | Render | User can |
|-------|-----------|--------|----------|
| Edit form loading | The source resource has no data | Skeleton of the form; a create form renders at once | Leave |
| Edit form, source failed | Source in Error, no data | Error surface in the form's box with retry; never an empty form that would save blanks | Retry |
| Field invalid | `field.visibleErrors.length > 0` | Message under the field, `aria-invalid`, `aria-describedby` | Fix |
| Field checking | `field.isPending` | Small indicator; the field stays editable | Keep typing, submit |
| Submitting | `root.isSubmitting` | Busy submit button; fields stay editable — edits in flight stay draft | Edit |
| Rejected by validation | `submit()` → `false` | Errors on every field; focus the first `[aria-invalid="true"]`; a summary on a long form | Fix and resubmit |
| Server field errors | Issues on fields after a failed submit | As validation errors; each clears when its field changes | Fix and resubmit |
| Server form error | `form.ownIssues$()` non-empty | Above the submit button, `role="alert"` | Resubmit — same request id |
| Done | `submit()` → `true` | The next step: navigate, close, "Saved"; a create form calls `form.initialize()` | Continue |
| Unsaved changes | `root.isDirty` | Guard leaving (router block / `beforeunload`) | Save, discard, stay |

The submit button stays enabled while invalid (`canSubmit` is only `!isSubmitting`): a click reveals what is wrong
instead of a dead button.

---

## Optimistic vs invalidate

Mechanics — [cache-and-invalidation.md](cache-and-invalidation.md#links--wiring-a-command-to-resources).

| Decision | Baseline | Choose otherwise when |
|----------|----------|-----------------------|
| `optimisticUpdate` | On — the UI changes the moment the user acts | The server computes the result, or a refusal is likely and costly to explain (payments) |
| `invalidate` | By transport and load, not habit | REST-only: **on** — the server is the source of truth. WS / event bus: **off** — the bus patches entries; a refetch per mutation multiplies load |
| `retentionTime` | 60 000 ms | Search-as-you-type: 30 s or less. Routes users return to: longer. A function can evict failed entries at once |

---

## Profiles

Two real placements — the same flags, different decisions.

### Searchable list in a high-load messenger

| Decision | Implementation |
|----------|----------------|
| Initial load | `Skeleton` instead of the list, after the skeleton delay |
| Error | `EmptyState` (error intent): icon, one line by kind, retry; the retry button is busy while retrying |
| Invalidation error | Banner above the list: "Couldn't refresh" |
| Empty | `EmptyState` (create intent); with filters active — other copy plus "reset filters"; nothing while debouncing |
| Reloading | Not shown |
| Switching | The list dims after the dim delay; the search input never locks |
| Input | `useDebouncedArgs(q ? { q } : SKIP, { delay: 250 })`; Enter calls `flush()` |
| Mutations | Patch entries, never `invalidate` — the bus is the source of updates; a failed send keeps the message as "Not sent · Retry" |
| Live updates | `onCacheEntryAdded`: subscribe to the topic on the WS client, patch the entry until `$cacheEntryRemoved` |
| Revalidation | `invalidateOn: false` — the bus keeps entries fresh; a refetch on focus only adds load |
| Cache lifetime | `retentionTime: 30_000` — active search creates many keys |

### KPI widget with group settings

| Decision | Implementation |
|----------|----------------|
| Initial load | `<Suspense>` fallback: `Skeleton` |
| Error | Error Boundary with retry, copy by kind |
| Invalidation error | Returned in state, not thrown: icon in the widget corner, data age (`updatedAt`) in its tooltip |
| Reloading | Faint spinner in the corner |
| Settings change | `invalidate` on the settings command — the widget's entry is held, so the refetch fires at once |
| Polling | `invalidateOn: { interval: 30_000, reconnect: true }` — pauses while unmounted, hidden or offline ([cache-and-invalidation.md](cache-and-invalidation.md#automatic-revalidation--invalidateon)) |
| Switching | Unreachable — the widget is remounted per id, so a new id is an initial load |

```tsx
<ErrorBoundary fallback={WidgetError}>
  <Suspense fallback={<Skeleton />}>
    <Widget key={id} widgetId={id} />
  </Suspense>
</ErrorBoundary>
// inside Widget:
const state = widgetApi.getWidget.useSuspenseResource({ widgetId });
```

---

## Pitfalls

- ❌ Branching on `status` alone — `pending` merges initial load, placeholder, switching, reloading and retrying.
- ❌ `useResources` rendered by aggregate `status` — `error` hides data after one slot's refresh failed; `pending` swaps the error for a loader during a retry.
- ❌ A full error screen on `hasError && dataSource === 'current'` — the data is still usable.
- ❌ Skeleton on every `isPending`, or the instant a load starts — refreshes flash; delay it, then hold it a minimum.
- ❌ Skeleton or spinner for `idle` — nothing comes until the args are supplied.
- ❌ Swapping the error for a skeleton while retrying.
- ❌ Treating a placeholder as the answer — enabling actions on it, or `EmptyState` for an empty one.
- ❌ "No results" while the input is still debouncing — it describes the previous query.
- ❌ One `EmptyState` for "no results" and "request failed".
- ❌ A retry button on `forbidden`, `not-found`, `validation` or `contract`; showing a `superseded` failure.
- ❌ One spinner for the whole page over independent blocks; several `useSuspenseResource` in one block (waterfall).
- ❌ Disabling the search input or the tabs while results load.
- ❌ One `useCommand` for a list of rows — key it per row.
- ❌ A mutation control enabled while `isPending` — a double submit is a second entry with a new request id.
- ❌ A silent optimistic rollback; a rollback or failed submit that throws away the input.
- ❌ A submit button disabled while the form is invalid.
- ❌ An auto-loading feed sentinel active on a failed tail page — a retry loop.
- ❌ Hand-rolled focus / reconnect listeners in an api-wide `onCacheEntryAdded` — it also runs for commands; use `invalidateOn`.
- ❌ `focus: true` on expensive resources — devtools and file dialogs refetch them.
- ✅ Decide `invalidate` and `invalidateOn` per product transport; a bus-fed cache needs neither.
- ✅ Prefetch on intent and placeholder from the list before reaching for a faster skeleton.
