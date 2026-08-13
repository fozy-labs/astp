# Setup — framework-agnostic (core)

Wiring `@fozy-labs/simplest-di` outside React: Node services, CLIs, workers, and unit tests.
For the React binding see `setup-react.md`.

---

## Install

```bash
npm install @fozy-labs/simplest-di
```

| Peer dependency | Version   | Required                        |
|-----------------|-----------|---------------------------------|
| `rxjs`          | `^7.0.0`  | Yes — scope lifecycle uses `Subject`. |
| `react`         | `^19.0.0` | Only for the React binding.     |

## `tsconfig.json`

TypeScript ≥ 5.0. The library uses **TC39 Stage 3 decorators**, which are on by default.

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    // ❌ Do NOT add this — it switches TS to the legacy decorator protocol
    //    and silently breaks @injectable metadata:
    // "experimentalDecorators": true
  }
}
```

If a shared base config enables `experimentalDecorators`, override it with `"experimentalDecorators": false` locally.

---

## How the current scope is resolved

`Scope.getCurrentScope` is a static hook. Out of the box it returns `null`:

```ts
static getCurrentScope: () => Scope | null = () => null;
```

Consequences for the core-only setup:

- `SINGLETON` and `TRANSIENT` resolve anywhere, no scope needed.
- `SCOPED` needs a scope, supplied one of three ways:

```ts
inject(OrderApi, scope);                    // 1. explicit scope argument — preferred
scope.runInScope(() => inject(OrderApi));   // 2. ambient, synchronous only
inject(OrderApi, AUTHENTICATED);            // 3. by tag, resolved from the ambient scope
```

Without any of them: `Error: No active scope found for scoped injection of OrderApi`.

> `runInScope` swaps the global `Scope.getCurrentScope` for the duration of a **synchronous** call and restores it in `finally`. It does not survive `await`, and it is not safe for concurrent requests on a server. For request-scoped DI on the backend, pass the scope explicitly through your own call chain — do not rely on ambient resolution.

---

## Minimal bootstrap

```ts
import { Subject } from "rxjs";
import { Scope, inject } from "@fozy-labs/simplest-di";

// Root scope for the process.
const appScope = new Scope(null, "app");
appScope.init$ = new Subject<void>();
appScope.destroyed$ = new Subject<void>();

inject.provide(OrderApi, appScope);
appScope.init(); // fires onScopeInit callbacks

// … later, on shutdown
appScope.dispose();
```

`init$` / `destroyed$` are **not** created by the `Scope` constructor. Skip them and any `@injectable` with `onScopeInit` throws
`Error: Scope for X does not support initialization callbacks` on first resolution. Details and the store-based alternative: `scopes-native.md`.

---

## Tests

`resetRegistry()` clears the module-level SINGLETON registry. Without it, singletons leak between test cases.

```ts
import { beforeEach } from "vitest";
import { resetRegistry } from "@fozy-labs/simplest-di";

beforeEach(() => {
  resetRegistry();
});
```

Scoped services need no reset — create a fresh `Scope` per test and dispose it in `afterEach`:

```ts
let scope: Scope;

beforeEach(() => {
  resetRegistry();
  scope = new Scope(null, "test");
  scope.init$ = new Subject<void>();
  scope.destroyed$ = new Subject<void>();
  scope.init();
});

afterEach(() => scope.dispose());

it("loads orders", () => {
  const api = inject.provide(OrderApi, scope);
  // …
});
```

To substitute a dependency in tests, bind a contract to a fake implementation before the first resolution — see `contracts.md`.

---

## Checklist

- ✅ `rxjs@7` installed; `experimentalDecorators` **not** enabled.
- ✅ Root `Scope` created with `init$` / `destroyed$` and `init()` called.
- ✅ SCOPED resolutions pass the scope explicitly, or run inside a synchronous `runInScope`.
- ✅ `resetRegistry()` in `beforeEach`; scopes disposed in `afterEach`.
- ❌ No ambient scope resolution across `await` or across concurrent requests.
