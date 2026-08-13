# Contracts — `inject.define`

An interface-shaped token whose implementation is chosen at wiring time. Use for **platform-swappable or mockable**
dependencies only — not for ordinary DI, where the class itself is a perfectly good token.

---

## Declaring and binding

```ts
// shared/feature/feature.model.ts
export interface DataSource {
  fetchItems(): Promise<string[]>;
}

export const DataSource = inject.define<DataSource>("DataSource");
```

The interface and the const share a name — TypeScript keeps them in separate declaration spaces, so `DataSource` works
both as a type and as a token.

```ts
// app wiring — before the first resolution
DataSource.bind(CloudDataSource);   // a class decorated with @injectable

// anywhere
const ds = inject(DataSource);
```

The implementation supplies the lifetime: the contract inherits it from the bound `@injectable` class.

---

## Rules

| Rule                                                                  | Violation                                                                       |
|-----------------------------------------------------------------------|---------------------------------------------------------------------------------|
| Identity is the **object** returned by `define`, not the string name. | Two `define("X")` calls = two distinct tokens that never resolve to each other. |
| `bind` must run before the first `inject(contract)`.                  | `UnboundContractError`                                                          |
| `bind` may be repeated only while unresolved.                         | `ContractAlreadyResolvedError`                                                  |

The name is diagnostics only — it shows up in error messages. Export the token from one module and import it; never
re-`define` the same name elsewhere.

---

## Object-shaped provider

`bind` also accepts a plain provider instead of a class — useful for fakes and adapters that are not worth a class:

```ts
MockChatDataSource.bind({
  lifetime: "TRANSIENT",
  name: "MockChatDataSourceImpl",
  getInstance: () => ({
    fetchChatMessages: () => Promise.resolve(["mock"]),
  }),
});
```

Required fields: `lifetime`, `name`, `getInstance`.

---

## Scoped contracts

A contract bound to a SCOPED implementation counts as registered by the `bind` itself — no separate
`inject.provide(contract, scope)` is needed. An **active scope is still required**:

```tsx
const RequestSession = inject.define<RequestSession>("RequestSession");
RequestSession.bind(BrowserRequestSession); // @injectable({ lifetime: "SCOPED", requireProvide: true })

function RequestPanel() {
  const session = inject(RequestSession); // ✅ inside a DiScopeProvider
  return <span>{session.requestId}</span>;
}
```

Outside any scope it still fails with `No active scope found …`. Constructor-based SCOPED classes keep their usual
`requireProvide` semantics — binding a contract does not relax them for the class itself.

---

## Test substitution

```ts
import { beforeEach } from "vitest";
import { resetRegistry } from "@fozy-labs/simplest-di";

beforeEach(() => {
  resetRegistry(); // clears singleton instances
});

// in a test-only setup module, before anything resolves:
DataSource.bind(FakeDataSource);
```

`resetRegistry()` drops cached instances but **not** the contract binding — a contract already resolved once cannot be
rebound. Bind fakes in a setup file that runs before the first resolution, or give each test suite its own contract token.

---

## When to use / not use

**Use** when:

- the implementation differs per platform (web / native / server);
- tests need a fake at the seam;
- the consumer genuinely depends on an interface, not a class.

**Do not use** when:

- there is exactly one implementation, forever → inject the class;
- you only want a nicer name → that is not a reason to add a token;
- the seam is inside one module → a constructor argument is simpler.
