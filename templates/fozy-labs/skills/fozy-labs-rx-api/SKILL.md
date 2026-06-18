---
name: fozy-labs-rx-api
description: >
  Server-state layer via @fozy-labs/rx-toolkit (createApi / createResource / createCommand).
---

# @fozy-labs/rx-toolkit — Query (server state)

Cache-aware declarative server-state layer. Built on top of `@fozy-labs/rx-toolkit` signals — every resource/command exposes the same `obs` and reactive primitives under the hood, so it composes with `Signal.compute` and `useSignal`.

Two primitives:

| Primitive  | Purpose                                          | Returns                                        |
|------------|--------------------------------------------------|------------------------------------------------|
| `resource` | **Read** — cached by args, SWR, auto-invalidate. | `useResource(args)`, `trigger`, `refresh`, …  |
| `command`  | **Write** — mutations, optimistic updates, links to resources. | `useCommand()`, `trigger(args)`. |

---

## 1. `createApi`

One API instance per app is enough.

```ts
// shared/api/api.ts
import { createApi, reactHooksPlugin } from "@fozy-labs/rx-toolkit";

export const api = createApi({
  keyPrefix: "main-api",
  plugins: [reactHooksPlugin()],
});
```

---

## 2. `createResource` — cached read

```ts
// entities/user/model/user.api.ts
@injectable("SCOPED")
export class UserApi {
  getCurrentUser = api.createResource({
    key: "currentUser", // unique — used by devtools, broadcast sync, snapshots
    queryFn: fetchCurrentUser, // (args, signal) => Promise<UserDto>
  });
}
```

With explicit generics `<TArgs, TData>`:

```ts
@injectable("SCOPED")
export class OrderApi {
  listOrders = api.createResource<{ status: OrderStatus }, OrdersPage>({
    key: "ordersByStatus",
    queryFn: ({ status }, signal) =>
      fetchOrdersPage({ status, limit: DEFAULT_PAGE_SIZE }, signal),
  });
}
```

### React hook — `.useResource(args?)`

Auto-fires on mount; refetches when args change; keeps previous data on-screen while loading new args (SWR fallback).

```tsx
const userApi = inject(UserApi);

// No args
const { data, isLoading } = userApi.getCurrentUser.useResource();

// With args — refetches when args change
const orderApi = inject(OrderApi);
const { data: page } = orderApi.listOrders.useResource({ status });

// Skip until ready
import { SKIP } from "@fozy-labs/rx-toolkit";
const { data } = orderApi.listOrders.useResource(status ? { status } : SKIP);
```

#### Returned state

| Field              | Meaning                                                |
|--------------------|--------------------------------------------------------|
| `data`             | Latest data or `null`.                                 |
| `error`            | Error from the last failed fetch.                      |
| `args`             | Args of the last fetch.                                |
| `status`           | `idle` \| `pending` \| `success` \| `error` \| `refreshing` \| `refresh-error`. |
| `isLoading`        | Any in-flight fetch.                                   |
| `isInitialLoading` | First load (no data yet).                              |
| `isRefreshing`     | Background refetch (stale data still shown).           |
| `isSuccess`        | Last fetch succeeded.                                  |
| `isError`          | Last fetch failed.                                     |
| `isRefreshError`   | Background refetch failed, stale data still present.   |
| `retry()`          | Retry the last failed fetch.                           |
| `refresh()`        | Force a background refresh (keeps current data).       |

### Imperative API

For use in stores / handlers — outside the React render cycle.

```ts
// Inside a store method:
await this._api.getCurrentUser.trigger();          // fetch + dedupe with in-flight
await this._api.listOrders.trigger({ status });

// Background refresh (keeps current data visible to subscribers)
this._api.getCurrentUser.refresh();

// Read current cache entry / state synchronously
const entry = this._api.getCurrentUser.getEntry(undefined, /* create */ true);
const state = this._api.getCurrentUser.getState(undefined);
```

> Prefer `useResource` in components. Reach for imperative `trigger` only when fetching from non-React code (stores, route loaders, command handlers).

---

## 3. `createCommand` — mutation

