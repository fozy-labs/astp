# Scopes — React binding

`DiScopeProvider`, `useScope`, keying, and tags inside a React tree.

**Contents:** [`DiScopeProvider`](#discopeprovider) · [Pattern A](#pattern-a--inline-provide) · [Pattern B](#pattern-b--usescope--injectprovide) · [Keying](#keying--recreate-on-input-change) · [Nesting](#nesting) · [Tags](#tags--register-into-an-ancestor-scope) · [Lifecycle](#lifecycle) · [Pitfalls](#pitfalls)

---

## `DiScopeProvider`

| Prop       | Type                     | Meaning                                                                                     |
|------------|--------------------------|---------------------------------------------------------------------------------------------|
| `children` | `React.ReactNode`        | Subtree that resolves against this scope.                                                   |
| `keyName`  | `string?`                | Scope name. **Changing it recreates the scope** (old one disposed).                         |
| `provide`  | `ProvideOptions<any>[]?` | Services registered into the scope on first render.                                         |
| `tags`     | `ScopeTag[]?`            | Tags assigned to the created scope, addressable by `inject.provide(token, tag)`.            |
| `scope`    | `Scope?`                 | External scope from `useScope`. The provider then does **not** call `init()` / `dispose()`. |

---

## Pattern A — inline `provide`

For a stable set of services whose instances the owner does not need to read.

```tsx
// app/layout/AppLayout.tsx
<DiScopeProvider
  keyName="app"
  provide={[UserApi, OrderApi, NotificationsApi, ThemeStore]}
>
  <AppLayoutInner />
</DiScopeProvider>
```

## Pattern B — `useScope` + `inject.provide`

When the owning component must read an instance **during its own render**, before the subtree mounts.

```tsx
// pages/order/OrderPage.tsx
export function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const scope = useScope({ keyName: `order:${orderId}` });
  const details = inject.provide(OrderDetailsStore, scope);

  return (
    <DiScopeProvider scope={scope}>
      <OrderWidget onEditPress={() => details.openEdit(orderId)} />
    </DiScopeProvider>
  );
}
```

Why not plain `inject(OrderDetailsStore)` in `OrderPage`? The provider's context has not propagated down yet — at that
point the ambient scope is still the *parent's*. Passing `scope` explicitly is what makes it work.

`useScope({ keyName?, provide?, tags? })`:

- parent = the scope from React context (or `null` at the top);
- stable across renders, recreated only when `keyName` changes;
- `init$` fires after mount, `destroyed$` after unmount;
- ownership stays with the hook — `<DiScopeProvider scope={scope}>` never disposes it.

---

## Keying — recreate on input change

```tsx
<DiScopeProvider keyName={routeId} provide={[PageStore]}>
  <PageContent />
</DiScopeProvider>
```

Changing `routeId` disposes the old scope (cleanups run) and builds a fresh `PageStore`. This is the intended way to reset
per-entity state — prefer it over pushing new inputs into a long-lived store (see [architecture.md](architecture.md)).

An explicit React `key` on the provider achieves the same for the whole subtree:

```tsx
<DiScopeProvider key={orderId} scope={scope}>…</DiScopeProvider>
```

---

## Nesting

Child scopes inherit everything from ancestors; only what a child provides itself is shadowed.

```tsx
<DiScopeProvider provide={[ThemeService]}>
  <DiScopeProvider provide={[PageStore]}>
    {/* sees PageStore (own) + ThemeService (inherited) */}
    <ThemedComponent />
  </DiScopeProvider>
</DiScopeProvider>
```

---

## Tags — register into an ancestor scope

Use when a deep page must register a service where it *belongs* — e.g. `OrderApi` lives in the authenticated container,
not in the per-page scope.

```ts
// shared
export const AUTHENTICATED = inject.createTag();
```

```tsx
// AppLayout.tsx
<DiScopeProvider keyName="auth" tags={[AUTHENTICATED]}>
  <Routes />
</DiScopeProvider>

// OrderPage.tsx — inside the tagged provider's subtree
inject.provide(OrderApi, AUTHENTICATED);
```

> **Pitfall.** The tag search starts at the *current* scope from React context. Inside the component that created the tagged
> scope via `useScope`, that scope is not in context yet — the search starts from its parent and throws `No active scope found …`.
> Resolve by tag from a child component, or pass the scope object directly.

```tsx
function Page() {
  const scope = useScope({ keyName: "private-page", tags: [PRIVATE] });
  return (
    <DiScopeProvider scope={scope}>
      <Content />          {/* ✅ inject.provide(PrivateStore, PRIVATE) works here */}
    </DiScopeProvider>
  );
}
```

---

## Lifecycle

Mount:

1. `Scope` is created with `init$` / `destroyed$`;
2. `provide` entries are registered;
3. `scope.init()` runs → `onScopeInit` callbacks fire.

Unmount:

1. `scope.dispose()` → cleanup functions returned from `onScopeInit` run, children cascade first;
2. both subjects `complete()`.

StrictMode double-mount is absorbed — `init()` happens once, no spurious dispose. See [setup-react.md](setup-react.md).

---

## Pitfalls

- ❌ `inject(ScopedThing)` in the component that owns the scope via `useScope` — context has not propagated; use `inject.provide(Thing, scope)`.
- ❌ Two providers registering the same SCOPED class when one instance was intended — the deeper one shadows the outer.
- ❌ Unstable `keyName` (e.g. built from an inline object or a new array each render) — silently recreates the scope every render.
- ✅ `keyName` keyed on the entity id when the store must reset per entity.
- ✅ `provide` for services the subtree needs; `inject` everywhere below.
