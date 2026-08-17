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
Tracks package version **0.11.1**.

Two primitives:

| Primitive        | Purpose                                                        | Reactive surface                          |
|------------------|----------------------------------------------------------------|-------------------------------------------|
| `createResource` | **Read** — cached by args, SWR, invalidated by commands.       | `useResource`, `createAgent`, `getEntry$` |
| `createCommand`  | **Write** — mutations, optimistic patches, links to resources. | `useCommand`, `createAgent`               |

The resource/command objects are plain objects, not signals.
Everything reactive they expose (`state$`, `machine$`, `getEntry$`) is an rx-toolkit signal,
so it composes with `Signal.compute` and `useSignal` — see the `fozy-labs-signals` skill.

---

## 1. `createApi`

One api instance per app.

```ts
// shared/api/api.ts
import { createApi, reactHooksPlugin } from "@fozy-labs/rx-toolkit";

export const api = createApi({
  keyPrefix: "main-api",
  plugins: [reactHooksPlugin()],
});
```

| Option                                  | Default           | Meaning                                                            |
|-----------------------------------------|-------------------|--------------------------------------------------------------------|
| `keyPrefix`                             | `undefined`       | Prefixed onto every `key` as `` `${keyPrefix}/${key}` ``.          |
| `plugins`                               | `[]`              | `reactHooksPlugin()` is what adds the `use*` methods.              |
| `serializeArgs`                         | `stableStringify` | Args → cache key.                                                  |
| `resourceRetentionTime`                 | `60_000`          | ms an unsubscribed resource entry survives. `false` = never evict. |
| `commandRetentionTime`                  | `0`               | Same, for commands.                                                |
| `mapError`                              | identity          | Normalizes errors and types `TError`.                              |
| `initialSnapshot` / `snapshotValidTime` | `null` / `false`  | SSR hydration.                                                     |
| `defaultSync` / `syncDriver`            | `"none"` / —      | Cross-tab sync.                                                    |
| `onCacheEntryAdded` / `onQueryStarted`  | —                 | Api-wide lifecycle hooks, merged with per-resource ones.           |

The instance exposes exactly four members: `createResource`, `createCommand`, `getSnapshot()` and `resetAll()`.

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
    the library aborts on args change and on eviction. 
`key` is optional, but devtools, snapshots and cross-tab sync all address by it.

```tsx
const orderApi = inject(OrderApi);
const { data, isLoading } = orderApi.getCurrentUser.useResource();
const orders = orderApi.getOrders.useResource(status ? { status } : SKIP);
```

State is a discriminated union on `status` (`idle | pending | success | error | refreshing | refresh-error`);
    narrowing on `isSuccess` gives `data: TData` without `| null`.

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
const [createOrder, { isLoading }] = orderApi.createOrder.useCommand();
const result = await createOrder(dto); // never rejects
if (result.status === "error") show(result.error);
else navigate(result.data.id);
```

Hook and agent `trigger` resolve an envelope and never reject (`.unwrap()` restores throwing semantics). 
The imperative `command.execute(args, key?)` returns a raw `Promise<TData>` that does reject.

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

| Field              | Runs                                                         |
|--------------------|--------------------------------------------------------------|
| `optimisticUpdate` | Before `queryFn`; Immer recipe, auto-rolled back on failure. |
| `update`           | After success; also receives the server result.              |
| `invalidate: true` | After success; background SWR refresh of the entry.          |

`forwardArgs` is required and selects **exactly one** cache entry. It is not a wildcard: if no entry exists for those
args, the link silently does nothing.

---

## 5. Not built in

| Expectation                        | Reality                                                                         |
|------------------------------------|---------------------------------------------------------------------------------|
| Automatic retry / backoff          | None. `retry()` is manual; put a retry policy inside `queryFn`.                 |
| Polling / `refetchInterval`        | None. `refresh(args)` from an `onCacheEntryAdded` hook, or `prefetch(args, { force: true })` from your own timer. |
| Infinite query / pagination helper | None. One entry per page args; SWR keeps the previous page on screen.           |
| A built-in fetcher                 | None by design — `queryFn` is any function returning `Promise<TData>`.          |

---

## Rules

- ❌ Don't `try/catch` a hook or agent `trigger` — it never rejects; check `result.status` or use `.unwrap()`.
- ❌ Don't leave a manual `entry.createPatch(...)` handle uncommitted — a pending patch never reconciles.
- ✅ Use `ensure` / `fetch` when you need the data, `prefetch` when you only want the cache warm.
- ✅ `SKIP` gates a read until args are ready (`useResource` only — `useSuspenseResource` rejects it).

---

## Conditional references

Load these only when the specific situation applies — do **not** preload.

| Situation                                                                          | File                                   |
|------------------------------------------------------------------------------------|----------------------------------------|
| Rendering server data — hooks, `SKIP`, state union, Suspense                       | `references/reading-in-react.md`       |
| Reading from stores, route loaders, workers — `ensure`/`fetch`/`prefetch`, agents  | `references/reading-outside-react.md`  |
| Writing a mutation — `execute`, request id, envelope, retry, command cache keys    | `references/writing-mutations.md`      |
| The cache did not update after a mutation — `links`, patches, staleness, eviction  | `references/cache-and-invalidation.md` |
| Typing `error`, `mapError`, retries, cancellation, `CacheEntryRemovedError`        | `references/error-handling.md`         |
| Websocket/streaming updates, polling, per-entry teardown, per-run instrumentation  | `references/lifecycle-hooks.md`        |
| Writing a custom plugin, devtools, `DefaultOptions`                                | `references/extending-the-api.md`      |
| SSR — serializing a snapshot on the server, hydrating it on the client             | `references/ssr-hydration.md`          |
| Sharing cache between browser tabs — `syncDriver`, `defaultSync`, custom transports | `references/cross-tab-sync.md`         |
| Existing code uses a name this skill does not describe (`trigger`, `getDevtoolsKey`) | `references/migrations.md`             |

Pick **one** reading file matching the target environment — loading both the React and the non-React variant of the same
topic is redundant.
