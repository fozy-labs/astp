# Segments and naming

The inside of a slice: which segment a file goes in, what to call it, what `index.ts` exports, and how path
aliases are wired. For which layer and slice a file belongs to, see [layer-structure.md](layer-structure.md).

**Contents:** [Segments](#segments) · [Domain-based file names](#domain-based-file-names) · [`index.ts`](#indexts--the-public-api) · [Path aliases](#path-aliases)

---

## Segments

Segments group code by technical purpose, never by domain — the domain is already the slice.

| Segment   | Holds                                             | Typical files                                     |
|-----------|---------------------------------------------------|---------------------------------------------------|
| `ui/`     | Visual components and their styles                | `ProfileForm.tsx`, `ProfileForm.module.css`       |
| `model/`  | Domain types, stores, validation, business logic  | `profile.types.ts`, `profile.store.ts`            |
| `api/`    | Backend integration                               | `profile.api.ts`, `fetch-profile.ts`              |
| `react/`  | React code that renders nothing                   | `use-profile.ts`, `ProfileContext.tsx`            |
| `lib/`    | Slice-internal, framework-agnostic utilities      | `merge-profile.ts`                                |
| `config/` | Slice-internal configuration                      | `profile.const.ts`                                |

No slice needs every segment. A slice with one component and no state is just `ui/` + `index.ts`; adding
empty `model/` and `api/` folders is noise.

### `ui/` vs `react/` vs `lib/`

- `ui/` — anything that renders: `UserAvatar.tsx`.
- `react/` — depends on the React API but renders nothing: `use-current-user.ts`, `UserContext.tsx`,
  `withUser.tsx`.
- `lib/` — no React import at all: mapping, sorting, formatting.

`react/` exists at every level: `shared/react/` for generic hooks (`use-debounce.ts`),
`entities/[name]/react/` for entity-bound hooks (`use-current-user.ts`), `pages/[name]/react/` for
page-local ones.

### `api/` vs `model/`

Entities keep `*.api.ts` in `model/` — the resource set is part of the domain model and travels with the
types it returns. Pages, widgets and features put theirs in `api/`.

---

## Domain-based file names

Name a file after the business domain it owns, never after its technical role. A technical-role name is an
open invitation to pile unrelated concerns into one file.

```text
❌ model/types.ts          ← whose types? user? order? both, eventually
❌ model/utils.ts
❌ api/endpoints.ts

✅ model/user.types.ts     ← user types only
✅ model/order.store.ts    ← order state only
✅ api/fetch-profile.ts    ← one request function, named for what it does
```

### Single-concern segments

When a segment holds exactly one domain concern, the domain prefix may be the slice name:

```text
features/auth/
  model/
    auth.store.ts          ← one concern, prefix matches the slice
```

---

## `index.ts` — the public API

Every slice has an `index.ts` re-exporting exactly what outside consumers may use. Anything not exported
there is slice-internal and free to move or rename.

```ts
// entities/user/index.ts
export { UserAvatar } from "./ui/UserAvatar";
export { UserApi } from "./model/user.api";
export type { User } from "./model/user.types";
```

- Export the narrowest surface consumers actually need — widening later is cheap, narrowing is not.
- `app/` and `shared/` have no slices, so their public API is per-segment: `shared/ui/index.ts`,
  `shared/auth/index.ts`.
- Inside the slice, keep relative imports (`./ui/LoginForm`, `../react/use-auth`). Only cross-slice imports
  go through the alias, and they stop at the slice root (`SKILL.md` §3-2).

---

## Path aliases

Imports read as `@/layer/slice`, which makes an illegal import direction visible at a glance.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/app/*": ["src/app/*"],
      "@/pages/*": ["src/pages/*"],
      "@/widgets/*": ["src/widgets/*"],
      "@/features/*": ["src/features/*"],
      "@/entities/*": ["src/entities/*"],
      "@/shared/*": ["src/shared/*"]
    }
  }
}
```

The runtime resolver can need the same mapping.