```ts
@injectable("SCOPED")
export class OrderApi {
  createOrder = api.createCommand({
    key: "createOrder", // shown in devtools
    queryFn: fetchCreateOrder,
  });

  cancelOrder = api.createCommand({
    key: "cancelOrder",
    queryFn: fetchCancelOrder,
  });
}
```

### React hook — `.useCommand()`

```tsx
const userApi = inject(UserApi);
const [save, { isLoading: isSaving, error }] = userApi.updateUser.useCommand();

await save(args); // Promise<TData>, rejects on error
```

`save` (the trigger) is stable across renders — safe in dependency arrays. The hook **does not** fire on mount; you call `save(args)` explicitly.

### Imperative `.trigger(args)`

In stores / handlers:

```ts
const order = await this._api.createOrder.trigger({ items, addressId });
const { url } = await this._api.uploadAttachment.trigger({ file });
```

---

## 4. `links` — optimistic updates & cache wiring

Connect a command to one or more resources so the cache stays consistent after a mutation. `forwardArgs` is **required** — it maps command args → resource args (i.e. which cache entry is affected).

Three independent strategies (combine as needed):

| Strategy            | When                                             |
|---------------------|--------------------------------------------------|
| `optimisticUpdate`  | Patch cache **before** server responds (Immer draft). Auto-rolled back on error. |
| `update`            | Patch cache **after** successful response (receives the server result).          |
| `invalidate: true`  | Mark cache entry stale on success — next read refreshes.                         |

```ts
@injectable("SCOPED")
export class UpdateStatusApi {
  private userApi = inject(UserApi);

  setStatus = api.createCommand<UserStatus, User>({
    queryFn: (status) => fetchUpdateCurrentUser({ status }),
    links: (link) =>
      link({
        resource: this.userApi.getCurrentUser,
        forwardArgs: () => undefined, // getCurrentUser has no args
        optimisticUpdate: (draft, status) => {
          if (draft) draft.status = status;
        },
      }),
  });
}
```

Multiple links per command (e.g. update one resource and invalidate another):

```ts
links: (link) => {
  link({
    resource: this.userApi.getCurrentUser,
    forwardArgs: () => undefined,
    update: (draft, args, response) => Object.assign(draft, response),
  });
  link({
    resource: this.orderApi.listOrders,
    forwardArgs: () => ({ status: "ALL" }),
    invalidate: true,
  });
},
```

---

## 5. Plugin hooks — `onCacheEntryAdded` / `onQueryStarted`

For per-resource/per-command lifecycle (subscribe to websockets, log, instrument, etc.). Mention briefly — read the package docs before using.

```ts
getCurrentUser = api.createResource({
  key: "currentUser",
  queryFn: fetchCurrentUser,
  onCacheEntryAdded: async (args, { entry, $cacheDataLoaded, $cacheEntryRemoved }) => {
    await $cacheDataLoaded; // wait for initial data
    const sub = wsClient.subscribe("user", (patch) => {
      entry.createPatch((draft) => Object.assign(draft, patch)); // apply update to cached data
    });
    await $cacheEntryRemoved; // wait for last consumer to detach
    sub.unsubscribe();
  },
});
```

---

## 6. Agents (advanced)

`useResource` / `useCommand` are sugar over **agents** — low-level subscribers that own a `status`, `data`, `error` stream. Reach for `resource.createAgent()` / `command.createAgent()` only when you need a reactive observer outside React (e.g. inside a store) **and** the imperative `trigger`/`refresh` is not enough.

Default rule: components use the hooks; stores use `trigger`. Only drop to agents if you genuinely need reactive cache state in non-React code.

---

## Rules

- ❌ Don't declare resources/commands at module scope — put them on a `@injectable("SCOPED")` API class.
- ❌ Don't call `.useResource` / `.useCommand` outside a React render.
- ❌ Don't omit `forwardArgs` in `links` — even when the resource has no args, return `undefined` explicitly.
- ❌ Don't reach for agents when `trigger`/`refresh`/`useResource` would do.
- ✅ Every `createResource` / `createCommand` needs a unique `key` (used by devtools, broadcast, snapshots).
- ✅ Prefer `useResource`/`useCommand` in components; `trigger` in stores.
- ✅ Use `SKIP` to gate a resource until args are ready.
