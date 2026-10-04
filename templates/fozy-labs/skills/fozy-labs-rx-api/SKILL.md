---
name: fozy-labs-rx-api
description: >
    Server-state layer for js/ts projects based on the Query module of @fozy-labs/rx-toolkit
    (createApi / createResource / createCommand) — caching, SWR, optimistic updates, React hooks.
---

# @fozy-labs/rx-toolkit — Query

Declarative cache-aware server state: one cache entry per serialized args, stale-while-revalidate, optimistic updates,
SSR snapshots.
Framework-agnostic core; React binds through a plugin.
Tracks package version **0.13.1**.

Two primitives:

| Primitive        | Purpose                                                        | Reactive surface                           |
|------------------|----------------------------------------------------------------|--------------------------------------------|
| `createResource` | **Read** — cached by args, SWR, invalidated by commands.       | `useResource`, `createClutch`, `getEntry$` |
| `createCommand`  | **Write** — mutations, optimistic patches, links to resources. | `useCommand`, `createClutch`               |

The resource/command objects are plain objects, not signals.
Everything reactive they expose (`state$`, `getEntry$`) is an rx-toolkit signal,
so it composes with `Signal.compute` and `useSignal` — see the `fozy-labs-signals` skill.

---

## 1. `createApi`

One api instance per app.

```ts
// shared/api/api.ts
import { createApi } from "@fozy-labs/rx-toolkit";
import { reactHooksPlugin } from "@fozy-labs/rx-toolkit/react";

export const api = createApi({
  keyPrefix: "main-api",
  plugins: [reactHooksPlugin()],
});
```

