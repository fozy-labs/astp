# State that survives a reload — `LocalSignal`

A signal backed by `localStorage` (or any compatible driver).

Use it for **user preferences** — panel open/closed, selected filter, sort order and etc.

**Contents:** [Creating one](#creating-one) · [Storage layout](#storage-layout) · [Hydration and bad data](#hydration-and-bad-data) · [Garbage collection](#garbage-collection) · [Drivers, Node and SSR](#drivers-node-and-ssr) · [Pitfalls](#pitfalls)

---

## Creating one

```ts
import { z } from "zod/v4";
import { LocalSignal } from "@fozy-labs/rx-toolkit";

readonly isOpen$ = LocalSignal.state<boolean>({
  key: "filters_panel_open",
  defaultValue: true,
  zodSchema: z.boolean(),
  userId: this._session.user$.peek()?.id,
  devtoolsOptions: "FiltersPanelStore/isOpen$",
});

isOpen$();          // read (tracked)
isOpen$.set(false); // write-through to storage
isOpen$.clear();    // drop the stored value, fall back to defaultValue
```

| Option            | Required | Meaning                                                                                           |
|-------------------|----------|---------------------------------------------------------------------------------------------------|
| `key`             | yes      | Slot key. Becomes `` `__LSValue__:${key}` `` — [Storage layout](#storage-layout).                 |
| `defaultValue`    | yes      | Used when nothing is stored, the stored blob is invalid, or `checkEffect` rejects the value.      |
| `zodSchema`       | no       | Zod v4 schema validating **this slot's** value at construction.                                   |
| `userId`          | no       | Puts the value in its own per-user slot. Omit only for genuinely anonymous state.                 |
| `checkEffect`     | no       | `(value) => boolean` — a **read-time** filter; [Hydration and bad data](#hydration-and-bad-data). |
| `driver`          | no       | `StorageLike`. Defaults to `localStorage` when reachable.                                         |
| `gc`              | no       | `boolean \| { enabled?, maxUnreadTime? }` — auto-cleanup policy for this slot. Default `true`.    |
| `devtoolsOptions` | no       | `SignalOptionsOrKey` — a devtools key string or an options object.                                |

Returns a `LocalStateSignal<T>`: `()`, `get()`, `peek()`, `obs`, `set`, `update`, `clear`. There is **no `dispose()`**
and nothing to tear down.

---

## Storage layout

**One storage key per slot**, each holding an envelope, plus one namespace meta key:

```
__LSValue__                  → { v, nextGcAt }     // format version + GC deadline
__LSValue__:{key}            → { at, ttl?, data }  // anonymous slot
__LSValue__:{key}:user:{id}  → { at, ttl?, data }  // per-user slot
```

- `at` — last-touched timestamp (the GC's LRU input). `ttl` — `null` means GC-exempt, a number is this slot's
  `maxUnreadTime`; absent means "use the default policy", so raising the default later also covers stored slots.
- `%` and `:` are escaped in `key` and `userId`, so `key: "cart:user:42"` and `key: "cart", userId: "42"` cannot
  collide.
- **Slots are independent.** A corrupt sibling slot cannot break yours, and `set()` is a single atomic `setItem` of one
  key, so two tabs writing different slots do not clobber each other.

### Format version — upgrading wipes

`v` is `1`. On the first signal constructed per driver: meta missing or **older** → the entire `__LSValue__*`
namespace is erased and re-marked, with no migration by design. A **newer** `v` (a tab running a newer package) is left
strictly alone — that session does not wipe, sweep, self-heal or re-touch anything.

- ⚠️ A format bump therefore **drops every persisted value once**, on first load. Do not store anything you cannot
  regenerate.
- A driver with no key enumeration cannot be wiped; stale entries are then cleaned one at a time as they are read.

---

## Hydration and bad data

Hydration is **synchronous and one-shot** — the slot is read in the constructor and never re-read.

A slot that fails to parse, is not a valid envelope, or fails `zodSchema` falls back to `defaultValue`, logs a
`console.warn`, and is **removed** (self-heal), so it cannot resurface. Self-heal is skipped when a newer format owns
the namespace, and is best-effort: a storage that rejects writes never breaks a read or a constructor.

- ✅ Always pass `zodSchema`, and version it via `key` when the shape changes.
- ✅ `set` / `update` / `clear` work over a corrupt entry and simply overwrite it.

### `checkEffect`

A read-time guard, evaluated inside the internal computed on every read:

```ts
readonly sort$ = LocalSignal.state<SortKey>({
  key: "orders_sort",
  defaultValue: "created_at",
  checkEffect: (value) => ALLOWED_SORT_KEYS.includes(value),
});
```

If it returns `false` the signal yields `defaultValue` — the stored value is **not** removed and will be re-evaluated on
the next read. Use it for values whose validity depends on runtime state (a feature flag, a permission) rather than on
shape; shape belongs in `zodSchema`.

---

## Garbage collection

A slot untouched for longer than its `maxUnreadTime` (default **60 days**) is deleted by a periodic sweep — this is how
long-logged-out users' data disappears.

| Knob                                  | Default   | Meaning                                                     |
|---------------------------------------|-----------|-------------------------------------------------------------|
| `gc: false` / `{ enabled: false }`    | —         | Slot is exempt; never auto-removed.                         |
| `gc: { maxUnreadTime: ms }`           | 60 days   | Per-slot lifetime.                                          |
| `LocalSignal.GC_OPTIONS.checkInterval`| 1 week    | How often a sweep is due.                                   |
| `LocalSignal.GC_OPTIONS.randomOffset` | 1 hour    | Random start spread — used instead of cross-tab locking.    |
| `LocalSignal.GC_OPTIONS.syncLimit`    | 20        | Keys per synchronous slice; the sweep yields between slices.|

- `LocalSignal.GC_OPTIONS` and `LocalState.GC_OPTIONS` are the same object; assigning to it merges in place, so the
  engine never loses the reference. Defaults, `maxUnreadTime` included, are exported as `LOCAL_STATE_GC_DEFAULTS`.
- A slot with a live instance in this session is **re-touched, never expired** — including against sweeps from other
  tabs. Reads also refresh `at`, throttled to `min(checkInterval, ttl / 2)`.
- Tabs coordinate lock-free through `nextGcAt` in the meta key: first to fire claims the next deadline, then sweeps.
- GC requires key enumeration on the driver (`keys(): string[]`, or `length` + `key(i)`). Without it everything else
  still works — there is simply no sweep and no wipe.

---

## Drivers, Node and SSR

The default driver is resolved once at module load and is `null` whenever `localStorage` is unreachable (including a
sandboxed iframe, where merely touching `localStorage` throws).

```ts
import { LocalSignal, type StorageLike } from "@fozy-labs/rx-toolkit";

const memoryDriver = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],   // optional — enables wipe + GC
  };
};

LocalSignal.state({ key: "theme", defaultValue: "dark", driver: memoryDriver() });
// or, app-wide:
LocalSignal.DEFAULT_DRIVER = memoryDriver();
```

- One storage manager (and its GC timers) is cached **per driver object** for the life of the page. Pass a long-lived
  driver — an ephemeral one created per component mount is never released.
- With no driver and no `localStorage`, construction throws
  `[LocalSignal]: localStorage does not exist and no driver was passed.`

---

## Pitfalls

- ✅ Pass `zodSchema`, and a `driver` with `keys()` in Node / tests.
- ✅ `gc: false` for anything that must outlive 60 idle days (a licence key, an onboarding flag).
- ✅ Reuse one driver instance app-wide; do not build one per component.
- ❌ Don't expect cross-tab **reactivity**: nothing listens to the `storage` event, so another tab's write is invisible
  until the next construction. That is separate from writes not destroying each other, which they do not.
- ❌ Don't rely on persisted data surviving a package upgrade that bumps the storage format — it is wiped, not migrated.
- ❌ Don't look for `dispose()`; `LocalStateSignal` has none.
- ❌ Don't store secrets: `zod` validates shape, not trust, and the blob is plain `localStorage`.
