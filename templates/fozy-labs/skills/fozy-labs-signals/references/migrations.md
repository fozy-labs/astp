# Migrations — Signals

The last two releases that require code changes. Read this only when working in a codebase written against an older
version, or when an unfamiliar name shows up in existing code.

**Contents:** [0.10.x → 0.11.0](#010x--0110--signalfrom-and-the-localsignal-rewrite) · [0.7.x → 0.8.0](#07x--080--dispose-and-localsignalstate) · [Name lookup](#name-lookup)

---

## 0.10.x → 0.11.0 — `Signal.from` and the `LocalSignal` rewrite

### `signalize` → `Signal.from`

`signalize` still works and is still a `ReadonlySignal` (no `dispose()`), but it is `@deprecated`. The equivalence is
exact:

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

Keeping `keepAlive: "none"` reproduces both. See `rxjs-interop.md` for what to pick instead.

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

Garbage collection is new in this release: unread slots expire (60 days by default), tuned globally through
`LocalSignal.GC_OPTIONS` or per slot through the `gc` option. A driver that cannot enumerate its keys is swept lazily
instead. Details in `persisted-state.md`.

---

## 0.7.x → 0.8.0 — `dispose()` and `LocalSignal.state`

### `Computed.destroy()` → `dispose()`

```ts
sum$.destroy();   // old
sum$.dispose();   // current
```

### `LocalState.create(options)` → `LocalSignal.state(options)`

```ts
const volume$ = LocalState.create({ key: "user-volume", defaultValue: 1 });    // old
const volume$ = LocalSignal.state({ key: "user-volume", defaultValue: 1 });    // current
```

### The legacy signal types were deleted

| Removed type              | Replacement                                                     |
|---------------------------|-----------------------------------------------------------------|
| `ReadableSignalLike<T>`   | `ReadonlySignal<T>`                                             |
| `ReadableSignalFnLike<T>` | `ReadonlySignal<T>`                                             |
| `WriteableSignalLike<T>`  | `StateSignal<T>` (or `LocalStateSignal<T>`)                     |
| `ClearableSignalLike<T>`  | `LocalStateSignal<T>` — it is the one carrying `clear()`        |
| `StatefulSignalFn<T>`     | `LocalStateSignal<T>`                                           |
| `SignalFn<T>`             | `StateSignal<T>`                                                |
| `ComputeFn<T>`            | `DisposableSignal<T>`                                           |

The current hierarchy is `ReadonlySignal` / `DisposableSignal` / `StateSignal` / `LocalStateSignal`.

---

## Name lookup

| Name in old code                | Read it as                                                            |
|---------------------------------|-----------------------------------------------------------------------|
| `signalize(obs, def?)`          | `Signal.from(obs, { default: def })` — drop `keepAlive: "none"`        |
| `LocalState.create(...)`        | `LocalSignal.state(...)`                                              |
| `computed.destroy()`            | `computed.dispose()`                                                  |
| `ReadonlySignal.create(...)`    | `SourceSignal.create(...)` — the class was renamed in 0.7.4; `ReadonlySignal` is now the read-only **type** |
| `SignalFn` / `ComputeFn` / …    | see the table above                                                   |

---

## Pitfalls

- ❌ Replacing `signalize(obs)` with `Signal.from(obs, { keepAlive: "none" })` — that keeps both bugs you were migrating away from.
- ❌ Shipping the 0.11 upgrade without checking what lives in `LocalSignal` — every stored value is dropped once.
- ❌ Keeping a workaround for the old cross-tab clobbering or corrupt-sibling behaviour; both are fixed.
- ✅ Take the 0.11 upgrade as the moment to move anything non-regenerable out of `LocalSignal`.
- ✅ After swapping `signalize` for `Signal.from`, pick a `keepAlive` deliberately — the default suits replaying sources, `"forever"` suits stateful pipelines.
