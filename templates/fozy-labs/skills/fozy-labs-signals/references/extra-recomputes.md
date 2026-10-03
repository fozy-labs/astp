# Recomputes, batching and ordering

Why a `compute` or `effect` runs more often, less often, or in a different order than expected — and how the batcher
decides. 

**Contents:** [1. What actually gets tracked](#1-what-actually-gets-tracked) · [2. Dedupe is `Object.is`, in three places](#2-dedupe-is-objectis-in-three-places) · [3. Cold vs warm computeds](#3-cold-vs-warm-computeds) · [4. Batching](#4-batching) · [5. Checklist](#5-checklist)

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
  `useSignal` on it re-renders every time. That is correct behaviour, not a leak of updates — unless you give the
  computed your own equality (below).
- **In-place mutation is invisible.** `arr$.peek().push(x); arr$.set(arr$.peek())` writes the same reference — dropped.

When a **computed** builds a fresh object every run, give it structural equality instead of a hand guard:
`Signal.compute(fn, { equals })`. On equal it keeps the previous reference, so `obs` subscribers and dependents never
wake. The exported `shallowEqual` / `deepEqual` plug straight in (`deepEqual` compares `File`, `Blob` and `URL` by
reference):

```ts
import { shallowEqual } from "@fozy-labs/rx-toolkit";

readonly page$ = Signal.compute(() => toPage(this.raw$()), { equals: shallowEqual });
```

A **state** signal has no `equals` option — guard before `set`:

```ts
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
`SourceSignal` handing back a fresh object on each re-subscribe, say — so every read counts as a change; or a computed
cycling warm → cold: warming up re-runs `computeFn` (with `{ equals }`, an equal result still keeps the old reference
and notifies nobody).

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
- The flush is **synchronous and glitch-free**: a downstream effect never observes a half-updated graph and never runs
  twice for one batch. Independent effects run **in the order they were queued** (0.12.x drained them by graph depth).
- A read inside a batch returns the up-to-date value: a stale computed recomputes for that read only — its source
  subscriptions re-sync after the batch.
- The flush is iterative, so deep dependency chains do not blow the stack.
- If `fn` or a reaction throws, the remaining reactions **still run**, and the first error rethrows after the flush —
  nothing is silently dropped, and a throwing effect is not closed (see [SKILL.md](../SKILL.md#3-signaleffect--side-effect-on-dependency-change)).

### The one case that may double-emits

A `signal → observable → signal` round trip through an asynchronous operator (`debounceTime`, `delay`, `switchMap`, an
HTTP call) leaves the synchronous flush. The value re-enters the graph in a later tick as an independent update, so
consumers downstream of both the original signal and the round-tripped one can see two updates for one logical change.
Keep such round trips out of the middle of a derived chain — see [rxjs-interop.md](rxjs-interop.md).

---

## 5. Checklist

- ✅ Read every dependency synchronously, at the top of the body.
- ✅ `peek()` for inputs that must not trigger a rerun.
- ✅ `Batcher.run` for multi-write transactions; nothing for a single write.
- ❌ No `async` / `await` inside `compute` or `effect` bodies.
- ❌ No polling a cold computed in a tight loop — every read revalidates the whole dependency list; subscribe instead.
- ❌ No expectation that an object-returning computed will dedupe itself.
