---
name: fozy-labs-signals
description: >
  Reactive state primitives via @fozy-labs/rx-toolkit — Signal.state / compute / effect,
  LocalSignal, RxJS interop and the useSignal React hook.
---

# @fozy-labs/rx-toolkit — Signals

Value-based reactive primitives (SolidJS / Angular Signals in spirit), built on RxJS. Reference version: **0.11.2**.
Use for **local synchronous state** — server state goes through `createResource` (see `fozy-labs-rx-api`).

Two layers:

- **core** — framework-agnostic (`Signal`, the `State` / `Computed` / `Effect` / `FromSignal` classes, `Batcher`). Works in Node, workers, tests, any framework.
- **react** — a single hook, `useSignal`. React ≥ 19 (declared peer), client-only.

Reactivity is by **value, not by event**: every write dedupes with `Object.is`, so writing an equal value notifies nobody.

**Convention:** every signal field ends with a `$` suffix (matches the RxJS observable convention).

---

## 1. `Signal.state` — mutable reactive value

```ts
import { Signal } from "@fozy-labs/rx-toolkit";

class FiltersStore {
  readonly query$ = Signal.state("");
  readonly user$ = Signal.state<UserDto | null>(null);
  readonly isOpen$ = Signal.state(false, "FiltersStore/isOpen$"); // 2nd arg = devtools key

  markSeen() {
    this.user$.update((u) => (u ? { ...u, seen: true } : u));
  }
}
```

| Call                         | Tracked | Notes                                                            |
|------------------------------|---------|------------------------------------------------------------------|
| `s$()` / `s$.get()`          | yes     | Registers a dependency when read inside a `compute` / `effect`.  |
| `s$.peek()`                  | no      | Current value, no subscription.                                  |
| `s$.set(v, actionName?)`     | —       | Silently ignored when `Object.is(v, current)`.                   |
| `s$.update(fn, actionName?)` | —       | `set(fn(peek()))` — the read inside `update` is **not** tracked. |
| `s$.obs`                     | —       | `Observable<T>`; see [references/rxjs-interop.md](references/rxjs-interop.md).               |
| `s$.dispose()`               | —       | Completes the signal; see [references/disposal-and-leaks.md](references/disposal-and-leaks.md).    |

- ❌ Mutating an object in place and re-`set`ting the same reference is a no-op — the `Object.is` guard swallows it. Always set a new reference.
- Every `set` / `update` already opens a batch; `Batcher.run` is only for grouping several writes.

---

## 2. `Signal.compute` — derived, lazy, read-only

```ts
class OrderListStore {
  private readonly _session = inject(SessionStore);

  readonly orders$ = Signal.state<OrderDto[]>([]);
  readonly archivedIds$ = Signal.state<string[]>([]);

  readonly isAuthenticated$ = Signal.compute(() => this._session.user$() !== null);
  readonly archivedKeys$ = Signal.compute(() => new Set(this.archivedIds$()));
  readonly visible$ = Signal.compute(() =>
    this.orders$().filter((o) => !this.archivedKeys$().has(o.id)),
  );
}
```

- **Lazy.** With no subscriber it computes on demand and memoizes against the values of the dependencies it read — it holds no subscriptions. A live subscriber (a tracking parent, `obs`, `useSignal`) starts an internal effect that keeps it warm, and stops it when the last subscriber leaves.
- **Deduped by `Object.is`.** A compute that builds a fresh object / array / `Set` on every run notifies on every run — that is a legitimate result, not a bug, but it is what makes React re-render. See [references/extra-recomputes.md](references/extra-recomputes.md).
- Returns `DisposableSignal<T>` — no `set` / `update`.
- ❌ Never `async` — a promise is not a value. Use `createResource` (`fozy-labs-rx-api`).

---

## 3. `Signal.effect` — side effect on dependency change

```ts
const stop = Signal.effect(() => {
  const id = this.resourceId$();     // tracked — read synchronously
  const mode = this.mode$();
  
  const ws = openSocket(id, mode);
  
  return () => ws.close();           // teardown: before the next run and on unsubscribe
});

stop.unsubscribe(); // stop it; `stop.closed` is true afterwards
```

- Runs **immediately and synchronously** at creation, then again on every tracked change.
- **Only synchronous reads are tracked.** A signal read after `await`, inside `.then`, or in a timer callback establishes nothing — capture it before the async hop.
- If the body throws, the effect unsubscribes itself and rethrows — it is dead and will never run again.
- Nothing stops an effect for you. Create it where a teardown hook exists (React `useEffect`, DI `onScopeInit`), never in a constructor. See [references/disposal-and-leaks.md](references/disposal-and-leaks.md).

---

## 4. `Signal.from` — RxJS Observable → signal

```ts
readonly online$ = Signal.from(navigatorOnline$, { default: true });
readonly clicks$ = Signal.from(clickStream$, { keepAlive: "forever" }); // stateful pipeline
```

One **shared** upstream subscription behind a replay cache: while it is hot every read is a cache hit, not a
re-subscription. `keepAlive` (`"none" | "microtask" | "task" | "forever" | number`, default `"microtask"`) decides how
long that subscription outlives the last consumer.

