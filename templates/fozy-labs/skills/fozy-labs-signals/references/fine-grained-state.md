# Fine-grained state — deep trees and keyed collections

Two experimental primitives for the case where one big `Signal.state` wakes every reader on every write. For ordinary
state, stay with `Signal.state` + `Signal.compute` (core `SKILL.md`).

| Situation                                                                    | Reach for                |
|------------------------------------------------------------------------------|--------------------------|
| One state tree, many readers each caring about a different path.             | `unstable_ProxySignal`   |
| A normalised map / cache with per-entry readers and frequent O(1) writes.    | `unstable_KeyedSignal`   |
| Anything else — a handful of fields, a list rendered as a whole.             | `Signal.state`           |

**Contents:** [`unstable_ProxySignal`](#unstable_proxysignal--subscribe-to-a-path) · [`unstable_KeyedSignal`](#unstable_keyedsignal--subscribe-to-a-key) · [In React](#in-react)

---

## `unstable_ProxySignal` — subscribe to a path

```ts
import { unstable_ProxySignal as ProxySignal, Signal } from "@fozy-labs/rx-toolkit";

const ps = ProxySignal.state({
  user: { name: "Ann", age: 20 },
  tags: ["a", "b"],
});

Signal.effect(() => {
  console.log(ps.root.user.name()); // wakes only when user.name changes
});

ps.mutate((draft) => {
  draft.user.age += 1;              // copy-on-write; wakes only the touched paths
});

ps.set({ user: { name: "Bob", age: 30 }, tags: [] }); // replace the whole tree
ps.peek();                                            // non-reactive snapshot
ps.dispose();
```

`ProxyStateSignal<T>` extends `StateSignal<T>` — `()`, `get()`, `peek()`, `obs`, `set`, `update`, `dispose` all behave
as on a normal state signal over the whole tree — and adds `mutate(recipe, actionName?)` and `root`.

### Reading

- `ps.root` is the root of a **lazy path trie**. Navigating (`ps.root.user`) subscribes to nothing and allocates
  nothing — it is just a path. Reactivity happens when you **call** a node: `ps.root.user.name()`.
- Inside a `compute` / `effect`, calling a node subscribes to exactly that path. Outside one it is a plain read.
- A node under a nullable ancestor (and any array index) is callable with a fallback:
  `ps.root.user.name("")` → `string` instead of `string | undefined`.
- `root` supports exactly two operations: **navigation** (property access) and **reading** (call). Everything else —
  `in`, `Object.keys`, spread, `for..of`, `JSON.stringify`, template interpolation, assignment, `delete` — does not
  reach the state. Assignments in particular are silently ineffective. Use `peek()` for a real snapshot and
  `mutate` / `set` / `update` to write.

### Writing

- `mutate(recipe)` builds a copy-on-write draft (immer-like). Untouched subtrees keep their reference, so the commit
  diff costs the changed region, not the number of paths ever read. A recipe that changes nothing commits nothing.
- Every node dedupes with `Object.is`, so a no-op write wakes nobody.
- A deep change wakes ancestors too — copy-on-write replaces the reference at every level, so an observer of
  `ps.root.user()` sees a change to `user.name`. Sibling paths stay isolated.
- `mutate` throws `TypeError: ProxySignal.mutate: state must be a plain object, an array, a Map or a Set` when the
  current root is not draftable.

### Leaves

Path traversal descends into **plain objects and arrays only**. `Map`, `Set`, `Date`, class instances, functions and
primitives are atomic leaves: you cannot navigate inside them reactively (the types stop there too), and they only
change by whole-reference replacement.

That is separate from `produce`, which *is* exported standalone and *does* draft `Map` as a container:

```ts
import { isDraftable, produce } from "@fozy-labs/rx-toolkit";

const next = produce(base, (draft) => { draft.items[0].done = true; });
```

`produce` drafts plain objects, arrays and `Map` (its values are draftable); `Set` elements and class instances are
atomic. The base is never mutated, untouched subtrees keep identity, and a no-op recipe returns the base itself.
Cyclic structures are not supported.

### Lifetime

Path nodes are materialised on first reactive read and pruned on a microtask once nobody observes them — rotating keys
(a cache) does not accumulate nodes. `dispose()` releases the trie and the root state.

---

## `unstable_KeyedSignal` — subscribe to a key

```ts
import { unstable_KeyedSignal, Signal } from "@fozy-labs/rx-toolkit";

const users = unstable_KeyedSignal.state<{ id: string; name: string; online: boolean }>();

users.set("u1", { id: "u1", name: "Ann", online: true });
users.set("u2", { id: "u2", name: "Bob", online: false });

Signal.effect(() => {
  console.log(users.get$("u1")); // wakes only when "u1" changes
});

users.set("u2", { id: "u2", name: "Bob", online: true }); // does not wake the "u1" observer
users.dispose();
```

`state(initial?)` seeds from a plain object, an array of `[key, value]` pairs, or a `Map`. Keys are strings.

| Member                    | Reactive on                  | Notes                                                              |
|---------------------------|------------------------------|---------------------------------------------------------------------|
| `users()` (the call)      | any change                   | Snapshot of the whole collection as `Readonly<Record<string, V>>`.  |
| `get$(key)`               | this key only                | Add / remove / replace of **this** key, deduped by `Object.is`.     |
| `values$()`               | structure only               | Array of values; re-reads on add/remove, not on value replacement.  |
| `peek()` / `snapshot()`   | —                            | Snapshot without subscribing; memoised until the next write.        |
| `get(key)` / `has(key)`   | —                            | Plain reads; allocate no node.                                      |
| `values()` / `size`       | —                            | Plain iteration / count.                                            |
| `set(key, value)`         | —                            | O(1); a write equal by `Object.is` wakes nobody.                    |
| `delete(key)` / `clear()` | —                            | `delete` returns whether the key was present.                       |
| `obs`                     | —                            | Replays the current snapshot on subscribe, then emits on change.    |
| `dispose()`               | —                            | Also `[Symbol.dispose]`.                                            |

Semantics worth knowing before relying on it:

- `get$` on an **absent** key is still reactive — the observer wakes when the key appears.
- An `undefined` value is indistinguishable from absence for `get$`: adding or removing an `undefined`-valued entry does
  not wake a `get$` observer, though the whole-snapshot call, `values$()` and `obs` do fire.
- `get$` outside a tracking context is a plain read and materialises no node.
- Per-key nodes are created lazily and reaped once the key is gone and unobserved, so memory follows the live set rather
  than every key ever touched.

---

## In React

Both controllers satisfy `{ obs, peek }`, so `useSignal(ps)` / `useSignal(users)` works — but that subscribes to the
**whole** structure and defeats the point. Wrap the narrow read instead:

```tsx
function UserRow({ id }: { id: string }) {
  const user$ = useConstant(() => Signal.compute(() => users.get$(id)), [id]);
  const user = useSignal(user$);
  return <li>{user?.name}</li>;
}

function UserList() {
  // Re-renders only when rows are added or removed, not when a row changes.
  const rows$ = useConstant(() => Signal.compute(() => users.values$()));
  const rows = useSignal(rows$);
  return <ul>{rows.map((u) => <UserRow key={u.id} id={u.id} />)}</ul>;
}
```

`useConstant` does not dispose the previous computed when `deps` change — dispose it in a `useEffect` cleanup if the
component churns (`use-in-react.md`, `disposal-and-leaks.md`).
