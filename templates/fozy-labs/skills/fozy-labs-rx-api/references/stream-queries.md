# Stream queries

A **resource** `queryFn` may return `Observable<TData>` instead of a promise (`TQueryFnResult<TData> =
Promise<TData> | Observable<TData>`). The cache entry then becomes *live*: the first emission completes the load,
every later emission updates the data in place. Commands stay promise-only.

```ts
import { webSocket } from "rxjs/webSocket";

ordersFeed = api.createResource({
  key: "ordersFeed",
  queryFn: (args: { deskId: string }) => webSocket<Order[]>(`wss://api.example.com/desks/${args.deskId}/orders`),
});

const { data, isLoading } = ordersFeed.useResource({ deskId: "main" }); // updates on every emission
```

Agents, `useResource` / `useSuspenseResource`, SWR, `ensure` / `fetch` / `prefetch` and devtools all work unchanged.

---

## Lifecycle

- **First emission**: `pending → success` — from this point `whenFetched`, `fetch()`, Suspense and `$queryFulfilled`
  consider the query done.
- **Later emissions**: `success → success` in place (devtools action `stream-next`); active optimistic patches are
  replayed on the new base — the same rebase as a background refresh.
- **Stream error**: before any emission — ordinary `error`; after data — `refresh-error` with last-known-good data
  kept. Goes through `mapError`.
- **`complete`** after data just ends the live phase — the entry stays in `success` under normal cache rules.
  Completing with **zero emissions** is an `EmptyStreamError` (exported), so the entry cannot hang in `pending`.
- **`refresh()` / `retry()` / `fetch()`** unsubscribe from the current stream and resubscribe; the new run's first
  emission arrives through the rebase path.
- **Eviction** (retention GC, `resetAll`) unsubscribes — the producer teardown (socket close) runs; the `AbortSignal`
  passed to `queryFn` fires at the same moment.
- One subscription per cache entry regardless of how many components read the same args; different args — different
  entries, different subscriptions. `updatedAt` ticks on every emission.

---

## Optimistic patches on an open stream

`createPatch` works — emissions replay active patches. But a **committed** patch dissolves into the next emission: if
the stream does not echo your mutation back, the optimistic value reverts. The library warns once on the first patch
over an open stream; if the combination is deliberate, set the resource option `allowStreamPatches: true`. Immer
patches are absolute replaces: replaying "`likes = 6`" on a new base gives `6`, not "+1".

---

## Lifecycle hook: `$queryStream`

The `onQueryStarted` ctx carries `$queryStream` with two promises:

| Promise | Stream | Promise-based `queryFn` |
|---|---|---|
| `$queryStream.firstReceived` | first emission (≙ `$queryFulfilled`) | the query result |
| `$queryStream.allReceived` | last emission, after the stream completes | the query result |

Both reject with the **raw** producer error (before `mapError`, like `$queryFulfilled`), or with the cancellation
reason when the run is torn down first (resubscription, eviction). For a promise `queryFn` both equal
`$queryFulfilled`, so a hook can be written uniformly.

---

## Interaction with other mechanics

- **SSR snapshots** serialize the last emission like any success entry, but a hydrated entry does **not** reconnect
  the stream — data is static until a `refresh()`. For purely live resources consider `snapshotable: false`
  (see [ssr-hydration.md](ssr-hydration.md)).
- **Cross-tab sync** hands the neighbour tab a one-shot copy of the data, not the stream — the cold entry never
  subscribes to the producer. Leave `sync` off (the default) for stream resources.

---

## Pitfalls

- ❌ Expecting a hydrated or synced entry to be live — only a real `queryFn` run subscribes.
- ❌ Committing patches over a stream that does not echo mutations — the next emission reverts them.
- ❌ Returning an `Observable` from a command `queryFn` — streams are resource-only.
- ✅ Put the socket in `queryFn` and let refresh/eviction manage the subscription — no manual `onCacheEntryAdded`
  socket plumbing needed for plain live data.
- ✅ Use `$queryStream.allReceived` only for finite streams — an endless stream never resolves it.
