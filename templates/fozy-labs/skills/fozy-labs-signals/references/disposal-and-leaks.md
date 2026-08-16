# Disposal, teardown and leaks

What holds a subscription, what must be stopped by hand, and what cleans itself up.

---

## 1. What each primitive holds

| Primitive                                   | Holds while alive                                              | How it ends                                                  |
|---------------------------------------------|----------------------------------------------------------------|--------------------------------------------------------------|
| `Signal.state`                              | One `BehaviorSubject` plus its subscribers.                    | Usually nothing. `dispose()` completes it.                   |
| `Signal.compute`                            | Nothing while cold; an internal effect + dependency subs while warm. | Automatic at the last unsubscribe. `dispose()` for good. |
| `Signal.effect`                             | One subscription per tracked dependency + your teardown.       | **You must** call `unsubscribe()`.                           |
| `signalize` / `SourceSignal`                | A fresh subscription per read and per tracking consumer.       | Ends with the consumer; the signal itself owns nothing.      |
| `LocalSignal.state`                         | An internal state + computed. **No `dispose()` exists.**       | Nothing to call.                                             |
| `unstable_KeyedSignal` / `unstable_ProxySignal` | Lazily materialised per-key / per-path nodes.               | `dispose()`; idle nodes are reaped on their own.             |
| `s$.obs.subscribe(...)`                     | A plain RxJS subscription.                                     | `sub.unsubscribe()` or `takeUntil(destroyed$)`.              |

The single rule that matters: **an `Effect` never stops itself.** Everything else in the list either owns nothing or
releases on refcount. An effect created and forgotten keeps its dependency subscriptions — and whatever its body opened —
alive for the lifetime of the signals it reads.

---

## 2. Effect teardown

```ts
const stop = Signal.effect(() => {
  const id = this.resourceId$();
  const sub = this._ws.subscribe(id);
  return () => sub.unsubscribe(); // runs before every re-run AND on unsubscribe
});

stop.unsubscribe();
```

- The returned function runs **before each re-run** and once on `unsubscribe()`. It never runs twice for the same run.
- `Signal.effect` is declared as `(effectFn: () => void) => Effect`. Returning a teardown still type-checks (TypeScript's
  void-return rule) and is honoured at runtime. The class form `new Effect(fn)` types the teardown explicitly.
- A body that **throws** unsubscribes the effect from everything it had collected, sets `closed = true` and rethrows.
  The effect is dead; it will not resume when a dependency changes. Guard risky work inside the body if the effect must
  survive it.

---

## 3. `dispose()` on state and computed

```ts
count$.dispose();
count$.set(5);      // silently notifies nobody — the signal is completed
```

- `dispose()` completes the underlying subject: current subscribers receive `complete`, and later writes reach no one.
  It is not an error, and it is not loud — so dispose **last**, during teardown, never speculatively.
- `Computed.dispose()` also stops its internal effect and drops the memo cache.
- Most signals no explicit disposal: cold, they hold nothing; warm, they release at the last unsubscribe.
  Dispose one when you built it for a bounded piece of work and want its cached value released immediately.
  Or to release the key into redux devtools immediately (it usually takes time) so as not to receive console.warnings about key-collisions.

### `using`

`DisposableSignal` implements `Disposable`, so explicit resource management works:

```ts
function totalFor(ids: string[]) {
  using sum$ = Signal.compute(() => ids.reduce((n, id) => n + this.weights$()[id], 0));
  return sum$();
}
```

Requires TypeScript ≥ 5.2 and a runtime `Symbol.dispose`. The library resolves the symbol polyfill-safely
(`Symbol.dispose ?? Symbol.for("Symbol.dispose")`), which lines up only if your polyfill defines `Symbol.dispose`
**before** the library module is evaluated. When in doubt, call `dispose()` explicitly.

---

## 4. Devtools entries and GC

A `State` created with a devtools key or with custom `SignalOptions.hooks` is registered in a `FinalizationRegistry`, so
its devtools entry is closed when the signal is garbage-collected. An explicit `dispose()` unregisters the finaliser and
closes the entry immediately — no double `$COMPLETED`. Practical consequence: devtools entries do not leak either way,
but they linger until GC if you never dispose.

---

## 5. Checklist

- ✅ Every `Signal.effect` has a matching `unsubscribe()` in a teardown hook.
- ✅ Every manual `s$.obs.subscribe(...)` has a matching `unsubscribe()` (or `takeUntil`).
- ✅ Effects start in `onScopeInit` (DI) or `useEffect` (React), never in a constructor.
- ✅ Teardown functions are idempotent — React StrictMode runs the mount/unmount pair twice.
- ❌ Don't `dispose()` a signal you still write to; writes after dispose are silently dropped.
- ❌ Don't hunt for a `dispose()` on `LocalSignal` or `signalize` results — they have none.
