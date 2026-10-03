# Reading — outside React

Imperative and reactive reads from stores, route loaders, workers, Node and tests.

**Contents:** [Which method starts a query](#which-method-starts-a-query) · [Keepalive and the retention window](#keepalive-and-the-retention-window) · [Router loaders and warm-ups](#router-loaders-and-warm-ups) · [Synchronous state](#synchronous-state-no-subscription) · [Reactive reads](#reactive-reads-in-a-store) · [`createClutch()`](#createclutch--a-reactive-observer-with-swr) · [Which one to use](#which-one-to-use)

---

## Which method starts a query

Every entry point below addresses the same cache entry (one per serialized args). They differ in what they do
to an entry that already exists, what comes back, and whether a failure is visible.

| Call                             | No entry yet    | Entry holds data                          | Entry in `error`                | Returns            | Abort-aware | On failure          |
|----------------------------------|-----------------|-------------------------------------------|---------------------------------|--------------------|-------------|---------------------|
| `ensure(args, opts?)`            | creates + waits | resolves at once (stale data too)         | **retries**, waits              | `Promise<TData>`   | yes         | rejects             |
| `fetch(args, opts?)`             | creates + waits | refetches, waits for the new result       | **retries**, waits              | `Promise<TData>`   | yes         | rejects             |
| `prefetch(args)`                 | creates + waits | resolves at once                          | **retries**                     | `Promise<void>`    | no          | swallowed           |
| `prefetch(args, { force: true })`| creates + waits | refetches                                 | **retries**                     | `Promise<void>`    | no          | swallowed           |
| `getEntry(args, true)`           | creates + runs  | returns it untouched                      | left alone                      | `IQueryCacheEntry` | no          | lands in entry state |
| `invalidate(args)`               | **never**       | held → refetch now; unheld → **mark**, refetch on next hold | **retries**, error cleared | `void`    | no          | → `invalidate-error` |

- `prefetch` **is** `ensure` (or `fetch`, with `force`) with the outcome swallowed — same entry creation, same
  retry-on-`error`, a `Promise<void>` that never rejects.
- `fetch` and `prefetch({ force: true })` on an entry with a request in flight **cancel it by default** and wait
  for the new one. `{ inFlight: 'trail' }` lets it finish and waits for the next run; `{ inFlight: 'join' }` waits
  for the current one (the pre-0.13 behaviour).
- `ensure` / `prefetch` wait for an entry whose request is in flight only while it has no data; with data they
  resolve at once.
- `invalidate` is the only one that never creates an entry — and it never fails: it either starts the refetch or
  sets `entry.isInvalidated`. Use `fetch` / `prefetch(args, { force: true })` when the refresh must happen **now**
  (a timer over invisible data, a warm-up after a mutation).
- `getEntry(args, true)` is typed non-null: the `doInitiate: true` overload returns `IQueryCacheEntry`, not
  `IQueryCacheEntry | null`.

`prefetch` returns a promise only so callers *can* await the warm-up; nothing needs handling. Under
`@typescript-eslint/no-floating-promises` write `void resource.prefetch(args)`, or whitelist it once:

```js
"@typescript-eslint/no-floating-promises": ["error", {
  allowForKnownSafeCalls: [{ from: "package", name: "prefetch", package: "@fozy-labs/rx-toolkit" }],
}]
```

`ensure` / `fetch` keep requiring handling — they reject.

---

## Keepalive and the retention window

An entry created outside React has no subscriber until a component mounts, so `retentionTime` (default
60 000 ms) decides how long the warm-up survives. The option also accepts `(args, state) => number | false`,
evaluated each time the last hold is released — e.g. evict failed entries at once, keep list pages longer.

`ensure` / `fetch` / `prefetch` hold a keepalive subscription on the entry for the duration of the call —
**cache hits included** — and release it when the promise settles. With nothing else holding the entry that
**restarts the full `retentionTime` countdown** (or re-evaluates the function). `getEntry(args, true)` and
`invalidate(args)` never subscribe and never touch the timer.

Consequence for a periodic warm-up loop:

```ts
// ❌ Pins the entry forever, and after the first load never fetches again:
//    every tick is a cache hit that resolves at once and re-arms retention.
setInterval(() => void orderApi.getOrders.prefetch({ status: "NEW" }), 30_000);

// ✅ Actually refreshes on every tick.
setInterval(() => void orderApi.getOrders.prefetch({ status: "NEW" }, { force: true }), 30_000);
```

With an interval shorter than `retentionTime` the entry is never collected, so a non-forcing loop keeps
resolving from the same cached value. Either force it, or use an interval longer than `retentionTime`.

---

## Router loaders and warm-ups

```ts
// Data required to render → ensure, wired to the router's abort signal.
export const Route = createFileRoute("/orders/$orderId")({
  loader: ({ params, abortController }) =>
    orderApi.getOrder.ensure({ orderId: params.orderId }, { signal: abortController.signal }),
});

// Speculative warm-up on hover → prefetch, deliberately survives navigation.
<Link onMouseEnter={() => void orderApi.getOrder.prefetch({ orderId })} />
```

`signal` **detaches the caller**, it does not cancel the query: the returned promise rejects with
`signal.reason` while the shared in-flight request keeps running for any other consumer. A request left with
no consumers is torn down by the retention collector, which aborts `queryFn` through its own `AbortSignal`.
`prefetch` is intentionally not abort-aware — it takes no `signal`.

A `serializeArgs` that throws produces a rejected promise, never a synchronous throw; `prefetch` swallows even
that.

---

## Synchronous state, no subscription

```ts
const state = orderApi.getOrders.getState({ status: "NEW" });
if (state.hasData) console.log(state.data);
```

`getState` is a read-only snapshot with the same fields and flags as the hook state (`TResourceEntryState`),
with `dataSource` narrowed to `'none' | 'current'` and no methods — built from `getEntry(args, false)`, so it
never creates an entry and never holds one. Its `idle` means "no cache entry", where the clutch's `idle` means
"`SKIP`". An `isPending` / `isInvalidating` here can also mean "a refetch is owed" rather than in flight: an
entry whose request was cancelled with no holds keeps its status until the next hold.

Other pure accessors: `serialize(args)` → the cache key string, `toKeyed(args)` → a `{ value, key }` pair you
can pass back to any method to skip re-serialization, `getEntries()` → an iterator over live entries,
`bind(args)` → an inert `{ kind: "resource", resource, args }` descriptor that executes nothing.

---

## Reactive reads in a store

`getEntry$(args, doInitiate?)` returns a signal; read it inside `Signal.compute` / `Signal.effect`:

```ts
@injectable("SCOPED")
export class OrderListStore {
  private readonly _api = inject(OrderApi);

  status$ = Signal.state<OrderStatus>("NEW");

  private _entry$ = Signal.compute(() => this._api.getOrders.getEntry$({ status: this.status$() })());

  count$ = Signal.compute(() => {
    const state = this._entry$()?.state$();
    // `data` exists only on the data-bearing variants — narrow on `status` first.
    return state?.status === "success" ? state.data.items.length : 0;
  });
}
```

`entry.state$()` is a flat `TQueryEntryState`: `status` (`pending | success | error | invalidating |
invalidate-error`), `args`, `data`, `error`, `updatedAt`, `patchState`. A retry in flight shows up as
`pending` / `invalidating` with `error !== null`.

With `doInitiate: false` (the default) the signal is a pure observer: it yields `null` until an entry exists.
With `doInitiate: true` **reading the signal creates and starts the entry**, fires `onCacheEntryAdded` /
`onQueryStarted`, and re-creates it after eviction — never use that variant anywhere a read must stay pure.

---

## `createClutch()` — a reactive observer with SWR

The clutch is what `useResource` is built on. Reach for it when a store needs live `status` / `data` / `error`
rather than a one-shot value.

```ts
const clutch = orderApi.getOrders.createClutch();
clutch.switch({ status: "NEW" }, { markPending: true }); // choose the args (does not start the query)
clutch.start();                                          // begin observing and create/start the entry
```

| Member                  | Signature                                     | Notes                                                           |
|-------------------------|-----------------------------------------------|-----------------------------------------------------------------|
| `state$`                | `ReadonlySignal<TResourceClutchState<…>>`     | Same union the hook returns.                                    |
| `switch(args, opts?)`   | `(TArgsOrVoidOrSkip<TArgs>, { markPending?: boolean }?) => void` | Switches args. `SKIP` → `idle`. Same key = no-op. `markPending` makes an unstarted clutch report `pending` instead of `idle`. |
| `start()`               | `() => void`                                  | Takes **no arguments**; starts the currently set args.          |
| `adoptPrevious(source)` | `(IResourceClutch<…>) => void`                | Takes over `source`'s data as this clutch's SWR fallback — for "replace the clutch" flows instead of `switch`. |
| `retry()` / `invalidate(opts?)` | `() => void` / `(opts?: { inFlight?: TInFlightPolicy }) => void` | Delegate to the tracked entry; `retry()` keeps the error on screen, `invalidate()` clears it. On an error with nothing shown `invalidate()` warns and no-ops — `retry()` is the call there. |
| `whenSettled(opts?)`    | `({ waitForDone?: boolean }?) => Promise<void>` | Resolves when there is something to render (any data, or an error with nothing to show); `waitForDone: true` waits for "no request in flight" instead. Never rejects. |
| `args`                  | `TArgs \| null` (getter)                      | Currently observed args.                                        |

`start()` and a post-start `switch()` go through `getEntry(args, true)`: a warm entry is reused as-is, never
re-fetched. No explicit teardown is needed — the internal signals deactivate when their last subscriber
leaves. On an args change the clutch keeps the previous entry's data as the stale SWR fallback — surfaced as
`pending` with `isSwitching: true` and `dataArgs` pointing at the previous args.

`adoptPrevious(source)` is the same fallback for the case where a store creates a **new** clutch per args instead of
calling `switch` on a live one (that is how the React hooks work): it copies `source`'s current entry when it holds data
(`success` / `invalidating` / `invalidate-error`), otherwise `source`'s own previous slot. `source` is read once and not
retained; a `placeholderData` memo is not carried over. Call it right after `createClutch()`, before `switch` and `start()`.

Ordering matters: `switch` before `start`, and `start()` never accepts args.

---

## Which one to use

| Situation                                       | Use                                 |
|-------------------------------------------------|-------------------------------------|
| Route loader — the render needs the data        | `ensure(args, { signal })`          |
| Hover / idle warm-up, result unused             | `void prefetch(args)`               |
| "Give me genuinely fresh data now"              | `fetch(args)`                       |
| Periodic background refresh, result unused      | `void prefetch(args, { force: true })` |
| Invalidate an entry someone is already watching | `invalidate(args)`                  |
| Refresh an entry on a timer, watched or not     | `void prefetch(args, { force: true })` |
| One-off check of what is cached                 | `getState(args)`                    |
| Store needs to react to loading/error over time | `createClutch()` or `getEntry$`     |

---

## Pitfalls

- ❌ `clutch.start(args)` — `start` takes no arguments; call `switch(args, { markPending: true })` first.
- ❌ `getEntry$(args, true)` inside a React render or any other pure read — it starts a query as a side effect.
- ❌ Relying on `invalidate(args)` to refresh an unwatched entry — with no holds it only marks the entry, and the
  request fires on the next hold. Use `fetch` / `prefetch(args, { force: true })` for a refresh that must happen now.
- ❌ A `prefetch(args)` loop as a poller — it re-arms retention on every hit and never refetches; pass
  `{ force: true }`.
- ❌ `try/catch` around `prefetch` — it never rejects; read `getState(args)` to find out what happened.
- ✅ Pass the loader's `AbortSignal` to `ensure` / `fetch` so an abandoned navigation stops waiting.
- ✅ Reuse `toKeyed(args)` when the same args hit several methods in a row.
- ✅ Check `retentionTime` against the gap between a loader's `ensure` and the component's mount.
