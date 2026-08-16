# Layer structure

What belongs in each layer, with a representative folder tree per layer. For the segments *inside* a slice
and for file naming, see `segments-and-naming.md`.

---

## `app/`

App-wide initialization: providers, routing, global styles, entry point. Segments only, no slices.

```text
app/
  providers/          ← DI root scope, theme provider, error boundary
  styles/             ← global CSS, reset, theme variables
  app.router.tsx      ← route table
  main.tsx            ← entry point
```

**Belongs:** global providers, router setup, global styles, error boundaries, analytics bootstrap.

**Does not belong:** feature-specific code, business logic, page-level UI.

---

## `pages/`

Route-level composition. In v2.1 pages **own substantial logic** — they are not thin wrappers. Early in a
project most code lives here.

```text
pages/
  home/
    ui/
      HomePage.tsx
      HeroSection.tsx
    model/
      home.store.ts           ← page state + logic
    api/
      home.api.ts             ← page-local resources / commands
    index.ts
  profile/
    ui/
      ProfilePage.tsx
      ProfileForm.tsx
    model/
      profile.types.ts
      profile.store.ts
    api/
      profile.api.ts
    react/
      use-profile-form.ts
    index.ts
```

**Belongs:** page-specific UI, forms, validation, data fetching, state, business logic. Code that merely
*looks* reusable stays here.

**Does not belong:** code with 2+ real consumers that the team has agreed to extract.

### Composition

A page composes lower layers plus its own local UI:

```tsx
// pages/product-detail/ui/ProductDetailPage.tsx
import { Header } from "@/widgets/header";
import { AddToCart } from "@/features/add-to-cart";
import { ProductCard } from "@/entities/product";
import { useProductDetail } from "../react/use-product-detail";
import { RelatedProducts } from "./RelatedProducts";

export function ProductDetailPage({ productId }: { productId: string }) {
  const product = useProductDetail(productId);

  return (
    <>
      <Header />
      <ProductCard data={product} />
      <AddToCart productId={productId} />
      <RelatedProducts products={product.related} />
    </>
  );
}
```

A page that imports nothing but `shared/` and its own components is equally valid — no lower layer is
mandatory.

---

## `widgets/`

Composite UI blocks with their own logic, reused across 2+ pages. Add the layer only once a block actually
appears in 2+ pages.

```text
widgets/
  header/
    ui/
      Header.tsx
      Navigation.tsx
      UserMenu.tsx
    model/
      header.store.ts
    api/
      notifications.api.ts
    index.ts
  sidebar/
    ui/
      Sidebar.tsx
    model/
      sidebar.store.ts
    index.ts
```

**Belongs:** navigation bars, sidebars, dashboards, footers, card layouts that combine several
entities/features.

**Does not belong:** UI primitives (→ `shared/ui/`), single-use page sections (→ keep them in the page).

---

## `features/`

Independent, reusable user interactions. **Create only when used in 2+ places.**

```text
features/
  auth/
    ui/
      LoginForm.tsx
      RegisterForm.tsx
    model/
      auth-form.store.ts
    api/
      auth.api.ts
    index.ts
  add-to-cart/
    ui/
      AddToCartButton.tsx
    model/
      cart.store.ts
    index.ts
  like-post/
    ui/
      LikeButton.tsx
    api/
      like.api.ts
    index.ts
```

Features consume entities and are themselves composed by higher layers:

```tsx
// widgets/post-card/ui/PostCard.tsx
import { UserAvatar } from "@/entities/user";
import { LikeButton } from "@/features/like-post";
import { CommentButton } from "@/features/comment-create";

export function PostCard({ post }: { post: Post }) {
  return (
    <article>
      <UserAvatar userId={post.authorId} />
      <h2>{post.title}</h2>
      <p>{post.content}</p>
      <LikeButton postId={post.id} />
      <CommentButton postId={post.id} />
    </article>
  );
}
```

---

## `entities/`

Reusable business domain models. **Create only when used in 2+ places — starting a project without this
layer is completely valid.**

```text
// minimal entity — model only, the most common form
entities/user/
  model/
    user.types.ts
    user.api.ts               ← entity api classes live in model/
  index.ts

// entity with UI — use sparingly
entities/product/
  model/
    product.types.ts
  ui/
    ProductCard.tsx
  index.ts
```

Entity UI raises coupling risk: other entities start wanting to import it, which pushes the project toward
`@x` dependencies. Entity UI is consumed by features, widgets and pages only. When two entities do want each
other's code, treat it as a cross-import problem — `cross-import-patterns.md`.

---

## `shared/`

Infrastructure with no business logic. Segments only, no slices; segments may import each other.

```text
shared/
  ui/        ← UI kit: Button, Input, Modal, Card
  date/      ← date utilities: format-date.ts
  react/     ← generic React hooks / contexts: use-debounce.ts, use-media-query.ts
  api/       ← api client instance, request infrastructure, base types
  http/      ← raw fetch functions + zod DTO schemas
  auth/      ← tokens, session store, login utilities
  config/    ← environment variables, route constants, app settings
  assets/    ← images, fonts, icons (branding allowed)
  errors/    ← errors (exceptions) conventions
  lib/       ← framework-agnostic utilities (try to avoid creating this directory)
  and etc...
```

`shared/` **may** be application-aware — route constants, API endpoints, branding assets, common types. It
must **never** hold business logic, feature-specific code, or entity-specific code.

Small projects may fold `http/` into `api/`; keep the split once raw request functions and DTO schemas
outgrow a single folder.
