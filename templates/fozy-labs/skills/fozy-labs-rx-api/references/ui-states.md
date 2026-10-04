# UI states — what to render per state

The path from rx-toolkit state to UX: for every state a resource, feed, command or form can be in — the condition that
detects it, what the user sees, and what the user can do. Goal: no state leaves the user without an answer to
"what is happening" and "what can I do now", including the abnormal ones.

The tables are the reference; enter from any column. Code examples show only the non-obvious wiring. Component names
in them (`Skeleton`, `InlineNotice`, `EmptyState`, `BusyButton`, `toast`) are placeholders for the project's own —
this document fixes behaviour, not looks.

**Contents:** [Inventory first](#inventory-first) · [Rendering obligations](#rendering-obligations) ·
[Resource: baseline per state](#resource-baseline-per-state) · [Timing](#timing) ·
[Making states not happen](#making-states-not-happen) · [Several resources on one screen](#several-resources-on-one-screen) ·
[Search, filters, tabs](#search-filters-tabs) · [Suspense](#suspense) · [Infinite feed](#infinite-feed) ·
[Live data](#live-data) · [Error kinds](#error-kinds) · [Error loudness](#error-loudness) ·
[Recovery without the user](#recovery-without-the-user) · [Mutations](#mutations) · [Forms](#forms) ·
[Links: optimistic vs invalidate](#links-optimistic-vs-invalidate) · [Profiles](#profiles) · [Pitfalls](#pitfalls)

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

| Concern          | Rule                                                                                                                                                         |
|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Layout stability | A skeleton occupies the box of the content it stands for; a busy control keeps its width (spinner replaces the label or sits beside it in reserved space); an inline notice pushes content down once, it does not toggle per retry |
| What stays       | Data on screen is never removed by a pending or failed request — only replaced by newer data or by an explicit user action                                   |
| User input       | Never lost: a failed submit, a rollback or a remount keeps what the user typed                                                                               |
| Busy region      | `aria-busy="true"` on the region while it waits for its first data or switches args                                                                          |
| Announcements    | Background failures (refresh, sync) — `aria-live="polite"`; failure of something the user just did — `role="alert"`; never announce Reloading               |
| Focus            | Stays where the user acted: a retry button keeps focus through the retry; after a failed submit — the first invalid field                                    |
| Motion           | Shimmer and spinners respect `prefers-reduced-motion`                                                                                                        |
| Copy             | What happened plus what the user can do ("Couldn't load orders. Retry"). Never `String(error)` — map by [error kind](#error-kinds)                            |
| Disabled         | A busy control is `aria-disabled` and ignores activation, so focus is not dropped; a disabled control that the user may wonder about carries the reason       |

---

## Resource: baseline per state

Flags are the [state shape](reading-in-react.md#the-state-shape); which failure sits in `error` is in
[error-handling.md](error-handling.md#where-a-failure-shows-up). The conditions cover every `useResource` / clutch
state and, except Empty, are mutually exclusive, so the rows can be checked in any order.

| State                                 | Condition                                         | Render                                                                                                                                        | User can                                     |
|---------------------------------------|---------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------|
| Idle — args not ready (`SKIP`)        | `status === 'idle'`                               | Not a loading state: the prompt that supplies the args ("pick a project"), or no block at all. Never a skeleton                              | Supply the args                              |
| Initial load                          | `dataSource === 'none' && isPending && !hasError` | Skeleton in the shape of the content, after the [skeleton delay](#timing)                                                                    | Leave — navigation aborts the request        |
| Placeholder                           | `dataSource === 'placeholder' && !hasError`       | Render as content, marked as not final: actions that need the server's answer stay disabled. It is synthesized, never cached                 | Read; act on nothing server-dependent        |
| Switching — new args behind old data  | `isSwitching && !hasError`                        | Keep the data, lower its emphasis (dim / muted colours) after the [dim delay](#timing); it belongs to `dataArgs`, not to `args` — see [Search, filters, tabs](#search-filters-tabs) | Keep changing args — each change aborts the previous request |
| Data                                  | `status === 'success'`                            | The content                                                                                                                                   | Everything                                   |
| Empty                                 | `dataSource === 'current'` and the data is empty  | Replaces the content in Data, Reloading and Invalidation error: `EmptyState` with a *create* intent; with filters active — other copy plus "reset filters" | Create, or reset filters               |
| Reloading — `invalidate`, polling     | `isInvalidating && !hasError`                     | Nothing — the data is still valid. A user-initiated reload shows progress on the control that started it (refresh button, pull-to-refresh)   | Everything                                   |
| Error, no data                        | `hasError && dataSource === 'none'`               | By [kind](#error-kinds) and [consequence](#error-loudness), in the content's box                                                             | Retry — `state.retry()` — if the kind allows |
| Error, placeholder on screen          | `hasError && dataSource === 'placeholder'`        | Same as Error, no data — the placeholder is not an answer: hide it, or dim it behind the error                                               | Retry                                        |
| Error, previous args' data            | `hasError && dataSource === 'previous'`           | The error surface for `args`, as above; `data` belongs to `dataArgs`, not to the failed request: dimmed behind the error at most, never shown as the current result | Retry, or go back to `dataArgs`  |
| Invalidation error — data on screen   | `hasError && dataSource === 'current'`            | Keep the data; a quiet inline notice ("couldn't refresh · 2 min ago") with retry, age from the entry's `updatedAt`                          | Everything, plus retry                       |

**Retrying** is not a row of its own: a retry in flight is `isPending && hasError`, and the error rows above match it.
Keep the error surface while it runs and show the retry control as busy — `retry()` keeps `error` in state for exactly
this, so a fast repeat failure does not flicker skeleton → error. `state.invalidate()` clears the error instead, but
only where data is on screen — on Error, no data it warns and does nothing.

"Empty" is the product's rule (`length === 0`, no rows on the page, `null` for "not found"). Only
`dataSource: 'current'` data is the answer for `args`, so an empty placeholder or an empty previous result is not the
Empty state. A `queryFn` that returns `null` for "not found" gives `hasData: true` — render a not-found state from the
data, not an error.

---

## Timing

Fast responses must not flash intermediate states; slow ones must not look frozen. The numbers are starting points
to tune per product, not norms.

| Moment                                  | Rule                                                                                     | Starting point |
|-----------------------------------------|------------------------------------------------------------------------------------------|----------------|
| Initial load → skeleton                 | Render nothing (or the empty box) until the load outlasts the delay                      | 150 ms         |
| Skeleton shown → content                | Once shown, keep the skeleton for a minimum, so it does not blink                        | 400 ms         |
| Switching → dim                         | Dim only after the delay; a fast switch swaps data without dimming                       | 150 ms         |
| Busy control                            | Busy state at once — the user needs proof the click landed                               | 0 ms           |
| Long initial load                       | Add a line under the skeleton: "Taking longer than usual…"                               | 8 s            |
| Search input → args                     | Debounce the args, never the input value                                                 | 250 ms         |

A warm cache renders `success` synchronously on the first render, so these timers only run on real network waits.

```tsx
import { useDelayedFlag } from "@shared/react";


const state = orderApi.getOrders.useResource({ status });
const showSkeleton = useDelayedFlag(state.isInitialLoading && !state.hasError, 150, 400);
const dimmed = useDelayedFlag(state.isSwitching, 150);
```

While the minimum-visibility timer holds the skeleton, the data has already arrived — keep rendering the skeleton
until `showSkeleton` drops, then the content.

---

## Making states not happen

The best Initial load is the one the user never sees. Each lever turns a waiting state into a better row:

| Lever                          | rx-toolkit tool                                                                                 | Turns                               |
|--------------------------------|-------------------------------------------------------------------------------------------------|-------------------------------------|
| Warm on intent                 | `resource.prefetch(args)` on hover / focus / visible link — [reading-outside-react.md](reading-outside-react.md) | Initial load → Data         |
| Detail from the list           | `placeholderData` reading the list entry via `getState()` — [reading-in-react.md](reading-in-react.md#the-state-shape) | Initial load → Placeholder |
| Args change                    | Built in — SWR keeps the previous args' data                                                    | Initial load → Switching            |
| Back navigation                | Entry survives `retentionTime` after unmount; raise it for routes users return to               | Initial load → Data (+ Reloading if invalidated) |
| Server render                  | SSR snapshot — [ssr-hydration.md](ssr-hydration.md)                                             | Initial load → Data on first paint  |
| Instant writes                 | `optimisticUpdate` — [Links](#links-optimistic-vs-invalidate)                                   | Running → nothing visible           |
| Items shared across lists      | Projection resource item cache — [projection-resource.md](projection-resource.md)               | Initial load → Data for known ids   |

```tsx
// List row: warm the detail before the click lands
<Link to={`/orders/${order.id}`} onPointerEnter={() => void orderApi.getOrder.prefetch({ id: order.id })}>

// Detail resource: show the list's copy while the full order loads
getOrder = api.createResource({
  queryFn: ({ id }: { id: string }, signal) => fetchOrder(id, signal),
  placeholderData: ({ id }) => {
    const row = this.getOrders.getState({ status: "all" }).data?.items.find((o) => o.id === id);
    return row ? { data: toPartialOrder(row) } : null;
  },
});
```

`prefetch` never rejects and holds the entry only while it waits, so a hovered-and-abandoned link costs one request
and is collected after `retentionTime`.

---

## Several resources on one screen

One block per resource, each with its own state from the [baseline](#resource-baseline-per-state). A failed sidebar
does not block the main list; a slow widget does not hold the page behind one spinner.

| Relation between the data                      | Render                                                                                       |
|------------------------------------------------|----------------------------------------------------------------------------------------------|
| Independent (dashboard widgets, sidebar)       | Each block renders its own row; the page frame renders at once                               |
| One needs the other's data for its args        | The dependent read takes `SKIP` until the first has data; its Idle row renders as the first's skeleton, not as a prompt |
| Rendered as one unit (header + body of a card) | Combine: any no-data error → error; any Initial load → skeleton; else content. Retry calls `retry()` on every failed state |

```tsx
const user = userApi.getUser.useResource({ id });
const orders = orderApi.getOrders.useResource(user.hasData ? { customerId: user.data.customerId } : SKIP);
```

---

## Search, filters, tabs

Args change → SWR: the user keeps seeing the previous result while the new one loads. Each element reads a
different source:

| Element                                | Source                       | Rule                                                                                  |
|----------------------------------------|------------------------------|---------------------------------------------------------------------------------------|
| Input text, selected tab / chip        | Local UI state → `args`      | Updates on the keystroke / click; never disabled while pending                         |
| Result list                            | `data` (belongs to `dataArgs`) | Dimmed while `isSwitching`                                                          |
| Result caption ("12 results for …")    | `dataArgs`                   | Describes what is on screen, not what was typed                                       |
| Progress                               | `isSwitching`                | Small indicator in the input / beside the tabs, not over the list                     |
| Superseded request                     | `AbortSignal` in `queryFn`   | Forward it to `fetch` — each args change aborts the previous request                 |
| No results                             | Empty row with filters active | "Nothing matches 'abc'" plus "reset filters" / suggestions                           |
| Many short-lived keys                  | `retentionTime`              | 30 s or less for search-as-you-type                                                   |

```tsx
const [searchString, setSearchString] = useState("");
const debounced = useDebouncedValue(searchString.trim(), 250);
const results = searchApi.search.useResource(debounced ? { q: debounced } : SKIP);
const dimmed = useDelayedFlag(results.isSwitching, 150);

<SearchInput value={searchString} onChange={setSearchString} busy={results.isSwitching || results.isInitialLoading} />
{results.hasData && results.dataArgs && (
  <ResultList items={results.data.items} caption={`Results for “${results.dataArgs.q}”`} dimmed={dimmed} />
)}
```

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
The boundary's fallback follows [Error kinds](#error-kinds) like any other error surface: it reads the thrown error
(the `mapError` output) to pick copy and whether "Retry" (the reset) is offered.

---

## Infinite feed

`useInfiniteResource` flags are aggregates over pages, not a partition: `isInvalidating` and `isLoadingNext` can be
true at once. Fields — [projection-resource.md](projection-resource.md#infinite-feed-useinfiniteresource).

| State             | Condition                                   | Render                                                                                            | User can                       |
|-------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------|--------------------------------|
| Idle              | `isIdle`                                    | As the resource Idle row                                                                          | Supply the args                |
| Initial load      | `isInitialLoading`                          | Skeleton for the first page                                                                       | Leave                          |
| First page failed | `hasError && !hasData`                      | Error surface with retry — `feed.invalidate()` retries a failed page keeping the error on screen  | Retry                          |
| Next page loading | `isLoadingNext`                             | A skeleton row at the tail; loaded pages stay as they are                                         | Keep scrolling and reading     |
| A page failed     | `hasError && hasData`                       | Inline notice at the failing page (find it in `pages` — `error` is only the first in page order) | Retry: `fetchNext(sameArgs)` for the tail, `invalidate()` for the whole feed |
| Reloading         | `isInvalidating`                            | Nothing                                                                                           | Everything                     |
| End of list       | The caller's pager has no next ids          | An end marker or nothing; stop calling `fetchNext` — the hook has no `hasNext`                    | —                              |
| Empty             | `hasData && data.length === 0`              | `EmptyState`, as the resource Empty row                                                           | Create, reset filters          |

An auto-loading sentinel (`IntersectionObserver` at the tail) must stop while the tail page is in error: on a failed
page `fetchNext` is a retry, so a visible sentinel turns into a retry loop. Resume on the user's retry.

---

## Live data

A stream `queryFn` ([stream-queries.md](stream-queries.md)) maps onto the resource rows:

| Stream moment                     | Resource row                    | Render                                                                            |
|-----------------------------------|---------------------------------|-----------------------------------------------------------------------------------|
| Waiting for the first emission    | Initial load                    | Skeleton                                                                          |
| Emitting                          | Data                            | Content; new items appear without moving what the user is reading (anchor the scroll) |
| Failed before any emission        | Error, no data                  | As that row                                                                       |
| Failed after data                 | Invalidation error              | Data stays, plus a "live updates paused" indicator; `retry()` resubscribes        |
| Completed                         | Data                            | Content, no longer live; indicate only if the product promises liveness           |
| Hydrated from SSR / another tab   | Data, not live                  | Same as Completed until an `invalidate()` subscribes                              |

Reconnect with backoff inside `queryFn` (an RxJS `retry({ delay })` on the observable) so a transient drop never
reaches the state; the paused indicator is for drops that outlast it.

---

## Error kinds

The kind decides the copy and whether retry is offered at all; [loudness](#error-loudness) decides where it shows.
Kinds come from `mapError` ([error-handling.md](error-handling.md)) — give each a literal `kind` so the UI switches on
it. Examples for one specific REST api (not your project):

| Kind                         | Typical source                         | Retry                             | Copy and action                                                                                   |
|------------------------------|----------------------------------------|-----------------------------------|---------------------------------------------------------------------------------------------------|
| `offline` / `network`        | `fetch` rejects with `TypeError`       | Yes, and [automatically](#recovery-without-the-user) on reconnect | "You're offline — we'll retry when you're back" / "Couldn't reach the server"       |
| `timeout`, `server` (5xx)    | Timeout, 500–504                       | Yes                               | "Something went wrong on our side"                                                                |
| `rate-limited`               | 429                                    | After `Retry-After` — retry control counts down | "Too many requests — retrying in 12 s"                                              |
| `unauthenticated`            | 401                                    | No — the transport refreshes auth or redirects to sign-in, keeping the return location | Never shown as a block error                         |
| `forbidden`                  | 403                                    | No                                | "You don't have access to …" plus who to ask / request access; no retry button                     |
| `not-found`                  | 404, or `null` data                    | No                                | Not-found state with a way out (back to the list, search)                                          |
| `conflict`                   | 409 on a mutation                      | No — reload the entity            | "Changed by someone else" plus reload / review; keep the user's input to reapply                   |
| `validation`                 | 422 on a mutation                      | No — fix and resubmit             | Into the form's fields — [Forms](#forms)                                                           |
| `contract`                   | Response fails the schema              | No                                | "This page is out of date" plus reload page; report it                                             |
| `superseded`                 | `CacheEntryRemovedError`               | —                                 | Nothing: a newer run of the same key or a reset replaced it                                       |

Aborted runs never reach the state — nothing to render.

```ts
export const api = createApi({
  plugins: [reactHooksPlugin()],
  mapError: (error) => {
   // ...
  },
});

const RETRYABLE = // ...
```

**Escalation.** A retry that keeps failing can change the offer, example: after two failed manual retries in a
row (starting point) keep "Retry" and add a second path — reload the page, contact support with an error reference
(a trace id from the response, carried on `AppError`). Report through ls-hooks not from the component.

---

## Error loudness

Pick by the consequence for the user's task, not by the exception type:

| Consequence                                                        | Surface                                                     |
|--------------------------------------------------------------------|-------------------------------------------------------------|
| Cosmetic — a secondary block is missing                            | Inline label / icon with retry, no interruption             |
| The block's task is blocked, the page is not                       | `EmptyState` with an error intent + retry, or a banner above the stale data |
| Something the user did not initiate failed (refresh, background sync) | Toast, or nothing beyond the inline notice when the data stays on screen |
| Something the user just did failed                                 | Next to the control that did it — [Mutations](#mutations)   |
| The page cannot continue                                           | Modal / `ErrorBoundary` with retry or "reload the page"     |

One failure, one surface: an inline notice and a toast for the same refresh is noise. Transport-level states — offline,
signing in again — can use one app-wide banner, not a notice in every block.

---

## Example ls-hook: Recovery without the user

Strategy and implementation may vary greatly from project to project,
    this is just one example.

```ts
const STALE_ON_RETURN_MS = 60_000; // starting point

export const reviveOnReturn = async <A, D>(_args: A, { entry, $cacheEntryRemoved }: TCacheEntryAddedContext<A, D>) => {
  const onOnline = () => {
    const s = entry.peek();
    if (!entry.isMelting && (s.status === "error" || s.status === "invalidate-error")) entry.retry();
  };
  const onVisible = () => {
    const s = entry.peek();
    if (document.visibilityState === "visible" && s.status === "success" && Date.now() - s.updatedAt > STALE_ON_RETURN_MS)
      entry.invalidate(); // an unheld entry is only marked — it refetches when shown again
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  await $cacheEntryRemoved;
  window.removeEventListener("online", onOnline);
  document.removeEventListener("visibilitychange", onVisible);
};

getOrders = api.createResource({ key: "orders", queryFn: fetchOrders, onCacheEntryAdded: [reviveOnReturn] });
```

---

## Mutations

`useCommand` / command clutch state — [writing-mutations.md](writing-mutations.md#command-state). A form built on
`unstable_FormSignal` has its own table — [Forms](#forms).

| State                   | Condition                              | Render                                                                                                                             | User can                       |
|-------------------------|----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|--------------------------------|
| Ready                   | `status === 'idle'`                    | The control enabled                                                                                                                | Act                            |
| Running                 | `isPending && !hasError`               | Busy state on the control that started it, guarded against a double submit; every other control stays usable                      | Keep working elsewhere         |
| Running, optimistic     | `isPending`, link has `optimisticUpdate` | The result is already on screen; no spinner. Mark the item as unconfirmed only where the server can meaningfully refuse (a sent message: "sending…"), not for toggles | Keep working         |
| Done                    | `hasData` / envelope `success`         | The next step — navigate, close, reset the form. A toast only when the result is not visible otherwise                             | Continue                       |
| Failed                  | `status === 'error'`, kind not `superseded` | Next to the control, by [kind](#error-kinds), with retry when retryable                                                       | Retry, edit, cancel            |
| Failed after optimistic | as Failed, link had `optimisticUpdate` | The rollback is automatic and silent — say what was undone at the item ("Couldn't archive · Retry"), toast only if the item left the screen | Retry                  |
| Retrying                | `isPending && hasError`                | Keep the message, busy retry control; `retry()` reuses the request id, so the backend can deduplicate                              | Wait                           |
| Superseded              | envelope error, `kind === 'superseded'` | Nothing — the hook already follows the newer run                                                                                  | —                              |

Where the state lives decides which control goes busy:

| Control                                    | Hook placement                                                                     |
|--------------------------------------------|------------------------------------------------------------------------------------|
| One action on the screen (save, pay)       | `useCommand()` beside the control                                                  |
| Same action per row (archive, toggle)      | `useCommand(\`archive/${id}\`)` inside the row component — only that row goes busy |
| Started in one place, shown in another     | A named `entryKey` shared by both hooks                                            |

```tsx
function OrderRow({ order }: { order: Order }) {
  const [archive, state] = orderApi.archiveOrder.useCommand(`archive/${order.id}`);
  const failed = state.hasError && state.error.kind !== "superseded" ? state.error : null;

  return (
    <Row muted={state.isPending}>
      <OrderSummary order={order} />
      <BusyButton busy={state.isPending} onClick={() => void archive({ id: order.id })}>Archive</BusyButton>
      {failed && (
        <InlineNotice tone="error" role="alert">
          {describe(failed)}
          {RETRYABLE.has(failed.kind) && <BusyButton busy={state.isPending} onClick={state.retry}>Retry</BusyButton>}
        </InlineNotice>
      )}
    </Row>
  );
}
```

Destructive actions:

| Reversible?                                  | Pattern                                                                                                     |
|----------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Yes (archive, move, hide)                    | No confirmation; act at once, offer "Undo" in a toast; undo is the inverse command                          |
| Deferrable (delete with a grace period)      | Hide the item locally, show "Deleted · Undo" for the window, `execute` when it closes; undo just unhides    |
| No (permanent delete, payment)               | Confirmation naming the object ("Delete project Atlas?"), the confirm button goes busy, the dialog closes on success and stays open with the error on failure |

A create action whose optimistic item disappears on rollback loses what the user wrote — put the input back (composer,
form) or keep the failed item locally with "Not sent · Retry".

---

## Forms

Root and field members — [forms.md](forms.md). Read the root with `useSignal(form.state$)`, a field with
`useSignal(form.fields.x$)`.

| State                         | Condition                                              | Render                                                                                                | User can                      |
|-------------------------------|--------------------------------------------------------|-------------------------------------------------------------------------------------------------------|-------------------------------|
| Edit form loading             | The source resource has no data                        | Skeleton of the form; a create form renders at once                                                   | Leave                         |
| Edit form, source failed      | Source resource in Error, no data                      | Error surface in the form's box with retry; never an empty form that would save blanks               | Retry                         |
| Field invalid                 | `field.visibleErrors.length > 0`                       | Message under the field, `aria-invalid`, `aria-describedby` to the message                            | Fix                           |
| Field checking                | `field.isPending`                                      | Small indicator in the field; the field stays editable                                                | Keep typing, submit           |
| Submitting                    | `root.isSubmitting`                                    | Busy submit button; fields stay editable — edits made in flight stay draft                            | Edit                          |
| Rejected by validation        | `submit()` → `false`, `root.status === 'invalid'`      | Errors visible on every field; focus the first invalid one; on a long form a summary at the top       | Fix and resubmit              |
| Server field errors           | After a failed submit, issues on fields                | Under the fields, as validation errors; each clears when its field changes                            | Fix and resubmit              |
| Server form error             | `form.ownIssues$()` non-empty                          | Above the submit button, `role="alert"`                                                               | Resubmit — `submit()` retries with the same request id |
| Done                          | `submit()` → `true`                                    | The next step: navigate, close, inline "Saved"; a create form calls `form.initialize()`              | Continue                      |
| Unsaved changes               | `root.isDirty`                                         | Guard leaving (router block / `beforeunload`); optionally "Unsaved changes" near the submit button   | Save, discard, stay           |

The submit button is enabled while invalid: `canSubmit` is only `!isSubmitting` by design, so a click reveals what is
wrong instead of a dead button.

```tsx
function SubmitBar({ form }: { form: FormInstance<typeof ProfileForm> }) {
  const root = useSignal(form.state$);
  const formErrors = useSignal(form.ownIssues$);

  const onSubmit = async () => {
    const ok = await form.submit();
    if (!ok) document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  };

  return (
    <>
      {formErrors.length > 0 && <InlineNotice tone="error" role="alert">{formErrors[0].message}</InlineNotice>}
      <BusyButton busy={root.isSubmitting} onClick={onSubmit}>Save</BusyButton>
    </>
  );
}
```

---

## Links: optimistic vs invalidate

Mechanics: [cache-and-invalidation.md](cache-and-invalidation.md#links--wiring-a-command-to-resources).

| Decision           | Baseline                                            | Choose otherwise when                                                                                                                                                                                             |
|--------------------|-----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `optimisticUpdate` | On — the UI changes the moment the user acts        | The patch cannot be derived on the client (the server computes the result), or a refusal is likely and costly to explain (payments)                                                                               |
| `invalidate`       | Depends on transport and load, not on habit         | REST-only B2B: **on** — the server is the only source of truth. High-load with a WS / event bus: **off** — the bus patches entries (`onCacheEntryAdded` subscription or a [stream query](stream-queries.md)); a refetch per mutation multiplies load |
| `retentionTime`    | Default 60 000 ms                                   | Short-lived, high-cardinality keys (search-as-you-type): 30 s or less — memory over cache hits. Routes users return to: longer. A `(args, state) => number \| false` policy decides per entry (e.g. evict failed entries at once) |

---

## Profiles

Two real placements — the same flags, different decisions.

### Searchable list in a high-load messenger

| Decision       | Implementation                                                                                          |
|----------------|---------------------------------------------------------------------------------------------------------|
| Initial load   | `Skeleton` instead of the list, after the skeleton delay                                                |
| Error          | `EmptyState` (error intent): icon, one line by kind, retry; the retry button is busy while retrying     |
| Invalidation error | Banner above the list: "couldn't refresh"                                                           |
| Empty          | `EmptyState` (create intent); with filters active — other copy plus "reset filters"                     |
| Reloading      | Not shown                                                                                               |
| Switching      | The container's own `dimmed` flag on the list; the search input never locks                            |
| Mutations      | Patch entries, never `invalidate` — the bus is the source of updates; a failed send keeps the message as "Not sent · Retry" |
| Live updates   | `onCacheEntryAdded`: subscribe to the topic on the WS client, patch the entry until `$cacheEntryRemoved` |
| Cache lifetime | `retentionTime: 30_000` — active search creates many keys                                               |

### KPI widget with group settings

| Decision        | Implementation                                                                                       |
|-----------------|------------------------------------------------------------------------------------------------------|
| Initial load    | `Skeleton`                                                                                           |
| Error           | `ErrorBoundary` with retry, copy by kind                                                             |
| Invalidation error | Icon in the widget corner with the age of the data in its tooltip                                 |
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
- ❌ Skeleton the instant a load starts — a 50 ms response flashes; delay it, then hold it a minimum.
- ❌ Skeleton or spinner for `idle` — nothing is coming until the args are supplied.
- ❌ Swapping the error for a skeleton while retrying — the user loses the context and a fast failure flickers.
- ❌ Treating a placeholder as the server's answer — enabling actions on it, or showing `EmptyState` for an empty one.
- ❌ One `EmptyState` for "no results" and "request failed" — different intent, copy and primary action.
- ❌ A retry button on `forbidden`, `not-found`, `validation` or `contract` — retrying cannot change the answer.
- ❌ `String(error)` as copy — map by kind.
- ❌ Showing a `superseded` failure — a newer run replaced it.
- ❌ One spinner for the whole page over independent blocks.
- ❌ Disabling the search input or the tabs while results load.
- ❌ One `useCommand` for a list of rows — every row goes busy and a second click supersedes the first; key it per row.
- ❌ A mutation control left enabled while `isPending` — a double submit is a second entry with a new request id.
- ❌ A silent optimistic rollback — the UI reverts and the user believes the change was saved.
- ❌ A rollback or failed submit that throws away what the user typed.
- ❌ A submit button disabled while the form is invalid — the user cannot find out why.
- ❌ An auto-loading feed sentinel left active on a failed tail page — it becomes a retry loop.
- ❌ Reconnect / tab-return recovery as an api-wide hook — it would replay failed mutations too.
- ✅ Decide `invalidate` per product transport; a bus-fed cache does not need it.
- ✅ Prefetch on intent and placeholder from the list before reaching for a faster skeleton.