- Returns `DisposableSignal<T>` — `dispose()` freezes the last value and drops the upstream.
- A read with nothing emitted returns `default`, or throws `Error: No value emitted` when no `default` was given.
- Picking a `keepAlive`, error and complete behaviour: [references/rxjs-interop.md](references/rxjs-interop.md).

---

## 5. Types

```ts
// Signal.from(), SourceSignal.create()
interface ReadonlySignal<T> {
  readonly obs: Observable<T>;
  peek(): T;
  get(): T;
  (): T;
}

// Signal.compute(), Signal.from()
interface DisposableSignal<T> extends ReadonlySignal<T>, Disposable {
  dispose(): void;
}

// Signal.state()
interface StateSignal<T> extends DisposableSignal<T> {
  set(value: T, actionName?: string): void;
  update(updater: (value: T) => T, actionName?: string): void;
}
```

- `Signal.effect` returns an `Effect`, not a signal — an RxJS `SubscriptionLike` with `unsubscribe()` and `closed`.
- `LocalSignal.state` returns `LocalStateSignal<T>`: `ReadonlySignal` + `set` / `update` / `clear`, and notably **no**
  `dispose()` ([references/persisted-state.md](references/persisted-state.md)).

---

## 6. Devtools

```ts
import { DefaultOptions, reduxDevtools } from "@fozy-labs/rx-toolkit";

if (import.meta.env.DEV) {
  DefaultOptions.update({ DEVTOOLS: reduxDevtools() });
}
```

- Name a signal at creation: `Signal.state(0, "counter")` — the string is the `key` of `SignalOptions`. There is no `name` field.
- Label a write: `count$.set(0, "reset")` → action `UPDATE: reset`; a bare `set` → `UPDATE`.
- A flush carries the whole batch as one action, so its label describes the batch, not a single key: the event types it
  holds, joined by `+` in `CREATE → RECREATE → UPDATE → CLEAR` order, then the names collected (the first per key,
  deduped, five at most, then `+N more`) — `CREATE+UPDATE: reset, increment`. Which keys moved is in the **Diff** tab.
- A signal created under a key its predecessor still holds is `RECREATE`, not a collision: the newcomer owns the key,
  and late events from the superseded instance — its `dispose()`, its GC finaliser — are ignored. Never `dispose()` a
  signal merely to keep devtools clean.
- The key-collision warning fires only when a superseded instance keeps **writing** — two live signals on one key. That
  write is dropped so the tree keeps the owner's value; give one of them a unique key.
- `{scope}` inside a key is replaced by `DefaultOptions.update({ getScopeName })` — wire it to the DI scope name for keys like `"{scope}/CounterStore/value$"`. `{base}` expands to `State` / `Computed`.
- Opt out per signal: `Signal.state(secret, { isDisabled: true })`.
- `SignalOptions.hooks` (`onInit` / `onChange` / `onDispose`) is honoured by `Signal.state` only — `Signal.compute` drops it.

---

## Rules

- ❌ Don't use `Signal.compute` for async values — use `createResource` (see `fozy-labs-rx-api` if exist).
- ❌ Don't read signals inside `await` / microtask callbacks and expect tracking.
- ❌ Don't create effects or subscriptions in a constructor — there is no teardown there.
- ❌ Don't mutate in place and re-`set` the same reference — the write is dropped.
- ✅ `$` suffix on every signal field.
- ✅ Keep derived values as narrow as possible — one signal per thing a consumer reads.

---

## Conditional references

Load these only when the specific situation applies — do **not** preload.

| Situation                                                                          | File                                 |
|------------------------------------------------------------------------------------|--------------------------------------|
| Rendering signals in React — `useSignal`, component-local signals, StrictMode, SSR | [references/use-in-react.md](references/use-in-react.md)         |
| Signals outside React — Node, workers, tests, Angular/Svelte/Solid, class style    | [references/use-outside-react.md](references/use-outside-react.md)    |
| A compute/effect runs too often, too rarely, or out of order; `Batcher`            | [references/extra-recomputes.md](references/extra-recomputes.md)     |
| Deciding what must be disposed, effect teardown, leaks, DI scope interaction       | [references/disposal-and-leaks.md](references/disposal-and-leaks.md)   |
| An RxJS `Observable` on either side — `obs`, `Signal.from`, `keepAlive`, `SourceSignal`         | [references/rxjs-interop.md](references/rxjs-interop.md)         |
| State that must survive a reload — `LocalSignal`, storage layout, GC, drivers      | [references/persisted-state.md](references/persisted-state.md)      |
| One big object or a keyed collection wakes every reader (experimental APIs)        | [references/fine-grained-state.md](references/fine-grained-state.md)   |
| Existing code uses a name this skill does not describe (`signalize`, `LocalState`) | [references/migrations.md](references/migrations.md)           |

Pick **one** of `use-in-react.md` / `use-outside-react.md` — the one matching the host. Loading both variants of the same topic is redundant.
