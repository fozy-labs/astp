# Migrations — Signals

The last two releases that require code changes. Read this only when working in a codebase written against an older
version, or when an unfamiliar name shows up in existing code.

**Contents:** [0.12.x → 0.13.0](#012x--0130--signalize-removed-zodschema--schema-effect-semantics) · [0.10.x → 0.11.0](#010x--0110--signalfrom-and-the-localsignal-rewrite) · [Name lookup](#name-lookup)

---

## 0.12.x → 0.13.0 — `signalize` removed, `zodSchema` → `schema`, effect semantics

| Old (0.12.x) | Current |
|--------------|---------|
| `signalize(obs)` / `signalize(obs, def)` | **removed** — `Signal.from(obs)` / `Signal.from(obs, { default: def })` |
| `LocalSignal.state({ zodSchema })` | `LocalSignal.state({ schema })` — any synchronous Standard Schema; `zod` is no longer a peer dependency |
| `Signal.effect(() => values.push(x()))` | **type error** — the body must return a teardown or nothing; write a block body |
| Engine internals — `DependencyTracker`, `SyncObservable`, `Batcher.scheduler`, `Effect._getRang()` | removed with no replacement; `SourceSignal.create(subscribe, defaultValue).peek()` covers the `SyncObservable` use |

Behavior that still compiles but changed:

- A throwing `effectFn` used to unsubscribe the effect **for good**; now only a *first-run* throw does. A later throw
  rethrows from the write that scheduled the run, and the effect fires again when a dependency it read before the throw
  changes. Audit code that relied on a failing effect dying — unsubscribe it explicitly instead.
- `.obs` of `Signal.from` / `SourceSignal` used to emit every upstream value; now it emits **one value per batch** — a
  synchronous `of(1, 2, 3)` delivers `3`. `State.obs` still emits every write.
- `SourceSignal.create`'s producer used to run **per subscriber**; now one producer is shared by all observers. A
  producer written for per-subscriber side effects needs rethinking.
- `try/catch` around `set()` that intercepted a compute/effect error no longer sees it at the write (except an effect's
  re-run error, which rethrows from that write): a computed's error is caught at the **read**, a component's — in an
  `ErrorBoundary`.

---

## 0.10.x → 0.11.0 — `Signal.from` and the `LocalSignal` rewrite

### `signalize` → `Signal.from`

`signalize` was deprecated here and **removed in 0.13.0**. The equivalence is exact:

```ts
signalize(obs)        // ≡ Signal.from(obs, { keepAlive: "none" })
signalize(obs, def)   // ≡ Signal.from(obs, { keepAlive: "none", default: def })
```

Migrate by replacing the call **and dropping `keepAlive`**, which is the whole point of the move. `signalize`
re-subscribes on every read, so it had two failure modes that the default `keepAlive: "microtask"` removes:

- a source that does not replay synchronously never delivers a value — the signal is pinned to its default forever,
  even though a tracking consumer wakes up on every emission;
- a stateful cold pipeline (`scan`, `startWith`, `fromEvent`) restarts on each read, so its accumulated state is lost
  and the listener is re-attached per read.

Keeping `keepAlive: "none"` reproduces both. See [rxjs-interop.md](rxjs-interop.md) for what to pick instead.

### `LocalSignal` storage was rewritten — upgrading wipes

The storage layout moved from one record holding every slot to **one storage key per slot**, under a versioned
`__LSValue__` namespace.

⚠️ **Upgrading an app from 0.10.x drops every persisted value once, on first load.** The namespace format version is
checked when the first signal is constructed per driver; an older or missing version erases the whole namespace, by
design and with no migration path. Anything a user would resent losing does not belong in `LocalSignal` — and if a
release already shipped storing it there, restore it from the server on first run rather than expecting the local copy.

Two hazards of the old single-record layout are gone, so any workaround written for them can be deleted:

- a corrupt value in one slot dragged down validation for every other slot, including other users' — slots are now
  independent and a broken one self-heals alone;
- two tabs writing different slots of the same key clobbered each other through read-modify-write — a write is now a
  single atomic `setItem` of one key.

Garbage collection was added in 0.11.0: unread slots expire (60 days by default), tuned globally through
`LocalSignal.GC_OPTIONS` or per slot through the `gc` option. A driver that cannot enumerate its keys is swept lazily
instead. Details in [persisted-state.md](persisted-state.md).

---

## Name lookup

| Name in old code                | Read it as                                                            |
|---------------------------------|-----------------------------------------------------------------------|
| `signalize(obs, def?)`          | removed — `Signal.from(obs, { default: def })`, and pick a `keepAlive` deliberately |
| `zodSchema`                     | `schema` — any synchronous Standard Schema                            |
| `LocalState.create(...)`        | `LocalSignal.state(...)`                                              |
| `computed.destroy()`            | `computed.dispose()`                                                  |
| `ReadonlySignal.create(...)`    | `SourceSignal.create(...)` — the class was renamed in 0.7.4; `ReadonlySignal` is now the read-only **type** |
| `SignalFn` / `ComputeFn` / …    | the current hierarchy: `ReadonlySignal` / `DisposableSignal` / `StateSignal` / `LocalStateSignal` |

---

## Pitfalls

- ❌ Replacing `signalize(obs)` with `Signal.from(obs, { keepAlive: "none" })` — that keeps both bugs you were migrating away from.
- ❌ Shipping the 0.11 upgrade without checking what lives in `LocalSignal` — every stored value is dropped once.
- ❌ Renaming `zodSchema` → `schema` and adding `.refine(async …)` in the same pass — async schemas are rejected (`console.error`, the stored value ignored).
- ❌ Keeping a workaround for the old cross-tab clobbering or corrupt-sibling behaviour; both are fixed.
- ✅ Take the 0.11 upgrade as the moment to move anything non-regenerable out of `LocalSignal`.
- ✅ After swapping `signalize` for `Signal.from`, pick a `keepAlive` deliberately — the default suits replaying sources, `"forever"` suits stateful pipelines.
