---
name: fozy-labs-di
description: >
  Dependency injection for projects on the @fozy-labs/simplest-di stack.
---

# @fozy-labs/simplest-di

DI for projects on the fozy-labs stack. Classes decorated with `@injectable` are managed by the container — resolved via `inject()`, never instantiated with `new`.

Uses **TC39 Stage 3 decorators**. Do **not** enable `experimentalDecorators` in `tsconfig.json`.

---

## 1. `@injectable` — lifetimes

```ts
import { injectable } from "@fozy-labs/simplest-di";

@injectable("SINGLETON") // one instance per app
export class SessionStore { ... }

@injectable("SCOPED")    // one instance per Scope
export class OrderApi { ... }

@injectable("TRANSIENT") // new instance per inject() call (rare)
export class Logger { ... }
```

| Lifetime      | When to use                                                                            |
|---------------|----------------------------------------------------------------------------------------|
| `"SINGLETON"` | App-wide — `SessionStore`, `ThemeStore`, cross-cutting infrastructure.                 |
| `"SCOPED"`    | Tied to a `Scope` (page/widget subtree) — most stores and **all** API classes.         |
| `"TRANSIENT"` | New instance per `inject()`. Rare; only when each consumer needs unique state/metadata. |

### `onScopeInit` — cleanup hook

For SCOPED classes that need teardown (close sockets, revoke blob URLs, dispose substores) when the owning `DiScopeProvider` unmounts:

```ts
@injectable({
  lifetime: "SCOPED",
  onScopeInit() {
    return () => {
      this.feedStore.destroy(); // called on scope dispose
    };
  },
})
export class FeedStore { ... }
```

`onScopeInit` runs on scope init; the returned function runs on scope dispose. Use this — never side-effect code in the constructor.

### `requireProvide: false`

By default SCOPED throws `MustBeProvidedError` if not registered via `inject.provide`. Use sparingly when a SCOPED class should be auto-created on first `inject()` in any active scope:

```ts
@injectable({ lifetime: "SCOPED", requireProvide: false })
export class FiltersPanelStore { ... }
```

---

## 2. Consuming dependencies

### In stores / services (class fields)

```ts
@injectable("SCOPED")
export class OrderListStore {
  private readonly _api = inject(OrderApi);
  private readonly _session = inject(SessionStore);
}
```

### In React components

```tsx
function CurrentUserWidget() {
  const session = inject(SessionStore);    // SINGLETON — always available
  const list = inject(OrderListStore);     // SCOPED — must be provided above
}
```

> Never call `inject()` outside a render or class-field initializer (e.g. inside `useEffect`, event handlers, or constructor bodies).

---

## 3. Scopes

SCOPED classes live inside a `DiScopeProvider`. Two equivalent patterns:

### A. Inline `provide={[...]}` — for a stable set of services

```tsx
// app/layout/AppLayout.tsx
<DiScopeProvider
  keyName="app"
  provide={[UserApi, OrderApi, NotificationsApi, ThemeStore]}
>
  <AppLayoutInner />
</DiScopeProvider>
```

### B. `useScope` + `inject.provide` — when the owner page needs to read the instance

```tsx
// pages/order/OrderPage.tsx
export function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const scope = useScope({ keyName: `order:${orderId}` });
  const details = inject.provide(OrderDetailsStore, scope);

  return (
    <DiScopeProvider key={orderId} scope={scope}>
      <OrderWidget onEditPress={() => details.openEdit(orderId)} />
    </DiScopeProvider>
  );
}
```

### `inject.provide` vs `inject`

|                  | `inject.provide`                                       | `inject`                                                     |
|------------------|--------------------------------------------------------|--------------------------------------------------------------|
| Use when         | Registering a SCOPED class for the current subtree     | Reading an already-registered or SINGLETON instance          |
| Typical location | Component that owns the scope (page, widget root)      | Deeper components and stores                                 |
| Creates instance | Yes, if not yet registered                             | Only SINGLETON (and SCOPED with `requireProvide: false`)     |

### Scope tags — register in an ancestor scope

When a child page needs to register a service in an ancestor's scope (e.g. `OrderApi` belongs to the `AUTHENTICATED` container, not the per-page scope):

```ts
// shared
import { inject } from "@fozy-labs/simplest-di";
export const AUTHENTICATED = inject.createTag();
```

