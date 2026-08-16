---
name: fozy-labs-fsd
description: >
  Feature-Sliced Design (FSD) v2.1 — deciding which layer, slice and segment a piece of
  frontend code belongs to, plus the fozy-labs conventions.
---

# Feature-Sliced Design

Based on [FSD v2.1](https://fsd.how). The layer model is stack-agnostic; examples assume the fozy-labs fronted stack (`simplest-di` + `rx-toolkit`).

**Core principle:** *Start simple, extract when needed.* Place code in `pages/` first.
Duplication across pages is acceptable.
Lower layers exist only when a piece is genuinely shared across 2+ slices **and** the team agrees to extract. 
Strictness is a per-project choice — break a rule only as a deliberate decision, and document why.

---

## 1. Layers

```text
app → pages → widgets → features → entities → shared
```

Imports flow downward only. Same-layer cross-imports between slices are forbidden.

| Layer       | Responsibility                                                                                    |
|-------------|---------------------------------------------------------------------------------------------------|
| `app/`      | Global providers, styles, error boundaries, entry point, router (default).                        |
| `pages/`    | Route-level composition; **owns substantial logic**, not a thin wrapper.                          |
| `widgets/`  | Composite UI blocks reused across 2+ pages.                                                       |
| `features/` | Reusable user interactions (2+ consumers).                                                        |
| `entities/` | Reusable business domain models (2+ consumers).                                                   |
| `shared/`   | Infrastructure with no business logic: UI kit, API client, auth, route consts, framework tooling. |

> Projects may add their own layers between existing ones (e.g. a `modals/` layer for route-aware modal containers).

---

## 2. Decision tree

1. Used in only one page? → keep it in that `pages/` slice.
2. Reusable infrastructure with no business logic? → `shared/`.
3. Complete user interaction reused in 2+ places, team agrees? → `features/`.
4. Business domain model reused in 2+ places, team agrees? → `entities/`.
5. App-wide config / providers? → `app/`.

**Golden rule:** when in doubt, keep it in `pages/`.
Worked single-use vs shared placements: `references/practical-examples.md`.

---

## 3. Architectural rules (MUST)

### 3-1. Import only from lower layers

Upward imports and same-layer cross-slice imports are both forbidden. When two slices genuinely need to share, follow the resolution order in §5.

### 3-2. Public API via `index.ts`

External consumers import from a slice's `index.ts`. Internal paths are not part of the contract.

```ts
import { LoginForm } from "@/features/auth";              // ✅
import { LoginForm } from "@/features/auth/ui/LoginForm"; // ❌
```

### 3-3. Domain-based file naming

Name files after the business domain. Technical-role names mix unrelated concerns into one file.

```text
❌ model/types.ts, model/utils.ts, api/endpoints.ts
✅ model/user.types.ts, model/order.store.ts, api/fetch-profile.ts
```

### 3-4. `shared/` is infrastructure only

UI kit, HTTP client, auth, route constants, framework hooks, assets. **No business calculations, domain rules, or workflows** — those belong in `entities/` or higher.

---

## 4. Stack conventions

### File-name type suffix

Every file except the exceptions below carries a **domain-prefixed** type suffix, so its role is obvious from the filename alone.

| Suffix           | Contents                                                    |
|------------------|-------------------------------------------------------------|
| `*.types.ts`     | TypeScript types / interfaces                               |
| `*.schema.ts`    | zod schemas + inferred DTOs                                 |
| `*.api.ts`       | `@injectable` class with `createResource` / `createCommand` |
| `*.store.ts`     | `@injectable` class holding signals / state                 |
| `*.service.ts`   | `@injectable` class with behavior, no UI                    |
| `*.const.ts`     | Literal constants / enums                                   |
| `*.model.ts`     | `inject.define` contracts and plain models                  |
| `*.router.ts(x)` | Route tables                                                |
| `*.guards.ts(x)` | Route / auth guard components                               |
| `*.mock.ts`      | Test / fixture data                                         |
| `*.test.ts(x)`   | Unit tests                                                  |
| `use*.ts`        | Custom React hooks                                          |

**Exceptions (no suffix):** React components (PascalCase `.tsx`), pure utility functions (kebab-case verb — `group-by.ts`), `index.ts`, framework-required names (`main.tsx`, `vite-env.d.ts`).

### State management

Whether a store deserves DI at all is answered by `fozy-labs-di` → `references/architecture.md`, not here. 
Placement is orthogonal to the state-management choice — §1–§3 apply identically with Redux Toolkit, TanStack Query, or anything else.

---

## 5. Cross-import resolution order

When two same-layer slices need to share, try **in order**:

1. **Merge** — if they always change together, they are one slice.
2. **Extract to a lower layer** — shared domain logic moves to `entities/`; UI stays in `features/` / `widgets/`.
3. **Compose in a higher layer (IoC)** — the parent imports both and wires them via props, slots, render props, or DI.
4. **`@x` notation** — last resort, between entities only; document why 1–3 do not apply.

---

## 6. Segments

Inside a slice, group code by technical purpose.

| Segment   | Contents                                                        | Typical files                            |
|-----------|-----------------------------------------------------------------|------------------------------------------|
| `ui/`     | Visual components and their styles.                             | `UserAvatar.tsx`                         |
| `model/`  | Domain types, stores, business logic, validation.               | `user.types.ts`, `user.store.ts`         |
| `api/`    | Backend integration — request functions and `*.api.ts` classes. | `user.api.ts`, `fetch-profile.ts`        |
| `react/`  | React code that renders nothing — hooks, contexts, HOCs.        | `use-current-user.ts`, `UserContext.tsx` |
| `lib/`    | Slice-internal, framework-agnostic utilities.                   | `group-by.ts`                            |
| `config/` | Slice-internal configuration.                                   | `user.const.ts`                          |

- `app/` and `shared/`: **segments only, no slices** — segments may import each other within the layer.
- `pages/`, `widgets/`, `features/`, `entities/`: slices first, segments inside.

---

## Rules

- ❌ Never extract on anticipated reuse — 2+ real consumers plus team agreement, or it stays in `pages/`.
- ❌ Never create an entity for plain CRUD or types alone — `shared/http/` is enough until domain logic attaches.
- ❌ Never build god slices (`user-management/`) — split into `login-form/`, `profile-edit/`, `password-reset/`.
- ✅ Minimal viable FSD is `app/` + `pages/` + `shared/`; add layers when they earn their place.
- ✅ Name by domain plus type suffix (`user.store.ts`, never `store.ts`).

---

## Conditional references

Load these only when the specific situation applies — do **not** preload.

| Situation                                                                                                                                | File                                  |
|------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| Creating or reorganizing layers and slices; what belongs in each layer                                                                   | `references/layer-structure.md`       |
| Picking a segment, naming a file, writing `index.ts`, path aliases                                                                       | `references/segments-and-naming.md`   |
| Two same-layer slices need each other; `@x`; too many thin entities                                                                      | `references/cross-import-patterns.md` |
| `references/migration-guide.md`                                                                                                          |
| Concrete placement lookups — auth, DTO vs domain type, `*Moving a non-FSD codebase onto FSD, or FSD v2.0 → v2.1, .api.ts`, stores, hooks | `references/practical-examples.md`    |

`layer-structure.md` and `segments-and-naming.md` are the two halves of one lookup — the first answers *which layer and slice*, the second *which segment and filename*. Load one; load both only when scaffolding a project from scratch.

`practical-examples.md` assumes both. Load it **instead of** them when the question names a concrete artifact (a login form, a DTO, an `*.api.ts`, a store), and **after** them only once the structural decision is settled.
