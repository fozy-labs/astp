---
name: fozy-labs-fsd
description: >
  Feature-Sliced Design (FSD) v2.1 — methodology + fozy-labs stack conventions
  (signals + rx-api + DI).
---

# Feature-Sliced Design

Based on [FSD v2.1](https://fsd.how). Methodology applies to any TS frontend; this skill assumes the fozy-labs stack (`simplest-di` + `rx-toolkit`) when showing examples, but the layer model itself is stack-agnostic.

**Core principle:** *Start simple, extract when needed.* Place code in `pages/` first. Duplication across pages is acceptable. Lower layers exist only when a piece is genuinely shared across 2+ slices **and** the team agrees to extract.

Strictness can be adjusted per project — break a rule only as an intentional design choice, document the reason.

---

## 1. Layers

```
app → pages → widgets → features → entities → shared
```

Imports flow downward only. Same-layer cross-imports between slices are forbidden.

| Layer       | Responsibility                                                              |
|-------------|-----------------------------------------------------------------------------|
| `app/`      | Global providers, styles, error boundaries, entry point, router (default).  |
| `pages/`    | Route-level composition; **owns substantial logic**, not a thin wrapper.    |
| `widgets/`  | Composite UI blocks reused across 2+ pages.                                 |
| `features/` | Reusable user interactions (2+ consumers).                                  |
| `entities/` | Reusable business domain models (2+ consumers).                             |
| `shared/`   | Infrastructure with no business logic: UI kit, API client, auth, route consts, framework tooling. |

> Projects may add their own layers between existing ones (e.g. a `modals/` layer for route-aware modal containers).

---

## 2. Decision tree

1. Used in only one page? → Keep in that `pages/` slice.
2. Reusable infrastructure with no business logic? → `shared/`.
3. Complete user interaction reused in 2+ places, team agrees? → `features/`.
4. Business domain model reused in 2+ places, team agrees? → `entities/`.
5. App-wide config / providers? → `app/`.

**Golden rule:** when in doubt, keep it in `pages/`.

---

## 3. Quick placement table

| Scenario               | Single use                                  | Multi-use (with team agreement)       |
|------------------------|---------------------------------------------|---------------------------------------|
| User profile form      | `pages/profile/ui/ProfileForm.tsx`          | `features/profile-form/`              |
| Product card           | `pages/products/ui/ProductCard.tsx`         | `entities/product/ui/ProductCard.tsx` |
| Data fetching (API)    | `pages/[name]/api/*.api.ts`                 | `entities/[name]/model/*.api.ts`      |
| Auth tokens / session  | `shared/auth/` (always)                     | `shared/auth/` (always)               |
| Login form             | `pages/login/ui/LoginForm.tsx`              | `features/auth/`                      |
| Generic Card layout    | —                                           | `shared/ui/Card/`                     |
| React hook (generic)   | —                                           | `shared/react/`                       |
| React hook (entity-bound) | `pages/[name]/react/use-*.ts`            | `entities/[name]/react/use-*.ts`      |

---

## 4. Architectural rules (MUST)

### 4-1. Import only from lower layers

Upward and same-layer cross-slice imports are forbidden.

### 4-2. Public API via `index.ts`

External consumers import from a slice's `index.ts`. Internal paths are not part of the contract.

```ts
// ✅
import { LoginForm } from "@/features/auth";
// ❌
import { LoginForm } from "@/features/auth/ui/LoginForm";
```

### 4-3. No cross-imports between same-layer slices

If two slices need to share, use the resolution order in §6.

### 4-4. Domain-based file naming

Name files after the business domain. Technical-role names like `types.ts` / `utils.ts` mix unrelated concerns into one file.

```
❌ model/types.ts, model/utils.ts, api/endpoints.ts
✅ model/user.ts, model/order.ts, api/fetch-profile.ts
```

### 4-5. `shared/` is infrastructure only

UI kit, HTTP client, auth, route constants, framework hooks, assets. **No business calculations, domain rules, or workflows** — those belong in `entities/` or higher.

---

## 5. Stack conventions

### File-name type suffix

Every file except the exceptions below carries a **domain-prefixed** type suffix. This makes the file's role obvious from the filename alone and aligns with the `@injectable` / signals / rx-api primitives in the stack.

| Suffix           | Contents                                                       |
|------------------|----------------------------------------------------------------|
| `*.types.ts`     | TypeScript types / interfaces                                  |
| `*.schema.ts`    | zod schemas + inferred DTOs                                    |
| `*.api.ts`       | `@injectable` class with `createResource` / `createCommand`    |
| `*.store.ts`     | `@injectable` class holding signals / state                    |
| `*.service.ts`   | `@injectable` class with behavior, no UI                       |
| `*.const.ts`     | Literal constants / enums                                      |
| `*.model.ts`     | `inject.define` contracts and plain models                     |
| `*.router.ts(x)` | Route tables                                                   |
| `*.guards.ts(x)` | Route / auth guard components                                  |
| `*.mock.ts`      | Test / fixture data                                            |
| `*.test.ts(x)`   | Unit tests                                                     |
| `use*.ts`        | Custom React hooks                                             |

**Exceptions (no suffix):** React components (PascalCase `.tsx`), pure utility functions (kebab-case verb — `group-by.ts`), `index.ts`, framework-required names (`main.tsx`, `vite-env.d.ts`).

### State management (stack default)

Examples in this skill use the fozy-labs stack — see the dedicated skills for `how`:

| Concern       | Tool                                             | Skill                |
|---------------|--------------------------------------------------|----------------------|
| Local state   | `Signal.state`, `Signal.compute`, `LocalSignal`  | `fozy-labs-signals`  |
| Server state  | `api.createResource`, `api.createCommand`        | `fozy-labs-rx-api`   |
| Wiring        | `@injectable` + `inject()`                       | `fozy-labs-di`       |

FSD is orthogonal to state-management choice — the placement rules in §1–§4 apply identically with Redux Toolkit, TanStack Query, or anything else.

---

## 6. Cross-import resolution order

When two same-layer slices need to share, try **in order**:

1. **Merge** — if they always change together, they're one slice.
2. **Extract to a lower layer** — move shared domain logic to `entities/`; UI stays in `features/widgets/`.
3. **Compose in a higher layer (IoC)** — the parent layer imports both and wires them via props, slots, render-props, or DI.
4. **`@x` notation** — last resort, between entities only. Document why earlier strategies don't apply.

Details: `references/cross-import-patterns.md`.

---

## 7. Segments

Inside a slice, group code by technical purpose:

| Segment    | Contents                                                      |
|------------|---------------------------------------------------------------|
| `ui/`      | Components, styles.                                           |
| `model/`   | Types, stores, business logic, validation.                    |
| `api/`     | Backend integration, request functions, `.api.ts` classes.    |
| `react/`   | Framework-specific tooling — hooks, contexts, providers. **Not** components (those go in `ui/`). |
| `lib/`     | Slice-internal pure utilities (framework-agnostic).           |
| `config/`  | Slice-internal configuration.                                 |

**Layer organization:**

- `app/` and `shared/`: **segments only, no slices.** Segments may import each other within the layer.
- `pages/`, `widgets/`, `features/`, `entities/`: slices first, then segments inside.

If a segment owns only one domain concern, the filename may match the slice (`features/auth/model/auth.ts`).

### `react/` vs `ui/` vs `lib/`

- `ui/` — visual components (`UserAvatar.tsx`).
- `react/` — non-component React code that depends on the React API (`use-user.ts`, `UserContext.tsx`, `withUser.tsx`).
- `lib/` — framework-agnostic utilities (mapping, sorting, calculation).

A `shared/react/` for generic hooks (`useDebounce`, `useMediaQuery`) and `entities/[name]/react/` for entity-bound hooks (`useCurrentUser`).

---

## 8. Anti-patterns

- **Premature extraction.** Single-use code stays in its page.
- **Technical-role file names** (`types.ts`, `utils.ts`) — see Rule 4-4.
- **Entity for auth.** Tokens, login DTOs, session belong in `shared/auth/`.
- **CRUD-only entity.** Plain HTTP CRUD goes in `shared/http/` (or `shared/api/`). An entity is warranted only when domain logic attaches to the data.
- **Business logic in `shared/`.** See Rule 4-5.
- **Entity UI cross-imported from other entities.** Entity UI should be consumed from features/widgets/pages only.
- **God slices** (`user-management/`) — split into focused slices (`auth/`, `profile-edit/`, `password-reset/`).
- **Overusing `@x`.** If you reach for it, you usually skipped two earlier strategies in §6.

---

## 9. Quick reference

- **Import direction:** `app → pages → widgets → features → entities → shared`.
- **Minimal FSD:** `app/` + `pages/` + `shared/`.
- **Extract** only when 2+ consumers and the team agrees.
- **File naming:** domain-based + stack type suffix (`user.store.ts`, not `store.ts`).
- **Segments:** `ui/` for components, `react/` for React hooks/context, `lib/` for pure utilities, `model/` / `api/` / `config/` as standard FSD.

---

## 10. Conditional references

Load these only when the specific situation applies — do **not** preload.

- Creating/reorganizing folders and slices → `references/layer-structure.md`.
- Resolving cross-imports between same-layer slices → `references/cross-import-patterns.md`.
- Migrating non-FSD code → `references/migration-guide.md`.
- Concrete code patterns (auth shapes, API typing, store/api wiring) → `references/practical-examples.md`.

If you already loaded `layer-structure.md`, address structure first and only load `practical-examples.md` afterward to avoid context overlap.
