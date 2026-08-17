# Reading — outside React

Imperative and reactive reads from stores, route loaders, workers, Node and tests.

**Contents:** [Which method starts a query](#which-method-starts-a-query) · [Keepalive and the retention window](#keepalive-and-the-retention-window) · [Router loaders and warm-ups](#router-loaders-and-warm-ups) · [Synchronous state](#synchronous-state-no-subscription) · [Reactive reads](#reactive-reads-in-a-store) · [`createAgent()`](#createagent--a-reactive-observer-with-swr) · [Which one to use](#which-one-to-use)

---

## Which method starts a query

Every entry point below addresses the same cache entry (one per serialized args). They differ in what they do
to an entry that already exists, what comes back, and whether a failure is visible.

| Call                             | No entry yet    | Entry holds data                    | Entry in `error`      | Returns            | Abort-aware | On failure          |
|----------------------------------|-----------------|-------------------------------------|-----------------------|--------------------|-------------|---------------------|
| `ensure(args, opts?)`            | creates + waits | resolves at once (stale data too)   | **retries**, waits    | `Promise<TData>`   | yes         | rejects             |
| `fetch(args, opts?)`             | creates + waits | refreshes, waits for the new result | **retries**, waits    | `Promise<TData>`   | yes         | rejects             |
| `prefetch(args)`                 | creates + waits | resolves at once                    | **retries**           | `Promise<void>`    | no          | swallowed           |
| `prefetch(args, { force: true })`| creates + waits | refreshes                           | **retries**           | `Promise<void>`    | no          | swallowed           |
| `getEntry(args, true)`           | creates + runs  | returns it untouched                | left alone            | `IQueryCacheEntry` | no          | lands in entry state |
| `refresh(args)`                  | **never**       | marks stale + re-runs               | no-op + console warn  | `void`             | no          | → `refresh-error`   |

- `prefetch` **is** `ensure` (or `fetch`, with `force`) with the outcome swallowed — same entry creation, same
  retry-on-`error`, a `Promise<void>` that never rejects.
- `fetch` and `prefetch({ force: true })` on a `pending` / `refreshing` entry join the run already in flight
  instead of starting a second one.
- `ensure` / `prefetch` wait for a `pending` entry (it has no data yet) but take the stale data from a
  `refreshing` one at once.
- `refresh` is the only one that never creates an entry. It also no-ops (with a `console.warn`) from `pending`,
  `refreshing` and `error` — it is valid only from `success` / `refresh-error`.
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
60 000 ms) decides how long the warm-up survives.

`ensure` / `fetch` / `prefetch` hold a keepalive subscription on the entry for the duration of the call —
**cache hits included** — and release it when the promise settles. With nothing else subscribed that drops the
refcount to zero, which **restarts the full `retentionTime` countdown**. `getEntry(args, true)` and
`refresh(args)` never subscribe and never touch the timer.

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
if (state.isSuccess) console.log(state.data);
```

`getState` is a read-only snapshot with the same fields and flags as the hook state (`IResourceLiteState`),
built from `getEntry(args, false)` — it never creates an entry. Its `idle` means "no cache entry", where the
agent's `idle` means "`SKIP`".

Other pure accessors: `serialize(args)` → the cache key string, `toKeyed(args)` → a `{ value, key }` pair you
can pass back to any method to skip re-serialization, `getEntries()` → an iterator over live entries,
`pack(args)` → an inert `{ kind: "resource", resource, args }` descriptor that executes nothing.

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
    const machine = this._entry$()?.machine$();
    // `data` exists only on the data-bearing variants — narrow on `status` first.
    return machine?.status === "success" ? machine.data.items.length : 0;
  });
}
```

`Machine` is a union discriminated by `status`; `state` carries the full `{ status, args, data, error, updatedAt }`
shape, and `data` / `updatedAt` / `patchState` are direct getters on the `success` / `refreshing` /
`refresh-error` variants only.

With `doInitiate: false` (the default) the signal is a pure observer: it yields `null` until an entry exists.
With `doInitiate: true` **reading the signal creates and starts the entry**, fires `onCacheEntryAdded` /
`onQueryStarted`, and re-creates it after eviction — never use that variant anywhere a read must stay pure.

---

## `createAgent()` — a reactive observer with SWR

The agent is what `useResource` is built on. Reach for it when a store needs live `status` / `data` / `error`
rather than a one-shot value.

```ts
const agent = orderApi.getOrders.createAgent();
agent.set({ status: "NEW" }, true); // choose the args (does not start the query)
agent.start();                      // begin observing and create/start the entry
```

| Member                  | Signature                                     | Notes                                                           |
|-------------------------|-----------------------------------------------|-----------------------------------------------------------------|
| `state$`                | `ReadonlySignal<TResourceAgentState<…>>`      | Same union the hook returns.                                    |
| `set(args, mark?)`      | `(ArgsOrVoidOrSkip<TArgs>, boolean?) => void` | Switches args. `SKIP` → `idle`. Same key = no-op.               |
| `start()`               | `() => void`                                  | Takes **no arguments**; starts the currently set args.          |
| `retry()` / `refresh()` | `() => void`                                  | Delegate to the tracked entry.                                  |
| `whenSettled()`         | `() => Promise<void>`                         | Resolves when initial loading ends (either way). Never rejects. |
| `args`                  | `TArgs \| null` (getter)                      | Currently observed args.                                        |

`start()` and a post-start `set()` go through `getEntry(args, true)`: a warm entry is reused as-is, never
re-fetched. No explicit teardown is needed — the internal signals deactivate when their last subscriber
leaves. On an args change the agent keeps the previous entry's data as the stale SWR fallback.

Ordering matters: `set` before `start`, and `start()` never accepts args.

---

## Which one to use

| Situation                                       | Use                                 |
|-------------------------------------------------|-------------------------------------|
| Route loader — the render needs the data        | `ensure(args, { signal })`          |
| Hover / idle warm-up, result unused             | `void prefetch(args)`               |
| "Give me genuinely fresh data now"              | `fetch(args)`                       |
| Periodic background refresh, result unused      | `void prefetch(args, { force: true })` |
| Invalidate an entry someone is already watching | `refresh(args)`                     |
| One-off check of what is cached                 | `getState(args)`                    |
| Store needs to react to loading/error over time | `createAgent()` or `getEntry$`      |

---

## Pitfalls

- ❌ `agent.start(args)` — `start` takes no arguments; call `set(args, true)` first.
- ❌ `getEntry$(args, true)` inside a React render or any other pure read — it starts a query as a side effect.
- ❌ Relying on `refresh(args)` to load data that was never fetched — it no-ops on a missing entry, and also
  from `pending` / `refreshing` / `error`.
- ❌ A `prefetch(args)` loop as a poller — it re-arms retention on every hit and never refetches; pass
  `{ force: true }`.
- ❌ `try/catch` around `prefetch` — it never rejects; read `getState(args)` to find out what happened.
- ✅ Pass the loader's `AbortSignal` to `ensure` / `fetch` so an abandoned navigation stops waiting.
- ✅ Reuse `toKeyed(args)` when the same args hit several methods in a row.
- ✅ Check `retentionTime` against the gap between a loader's `ensure` and the component's mount.
