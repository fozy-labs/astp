# Cross-import resolution

Working through the four strategies of `SKILL.md` §5 when two slices on the same layer need each other's
code, plus the `@x` mechanics and the entity sprawl that usually causes the problem. For where a slice
belongs in the first place, see [layer-structure.md](layer-structure.md).

**Contents:** [The problem](#the-problem) · [Strategy 1](#strategy-1--merge-the-slices) · [Strategy 2](#strategy-2--extract-shared-logic-to-a-lower-layer) · [Strategy 3](#strategy-3--compose-in-a-higher-layer-ioc) · [Strategy 4](#strategy-4--x-notation-last-resort) · [Excessive entities](#excessive-entities--the-usual-root-cause) · [Decision flow](#decision-flow)

---

## The problem

A cross-import is any import between two slices on the same layer. It breaks the import rule, and it is
almost always a symptom rather than a cause: the boundary between the slices is wrong, or a lower layer is
missing. Try the strategies **in order** — each one is cheaper to live with than the next.

---

## Strategy 1 — merge the slices

If two slices always change together, they are one concept.

**Indicators:**

- a change to one almost always requires a change to the other;
- they share most of their dependencies;
- developers regularly guess wrong about which one owns a responsibility.

```text
// Before — two features that always change together
features/send-message/
  ui/MessageInput.tsx
  model/message-draft.store.ts
features/message-list/
  ui/MessageList.tsx
  model/messages.store.ts

// After — one cohesive feature
features/messaging/
  ui/
    MessageInput.tsx
    MessageList.tsx
  model/
    message-draft.store.ts
    messages.store.ts
  index.ts
```

**Do not merge** slices that are genuinely independent concepts and happen to share one small piece of
logic — that is Strategy 2.

---

## Strategy 2 — extract shared logic to a lower layer

When several features or widgets share the same domain logic, move that logic to `entities/`. Interaction
and UI stay in the higher layer.

```text
// Before — two features duplicate order logic
features/order-create/
  model/order.types.ts       ← order types + validation (duplicated)
  ui/OrderForm.tsx
features/order-history/
  model/order.types.ts       ← order types + formatting (duplicated)
  ui/OrderList.tsx

// After — shared domain logic in entities, UI stays in features
entities/order/
  model/
    order.types.ts           ← shared types + domain logic
  index.ts

features/order-create/
  ui/OrderForm.tsx
  model/order-form.store.ts  ← feature-specific form logic
  index.ts
features/order-history/
  ui/OrderList.tsx
  lib/format-order.ts        ← feature-specific display logic
  index.ts
```

**Key principle:** extract only what is genuinely shared — types, validation rules, business calculations.
Feature-specific UI, state and API calls stay in the feature. Extracting more than the shared part just
moves the coupling down a layer.

---

## Strategy 3 — compose in a higher layer (IoC)

The parent layer imports both slices and connects them; neither slice ever names the other. Props, slots,
render props and DI are all the same move.

```tsx
// Problem: features/comments wants user avatars owned by another feature —
// same-layer import, forbidden.
// Solution: the page composes both and passes the rendering down.

// pages/post/ui/PostPage.tsx
import { CommentList } from "@/features/comments";
import { UserAvatar } from "@/entities/user";

export function PostPage({ post }: { post: Post }) {
  return (
    <CommentList
      comments={post.comments}
      renderAuthor={(userId) => <UserAvatar userId={userId} />}
    />
  );
}
```

For non-UI wiring, invert the dependency into an explicit parameter and let the higher layer supply it:

```ts
// features/notifications/model/notifications.service.ts
// Instead of importing from another feature, declare what is needed:
interface NotificationDeps {
  getUserName: (userId: string) => string;
}

export const createNotificationService = (deps: NotificationDeps) => ({
  formatNotification: (n: Notification) => `${deps.getUserName(n.userId)}: ${n.message}`,
});

// pages/dashboard/model/dashboard.service.ts — the page wires it up
import { createNotificationService } from "@/features/notifications";
import { getUserName } from "@/entities/user";

export const notificationService = createNotificationService({ getUserName });
```

With the fozy-labs stack the same inversion is usually expressed as a DI contract bound at the composing
layer — see [fozy-labs-di / contracts.md](../../fozy-labs-di/references/contracts.md).

**When to use:** the slices are independent concepts and the link between them is composition, not shared
domain knowledge.

---

## Strategy 4 — `@x` notation (last resort)

An explicit, auditable cross-import **between entities only**. Every other layer uses Strategy 3.

Each entity may expose an `@x/` directory holding one file per consuming entity, named after that consumer.

```text
entities/
  user/
    @x/
      order.ts               ← exposed specifically for the order entity
    model/
      user.types.ts
    index.ts
  order/
    model/
      order-summary.ts       ← imports from user/@x/order
    index.ts
```

```ts
// entities/user/@x/order.ts — exposes only what order needs
export { getUserDisplayName } from "../model/user.types";

// entities/order/model/order-summary.ts
import { getUserDisplayName } from "@/entities/user/@x/order";

export const formatOrderSummary = (order: Order, userId: string) =>
  `${getUserDisplayName(userId)}'s order #${order.id}`;
```

### `@x` rules

1. **Only between entities.** Features, widgets and pages use Strategy 3.
2. **Document why** the earlier strategies do not apply, at the `@x` file itself.
3. **Keep the surface minimal** — one file per consumer, exporting the least possible.
4. **Review periodically.** Requirements move; an `@x` that is no longer needed is pure coupling.
5. **Plain cross-imports stay forbidden.** `@x` is the only sanctioned form, and it is not a shortcut around
   the import rule.
6. **Mutual `@x` between two entities is a red flag** — they are one entity, or one of them should not
   exist.

The `@x` file name is fixed by FSD: it is the consuming entity's slice name. The domain-prefixed type
suffix convention does not apply inside `@x/`.

---

## Excessive entities — the usual root cause

Most cross-import pain starts with entities extracted too early. Thin, premature entities need each other,
and the need cascades into `@x`.

**Signs:**

- several entities with `@x` dependencies on each other;
- entities used by exactly one page or feature;
- entity slices that are a type plus a re-export;
- one product change requiring edits in three entities.

**Resolution:**

1. **Audit usage.** Steiger's `insignificant-slice` rule finds single-consumer slices.
2. **Move single-use entities back** into the page or feature that consumes them.
3. **Merge entities that always change together** — if `order` and `order-item` never move apart, they are
   one `order`.
4. **Prefer `shared/http/` over an entity for shape-only code.** A DTO schema with no domain logic attached
   does not justify a slice.

```text
// Before — excessive entities held together by @x
entities/user/
  @x/order.ts
  @x/notification.ts
entities/order/
  @x/user.ts                 ← mutual @x
entities/notification/
  model/notification.types.ts ← used only by pages/dashboard

// After
entities/user/
  model/user.types.ts        ← kept, genuinely reused
entities/order/
  model/order.types.ts       ← kept, no longer needs @x
pages/dashboard/
  model/notification.types.ts ← moved back, single use
shared/http/
  notification.schema.ts     ← raw API shape
```

---

## Decision flow

```text
Two slices on the same layer need to share code
  │
  ├─ Do they always change together?
  │   └─ YES → Strategy 1: merge
  │
  ├─ Is the shared part domain logic (types, validation, business rules)?
  │   └─ YES → Strategy 2: extract to entities
  │
  ├─ Is the link a composition concern (UI assembly, data wiring)?
  │   └─ YES → Strategy 3: compose in a higher layer
  │
  └─ None of the above, and both are entities?
      ├─ YES → Strategy 4: @x
      └─ NO  → the slice boundaries are wrong; re-decompose before importing anything
```
