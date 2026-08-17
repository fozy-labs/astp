# Reading — React hooks

`useResource`, `useSuspenseResource`, `SKIP`, and the state union, for components rendering server data.

**Contents:** [`useResource`](#useresourceargs) · [The state union](#the-state-union) · [`SKIP`](#skip--conditional-queries) · [`useSuspenseResource`](#usesuspenseresourceargs) · [`useCommand`](#usecommandkey) · [Standalone forms](#standalone-forms)

The hooks exist (as a method) **only** when the api was built with `reactHooksPlugin()`:

```ts
export const api = createApi({ plugins: [reactHooksPlugin()] });
```

---

## `useResource(args)`

```tsx
const userApi = inject(UserApi);

// TArgs is void → call with no arguments
const { data, isLoading } = userApi.getCurrentUser.useResource();

// With args — a new cache entry per serialized args
const page = userApi.getOrders.useResource({ status, page });
```

Behaviour:

1. Records the args during render, then starts in a layout effect (`agent.start()` → `getEntry(args, true)`) — a cold entry is created and begins loading.
2. On an args change it switches entries; the previous entry's data stays visible (SWR).
3. On unmount it unsubscribes; the entry survives `retentionTime` (default 60 000 ms), so a remount inside that window renders from cache instantly.
4. It never refetches an entry that already holds data — a warm entry is reused as-is. For fresh data call `state.refresh()`, or `prefetch(args, { force: true })` from outside the component.

Passing a fresh object literal every render is fine: entries are addressed by the **serialized** key, not by reference. There is no dependency array to maintain.

---

## The state union

`TResourceAgentState` is a discriminated union on `status`. Narrowing on `status` or on any boolean flag narrows `data` and `error` too.

| `status`         | `data`            | `error`  | `isLoading` | `isInitialLoading` | `isRefreshing` | `isRefreshError` | `isSuccess` | `isError` |
|------------------|-------------------|----------|-------------|--------------------|----------------|------------------|-------------|-----------|
| `idle`           | `null`            | `null`   | —           | —                  | —              | —                | —           | —         |
| `pending`        | `null`            | `null`   | ✅           | ✅                  | —              | —                | —           | —         |
| `success`        | `TData`           | `null`   | —           | —                  | —              | —                | ✅           | —         |
| `error`          | `TData \| null`¹  | `TError` | —           | —                  | —              | —                | —           | ✅         |
| `refreshing`     | `TData` (stale)   | `null`   | ✅           | —                  | ✅              | —                | —           | —         |
| `refresh-error`  | `TData` (stale)   | `TError` | —           | —                  | —              | ✅                | —           | ✅         |

¹ Normally `null`; carries the previous entry's stale data when the args changed under SWR.

Plus two methods on every variant: `retry()` (re-run a failed query) and `refresh()` (force a background SWR refresh).

```tsx
const state = orderApi.getOrders.useResource({ status });

if (state.isError) return <ErrorBox error={state.error} onRetry={state.retry} />; // error: TError, not `| null`
if (state.isInitialLoading) return <Spinner />;
if (!state.data) return null;                                                     // idle
return <OrderList items={state.data} isStale={state.isRefreshing} />;
```

`error` is `unknown` unless the api declares `mapError` — see [error-handling.md](error-handling.md).

---

## `SKIP` — conditional queries

```tsx
import { SKIP } from "@fozy-labs/rx-toolkit";

const { data } = orderApi.getOrders.useResource(status ? { status } : SKIP);
```

`SKIP` puts the agent in `idle`: no cache entry, no request, `data: null`. It is the only way to make a read conditional — hooks cannot be called conditionally.

---

## `useSuspenseResource(args)`

Same subscription, different failure contract:

| Situation                       | `useResource`                     | `useSuspenseResource`                |
|---------------------------------|-----------------------------------|--------------------------------------|
| Initial load                    | `isInitialLoading: true`          | throws a promise → `<Suspense>`      |
| Initial error, no stale data    | `isError: true`                   | throws the error → Error Boundary    |
| Background refresh (SWR)        | `isRefreshing: true`              | same — **never** suspends            |
| Refresh failed                  | `isRefreshError: true`            | same — stale data stays              |
| Warm cache                      | renders `success`                 | renders synchronously, no fallback   |

```tsx
function UserCard({ userId }: { userId: string }) {
  const { data, isRefreshing } = userApi.getUser.useSuspenseResource({ userId });
  return <h1>{data.name}{isRefreshing && " …"}</h1>; // data is TData, never null
}
```

Constraints:

- `SKIP` is **not** accepted — the arg type is `ArgsOrVoid<TArgs>`. A component that may suspend must always have args; use `useResource` for conditional reads.
- The query starts **during render**, not in an effect (a suspended render never runs effects).
- Client-only: it inherits `useSignal`, which has no `getServerSnapshot`. For streaming SSR use `useResource` — see [ssr-hydration.md](ssr-hydration.md).

---

## `useCommand(key?)`

```tsx
const [createOrder, { isLoading, isError, error, retry }] = orderApi.createOrder.useCommand();

async function onSubmit(dto: CreateOrderDto) {
  const result = await createOrder(dto); // never rejects
  if (result.status === "success") navigate(`/orders/${result.data.id}`);
}
```

- The hook does **not** fire on mount; nothing runs until you call the trigger.
- The trigger is stable across renders (`useEventHandler`) — safe in props and dependency arrays.
- It returns `TTriggerPromise` — an envelope that never rejects. `try/catch` around `await` is dead code; use `result.status` or `.unwrap()`.
- The optional `key` binds the hook to a named cache entry, so several components can observe the same mutation. Full semantics: [writing-mutations.md](writing-mutations.md).

---

## Standalone forms

Every hook is also exported as a free function taking the resource/command first. Use these when the api has no `reactHooksPlugin()`, or in generic components:

```tsx
import { useResource, useSuspenseResource, useCommand } from "@fozy-labs/rx-toolkit";

const state = useResource(orderApi.getOrders, { status });
const [trigger] = useCommand(orderApi.createOrder);
```

---

## Pitfalls

- ❌ `try { await trigger(x) } catch` — the hook trigger never rejects; the catch branch is unreachable.
- ❌ `useSuspenseResource(cond ? args : SKIP)` — does not type-check and is not supported.
- ❌ Reading `data` without narrowing — it is `TData | null` on the un-narrowed union.
- ❌ Wrapping the hook result in `useMemo` keyed on `data` to "avoid rerenders" — `useSignal` already skips unchanged values.
- ✅ Narrow on `isSuccess` / `isError` / `status` before touching `data` / `error`.
- ✅ Use `isInitialLoading` for the full-page spinner and `isRefreshing` for the inline indicator; `isLoading` is both.
- ✅ Render stale data during `refresh-error` instead of an error screen — the last good response is still in `data`.
