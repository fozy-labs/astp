---
name: fozy-labs-signals
description: >
  Reactive state primitives via @fozy-labs/rx-toolkit (Signal / LocalSignal / useSignal).
---

# @fozy-labs/rx-toolkit — Signals

Value-based reactive primitives (inspired by SolidJS / Angular Signals), built on RxJS. Use for **local synchronous state** — server state goes through `createResource` (see `fozy-labs-rx-api`).

**Convention:** all signal fields end with a `$` suffix (matches RxJS observable convention).

---

## 1. `Signal.state` — mutable reactive value

```ts
import { Signal } from "@fozy-labs/rx-toolkit";

user$ = Signal.state<UserDto | null>(null);
isOpen$ = Signal.state(false);

// Read (tracks dependency in compute/effect)
user$();

// Read without tracking
user$.peek();

// Write
user$.set(newUser);
user$.update((u) => ({ ...u, displayName }));
```

---

## 2. `Signal.compute` — derived (read-only)

Recomputes lazily; only when a dependency it actually reads has changed.

```ts
isAuthenticated$ = Signal.compute(() => this.user$() !== null);

canEdit$ = Signal.compute(() =>
  Rights.canEdit(this._session.user$(), this.permissions$()),
);

// Derived Set for fast membership lookup
archivedKeys$ = Signal.compute(() => new Set(this._archivedKeys$()));
```

---

## 3. `Signal.effect` — side effect on dependency change

Runs once on creation, then again whenever a tracked dependency changes. Return a teardown function for cleanup before the next run or on unsubscribe.

```ts
const stop = Signal.effect(() => {
  const resourceId = this.resourceId$();
  const mode = this.mode$();
  const ws = openSocket(resourceId, mode);
  return () => ws.close(); // cleanup before next run or on unsubscribe
});

// Stop the effect (e.g. in `onScopeInit` cleanup)
stop.unsubscribe();
```

**Async caveat:** only signals read **synchronously** during the effect body are tracked. Reads inside `await`/`then` callbacks won't establish subscriptions — capture them first.

> Recommended to create the effect (as well as create the subscription) when mounting, rather than when creating the entity.

---

## 4. `LocalSignal.state` — persisted in localStorage

For user preferences that should survive reloads.

```ts
import { z } from "zod";
import { LocalSignal } from "@fozy-labs/rx-toolkit";

isOpen$ = LocalSignal.state<boolean>({
  defaultValue: true,
  key: "filters_panel_open",         // localStorage key suffix
  userId: this._session.user$()?.id, // namespaces per-user — required unless truly anonymous
  zodSchema: z.boolean(),            // validates stored value on hydration
  devtoolsOptions: "FiltersPanelStore/isOpen$",
  driver: localStorage,              // optional; defaults to localStorage
});

// Read/write API identical to Signal.state
isOpen$.set(false);

// Reset to defaultValue (removes the key)
isOpen$.clear();
```

- `userId`: omit only for genuinely anonymous state.
- `zodSchema`: always provide — guards against stale/corrupt storage.
- Hydration is synchronous — no waiting step.

---

## 5. React: `useSignal`

```tsx
import { useSignal } from "@fozy-labs/rx-toolkit";

function CurrentUserWidget() {
  const session = inject(SessionStore);
  const user = useSignal(session.user$);            // re-renders on change
  const isAuth = useSignal(session.isAuthenticated$);
  return <span>{user?.username}</span>;
}
```

Subscribes on mount, unsubscribes on unmount. No re-render when the value is referentially equal.

---

## 6. RxJS interop

Each signal exposes an `obs: Observable<T>`. Each RxJS observable can be lifted into a signal via `signalize`.

```ts
// Signal → Observable: apply RxJS operators
import { filter, take } from "rxjs";

const tenClicks$ = clickCount$.obs.pipe(
  filter((v) => v === 10),
  take(1),
);
const sub = tenClicks$.subscribe(() => console.log("ten!"));
// Don't forget to unsubscribe (or use takeUntil(destroyed$)).

// Observable → Signal: bring an event stream into the signal graph
import { fromEvent } from "rxjs";
import { signalize } from "@fozy-labs/rx-toolkit";

const clicks$ = signalize(
  fromEvent(document, "click").pipe(scan((n) => n + 1, 0), startWith(0)),
);
const doubled$ = Signal.compute(() => clicks$() * 2);
```

```ts
// Alternative for Signal.effect (Allowed to track a single signal):
const sub = doubled$.obs.subscribe((v) => console.log(v));


// Don't forget to unsubscribe (or use takeUntil(destroyed$)).
sub.unsubscribe();
```

Use signals as the source of truth for **state**; use RxJS operators when you genuinely need stream semantics (debouncing, windowing, taking N events).

---

## 7. Devtools — actionName / devtoolsOptions

For meaningful entries in Redux DevTools:

```ts
// At signal creation — `name` shows up in the action log
count$ = Signal.state(0, "counter");

// On write — appended to the action type
count$.set(1);                      // "UPDATE"
count$.set(0, "reset");             // "UPDATE: reset"
count$.update((v) => v + 1, "inc"); // "UPDATE: inc"

// Disable tracking for a specific signal
secret$ = Signal.state(null, { isDisabled: true });
```

`LocalSignal.state` accepts the same via `devtoolsOptions` (string label or object).

---

## 8. Types reference

```ts
export interface ReadableSignalLike<T> {
  readonly obs: Observable<T>;
  peek(): T;
  get(): T;
}

export interface ReadableSignalFnLike<T> extends ReadableSignalLike<T> {
  (): T;
}

export interface WriteableSignalLike<T> {
  set(value: T, actionName?: string): void;
  update(updater: (value: T) => T, actionName?: string): void;
}

export interface ClearableSignalLike<_T> {
  clear(): void;
}

export interface StatefulSignalFn<T> extends ReadableSignalFnLike<T>, WriteableSignalLike<T>, ClearableSignalLike<T> {}
export interface SignalFn<T>         extends ReadableSignalFnLike<T>, WriteableSignalLike<T> {}
export type ComputeFn<T>             = ReadableSignalFnLike<T> & { destroy(): void };
```

---

## Rules

- ❌ Don't use `Signal.compute` for async values — use `createResource` (see `fozy-labs-rx-api`).
- ❌ Don't read signals inside `await`/microtask callbacks in a `compute`/`effect` and expect tracking.
- ✅ `$` suffix on every signal field.
- ✅ Always pass `zodSchema` to `LocalSignal.state` — storage can return stale shapes.
