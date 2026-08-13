---
name: fozy-labs-di
description: >
  Dependency injection for js/ts projects based on @fozy-labs/simplest-di package.
---

# @fozy-labs/simplest-di

DI for js/ts projects. Classes decorated with `@injectable` are managed by the container — resolved via `inject()`, never instantiated with `new`.

Two layers:

- **core** — framework-agnostic (`inject`, `injectable`, `Scope`, contracts). Works in Node, workers, tests, any framework.
- **react** — optional binding (`setupReactDi`, `DiScopeProvider`, `useScope`). Requires React ≥ 19.

Uses **TC39 Stage 3 decorators**. Do **not** enable `experimentalDecorators` in `tsconfig.json`.

---

## 1. `@injectable` — lifetimes

```ts
import { injectable } from "@fozy-labs/simplest-di";

@injectable("SINGLETON") // one instance per app (also the default for bare `@injectable()`)
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

Detailed form:

```ts
@injectable({
  lifetime: "SCOPED", 
  requireProvide: true, // @default true. SCOPED option to disable auto-providing by `inject()`
  onScopeInit() {
    this.socket.connect();            // instance is `this`, not an argument
    return () => this.socket.close(); // runs on scope dispose
  },
})
export class FeedStore { ... }
```

- `onScopeInit` runs on scope init; the returned function runs on scope dispose. Use it — never side-effect code in the constructor.
- `requireProvide: false` lets a SCOPED class be auto-created on first `inject()` in any active scope. Use sparingly.

---

## 2. Resolving — `inject`

```ts
inject(Token)              // resolve from the current scope
inject(Token, scope)       // resolve from an explicit Scope
inject(Token, TAG)         // resolve from the nearest ancestor scope carrying TAG
```

SCOPED legal calls:

- a class-field initializer of an `@injectable` class,
- a platform/framework based scope providing method (if settled). 
- inside `scope.runInScope(() => ...)` — synchronous only.

```ts
@injectable("SCOPED")
export class OrderListStore {
  private readonly _api = inject(OrderApi);
  private readonly _session = inject(SessionStore);
}
```

---

## 3. `inject.provide` vs `inject`

`inject.provide` is just `inject` with `requireProvide` forced off — it both registers and returns the instance.

---

## 4. Errors

| Error                                                          | Cause                                                                   |
|----------------------------------------------------------------|-------------------------------------------------------------------------|
| `MustBeProvidedError`                                          | SCOPED class with `requireProvide: true` injected without `provide`.    |
| `NonCompatibleParentError`                                     | SINGLETON or TRANSIENT injects a SCOPED — lifetime contract violated.   |
| `CircularDependencyError`                                      | A injects B, B injects A inside class-field initializers.               |
| `UnboundContractError`                                         | `inject(contract)` called before `contract.bind(Impl)`.                 |
| `ContractAlreadyResolvedError`                                 | `contract.bind()` called after the contract was first resolved.         |
| `Error: No active scope found for scoped injection of X`       | SCOPED resolved with no current scope and no explicit scope/tag.        |
| `Error: Scope for X does not support initialization callbacks` | `onScopeInit` class resolved in a scope without `init$` / `destroyed$`. |

---

## 5. DI is opt-in, not mandatory

Full rationale, plus the unidirectional-data-flow rule: `references/architecture.md`.

--- 

## Rules

- ❌ Never run scope-based subscriptions/side effects in the constructor — use `onScopeInit`.
- ❌ Never push React-side state into a DI store via setter methods.
- ✅ SINGLETON deps no need `provide` — they are available app-wide.
- ✅ When DI no gives win, prefer plain classes constructed with `new` and explicit constructor args.

---

## Conditional references

Load these only when the specific situation applies — do **not** preload.

| Situation                                                                    | File                          |
|------------------------------------------------------------------------------|-------------------------------|
| Wiring DI into a React app, `setupReactDi`, StrictMode, testing components   | `references/setup-react.md`   |
| Wiring DI outside React — Node, CLI, workers, unit tests, `resetRegistry`    | `references/setup-native.md`  |
| `DiScopeProvider`, `useScope`, scope keying and tags in a React tree         | `references/scopes-react.md`  |
| `Scope` by hand, cascade dispose, `runInScope`, `unstable_createScopesStore` | `references/scopes-native.md` |
| `inject.define` contracts, `bind`, platform/mock swapping                    | `references/contracts.md`     |
| Deciding whether DI belongs here at all; store-input data flow               | `references/architecture.md`  |

Pick **one** setup file and **one** scopes file matching the target environment — loading both the native and React variants of the same topic is redundant.