```tsx
// AppLayout.tsx
<DiScopeProvider keyName="auth" tags={[AUTHENTICATED]}>...</DiScopeProvider>

// OrderPage.tsx
inject.provide(OrderApi, AUTHENTICATED); // registers in nearest ancestor with AUTHENTICATED tag
```

---

## 4. `inject.define` — interface contracts

For platform-swappable or mock-able implementations only. **Not** for ordinary DI.

```ts
// shared/feature/feature.model.ts
export interface DataSource { fetchItems(): Promise<string[]>; }
export const DataSource = inject.define<DataSource>("DataSource");

// Bind concrete impl (only valid before first resolution)
DataSource.bind(CloudDataSource);

// Later
const ds = inject(DataSource);
```

---

## 5. Errors

| Error                         | Cause                                                                  |
|-------------------------------|------------------------------------------------------------------------|
| `MustBeProvidedError`         | SCOPED class with `requireProvide: true` injected without `provide()`. |
| `NonCompatibleParentError`    | SINGLETON or TRANSIENT injects a SCOPED — lifetime contract violated.  |
| `CircularDependencyError`     | A inject(B), B inject(A) inside class-field initializers.              |
| `UnboundContractError`        | `inject(contract)` called before `contract.bind(Impl)`.                |

---

## 6. Architectural rules — DI is opt-in, not mandatory

DI is a tool, not a default. Use it when you genuinely need a managed lifetime, scope-keyed identity, or cross-tree sharing. For everything else, plain classes / functions are simpler.

### When **to** use DI

- Cross-cutting singletons: `SessionStore`, `ThemeStore`, the shared `api` client.
- Per-scope identity: a store/API that lives as long as a page/widget subtree (`OrderApi`, `FeedStore`).
- Resources that need `onScopeInit` cleanup tied to a React subtree.

### When **not** to use DI

- Local UI state controlled by a single component → `useState`/`Signal.state` directly in that component.
- A pure helper (formatter, mapper) → export a function.
- A store whose entire lifetime is one parent component and whose dependencies are already in scope of that component → instantiate with `new` and pass deps explicitly.

```ts
// Without DI — plain class, deps via constructor
export class SomeFeatureStore {
  constructor(
    private readonly _api: OrderApi,
    private readonly _orderId: string,
  ) {}
}

// In the parent component:
const store = useMemo( // or useConstant if available
  () => new SomeFeatureStore(orderApi, orderId),
  [orderApi, orderId],
);
```

### Unidirectional data flow — stores don't accept state pushes

A common antipattern: a React component reads route params or upstream query data and `useEffect`s them into a DI-managed store via setter methods.

```tsx
// ❌ Antipattern — bidirectional flow, store is "bound" by its consumer
const feed = inject(FeedStore);
useEffect(() => feed.bindResource(resourceId, initialPage), [resourceId, initialPage]);
useEffect(() => feed.setPermissionBits(permissionBits), [permissionBits]);
useEffect(() => feed.setAuthors(authors), [authors]);
```

Problems: store state lags one render behind its inputs; ordering of multiple `useEffect`s is fragile; the store can't be reasoned about in isolation; tests need a fake React tree.

Prefer one of (in order of preference):

**1. Pass inputs at construction time.** If a store's identity is keyed on `resourceId`, hand it in once and let the scope key change when the input changes.

```tsx
// Scope is keyed on resourceId — instance is recreated when resourceId changes.
const scope = useScope({ keyName: `feed:${resourceId}` });
const feed = inject.provide(FeedStore, scope);
// FeedStore reads resourceId from a SCOPED ResourceContext (registered alongside).
```

**2. Use plain `new` with constructor args** when DI is overkill (see "When not to use DI" above).

**3. Let the store *pull* from upstream signals** instead of accepting pushes. E.g. compose `canSend$` from `SessionStore.user$` and a permissions signal owned by the store, not from a `setPermissionBits` setter.

---

## Rules

- ❌ Never `new SomeStore()` for classes decorated with `@injectable`.
- ❌ Never call `inject()` outside a component render or class-field initializer.
- ❌ Never run subscriptions/side effects in the constructor — use `onScopeInit`.
- ❌ Never push React-side state into a DI store via setter methods (see §6).
- ✅ SINGLETON deps need no `provide` — they are available app-wide.
- ✅ Use `onScopeInit` for cleanup tied to a React subtree.
- ✅ When DI gives no win, prefer plain classes constructed with `new` and explicit constructor args.
