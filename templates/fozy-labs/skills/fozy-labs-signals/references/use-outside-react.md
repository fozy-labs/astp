# Signals outside React

Using signals in Node, workers, CLIs, unit tests and non-React frameworks. For the React hook see `use-in-react.md` —
pick the one matching your host, not both.

There is **nothing to set up**. Signals carry no ambient context, no scheduler and no global registry: creating one is
just constructing an object, and everything it does is synchronous.

**Contents:** [Reading a signal](#reading-a-signal) · [Class style](#class-style) · [Other frameworks](#other-frameworks) · [Tests](#tests) · [Node / worker caveats](#node--worker-caveats) · [Checklist](#checklist)

---

## Reading a signal

| Way                          | When                                                                        |
|------------------------------|------------------------------------------------------------------------------|
| `s$.peek()`                  | One-shot read. No subscription, no tracking, nothing to clean up.           |
| `Signal.effect(() => …)`     | React to changes of **several** signals. You own `unsubscribe()`.           |
| `s$.obs.subscribe(…)`        | Bridge into RxJS or a framework binding. You own `unsubscribe()`.           |

```ts
const stop = Signal.effect(() => {
  logger.info("state", { id: this.id$(), mode: this.mode$() });
});
// … on shutdown
stop.unsubscribe();
```

Outside React, teardown is entirely yours — see `disposal-and-leaks.md`.

---

## Class style

`Signal.state` / `compute` / `effect` / `from` are thin wrappers over `State.create` / `Computed.create` /
`Effect.create` / `FromSignal.create`. The classes are exported too, and are the better fit when you subclass or want an
explicit, RxJS-like shape:

```ts
import { Computed, Effect, State } from "@fozy-labs/rx-toolkit";

const count = new State(0, "counter");
const doubled = new Computed(() => count.get() * 2);
const log = new Effect(() => console.log(doubled.get()));

log.unsubscribe();
```

Instances are **not callable** — use `get()`. Options are identical to the factory form. The factories return callable
function-objects (`count$()`); the classes do not.

---

## Other frameworks

Every signal exposes `obs`, a plain RxJS `Observable`, so any RxJS binding works:

```ts
// Angular
readonly count = toSignal(count$.obs);   // or {{ count$.obs | async }} in a template

// SolidJS
const count = from(count$.obs);

// Svelte — RxJS observables satisfy the store contract
const count = count$.obs;                // then `$count` in markup
```

`State.obs` is a `BehaviorSubject` stream and `Computed.obs` replays its current value on subscribe, so all three
bindings get an initial value synchronously.

Going the other direction — an existing `Observable` into the signal graph — is `Signal.from`, whose `keepAlive` option
decides how long the shared upstream subscription survives: see `rxjs-interop.md`.

---

## Tests

Everything is synchronous: no fake timers, no `act()`, no flushing.

```ts
import { Batcher, Signal } from "@fozy-labs/rx-toolkit";

it("derives the total", () => {
  const price$ = Signal.state(10);
  const qty$ = Signal.state(2);
  const total$ = Signal.compute(() => price$() * qty$());

  expect(total$.peek()).toBe(20);
  qty$.set(3);
  expect(total$.peek()).toBe(30);
});

it("runs a batched effect once", () => {
  const runs: number[] = [];
  const a$ = Signal.state(1);
  const b$ = Signal.state(2);
  const stop = Signal.effect(() => runs.push(a$() + b$()));

  expect(runs).toEqual([3]);                            // effects run at creation
  Batcher.run(() => {
    a$.set(10);
    b$.set(20);
  });
  expect(runs).toEqual([3, 30]);                        // one run, not two
  stop.unsubscribe();
});
```

- Without `Batcher.run` the same two writes produce two runs (`[3, 12, 30]`) — each `set` flushes its own batch.
- Assert with `peek()`, never `get()`, so the assertion does not register a dependency.
- Unsubscribe every effect the test created; a leaked effect keeps running across cases in the same file.

The only asynchrony in the library is deliberate and elsewhere: `useSignal` coalesces notifications in a microtask, and
the experimental collections reap idle nodes in a microtask (`fine-grained-state.md`).

---

## Node / worker caveats

- `LocalSignal.state` has no storage: the default driver resolves to `null` and **construction** throws
  `[LocalSignal]: localStorage does not exist and no driver was passed.` Pass a `driver` (give it `keys()` if you want
  its GC to run) — see `persisted-state.md`.
- `reduxDevtools()` without an explicit `driver` throws `Redux Devtools extension is not installed` when there is no
  `window`. Guard the `DefaultOptions.update({ DEVTOOLS })` call with an environment check.
- Nothing else in the signals layer touches browser globals.

---

## Checklist

- ✅ Every effect and every `obs.subscribe` has a matching `unsubscribe()`.
- ✅ `peek()` in assertions and in non-reactive code paths.
- ✅ `Batcher.run` around multi-write transactions.
- ❌ No `useSignal` outside React — it is a hook.
- ❌ No expectation that `new State(...)` is callable; that is the factory form only.
