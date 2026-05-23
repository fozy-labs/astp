# Practical Examples

Concrete patterns for common scenarios within FSD. Examples use the fozy-labs stack (`simplest-di` + `rx-toolkit`) as the default. For tool-level *how*, see the dedicated skills:

- `fozy-labs-di` — `@injectable`, `inject()`, scopes.
- `fozy-labs-signals` — `Signal.state`, `Signal.compute`, `LocalSignal`.
- `fozy-labs-rx-api` — `createResource`, `createCommand`, `links`.

This file covers **placement** (which layer/slice/segment owns the code), not API details.

---

## 1. Authentication

The most common FSD confusion: what goes in `shared/` vs. `features/`/`pages/`.

### Auth data → `shared/auth/`

Tokens, session, login utilities are infrastructure.

```text
shared/auth/
  session.store.ts   ← SINGLETON SessionStore (user$, isAuthenticating$)
  index.ts           ← export { SessionStore }
```

`SessionStore` belongs here even with `login()` / `logout()` methods — those are infrastructure integrations with `shared/http/`.

### Auth UI → `pages/login/` (single use) or `features/auth/` (reused)

```text
// Login UI only on /login:
pages/login/
  ui/LoginPage.tsx
  ui/LoginForm.tsx
  model/login-form.store.ts   ← @injectable("SCOPED"), form state
  index.ts

// Login form reused (e.g. modal + dedicated page):
features/auth/
  ui/LoginForm.tsx
  ui/RegisterForm.tsx
  model/auth-form.store.ts
  index.ts
```

### Don't create a `user` entity just for auth

Tokens, session, login DTOs rarely flow through non-auth code. Create `entities/user/` only when user profile data is consumed for non-auth purposes (avatars in comments, displayName in posts).

---

## 2. Type definitions

| Type scope                             | Location                                         |
|----------------------------------------|--------------------------------------------------|
| API request/response shapes            | `shared/http/*.types.ts` or `*.schema.ts`        |
| Domain types with logic                | `entities/[name]/model/[name].types.ts`          |
| Page-local types                       | `pages/[name]/model/[name].types.ts`             |
| Feature-local types                    | `features/[name]/model/[name].types.ts`          |
| Generic utility types (`Nullable<T>`)  | `shared/lib/types.ts` (rare)                     |

The `.types.ts` / `.schema.ts` suffix is required (see FSD skill §5).

### Raw API shape vs domain model

```ts
// shared/http/product.schema.ts — raw API shape (with zod)
export const ProductDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
});
export type ProductDto = z.infer<typeof ProductDtoSchema>;

// entities/product/model/product.types.ts — domain model with logic
import type { ProductDto } from "@/shared/http";

export interface Product {
  id: string;
  name: string;
  formattedPrice: string;
  isOnSale: boolean;
}

export const fromDto = (dto: ProductDto): Product => ({
  id: dto.id,
  name: dto.name,
  formattedPrice: `$${dto.price.toFixed(2)}`,
  isOnSale: dto.price < 10,
});
```

If you have **only** the raw shape and no logic — keep it in `shared/http/`. Don't create an entity for types alone.

---

## 3. API request handling

### Where each piece lives

```text
shared/api/api.ts            ← createApi({ plugins: [reactHooksPlugin()] })
shared/http/                 ← raw fetch functions + DTOs
  fetch-current-user.ts
  user.schema.ts

entities/user/model/user.api.ts ← @injectable wrapping resources/commands
```

### Pattern: `.api.ts` per entity (or page-local)

```ts
// entities/user/model/user.api.ts
@injectable("SCOPED")
export class UserApi {
  getCurrentUser = api.createResource({
    key: "currentUser",
    queryFn: fetchCurrentUser,
  });
}
```

A `*.api.ts` file holds **one** `@injectable` class with the resources/commands for that slice. Place it in:

- `entities/[name]/model/` — when consumed by 2+ slices.
- `pages/[name]/api/` or `features/[name]/model/` — when single-use.

---

## 4. State management

### Local UI state (per-component) → `useState` / `Signal.state` in the component

Trivial form/dropdown state doesn't need a `.store.ts`.

### Cross-component or behavior-rich state → `*.store.ts` with `@injectable`

```ts
// widgets/preferences-panel/model/preferences-panel.store.ts
@injectable("SCOPED")
export class PreferencesPanelStore {
  private _session = inject(SessionStore);

  isOpen$ = LocalSignal.state<boolean>({
    defaultValue: true,
    userId: this._session.user$()?.id,
    key: "preferences_panel_open",
    zodSchema: z.boolean(),
  });

  toggle() {
    this.isOpen$.set(!this.isOpen$());
  }
}
```

The store is provided in the nearest owning layer (a page, layout, or widget root) — see `fozy-labs-di` §3 for scope patterns.

### Server state → resources/commands (not signals)

For data from the backend, use `createResource` / `createCommand`, not `Signal.state`. The cache, SWR fallback, optimistic updates, and broadcast sync live in the rx-api layer.

---

## 5. React tooling — `react/` segment

Framework-specific code that isn't a UI component (hooks, contexts, providers) goes in a `react/` segment alongside `ui/`.

```text
shared/react/                ← framework hooks shared across the app
  use-debounce.ts
  use-media-query.ts

entities/user/
  model/user.types.ts
  react/use-current-user.ts  ← composes UserApi + SessionStore for components
  react/UserContext.tsx
  ui/UserAvatar.tsx          ← visual component stays in ui/
  index.ts
```

Distinction:

- `ui/` — visual components (`UserAvatar.tsx`).
- `react/` — non-component React code that depends on the React API.
- `lib/` — framework-agnostic utilities.

```ts
// entities/user/react/use-current-user.ts
import { inject } from "@fozy-labs/simplest-di";
import { useSignal } from "@fozy-labs/rx-toolkit";
import { SessionStore } from "@/shared/auth";

export function useCurrentUser() {
  const session = inject(SessionStore);
  return useSignal(session.user$);
}
```

---

## 6. Page composition

A page composes widgets/features/entities + its own local UI. With the fozy-labs stack, the page typically owns a DI scope keyed on a route param so per-page stores get fresh instances on navigation:

```tsx
// pages/[some-route]/ui/SomeRoutePage.tsx
export function SomeRoutePage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const scope = useScope({ keyName: `some-route:${resourceId}` });
  const pageStore = inject.provide(SomeRouteStore, scope);

  return (
    <DiScopeProvider key={resourceId} scope={scope}>
      <SomeWidget resourceId={resourceId} onOpen={() => pageStore.open()} />
    </DiScopeProvider>
  );
}
```

`key={resourceId}` + scope keyed on the route param means navigating to a different `resourceId` gets a fresh store; `onScopeInit` cleanup tears down the old one.

---

## 7. Common placement questions

| You have…                                            | Place it in…                                                   |
|------------------------------------------------------|----------------------------------------------------------------|
| A `fetch*` function that hits the backend            | `shared/http/`                                                 |
| A zod schema for an API response                     | `shared/http/[name].schema.ts`                                 |
| `createResource` consumed by 2+ pages                | `entities/[name]/model/[name].api.ts`                          |
| `createResource` consumed by one page                | `pages/[name]/api/[name].api.ts`                               |
| `@injectable` store touched only by one widget       | `widgets/[name]/model/[name].store.ts`                         |
| Generic React hook (e.g. `useDebounce`)              | `shared/react/`                                                |
| Entity-bound React hook (e.g. `useCurrentUser`)      | `entities/[name]/react/`                                       |
| Route path constants                                 | `shared/config/`                                               |
| `inject.createTag()` for a DI container              | The slice that owns the container                              |
