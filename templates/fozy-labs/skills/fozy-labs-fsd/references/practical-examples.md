# Practical examples

Concrete placement answers for recurring situations, using the fozy-labs stack (`simplest-di` +
`rx-toolkit`) as the default. This file covers **where the code goes**; the structural rules behind the
answers are in [layer-structure.md](layer-structure.md) and [segments-and-naming.md](segments-and-naming.md).

Tool-level *how* belongs to the sibling skills, not here:

- `fozy-labs-di` — `@injectable`, `inject()`, scopes, contracts, and whether DI is warranted at all.
- `fozy-labs-signals` — `Signal.state`, `Signal.compute`, `LocalSignal`.
- `fozy-labs-rx-api` — `createResource`, `createCommand`, `links`.

**Contents:** [1. Single use vs shared](#1-single-use-vs-shared) · [2. Artefact → path](#2-artefact--path) · [3. Authentication](#3-authentication) · [4. Raw API shape vs domain model](#4-raw-api-shape-vs-domain-model) · [5. API classes](#5-api-classes) · [6. State placement](#6-state-placement) · [7. React tooling](#7-react-tooling--the-react-segment) · [8. Page composition](#8-page-composition)

---

## 1. Single use vs shared

| Scenario                  | Single use                          | Multi-use (with team agreement)       |
|---------------------------|-------------------------------------|---------------------------------------|
| User profile form         | `pages/profile/ui/ProfileForm.tsx`  | `features/profile-form/`              |
| Product card              | `pages/products/ui/ProductCard.tsx` | `entities/product/ui/ProductCard.tsx` |
| Login form                | `pages/login/ui/LoginForm.tsx`      | `features/auth/`                      |
| Data fetching (API)       | `pages/[name]/api/[name].api.ts`    | `entities/[name]/model/[name].api.ts` |
| Entity-bound React hook   | `pages/[name]/react/use-*.ts`       | `entities/[name]/react/use-*.ts`      |
| Auth tokens / session     | `shared/auth/` (always)             | `shared/auth/` (always)               |
| Generic Card layout       | `shared/ui/Card/` (always)          | `shared/ui/Card/` (always)            |
| Generic React hook        | `shared/react/` (always)            | `shared/react/` (always)              |

## 2. Artefact → path

| You have…                                       | Place it in…                          |
|-------------------------------------------------|---------------------------------------|
| A `fetch*` function that hits the backend       | `shared/http/`                        |
| A zod schema for an API response                | `shared/http/[name].schema.ts`        |
| The `createApi` client instance                 | `shared/api/`                         |
| `createResource` consumed by 2+ slices          | `entities/[name]/model/[name].api.ts` |
| `createResource` consumed by one page           | `pages/[name]/api/[name].api.ts`      |
| An `@injectable` store touched by one widget    | `widgets/[name]/model/[name].store.ts` |
| A generic React hook (`useDebounce`)            | `shared/react/`                       |
| An entity-bound React hook (`useCurrentUser`)   | `entities/[name]/react/`              |
| Route path constants                            | `shared/config/`                      |
| `inject.createTag()` for a DI container         | The slice that owns the container     |

---

## 3. Authentication

The most common FSD confusion: what goes in `shared/` versus `features/` / `pages/`.

### Auth data → `shared/auth/`

Tokens, session and login utilities are infrastructure.

```text
shared/auth/
  session.store.ts   ← SINGLETON SessionStore (user$, isAuthenticating$)
  index.ts           ← export { SessionStore }
```

`SessionStore` belongs here even with `login()` / `logout()` methods — those are integrations with
`shared/http/`, not domain rules.

### Auth UI → `pages/login/` (single use) or `features/auth/` (reused)

```text
// login UI exists only on /login
pages/login/
  ui/LoginPage.tsx
  ui/LoginForm.tsx
  model/login-form.store.ts   ← form state
  index.ts

// the same form is reused (modal + dedicated page)
features/auth/
  ui/LoginForm.tsx
  ui/RegisterForm.tsx
  model/auth-form.store.ts
  index.ts
```

### Do not create a `user` entity just for auth

Tokens, session and login DTOs rarely flow through non-auth code. `entities/user/` is warranted only once
profile data is consumed for non-auth purposes — avatars in comments, display names on posts.

---

## 4. Raw API shape vs domain model

| Type scope                            | Location                                 |
|---------------------------------------|------------------------------------------|
| API request/response shapes           | `shared/http/[name].schema.ts`           |
| Domain types with logic               | `entities/[name]/model/[name].types.ts`  |
| Page-local types                      | `pages/[name]/model/[name].types.ts`     |
| Feature-local types                   | `features/[name]/model/[name].types.ts`  |
| Generic utility types (`Nullable<T>`) | `shared/lib/common.types.ts` (rare)      |

```ts
// shared/http/product.schema.ts — the raw API shape
export const ProductDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
});
export type ProductDto = z.infer<typeof ProductDtoSchema>;

// entities/product/model/product.types.ts — the domain model
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

With **only** the raw shape and no logic, stop at `shared/http/`. An entity that holds types alone is a
slice that pays rent and produces nothing.

---

## 5. API classes

```text
shared/api/api.ts               ← the createApi client instance
shared/http/                    ← raw fetch functions + DTO schemas
  fetch-current-user.ts
  user.schema.ts

entities/user/model/user.api.ts ← @injectable class exposing resources/commands
```

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

One `*.api.ts` file holds **one** `@injectable` class carrying the resources and commands of its slice.
Entities keep it in `model/`; pages, widgets and features keep it in `api/`.

---

## 6. State placement

- **Local, single-component state** — `useState` or `Signal.state` in the component. A trivial dropdown or
  form field does not earn a `*.store.ts`.
- **Cross-component or behaviour-rich state** — a `*.store.ts` in the `model/` segment of the slice that
  owns the behaviour, provided by the nearest owning page, layout or widget.
- **Server state** — `createResource` / `createCommand` in a `*.api.ts`, never `Signal.state`. Caching, SWR
  fallback, optimistic updates and broadcast sync belong to the rx-api layer.

```text
widgets/preferences-panel/
  model/preferences-panel.store.ts   ← @injectable("SCOPED"), panel state + toggles
  ui/PreferencesPanel.tsx
  index.ts
```

Whether that store should be DI-managed at all, and how its inputs flow in, is a DI question — see
[fozy-labs-di / architecture.md](../../fozy-labs-di/references/architecture.md). Do not decide it from FSD placement.

---

## 7. React tooling — the `react/` segment

Framework-specific code that renders nothing sits in `react/`, alongside `ui/`.

```text
shared/react/                  ← generic hooks, no domain knowledge
  use-debounce.ts
  use-media-query.ts

entities/user/
  model/user.types.ts
  react/use-current-user.ts    ← composes UserApi + SessionStore for components
  react/UserContext.tsx
  ui/UserAvatar.tsx            ← visual component stays in ui/
  index.ts
```

```ts
// entities/user/react/use-current-user.ts
import { inject } from "@fozy-labs/simplest-di";
import { useSignal } from "@fozy-labs/rx-toolkit";
import { SessionStore } from "@/shared/auth";

export function useCurrentUser() {
  return useSignal(inject(SessionStore).user$);
}
```

---

## 8. Page composition

A page composes widgets, features and entities plus its own local UI. With the fozy-labs stack it typically
also owns a DI scope keyed on a route param, so per-page stores are rebuilt on navigation:

```text
pages/order/
  ui/OrderPage.tsx        ← creates the scope, provides OrderDetailsStore, renders widgets
  model/order.store.ts
  index.ts
```

The scope-keying mechanics (`useScope`, `inject.provide`, `DiScopeProvider`, disposal) are owned by
[fozy-labs-di / scopes-react.md](../../fozy-labs-di/references/scopes-react.md). FSD only says the scope belongs to the page slice that owns
the route.
