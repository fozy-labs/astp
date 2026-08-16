# RxJS interop

Moving values between signals and RxJS: `obs`, `signalize`, `SourceSignal`.

Rule of thumb: signals are the source of truth for **state**; RxJS is for **stream semantics** — debounce, throttle,
take N, window, retry, merge.

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

## 2. Observable → Signal — `signalize`

```ts
signalize<T>(observable: Observable<T>): ReadonlySignal<T>;
signalize<T>(observable: Observable<T>, defaultValue: T): ReadonlySignal<T>;
```

The result is a `ReadonlySignal` — `()`, `get()`, `peek()`, `obs`, and **no** `dispose()`.

### The read model, and why it decides everything

`signalize` stores no value. Every `peek()` / `get()` **subscribes to the source, takes whatever it emits
synchronously, and unsubscribes again**. If nothing arrives synchronously, the signal returns `defaultValue` — or throws
`Error: No value emitted` when none was supplied.

Two consequences, and both bite:

```ts
// ❌ Cold pipeline: each read re-subscribes and restarts it.
const clicks$ = signalize(
  fromEvent(document, "click").pipe(scan((n) => n + 1, 0), startWith(0)),
);
clicks$(); // always 0 — startWith replays on every fresh subscription

// ❌ Nothing synchronous: every read throws "No value emitted".
const debounced$ = signalize(query$.obs.pipe(debounceTime(300)));
```

`defaultValue` only silences the throw; it does not add memory. Over a non-replaying source (`Subject`, `interval`,
`fromEvent`, anything after `debounceTime`) the signal returns the default **forever**, even after the source has
emitted.

Each tracking consumer also subscribes independently, so three computeds reading one `signalize`d `fromEvent` mean three
DOM listeners.

### What to signalize

✅ A source that replays its current value synchronously to every new subscriber:

```ts
const source$ = new BehaviorSubject(0);          // or ReplaySubject(1)
const value$ = signalize(source$);
```

`shareReplay({ bufferSize: 1, refCount: false })` also qualifies, at the cost of a source subscription that is never
released. `refCount: true` does **not** — the buffer resets whenever a `peek()` drops the refcount to zero.

### The robust bridge: write into a `Signal.state`

For anything asynchronous or operator-heavy, do not signalize it. Let RxJS carry the events and land the result in a
real state signal:

```ts
readonly debouncedQuery$ = Signal.state("");

// in onScopeInit / useEffect
const sub = this.query$.obs
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((q) => this.debouncedQuery$.set(q));

return () => sub.unsubscribe();
```

This gives a stable stored value, correct `peek()`, working `Object.is` dedupe, and one subscription regardless of how
many consumers read it.

---

## 3. `SourceSignal.create` — custom read-only sources

`signalize` is a one-liner over `SourceSignal.create`, which takes an RxJS-style subscribe function. Use it directly to
wrap an imperative source, and always emit synchronously on subscribe so reads work:

```ts
import { SourceSignal } from "@fozy-labs/rx-toolkit";

const isOnline$ = SourceSignal.create<boolean>((subscriber) => {
  subscriber.next(navigator.onLine);             // synchronous initial value
  const push = () => subscriber.next(navigator.onLine);
  window.addEventListener("online", push);
  window.addEventListener("offline", push);
  return () => {
    window.removeEventListener("online", push);
    window.removeEventListener("offline", push);
  };
});
```

`SourceSignal` was named `ReadonlySignal` before 0.10; that name is now the public **type**, not the class.

---

## 4. Round trips leave the batch

`signal → observable → signal` through an asynchronous operator re-enters the graph in a later tick, outside the
synchronous batch flush. A consumer downstream of both the original and the round-tripped signal can therefore see two
updates for one logical change. Keep async hops at the edge of a derived chain, not in the middle of it.

---

## Checklist

- ✅ `signalize` only replaying sources (`BehaviorSubject`, `ReplaySubject(1)`, `shareReplay` without refCount).
- ✅ Everything async or operator-heavy: subscribe and `set` into a `Signal.state`.
- ✅ `SourceSignal.create` bodies emit synchronously on subscribe.
- ❌ Don't `signalize` a cold `fromEvent` / `interval` / `debounceTime` pipeline and read it.
- ❌ Don't feed a `signalize`d non-replaying signal to `useSignal` — see `use-in-react.md`.
- ❌ Don't look for `dispose()` on the result; lifetime belongs to the consumer's subscription.
