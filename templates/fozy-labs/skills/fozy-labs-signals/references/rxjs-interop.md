# RxJS interop

Moving values between signals and RxJS: `obs`, `Signal.from`, `SourceSignal`.

Rule of thumb: signals are the source of truth for **state**; RxJS is for **stream semantics** — debounce, throttle,
take N, window, retry, merge.

**Contents:** [1. Signal → Observable](#1-signal--observable) · [2. Observable → Signal](#2-observable--signal--signalfrom) · [3. `SourceSignal.create`](#3-sourcesignalcreate--custom-read-only-sources) · [4. Round trips leave the batch](#4-round-trips-leave-the-batch) · [Checklist](#checklist)

---

## 1. Signal → Observable

Every signal exposes `obs` (synchronously observable).

```ts
import { filter, take } from "rxjs";

const sub = clickCount$.obs.pipe(filter((v) => v === 10), take(1))
  .subscribe(() => toast("ten!"));

sub.unsubscribe(); // or takeUntil(destroyed$)
```

---

## 2. Observable → Signal — `Signal.from`

```ts
Signal.from<T>(source: Observable<T>, options?: {
  default?: T;                                          // no default → reads may throw
  keepAlive?: "none" | "microtask" | "task" | "forever" | number; // default "microtask"
  key?: string;                                         // devtools key
}): DisposableSignal<T>;
```

Returns a `DisposableSignal` — `()`, `get()`, `peek()`, `obs`, `dispose()`, `[Symbol.dispose]`.
Class form: `FromSignal.create(source, options)`.

Internally: `distinctUntilChanged(Object.is)` → `share({ connector: ReplaySubject(1) })`. So **one** upstream
subscription is shared by every consumer, and while it is hot every read is a replay-cache hit — a stable reference, no
re-subscription, no pipeline restart. Its `.obs` delivers **one value per batch**, at the end of it — a synchronous
burst on connect (`of(1, 2, 3)`) delivers just `3`.

### `keepAlive` — how long the upstream survives the last consumer

A "consumer" is an `obs` subscriber *or* a pull read (`get()` / `peek()`).

| Mode                    | Upstream is torn down…                                       | Use for                                             |
|-------------------------|---------------------------------------------------------------|-----------------------------------------------------|
| `"none"`                | immediately, at every refcount-zero (`of(null)` notifier).   | Nothing — it restores the per-read re-subscribe.    |
| `"microtask"` (default) | when the current microtask queue drains.                     | Replaying sources; reads inside one sync burst.     |
| `"task"`                | on the next macrotask (`timer(0)`).                          | Reads spread across a single tick.                  |
| *number* (ms)           | after N ms idle; **renewed** by every new consumer.          | Bursty polling / imperative reads.                  |
| `"forever"`             | never — only `dispose()` ends it.                            | Stateful cold pipelines (`scan`), hot event sources.|

An error always resets the cycle immediately (`resetOnError: true`), regardless of `keepAlive`.

### Read model

| Call                     | Behaviour                                                                                          |
|--------------------------|-----------------------------------------------------------------------------------------------------|
| `get()`                  | Registers the dependency **before** reading, so inside a `compute` / `effect` the read is always hot.|
| `peek()`                 | No tracking. Hot → cache hit. Cold → subscribes, takes a synchronous emission, unsubscribes.       |
| no value, no `default`   | Throws `Error: No value emitted`.                                                                  |
| no value, with `default` | Returns `default`. Presence is checked with `in`, so `{ default: undefined }` is a real default.    |
| source errored           | The error rethrows from `get()` / `peek()` and goes to `.obs` subscribers as `error`; the signal resets to cold and the next read re-subscribes (retry). Reactions the error itself woke read it **without** re-subscribing — otherwise every such reaction would loop the retry. An error arriving through a [bridge](#synchronous-bridges-behave-like-computed) stays the signal's state until the bridge's source signal changes. |

Because `get()` registers the dependency before reading, an async source (`debounceTime`, `interval`, a `Subject`)
never wakes a consumer while still handing it `default` — the subscription is already established by then.

```ts
// ✅ Stateful cold pipeline — one subscription, scan keeps its state.
const clicks$ = Signal.from(
  fromEvent(document, "click").pipe(scan((n) => n + 1, 0), startWith(0)),
  { keepAlive: "forever" },
);

// ✅ Async source — default covers the window before the first emission.
const debounced$ = Signal.from(query$.obs.pipe(debounceTime(300)), { default: "" });
```

### Lifetime

- `dispose()` snapshots the cached value first, then tears the upstream down: later reads return that **frozen** value
  and `obs` completes. With nothing cached at that moment, reads fall back to `default` / throw.
- `dispose()` also cancels a pending grace window, so `keepAlive: 30_000` never outlives the signal.
- A **completed** source keeps serving its last value for the rest of the keepAlive window, then restarts cold on the
  next read. Under `"forever"` it is served from cache indefinitely — a completed source is never re-subscribed.
- On the cold path a read restarts the source, so `keepAlive: "none"` over a `fromEvent` still means one listener
  attach/detach per read. That is the reason the default is `"microtask"`.

### When a `Signal.state` is still the better bridge

Reach for an explicit subscription when the value must be **written** as well as read, must survive independently of any
subscription, or feeds a long-lived store:

```ts
readonly debouncedQuery$ = Signal.state("");

// in onScopeInit / useEffect
const sub = this.query$.obs
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((q) => this.debouncedQuery$.set(q));

return () => sub.unsubscribe();
```

---

## 3. `SourceSignal.create` — custom read-only sources

Takes an RxJS-style subscribe function. **One producer for every observer**: it starts on the first `.obs` subscriber
or tracking reader and stops when the last one leaves; a read with no observers runs it and stops it immediately.
(0.12.x ran the producer per subscriber and per read.) Use it only for a genuinely synchronous imperative source;
otherwise wrap the observable in `Signal.from`.

```ts
import { SourceSignal } from "@fozy-labs/rx-toolkit";

const isOnline$ = SourceSignal.create<boolean>((subscriber) => {
  subscriber.next(navigator.onLine);             // synchronous initial value — mandatory
  const push = () => subscriber.next(navigator.onLine);
  window.addEventListener("online", push);
  window.addEventListener("offline", push);
  return () => {
    window.removeEventListener("online", push);
    window.removeEventListener("offline", push);
  };
});
```

---

## 4. Round trips leave the batch

`signal → observable → signal` through an asynchronous operator re-enters the graph in a later tick, outside the
synchronous batch flush. A consumer downstream of both the original and the round-tripped signal can therefore see two
updates for one logical change. Keep async hops at the edge of a derived chain, not in the middle of it.

### Synchronous bridges behave like computed

A `Signal.from(a.obs.pipe(…))` (or `SourceSignal`) whose chain answers every source value **synchronously** — `map`,
`filter`, `combineLatest` with other `.obs`, `switchMap` onto another signal's `.obs` — is a *bridge*. Nothing declares
it; the engine sees the synchronous subscription. Readers, effects, computed and `.obs` of dependents never see the
bridge lag behind `a`, not even inside a batch, and get one consistent value per batch. An error inside the chain becomes
the bridge's state until `a` changes (then the chain re-subscribes and stateful operators restart). A synchronous cycle
through a bridge throws `SignalCycleError`. Writing a `State` from an `.obs` subscriber callback, or an emission of an
external `Subject` / timer inside the chain, is **not** a bridge — that is a new write in a later tick (§4).

---

## Checklist

- ✅ `Signal.from` for every `Observable → signal` bridge.
- ✅ `default` on any source that does not replay synchronously — otherwise the first read throws.
- ✅ `keepAlive: "forever"` for stateful (`scan`, `startWith`) or expensive-to-attach sources; `dispose()` owns the end.
- ✅ Everything that must also be writable: subscribe and `set` into a `Signal.state`.
- ✅ `SourceSignal.create` bodies emit synchronously on subscribe.
- ❌ Don't leave a `Signal.from` over a hot resource undisposed when you chose `"forever"` — nothing else releases it.
- ❌ Don't expect `dispose()` on a `SourceSignal` result; it has none.
- ❌ Don't count emissions inside a batch from a `Signal.from` `.obs` subscriber — it delivers the batch's last value only.
