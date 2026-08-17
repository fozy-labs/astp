# Scopes — framework-agnostic (core)

Managing `Scope` by hand: hierarchy, lifecycle, tags, and the imperative scopes store.
For scopes owned by a React tree see `scopes-react.md`.

**Contents:** [Creating a scope](#creating-a-scope) · [Resolution and shadowing](#resolution-and-shadowing) · [`init()` / `dispose()`](#init--dispose) · [`runInScope`](#runinscope--ambient-resolution) · [Tags](#tags) · [`unstable_createScopesStore`](#unstable_createscopesstore--scopes-keyed-by-string) · [Pitfalls](#pitfalls)

---

## Creating a scope

```ts
import { Subject } from "rxjs";
import { Scope, inject } from "@fozy-labs/simplest-di";

const root = new Scope(null, "app");          // (parent, name?, tags?)
const child = new Scope(root, "order:42");
```

The constructor registers the scope in `parent.children`. Nothing else happens automatically —
`init$`, `destroyed$`, `init()`, and `dispose()` are the owner's responsibility.

### Lifecycle subjects are opt-in

```ts
root.init$ = new Subject<void>();
root.destroyed$ = new Subject<void>();
```

| Subject       | Fires on         | Then         |
|---------------|------------------|--------------|
| `init$`       | `scope.init()`   | `complete()` |
| `destroyed$`  | `scope.dispose()`| `complete()` |

Resolving an `@injectable` that declares `onScopeInit` in a scope **without** these subjects throws before anything is
cached: `Error: Scope for X does not support initialization callbacks`. Plain SCOPED services without `onScopeInit`
work in a bare scope.

If the service is resolved *after* `init()` already ran, its `onScopeInit` is invoked immediately — ordering is safe either way.

---

## Resolution and shadowing

`scope.getInstance(token)` checks the scope itself, then walks up `parent` until it hits `null`:

```
grandchild → child → root → null
```

A child shadows a parent's instance only if the token is explicitly provided into the child:

```ts
inject.provide(UserSession, root);
const rootSession = inject(UserSession, root);
const childSession = inject(UserSession, child);   // same instance — inherited

inject.provide(UserSession, child);                // now child has its own
inject(UserSession, child) === rootSession;        // false
```

Instances live in a per-scope `WeakMap`, so both classes and object contract tokens work as keys.

---

## `init()` / `dispose()`

```ts
root.init();      // fires onScopeInit of everything resolved so far
root.dispose();   // fires their cleanup functions
```

- **Cascade.** `dispose()` destroys children recursively, deepest first, then itself, then unregisters from its parent:

  ```
  root.dispose()  →  grandchild → child → root
  ```

- **Idempotent.** A second `dispose()` is a no-op; `isDisposed` becomes `true`. Same for `init()` / `isInitialized`.
- **Strong references.** `children` is a `Set` of strong refs — a parent keeps its children alive until they are disposed.
  An orphaned child is *not* collected on its own. Always dispose explicitly (React does it via `useScope`; imperative
  code via `unstable_createScopesStore` or a direct `dispose()`).

---

## `runInScope` — ambient resolution

```ts
scope.runInScope(() => {
  inject.provide(OrderApi);      // no explicit scope needed inside
  const api = inject(OrderApi);
});
```

Swaps the global `Scope.getCurrentScope` for the duration of the callback and restores it in `finally`.

Constraints — these are hard limits, not style preferences:

- **Synchronous only.** The scope is restored when the callback returns, so anything after an `await` runs outside it.
- **Global, not per-task.** Concurrent work (parallel HTTP requests on a server) will observe each other's scope.
- For those cases pass the scope explicitly: `inject(Token, scope)`.

---

## Tags

A tag lets a nested context register a service into a specific **ancestor** scope instead of the nearest one.

```ts
const PRIVATE = inject.createTag();

const root = new Scope(null, "root");
const privateScope = new Scope(root, "private", [PRIVATE]);
const nested = new Scope(privateScope, "nested");

nested.runInScope(() => {
  inject.provide(UserSession, PRIVATE); // lands in privateScope, not nested
});
```

- `inject.provide(token, tag)` / `inject(token, tag)` walk up from the **current** scope to the nearest one carrying the tag.
- The search starts at the ambient scope, so a tag is useless without one — from a bare context it throws `No active scope found …`.
- No ancestor carries the tag → same error.

---

## `unstable_createScopesStore` — scopes keyed by string

Use it when scope lifetime is driven by something other than a component tree — a code-based router, a job queue, a
keep-alive cache. It reuses a scope across calls by key, wires `init$` / `destroyed$` itself, and runs `provide` at creation.

```ts
import { Scope, unstable_createScopesStore } from "@fozy-labs/simplest-di";

const rootScope = new Scope(null, "app");
const scopes = unstable_createScopesStore({ parent: rootScope });
```

| Method                    | Behavior                                                                                  |
|---------------------------|--------------------------------------------------------------------------------------------|
| `acquire(key, options?)`  | Get-or-create. Repeat calls with the same key return the same scope (`options` ignored).   |
| `get(key)`                | Existing scope or `null`, never creates.                                                   |
| `has(key)` / `keys()`     | Key presence / list of live keys.                                                          |
| `init(key)`               | Calls `Scope.init()`. Idempotent. Throws if the key is unknown.                             |
| `dispose(key)`            | Cascades via `Scope.dispose`, then drops the scope and all its descendants from the index. |
| `disposeAll()`            | Disposes every scope in the store and clears it.                                            |

`acquire` options: `parent` (a `Scope`, another store key, or the store default), `name` (defaults to `key`), `tags`, `provide`.

### Router zone + keep-alive pages

```ts
// Zone: created on entry, survives navigation inside, dies on exit.
beforeLoad: () => ({ scope: scopes.acquire("zone") })
onEnter:    () => scopes.init("zone")
onLeave:    () => scopes.dispose("zone")   // cascade also kills keep-alive pages below

// Page with keep-alive: a child of the zone, survives leaving the page.
loader:  ({ params }) => { scopes.acquire(`page:${params.id}`, { parent: "zone" }) }
onEnter: ({ params }) => scopes.init(`page:${params.id}`)
// no onLeave — the page scope lives until the zone is disposed
```

### Notes

- **No reuse of a dead scope.** After `dispose` the key is dropped; the next `acquire` builds a fresh scope with new subjects.
  `dispose` does not reset state, so reusing a disposed scope would be wrong.
- **Cascade reaches non-store children too** — e.g. `useScope` scopes mounted inside the zone's subtree.
- **GC.** A key in the store is a strong reference. `dispose` / `disposeAll` release it and the SCOPED cache becomes collectable.
- **Unbounded growth.** The cascade removes scopes when their parent dies, but nothing caps their number while the zone
  lives. For per-id keep-alive add an eviction policy over `keys()` / `dispose()` (e.g. LRU).
- **Failed `provide`.** If a `provide` entry throws during `acquire`, the half-built scope is disposed and the error rethrown —
  no leak, and the key stays free.

---

## Pitfalls

- ❌ `new Scope(...)` without `init$` / `destroyed$` for services that use `onScopeInit`.
- ❌ Relying on `runInScope` across `await` or under concurrency.
- ❌ Dropping a scope reference without `dispose()` — the parent still holds it.
- ❌ Calling `store.acquire` expecting new options to apply to an existing key — they are ignored.
- ✅ Dispose the root scope on shutdown; the cascade handles the rest.
