# State that survives a reload — `LocalSignal`

A signal backed by `localStorage` (or any compatible driver).

Use it for **user preferences** — panel open/closed, selected filter, sort order and etc.

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

| Option            | Required | Meaning                                                                                     |
|-------------------|----------|----------------------------------------------------------------------------------------------|
| `key`             | yes      | Storage key suffix. The real key is `` `__LSValue__:${key}` ``.                              |
| `defaultValue`    | yes      | Used when nothing is stored, the stored blob is invalid, or `checkEffect` rejects the value. |
| `zodSchema`       | no       | Zod v4 schema validating the stored value on every storage read.                             |
| `userId`          | no       | Namespaces the value inside the same key. Omit only for genuinely anonymous state.           |
| `checkEffect`     | no       | `(value) => boolean` — a **read-time** filter; see below.                                    |
| `driver`          | no       | `{ getItem, setItem, removeItem }`. Defaults to `localStorage` when reachable.               |
| `devtoolsOptions` | no       | `SignalOptionsOrKey` — a devtools key string or an options object.                           |

Returns a `LocalStateSignal<T>`: `()`, `get()`, `peek()`, `obs`, `set`, `update`, `clear`. There is **no `dispose()`**
and nothing to tear down.

---

## Storage layout

One storage key holds a JSON object keyed by slot, so several users share one key without colliding:

```jsonc
// localStorage["__LSValue__:filters_panel_open"]
{ "common": true, "user:42": false, "user:7": true }
```
---

## Hydration and bad data

Hydration is **synchronous**.
On parse on validation fails, falls back to `defaultValue`.
Methods keep working and overwrite the bad blob.

Two things follow:

- ✅ Always pass `zodSchema` with version.
- ⚠️ Validation covers the **whole record**, not just your slot.
  A corrupt sibling slot (another user's value) makes the read fail and your slot falls back to `defaultValue` too.

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

## Drivers, Node and SSR

The default driver is resolved once at module load and is `null` whenever `localStorage` is unreachable.

```ts
import { LocalState } from "@fozy-labs/rx-toolkit";

const memoryDriver = (() => {
  const map = new Map<string, string>();
  return () => ({
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
})();

LocalSignal.state({
    driver: memoryDriver(),
})
// or
LocalState.DEFAULT_DRIVER = memoryDriver();
```

---

## Limits

- ❌ **No cross-tab synchronisation.** Nothing listens to the `storage` event, so another tab's write is not observed;
  the value updates only on the next construction. If tabs must agree, drive the signal from your own `storage`
  listener.
- ❌ No `dispose()`, no completion — the signal lives as long as the object holding it.
- ❌ Not reactive to external writes: something that edits `localStorage` behind the signal's back is invisible.
- `zod` is a peer dependency (`^4`), imported as `zod/v4`.
- The inner state signal is devtools-disabled; `devtoolsOptions` names the derived value that consumers actually read.