| Option                                  | Default           | Meaning                                                            |
|-----------------------------------------|-------------------|--------------------------------------------------------------------|
| `keyPrefix`                             | `undefined`       | Prefixed onto every `key` as `` `${keyPrefix}/${key}` ``.          |
| `plugins`                               | `[]`              | `reactHooksPlugin()` — from `@fozy-labs/rx-toolkit/react` — is what adds the `use*` methods. |
| `serializeArgs`                         | `stableStringify` | Args → cache key.                                                  |
| `resourceRetentionTime`                 | `60_000`          | ms an unsubscribed resource entry survives. `false` = never evict; `(args, state) => number \| false` decides per entry. |
| `commandRetentionTime`                  | `0`               | Same, for commands.                                                |
| `mapError`                              | identity          | Normalizes errors and types `TError`.                              |
| `initialSnapshot` / `snapshotValidTime` | `null` / `false`  | SSR hydration.                                                     |
| `defaultSync` / `syncDriver`            | `"none"` / —      | Cross-tab sync.                                                    |
| `onCacheEntryAdded` / `onQueryStarted`  | —                 | Api-wide lifecycle hooks, merged with per-resource ones; accept arrays. |
| `invalidateOn` / `environmentDriver`    | — / `browserEnvironmentDriver()` | Automatic refetch on focus / reconnect / interval; per-resource keys override — see [references/cache-and-invalidation.md](references/cache-and-invalidation.md#automatic-revalidation--invalidateon). |

The instance exposes `createResource`, `createCommand`, `unstable_createProjectionResource`, `getSnapshot()` and
`resetAll()`; plugins may add members of their own (`augmentApi` — see [references/extending-the-api.md](references/extending-the-api.md)).

---

## 2. `createResource` — cached read

```ts
// entities/order/model/order.api.ts
@injectable("SCOPED")
export class OrderApi {
    getCurrentUser = api.createResource({
        key: "currentUser",
        queryFn: fetchCurrentUser, // or: `queryFn: (_: void, abortSignal) => fetchCurrentUser(undefined, abortSignal)`
    });

    getOrders = api.createResource({
        key: "ordersByStatus",
        queryFn: fetchOrdersPage, // or: `queryFn: ({ status }: { status: OrderStatus }, abortSignal) => fetchOrdersPage({ status }, abortSignal)`
    });
}
```

`queryFn` is the only required option; its second argument is an `AbortSignal` — forward it to `fetch`, 
    the library aborts a superseded request (args change, eviction, the default `cancel` in-flight policy). 
`key` is optional, but devtools, snapshots and cross-tab sync all address by it.
A resource `queryFn` may also return an `Observable<TData>` — the entry goes live and updates on every emission
    (WebSocket, SSE); see [references/stream-queries.md](references/stream-queries.md).

```tsx
const orderApi = inject(OrderApi);
const { data, isPending } = orderApi.getCurrentUser.useResource();
const orders = orderApi.getOrders.useResource(status ? { status } : SKIP);
```

State is a discriminated union over three axes: `status` (`idle | pending | success | error`), `dataSource`
    (`none | placeholder | previous | current`) and `hasError`. Narrow on `hasData` for `data: TData` without
    `| null`, on `hasError` for `error: TError`. `pending` and `error` both happen **on top of** data already on
    screen, so `switch (status)` without checking `hasData` first shows a spinner on every invalidation.
    `dataArgs` names the args `data` belongs to; `isSwitching` tells an args change under SWR apart from an
    `invalidate()` of the same entry; a retry in flight is `isPending && hasError`.

---

## 3. `createCommand` — mutation

```ts
createOrder = api.createCommand({
    key: "createOrder",
    queryFn: postOrder, // or: `queryFn: (dto: CreateOrderDto, requestId) => postOrder(dto, { headers: { "Idempotency-Key": requestId } })`
});
```

The second `queryFn` argument is a **request id**, 
    not an abort signal — a per-cache-entry idempotency token reused across `retry()`.

```tsx
const [createOrder, { isPending }] = orderApi.createOrder.useCommand();
const result = await createOrder(dto); // never rejects
if (result.status === "error") show(result.error);
else navigate(result.data.id);
```

Hook and clutch `trigger` resolve an envelope and never reject (`.unwrap()` restores throwing semantics). 
The imperative `command.execute(args, entryKey?)` returns a raw `Promise<TData>` that does reject.

---

## 4. `links` — keeping the cache consistent

```ts
setStatus = api.createCommand<UserStatus, User>({
    queryFn: (status) => putUserStatus(status),
    links: (link) =>
        link({
            resource: this._userApi.getCurrentUser,
            forwardArgs: () => undefined, // → the entry whose args are `undefined`
            optimisticUpdate: (draft, status) => { draft.status = status; },
        }),
});
```

| Field              | Runs                                                                              |
|--------------------|-----------------------------------------------------------------------------------|
| `optimisticUpdate` | Before `queryFn`; Immer recipe, auto-rolled back on failure.                      |
| `update`           | After success; also receives the server result.                                   |
| `invalidate: true` | After success; invalidates the entry — a background refetch while it is held.     |

`forwardArgs` is required and selects **exactly one** cache entry. It is not a wildcard: if no entry exists for those
args, the link silently does nothing.

---

## 5. Not built in

| Expectation                        | Reality                                                                         |
|------------------------------------|---------------------------------------------------------------------------------|
| Automatic retry / backoff          | None. `retry()` is manual; put a retry policy inside `queryFn`.                 |
| Polling / `refetchInterval`        | Built in since 0.13.1: `invalidateOn: { interval }`, plus `focus` / `reconnect` — see [references/cache-and-invalidation.md](references/cache-and-invalidation.md#automatic-revalidation--invalidateon). |
| Infinite query / pagination helper | Cursor pagination: none — one entry per page args, SWR keeps the previous page on screen. Id-based collections: `unstable_createProjectionResource` + `useInfiniteResource` (see [references/projection-resource.md](references/projection-resource.md)). |
| A built-in fetcher                 | None by design — `queryFn` is any function returning `Promise<TData>` (or `Observable<TData>` for streams). |

---

## Rules

- ❌ Don't `try/catch` a hook or clutch `trigger` — it never rejects; check `result.status` or use `.unwrap()`.
- ❌ Don't leave a manual `entry.createPatch(...)` handle uncommitted — a pending patch never reconciles.
- ❌ Don't test "loaded" with `data !== null` or `data &&` — `TData` may itself be `null`; the check is `hasData`.
- ❌ Importing hooks or `reactHooksPlugin` from the package root — React bindings live in `@fozy-labs/rx-toolkit/react` since 0.13.0.
- ✅ Render by `hasData`, report errors by `hasError` — `pending` and `error` can sit on top of shown data.
- ✅ Use `ensure` / `fetch` when you need the data, `prefetch` when you only want the cache warm.
- ✅ `SKIP` gates a read until args are ready (`useResource` only — `useSuspenseResource` rejects it).

---

## Conditional references

Load these only when the specific situation applies — do **not** preload.

| Situation                                                                          | File                                   |
|------------------------------------------------------------------------------------|----------------------------------------|
| Rendering server data — hooks, `SKIP`, state union, Suspense, `useResources`, timing hooks (`useDelayedFlag`, `useDebouncedArgs`) | [references/reading-in-react.md](references/reading-in-react.md)       |
| Deciding what the UI shows and offers per state — resource, several resources, Suspense, feed, stream, mutations, forms; skeleton timing, prefetch / placeholder, error kinds and loudness, `invalidateOn` policy | [references/ui-states.md](references/ui-states.md)         |
| Reading from stores, route loaders, workers — `ensure`/`fetch`/`prefetch`, clutches | [references/reading-outside-react.md](references/reading-outside-react.md)  |
| Writing a mutation — `execute`, request id, envelope, retry, command cache keys    | [references/writing-mutations.md](references/writing-mutations.md)      |
| The cache did not update after a mutation — `links`, patches, lazy invalidation, eviction; refetch on focus / reconnect / interval (`invalidateOn`) | [references/cache-and-invalidation.md](references/cache-and-invalidation.md) |
| Typing `error`, `mapError`, retries, cancellation, `CacheEntryRemovedError`        | [references/error-handling.md](references/error-handling.md)         |
| Live data — an `Observable` in `queryFn` (WebSocket, SSE), patches over a stream   | [references/stream-queries.md](references/stream-queries.md)        |
| Loading collections by id lists, per-item cache, infinite feed (`useInfiniteResource`) | [references/projection-resource.md](references/projection-resource.md) |
| Custom polling schedules, per-entry teardown, per-run instrumentation, hook arrays | [references/lifecycle-hooks.md](references/lifecycle-hooks.md)        |
| Building a form — field schemas, validation, submit through a command (`unstable_formsPlugin`) | [references/forms.md](references/forms.md)                 |
| Writing a custom plugin, devtools, `DefaultOptions`                                | [references/extending-the-api.md](references/extending-the-api.md)      |
| SSR — serializing a snapshot on the server, hydrating it on the client             | [references/ssr-hydration.md](references/ssr-hydration.md)          |
| Sharing cache between browser tabs — `syncDriver`, `defaultSync`, custom transports | [references/cross-tab-sync.md](references/cross-tab-sync.md)         |
| Existing code uses a name this skill does not describe (`createAgent`, `refresh`, `pack`, `trigger`) or imports hooks from the package root | [references/migrations.md](references/migrations.md)             |

Pick **one** reading file matching the target environment — loading both the React and the non-React variant of the same
topic is redundant.
