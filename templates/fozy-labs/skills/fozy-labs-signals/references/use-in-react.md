# Signals in React

Reading and owning signals from components. For Node, workers, tests and other frameworks see `use-outside-react.md` —
pick the one matching your host, not both.

React ≥ 19 is the declared peer dependency. Nothing needs wiring up: `useSignal` is the whole binding.

**Contents:** [`useSignal`](#usesignal) · [Stable signal identity](#stable-signal-identity) · [Component-local signals](#component-local-signals) · [Effects in components](#effects-in-components) · [Other exported hooks](#other-exported-hooks) · [Store pattern](#store-pattern)

---

## `useSignal`

```tsx
import { useSignal } from "@fozy-labs/rx-toolkit";

function CurrentUserWidget() {
  const session = inject(SessionStore);
  const user = useSignal(session.user$);
  const isAuth = useSignal(session.isAuthenticated$);

  return <span>{isAuth ? user?.username : "guest"}</span>;
}
```

- Accepts anything shaped `{ obs, peek }` — every signal type, plus the `unstable_ProxySignal` /
  `unstable_KeyedSignal` controllers (`fine-grained-state.md`).
- Implemented as `useSyncExternalStore(subscribe, () => signal$.peek())`. Subscribes on mount, unsubscribes on unmount.
- Re-renders only when the snapshot changes — React compares with `Object.is`.
- A burst of synchronous writes is coalesced into one `queueMicrotask` notification, so a batch produces one re-render.
- One hook per field. `useSignal(store.user$)` and `useSignal(store.isAuth$)` re-render independently; a single hook over
  a composite object re-renders on every part of it.

### `peek()` must return a stable reference

React requires `getSnapshot` to return a cached value; a snapshot that allocates on every call sends the component into
an infinite render loop (`The result of getSnapshot should be cached`).

- ✅ `Signal.state` — returns the stored value.
- ✅ `Signal.compute` — memoises, cold and warm alike.
- ✅ `Signal.from` — while mounted, `useSignal`'s own subscription keeps the upstream hot, so `peek()` is a replay-cache
  hit. Prefer `keepAlive: "forever"` for a stateful pipeline (`scan`): the very first `getSnapshot` runs during render,
  before React subscribes, and a shorter window lets the source restart in between.
- ❌ `SourceSignal.create(...)` over a cold or non-replaying source — **every** `peek()` re-subscribes and re-runs the
  body, so a `map` that builds objects yields a new reference each call. Use `Signal.from` (`rxjs-interop.md`).

### Server rendering

`useSignal` passes no `getServerSnapshot`, so it is **client-only**: React throws `Missing getServerSnapshot, which is
required for server-rendered content` when rendering on the server or hydrating server-rendered HTML. For data that must
exist during SSR use `useResource` (`fozy-labs-rx-api`) or pass values down as props.

---

## Stable signal identity

`useSignal` keys its subscription on the signal object. Passing a freshly created signal on each render re-subscribes on
every commit — and, for a computed, leaks the previous one.

```tsx
// ❌ new computed per render
const total = useSignal(Signal.compute(() => items$().length));

// ✅ created once
const total$ = useConstant(() => Signal.compute(() => items$().length));
const total = useSignal(total$);
```

---

## Component-local signals

`useConstant(fn, deps?)` is exported by the package — a `useMemo` that is never discarded by React.

```tsx
import { Signal, useConstant, useSignal } from "@fozy-labs/rx-toolkit";

function SearchBox() {
  const query$ = useConstant(() => Signal.state(""));
  const query = useSignal(query$);

  return <input value={query} onChange={(e) => query$.set(e.target.value)} />;
}
```

- `useConstant` recreates its value when `deps` change, but does **not** dispose the previous one. For a plain
  `Signal.state` that is harmless (it holds nothing); for a computed with subscribers, dispose it yourself.
- For state that only this component reads, `useState` is still simpler. Reach for a component-local signal when the
  value must feed a `Signal.compute` / `Signal.effect` graph, or be handed to non-React code.

---

## Effects in components

```tsx
useEffect(() => {
  const stop = Signal.effect(() => {
    const id = store.resourceId$();
    const ws = openSocket(id);
    return () => ws.close();
  });
  return () => stop.unsubscribe();
}, [store]);
```

- StrictMode mounts, unmounts and remounts in development: the effect is created and torn down twice. Keep teardown
  idempotent.
- `Signal.effect` runs synchronously at creation, so its first run happens inside the `useEffect` commit — not during
  render.
- ❌ Never create a `Signal.effect` in the render body: nothing unsubscribes it, and every render adds another.

---

## Other exported hooks

| Hook                                | Use                                                                             |
|-------------------------------------|----------------------------------------------------------------------------------|
| `useConstant(fn, deps?)`            | Create a value once (signals, stores) without React discarding it.              |
| `useEventHandler(fn)`               | A stable callback identity that always calls the latest `fn` — safe in deps.    |
| `useIsomorphicLayoutEffect(fn, deps?)` | `useLayoutEffect` on the client, `useEffect` on the server (no SSR warning).  |

---

## Store pattern

Signals live on plain classes; components only read them. With DI (`fozy-labs-di`) the store comes from `inject`, and
the component never pushes state back into it:

```tsx
function OrderList() {
  const store = inject(OrderListStore);
  const orders = useSignal(store.visible$);
  const isEmpty = useSignal(store.isEmpty$);

  if (isEmpty) return <EmptyState />;
  return <ul>{orders.map((o) => <OrderRow key={o.id} order={o} />)}</ul>;
}
```

- ✅ Write through store methods or `signal$.set` in event handlers.
- ✅ Group several writes from one handler in `Batcher.run` so downstream computeds and effects see one consistent
  update. The re-render itself is already coalesced by `useSignal`.
- ❌ Don't `useEffect` React state *into* a store via setters; key the scope on the input instead (`fozy-labs-di`).
