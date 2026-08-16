# Recomputes, batching and ordering

Why a `compute` or `effect` runs more often, less often, or in a different order than expected — and how the batcher
decides. 

---

## 1. What actually gets tracked

Dependency tracking is a **single global handler**, installed for the duration of a tracked synchronous run and restored
in a `finally`. A signal read registers a dependency only while that handler is installed.

```ts
Signal.effect(() => {
  const id = this.id$();                    // ✅ tracked
  void fetchThing(id).then(() => {
    console.log(this.mode$());              // ❌ not tracked — handler already restored
  });
  setTimeout(() => this.mode$(), 0);        // ❌ not tracked
});
```

Capture every input synchronously at the top of the body. The same rule applies to `Signal.compute` — which should not
contain async work at all.

`peek()` is the deliberate escape hatch: read the current value without becoming dependent on it.

```ts
readonly label$ = Signal.compute(() => {
  const count = this.count$();              // recompute when count changes
  return `${this.prefix$.peek()}: ${count}`; // …but not when the prefix changes
});
```

`update(fn)` reads through `peek()` internally, so `count$.update((v) => v + 1)` inside an effect does **not** make the
effect depend on `count$`.

---

## 2. Dedupe is `Object.is`, in three places

| Where              | What it does                                                                                |
|--------------------|---------------------------------------------------------------------------------------------|
| `State.set`        | A write equal to the current value is dropped — no notification, no devtools entry.         |
| `Computed.obs`     | The output stream drops consecutive equal values.                                           |
| compute memo cache | A cold `peek()` re-uses the cached value while every recorded dependency still peeks equal. |

Consequences worth internalising:

- **`NaN` is stable and `+0 → -0` is a change** — this is `Object.is`, not `===`.
- **A fresh reference always propagates.** `Signal.compute(() => new Set(this.ids$()))` emits on every recompute, and a
  `useSignal` on it re-renders every time. That is correct behaviour, not a leak of updates.
- **In-place mutation is invisible.** `arr$.peek().push(x); arr$.set(arr$.peek())` writes the same reference — dropped.

When a downstream consumer needs structural rather than referential comparison, the package exports `shallowEqual` and
`deepEqual`; use them in a guard, not as a signal option (there is no `equals` option on `SignalOptions`).

```ts
import { shallowEqual } from "@fozy-labs/rx-toolkit";

readonly page$ = Signal.state<PageDto>(EMPTY_PAGE);

setPage(next: PageDto) {
  if (shallowEqual(next, this.page$.peek())) return;
  this.page$.set(next);
}
```

---

## 3. Cold vs warm computeds

A `Signal.compute` has two regimes, and they cost different things:

- **Cold** (nobody subscribed): `peek()` / `get()` validates the memo cache by peeking every recorded dependency; if any
  differs, `computeFn` runs again. Reading a cold computed in a tight loop is cheap only while its inputs hold still.
- **Warm** (a tracking parent, an `obs` subscriber, or `useSignal`): an internal effect pushes each new value into an
  internal state signal; reads are a plain lookup. The effect is torn down when the last subscriber leaves and the memo
  cache takes over again.

A computed recomputes only when a dependency changes — cold reads revalidate the memo with `Object.is`, warm ones wake
on a dependency emission. So "my computed recalculates too often" is one of: a dependency that changes more often than
the output needs (split it, or `peek()` the noisy part); a dependency whose `peek()` is not `Object.is`-stable — a
`signalize`d observable handing back a fresh object, say — so every read counts as a change; or a computed cycling
warm → cold, which is the one recompute that is not caused by a dependency at all: warming up always runs `computeFn`
and drops the memo cache.

---

## 4. Batching

```ts
import { Batcher } from "@fozy-labs/rx-toolkit";

// Runs the dependent compute/effect once, after both writes.
Batcher.run(() => {
  count1$.set(1);
  count2$.update((v) => v + 1);
});
```

- `Batcher.run(fn)` returns whatever `fn` returns.
- **Nested calls join the outer batch.** Every `State.set` already wraps itself in `Batcher.run`, so a single write needs
  no explicit batch — reach for `Batcher.run` only to group two or more writes.
- The flush is **synchronous and glitch-free**: each effect/computed carries a *rang* (its depth in the dependency
  graph), and the batcher drains rangs in ascending order. A downstream effect therefore never observes a half-updated
  graph and never runs twice for one batch.
- The flush is iterative, so deep dependency chains do not blow the stack.
- If something throws during the batch, the queue is reset in a `finally` — pending reactions are **dropped**, not
  carried into the next unrelated batch. An effect whose body threw is closed permanently.

### The one case that may double-emits

A `signal → observable → signal` round trip through an asynchronous operator (`debounceTime`, `delay`, `switchMap`, an
HTTP call) leaves the synchronous flush. The value re-enters the graph in a later tick as an independent update, so
consumers downstream of both the original signal and the round-tripped one can see two updates for one logical change.
Keep such round trips out of the middle of a derived chain — see `rxjs-interop.md`.

---

## 5. Checklist

- ✅ Read every dependency synchronously, at the top of the body.
- ✅ `peek()` for inputs that must not trigger a rerun.
- ✅ `Batcher.run` for multi-write transactions; nothing for a single write.
- ❌ No `async` / `await` inside `compute` or `effect` bodies.
- ❌ No polling a cold computed in a tight loop — every read revalidates the whole dependency list; subscribe instead.
- ❌ No expectation that an object-returning computed will dedupe itself.
