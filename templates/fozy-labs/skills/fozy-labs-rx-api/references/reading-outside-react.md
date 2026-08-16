# Reading — outside React

Imperative and reactive reads from stores, route loaders, workers, Node and tests.

---

## Which method starts a query

All six create or reuse the same cache entry; they differ in whether they create a cold entry, 
    whether they force fresh data, and how the result comes back.

| Call                      | Cold entry      | Forces fresh                | Returns            | Abort-aware | On failure |
|---------------------------|-----------------|-----------------------------|--------------------|-------------|------------|
| `trigger(args, doForce?)` | creates + runs  | only with `doForce: true`   | `void`             | no          | swallowed  |
| `ensure(args, opts?)`     | creates + waits | no — stale resolves at once | `Promise<TData>`   | yes         | rejects    |
| `fetch(args, opts?)`      | creates + waits | yes                         | `Promise<TData>`   | yes         | rejects    |
| `prefetch(args)`          | creates + waits | no                          | `Promise<void>`    | no          | swallowed  |
| `getEntry(args, true)`    | creates + runs  | no                          | `IQueryCacheEntry` | no          | —          |
| `refresh(args)`           | **never**       | yes (background SWR)        | `void`             | no          | swallowed  |

> `ensure` / `fetch` / `prefetch` are marked **`@experimental`** in the package.

---

## Router loaders and warm-ups

```ts
// Data required to render → ensure, wired to the router's abort signal.
export const Route = createFileRoute("/orders/$orderId")({
  loader: ({ params, abortController }) => {
      orderApi.getOrder.ensure({ orderId: params.orderId }, { signal: abortController.signal });
  }
});

// Speculative warm-up on hover → prefetch, deliberately survives navigation.
<Link onMouseEnter={() => orderApi.getOrder.prefetch({ orderId })} />
```

`signal` **detaches the caller**, it does not cancel the query: the returned promise rejects with `signal.reason` while the shared in-flight request keeps running for any other consumer. A request left with no consumers is torn down by the retention collector, which aborts `queryFn` through its own `AbortSignal`. `prefetch` is intentionally not abort-aware.

**Retention window.** An entry created by `ensure` / `prefetch` has no subscriber until a component mounts. The `retentionTime` countdown (default 60 000 ms) starts as soon as the promise settles; a component that subscribes inside that window cancels collection. With a very small `retentionTime` the warm-up is wasted and the component refetches.

---

## Synchronous state, no subscription

```ts
const state = orderApi.getOrders.getState({ status: "NEW" });
if (state.isSuccess) console.log(state.data);
```

`getState` is a read-only snapshot with the same fields and flags as the hook state (`IResourceLiteState`), built from `getEntry(args, false)` — it never creates an entry. Its `idle` means "no cache entry", where the agent's `idle` means "`SKIP`".

Other pure accessors: `serialize(args)` → the cache key string, `toKeyed(args)` → a `{ value, key }` pair you can pass back to any method to skip re-serialization, `getEntries()` → an iterator over live entries, `pack(args)` → an inert `{ kind: "resource", resource, args }` descriptor that executes nothing.

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

`Machine` is a union discriminated by `status`; `state` carries the full `{ status, args, data, error, updatedAt }` shape, and `data` / `updatedAt` / `patchState` are direct getters on the `success` / `refreshing` / `refresh-error` variants only.

With `doInitiate: false` (the default) the signal is a pure observer: it yields `null` until an entry exists. With `doInitiate: true` **reading the signal creates and starts the entry**, fires `onCacheEntryAdded` / `onQueryStarted`, and re-creates it after eviction — never use that variant anywhere a read must stay pure.

---

## `createAgent()` — a reactive observer with SWR

The agent is what `useResource` is built on. Reach for it when a store needs live `status` / `data` / `error` rather than a one-shot value.

```ts
const agent = orderApi.getOrders.createAgent();
agent.set({ status: "NEW" }, true); // choose the args (does not start the query)
agent.start();                      // begin observing and trigger the entry
```

| Member                  | Signature                                     | Notes                                                           |
|-------------------------|-----------------------------------------------|-----------------------------------------------------------------|
| `state$`                | `ReadonlySignal<TResourceAgentState<…>>`      | Same union the hook returns.                                    |
| `set(args, mark?)`      | `(ArgsOrVoidOrSkip<TArgs>, boolean?) => void` | Switches args. `SKIP` → `idle`. Same key = no-op.               |
| `start()`               | `() => void`                                  | Takes **no arguments**; triggers the currently set args.        |
| `retry()` / `refresh()` | `() => void`                                  | Delegate to the tracked entry.                                  |
| `whenSettled()`         | `() => Promise<void>`                         | Resolves when initial loading ends (either way). Never rejects. |
| `args`                  | `TArgs \| null` (getter)                      | Currently observed args.                                        |

No explicit teardown is needed — the internal signals deactivate when their last subscriber leaves. On an args change the agent keeps the previous entry's data as the stale SWR fallback.

Ordering matters: `set` before `start`, and `start()` never accepts args.

---

## Which one to use

| Situation                                       | Use                            |
|-------------------------------------------------|--------------------------------|
| Route loader — the render needs the data        | `ensure(args, { signal })`     |
| Hover / idle warm-up                            | `prefetch(args)`               |
| "Give me genuinely fresh data now"              | `fetch(args)`                  |
| Kick off a background load, result unused       | `trigger(args)`                |
| Invalidate after some external event            | `refresh(args)`                |
| One-off check of what is cached                 | `getState(args)`               |
| Store needs to react to loading/error over time | `createAgent()` or `getEntry$` |

---

## Pitfalls

- ❌ `agent.start(args)` — `start` takes no arguments; call `set(args, true)` first.
- ❌ `getEntry$(args, true)` inside a React render or any other pure read — it starts a query as a side effect.
- ❌ Relying on `refresh(args)` to load data that was never fetched — it no-ops on a missing entry.
- ✅ Pass the loader's `AbortSignal` to `ensure` / `fetch` so an abandoned navigation stops waiting.
- ✅ Reuse `toKeyed(args)` when the same args hit several methods in a row.
- ✅ Check `retentionTime` against the gap between a loader's `ensure` and the component's mount.
