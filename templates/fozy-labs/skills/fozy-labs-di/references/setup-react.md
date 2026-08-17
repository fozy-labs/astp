# Setup — React binding

Wiring `@fozy-labs/simplest-di` into a React app. Requires **React ≥ 19** (`React.use` is used to read the scope context).
Install, peer deps, and `tsconfig` rules are identical to the core setup — see [setup-native.md](setup-native.md) if DI is not wired yet at all.

---

## `setupReactDi()` — call once, before the first render

```tsx
// app/main.tsx
import { createRoot } from "react-dom/client";
import { setupReactDi } from "@fozy-labs/simplest-di";

setupReactDi();

createRoot(document.getElementById("root")!).render(<App />);
```

What it does: replaces the static `Scope.getCurrentScope` hook so that ambient scope resolution reads the React context
instead of returning `null`. After this call, `inject(Token)` inside a render body resolves against the nearest
`DiScopeProvider` above the component.

- Skipping it makes every SCOPED resolution fail with `No active scope found …`, even inside a provider.
- On React < 19 it throws `React version 19 or higher is required for this DI setup.`
- Calling it twice is harmless, but keep it in exactly one entry point.

---

## StrictMode

`DiScopeProvider` / `useScope` handle the React 19 double mount/unmount replay through an internal `useSafeMount`:

- `init()` fires **exactly once**; the throwaway StrictMode pair does not `dispose()`.
- A real unmount does dispose.
- `onScopeInit` cleanups therefore do not run twice in development.

No configuration needed — just do not add your own mount guards on top.

---

## Testing React components

```tsx
import { render } from "@testing-library/react";
import { DiScopeProvider, resetRegistry, setupReactDi } from "@fozy-labs/simplest-di";

setupReactDi(); // once per test setup file

beforeEach(() => {
  resetRegistry(); // drop singleton state between tests
});

it("renders the order list", () => {
  render(
    <DiScopeProvider provide={[OrderApi, OrderListStore]}>
      <OrderList />
    </DiScopeProvider>,
  );
});
```

- Put `setupReactDi()` in the vitest setup file, not in each test — it mutates a module-level hook.
- Swapping an implementation (fake API, in-memory transport) goes through contracts: [contracts.md](contracts.md).
- The DOM environment must be `jsdom` (or similar) for `@testing-library/react`.

---

## Checklist

- ✅ `setupReactDi()` runs once, before the first render, in the app entry point.
- ✅ React ≥ 19; `experimentalDecorators` **not** enabled.
- ✅ Every SCOPED consumer sits under a `DiScopeProvider` that registers it ([scopes-react.md](scopes-react.md)).
- ✅ Tests: `setupReactDi()` in setup file, `resetRegistry()` in `beforeEach`.
