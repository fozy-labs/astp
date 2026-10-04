# Reading — React hooks

`useResource`, `useSuspenseResource`, `useResources`, `SKIP`, the state shape and the timing hooks, for components rendering server data.

**Contents:** [`useResource`](#useresourceargs) · [The state shape](#the-state-shape) · [`SKIP`](#skip--conditional-queries) · [`useSuspenseResource`](#usesuspenseresourceargs) · [`useResources`](#useresourcesslots--several-resources-in-one-hook) · [Timing hooks](#timing-hooks) · [`useCommand`](#usecommandentrykey) · [Standalone forms](#standalone-forms)

The hooks exist (as a method) **only** when the api was built with `reactHooksPlugin()`. All React bindings live in `@fozy-labs/rx-toolkit/react` — nothing React comes from the package root:

```ts
import { reactHooksPlugin } from "@fozy-labs/rx-toolkit/react";

export const api = createApi({ plugins: [reactHooksPlugin()] });
```

---

## `useResource(args)`

```tsx
const userApi = inject(UserApi);

// TArgs is void → call with no arguments
const { data, hasData } = userApi.getCurrentUser.useResource();

// With args — a new cache entry per serialized args
const page = userApi.getOrders.useResource({ status, page });
```

Behaviour:

1. Creates a clutch per `(resource, args key)` during render, then starts it in a layout effect — a cold entry is created and begins loading. Render stays pure: no shared clutch is mutated, so an args change inside `startTransition` (router navigation) cannot ping-pong between the transition and the committed tree.
2. On an args change a new clutch takes over; the last committed clutch hands its data to the successor (`adoptPrevious`), so the previous entry's data stays visible (SWR) as `dataSource: "previous"` with `isSwitching: true` and `dataArgs` pointing at the old args.
3. On unmount it unsubscribes; the entry survives `retentionTime` (default 60 000 ms), so a remount inside that window renders from cache instantly.
4. It never refetches an entry that already holds data — a warm entry is reused as-is. For fresh data call `state.invalidate()`, or `prefetch(args, { force: true })` from outside the component.

Passing a fresh object literal every render is fine: entries are addressed by the **serialized** key, not by reference. There is no dependency array to maintain.

---

## The state shape

`TResourceClutchState` is a discriminated union over three axes: `status`, `dataSource` and `hasError`. Every variant carries the literal values of all three, so narrowing works on any of them: narrowing on `hasData` gives `data: TData` without `| null`, narrowing on `hasError` gives `error: TError`.

| Field | Meaning |
|-------|---------|
| `status` | `idle` (`SKIP`) · `pending` (a request is in flight) · `success` · `error` — answers only "is a request running and how did the last one end". |
| `dataSource` | Where `data` came from: `none` · `placeholder` · `previous` · `current`. The single source of truth about data presence. |
| `data` / `dataArgs` | What is on screen and the args it was loaded for (`dataArgs` is `null` for `none` / `placeholder`). |
| `args` | The observed args (`null` only in `idle`). |
| `error` | The failure of the last settle of the **current** args; lives until the next settle, so it survives a retry. |
| `isPending` | A request is in flight. |
| `isInitialLoading` | In flight, and there is nothing (or only a placeholder) to show. |
| `isSwitching` | In flight, previous-args data on screen. |
| `isInvalidating` | In flight over current-args data. |
| `hasData` / `hasError` | `dataSource !== 'none'` / `error !== null`. |
| `updatedAt` | When the shown `data` was loaded: `null` for `none` / `placeholder`, the previous entry's time for `previous`, this entry's time for `current` (hydration and SWR refetch included). |
| `retry()` | Re-runs the failed query, **keeping the error on screen** (`pending` + `hasError`). |
| `invalidate()` | Re-checks the shown entry, **clearing** the error — warns and no-ops on error with nothing shown (`retry()` is the call there). |

`dataSource` values: `placeholder` is the product of the resource's `placeholderData` option — synthesized data for args with nothing cached, never written to the cache; `previous` is previous args' data held over an args change (SWR); `current` is this entry's own data. Display priority: `current` → `placeholder` → `previous` → `none`.

Two checks the union does **not** survive:

- ❌ `data !== null` / `data &&` as the "loaded" check — `TData` itself may be `null` (a `queryFn` returning `null` for "not found" yields `hasData: true`), so the falsy check sends that screen to loading or error. The check is `hasData`.
- ❌ `switch (state.status)` — `pending` covers initial load, switching and invalidation; without a `hasData` branch first it shows a spinner on every background refresh.

A retry in flight is `isPending && hasError` — there is no separate flag; the failure being retried stays in `error` until the run settles. Which failure sits in `error`: the initial load failed (`!hasData`), the new args failed behind previous data (`dataSource: 'previous'`), or the invalidation failed over current data (`status: 'error'`, `dataSource: 'current'`).

```tsx
const state = orderApi.getOrders.useResource({ status });

if (state.hasData) {
  return (
    <OrderList
      items={state.data}                                            // TData, no | null
      stale={state.isPending}
      caption={state.isSwitching ? `Showing ${state.dataArgs.status}, loading ${state.args.status}…` : undefined}
      notice={state.hasError ? state.error : undefined}             // error over shown data
    />
  );
}
if (state.hasError)                                                 // error: TError, not `| null`
  return <ErrorBox error={state.error} onRetry={state.retry} busy={state.isPending} />;
if (state.isPending) return <Spinner />;
return null;                                                        // idle (SKIP)
```

`error` is `unknown` unless the api declares `mapError` — see [error-handling.md](error-handling.md).

What to render for each case — [ui-states.md](ui-states.md).

---

## `SKIP` — conditional queries

```tsx
import { SKIP } from "@fozy-labs/rx-toolkit";

const { data } = orderApi.getOrders.useResource(status ? { status } : SKIP);
```

`SKIP` puts the clutch in `idle`: no cache entry, no request, `data: null`. It is the only way to make a read conditional — hooks cannot be called conditionally.

---

## `useSuspenseResource(args)`

Same subscription, different failure contract. The decision, in order:

1. There is something to show (`hasData`) → **return the state** — `data` is `TData`, never `null`.
2. `status === 'error'` with nothing to show → **throw the error** → the nearest Error Boundary.
3. Otherwise → **suspend** → the nearest `<Suspense fallback>`.

| Situation                        | `useResource`                              | `useSuspenseResource`                    |
|----------------------------------|--------------------------------------------|------------------------------------------|
| Initial load, nothing to show    | `isInitialLoading: true`                   | throws a promise → `<Suspense>`          |
| Initial error, nothing to show   | `hasError && !hasData`                     | throws the error → Error Boundary        |
| Error behind previous / placeholder data | `hasError`, data stays on screen | same — **returned in state**, no boundary |
| Args changed, old data on screen | `isSwitching: true`, `dataArgs` = old args | same — never suspends                    |
| Background invalidation          | `isInvalidating: true`                     | same — never suspends                    |
| Warm cache                       | renders `success`                          | renders synchronously, no fallback       |

```tsx
function UserCard({ userId }: { userId: string }) {
  const { data, isInvalidating } = userApi.getUser.useSuspenseResource({ userId });
  return <h1>{data.name}{isInvalidating && " …"}</h1>; // data is TData, never null
}
```

The returned union (`TSuspenseResourceState`) is narrowed to `dataSource: 'placeholder' | 'previous' | 'current'`.

Constraints:

- `SKIP` is **not** accepted — the arg type is `TArgsOrVoid<TArgs>`. A component that may suspend must always have args; use `useResource` for conditional reads.
- The query starts right after the suspending render (in a microtask), not in an effect — the render itself creates no entry and runs no `queryFn`.
- Under SSR a boundary that suspends on the server renders its fallback there — the data arrives on the client. Hydrate the cache when the server HTML must contain it — see [ssr-hydration.md](ssr-hydration.md).

---

## `useResources(slots)` — several resources in one hook

```tsx
import { SKIP } from "@fozy-labs/rx-toolkit";
import { useResources, useSuspenseResources } from "@fozy-labs/rx-toolkit/react";

const card = useResources({
  user: userApi.getUser.bind({ id }),
  stats: withStats ? statsApi.getStats.bind({ id }) : SKIP,
});
card.states.user;                 // TResourceClutchState — the slot, exactly as useResource returns it
card.data;                        // { user: TUser; stats: TStats | null } once card.hasData

const rows = useResources(ids.map((id) => orderApi.getOrder.bind({ id }))); // dynamic length; a literal [a, b] stays a tuple
```

One subscription for any number of slots, so it also covers a dynamic list where `useResource` in a loop is impossible.
Free function only — import it from `@fozy-labs/rx-toolkit/react`.

| Field | Meaning |
|-------|---------|
| `states` | Each slot's clutch state, in the input's shape; a `SKIP` slot is `idle`. |
| `status` | First match: `idle` (every slot `SKIP`) · `pending` (some slot in flight) · `error` (some slot failed) · `success`. |
| `hasData` / `data` | Every engaged slot has data; a `SKIP` slot does not block and reads `null`. `data` keeps its identity while slot data is unchanged. |
| `isPending`, `isInitialLoading`, `isSwitching`, `isInvalidating` | "Some slot is like this" — several can be `true` at once. |
| `hasError` / `error` | The **first** slot error in slot order — not a list; read `states` for the others. |
| `retry()` | Retries every failed slot. |
| `invalidate(opts?)` | Invalidates every engaged slot; a slot that failed with nothing to show is **retried** (unlike `state.invalidate()` of a single resource, which warns and no-ops there). |

The aggregate `status` is not a render switch: `pending` is checked before `error`, so a slot retrying next to a
failed one gives `pending` + `hasError`, and an invalidation failure in one slot gives `error` with `hasData: true`.
Narrow on `hasData` / `hasError` first, as for a single resource.

Slot behaviour:

- A named slot keeps the previous args' data while new args load (SWR); an array slot does not — the index is not an identity.
- A slot whose resource and args were already in the set is reused without a new request, also after an index shift; equal slots share one clutch.
- `[]` / `{}` is immediately `success` with `hasData: true`.

**`useResources` or a projection resource** — they overlap only when every slot reads one resource. A projection
resource needs a batch endpoint and fails as one set; `useResources` sends a request per slot and keeps a failed row
local. A projection's `bind(ids)` can itself be one slot — see [projection-resource.md](projection-resource.md).

### `useSuspenseResources(slots)`

The Suspense variant: every slot starts in **one** suspending render — several `useSuspenseResource` calls in a row
waterfall, because the first one to suspend keeps the next from starting. In order:

1. Every slot has something to show → returns the state, `data` is never `null`.
2. Some slot failed with nothing to show → throws the first such error to the Error Boundary without waiting for the rest; every such slot is marked, so the remount after the boundary's reset refetches it.
3. Otherwise → suspends.

`SKIP` is rejected (types and a runtime `TypeError`) — use `useResources` for conditional slots. While suspended it
holds every slot's entry, so a fast slot is not evicted by a short `retentionTime` while a slow one loads.

---

## Timing hooks

Anti-flicker and debounce helpers from `@fozy-labs/rx-toolkit/react`. All take an options object and return a tuple;
`delay` and `minDuration` must be non-negative finite numbers (a `RangeError` otherwise). Changing options does not
restart a running timer.

| Hook | Call | Returns |
|------|------|---------|
| `useDelayedFlag` | `useDelayedFlag(active, { delay, minDuration? })` | `[shown, isDelaying]` — `shown` turns on after `delay`, then stays on at least `minDuration` |
| `useDebouncedArgs` | `useDebouncedArgs(argsOrSkip, { delay })` | `[args, isDebouncing, flush]` — compares by the cache key, so a fresh `{ q }` per render does not restart the timer; `SKIP` applies at once |
| `useDebouncedValue` | `useDebouncedValue(value, { delay, equals?, immediate? })` | `[value, isDebouncing, flush]` — any value; `equals` defaults to `Object.is`, `immediate(v)` applies matching values in the same render |

```tsx
const [args, isDebouncing, flush] = useDebouncedArgs(q ? { q } : SKIP, { delay: 250 });
const results = searchApi.search.useResource(args);
const [showSkeleton, isDelaying] = useDelayedFlag(results.isInitialLoading && !results.hasError, { delay: 150, minDuration: 400 });
```

- The first value applies on mount; a value equal to the applied one cancels the timer; `flush()` applies the latest input now (Enter key).
- While `isDelaying`, `active` is `true` but `shown` is `false` — render neither the indicator nor an empty branch.
- Use `useDebouncedArgs` for resource args, `useDebouncedValue` for anything else. Which delays to choose — [ui-states.md](ui-states.md#timing).

---

## `useCommand(entryKey?)`

```tsx
const [createOrder, { isPending, hasError, error, retry }] = orderApi.createOrder.useCommand();

async function onSubmit(dto: CreateOrderDto) {
  const result = await createOrder(dto); // never rejects
  if (result.status === "success") navigate(`/orders/${result.data.id}`);
}
```

- The hook does **not** fire on mount; nothing runs until you call the trigger.
- The trigger is stable across renders (`useEventHandler`) — safe in props and dependency arrays.
- It returns `TTriggerPromise` — an envelope that never rejects. `try/catch` around `await` is dead code; use `result.status` or `.unwrap()`.
- The optional `entryKey` binds the hook to a named cache entry, so several components can observe the same mutation. Full semantics: [writing-mutations.md](writing-mutations.md).

---

## Standalone forms

Every hook is also exported as a free function taking the resource/command first. Use these when the api has no `reactHooksPlugin()`, or in generic components:

```tsx
import { useResource, useSuspenseResource, useCommand } from "@fozy-labs/rx-toolkit/react";

const state = useResource(orderApi.getOrders, { status });
const [trigger] = useCommand(orderApi.createOrder);
```

---

## Pitfalls

- ❌ `try { await trigger(x) } catch` — the hook trigger never rejects; the catch branch is unreachable.
- ❌ `useSuspenseResource(cond ? args : SKIP)` — does not type-check and is not supported.
- ❌ Reading `data` without narrowing — it is `TData | null` on the un-narrowed union.
- ❌ `if (query.data)` as the "loaded" check — `TData` may be `null`; use `hasData`.
- ❌ `switch (state.status)` without a `hasData` branch first — a spinner flashes on every invalidation.
- ❌ Wrapping the hook result in `useMemo` keyed on `data` to "avoid rerenders" — `useSignal` already skips unchanged values.
- ❌ `if (multi.status === 'error') return <Error />` on `useResources` — hides data after one slot's invalidation failure and swaps the error for a loader during a retry.
- ❌ Positional timing-hook arguments (`useDelayedFlag(flag, 150, 400)`) — every timing hook takes an options object.
- ✅ Narrow on `hasData` / `hasError` / `status` before touching `data` / `error`.
- ✅ Use `isInitialLoading` for the full-page spinner and `isInvalidating` for the inline indicator; `isPending` is both, plus switching.
- ✅ Render stale data with a quiet notice when `hasError && hasData` instead of an error screen — the last good response is still in `data`.
