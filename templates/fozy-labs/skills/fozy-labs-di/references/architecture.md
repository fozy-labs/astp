# Architectural rules

DI is a tool, not a default. Use it when you genuinely need a managed lifetime, scope-keyed identity, or cross-tree
sharing. For everything else, plain classes and functions are simpler and easier to test.

---

## 1. When to use DI

- **Cross-cutting singletons** — `SessionStore`, `ThemeStore`, the shared api client.
- **Per-scope identity** — a store or API that lives exactly as long as a page/widget subtree (`OrderApi`, `FeedStore`).
- **Resources needing cleanup** tied to a subtree, via `onScopeInit`.
- **Swappable implementations** behind an interface → contracts (`contracts.md`).

## 2. When **not** to use DI

- Local UI state controlled by a single component → `useState` / `Signal.state` in that component.
- A pure helper (formatter, mapper) → export a function.
- A store whose entire lifetime is one parent component, whose dependencies are already in 
  that component's scope → instantiate with `new` and pass deps explicitly.

```ts
// Without DI — plain class, deps via constructor
export class SomeFeatureStore {
  constructor(
    private readonly _api: OrderApi,
    private readonly _orderId: string,
  ) {}
}
```

```tsx
// In the parent component:
const store = useMemo( // or useConstant if available
  () => new SomeFeatureStore(orderApi, orderId),
  [orderApi, orderId],
);
```

A plain class is not a downgrade. It has no scope requirements, no lifetime rules to violate, and tests construct it directly.

---

## 3. Unidirectional data flow — stores don't accept state pushes

A common antipattern: a React component reads route params or upstream query data and `useEffect`s them into a
DI-managed store via setter methods.

```tsx
// ❌ Antipattern — bidirectional flow, the store is "bound" by its consumer
const feed = inject(FeedStore);
useEffect(() => feed.bindResource(resourceId, initialPage), [resourceId, initialPage]);
useEffect(() => feed.setPermissionBits(permissionBits), [permissionBits]);
```

Problems:

- store state lags one render behind its inputs;
- ordering between multiple `useEffect`s is fragile;
- the store cannot be reasoned about in isolation;
- tests need a fake React tree to drive it.

### Prefers

**1. Pass inputs at construction time.** If a store's identity is keyed on `resourceId`, hand it in once and let the scope
key change when the input changes.

```tsx
// Scope is keyed on resourceId — the instance is recreated when resourceId changes.
const scope = useScope({ keyName: `feed:${resourceId}` });
const feed = inject.provide(FeedStore, scope);
// FeedStore reads resourceId from a SCOPED ResourceContext registered alongside it.
```

**2. Use plain `new` with constructor args** when DI is overkill (see §2).

**3. Let the store *pull* from upstream signals** instead of accepting pushes — e.g. compose `canSend$` from
`SessionStore.user$` and a permissions signal owned by the store, rather than from a `setPermissionBits` setter.

---

## 4. Lifetime discipline

- A SINGLETON or TRANSIENT must never inject a SCOPED dependency — the scoped instance can outlive nothing and be
  destroyed while the SINGLETON still holds it. The container enforces this with `NonCompatibleParentError`.
- Cross-field cycles between two SINGLETON/SCOPED classes are caught (`CircularDependencyError`); between two TRANSIENT
  classes they are **not** — that path blows the stack instead.
- Side effects belong in `onScopeInit`, never in a constructor. A constructor that subscribes has no matching teardown
  and leaks once the scope dies.
