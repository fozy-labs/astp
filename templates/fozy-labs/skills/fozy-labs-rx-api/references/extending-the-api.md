# Extension points — plugins and devtools

Changing what every resource and command *is*, rather than what an individual one does.

For `onCacheEntryAdded` / `onQueryStarted` — the callbacks that run alongside a cache entry — see
`lifecycle-hooks.md`; they are a per-resource option, not an extension point.

---

## Custom plugins

A plugin can attach methods to every resource and command the api creates. `reactHooksPlugin()` is exactly this.

```ts
import type { IPlugin, IResource, PluginHKT, TResourceOptions } from "@fozy-labs/rx-toolkit";

// 1. Declare the augmentation shape as a higher-kinded type.
interface LoggingPluginHKT extends PluginHKT {
  readonly resourceType: { logState: (args: this["_TArgs"]) => void };
}

// 2. Implement IPlugin and expose the HKT through the phantom `_hkt` member.
class LoggingPlugin implements IPlugin {
  readonly name = "LoggingPlugin";
  declare readonly _hkt: LoggingPluginHKT; // compile-time only, never assigned

  install(context: { keyPrefix: string }): void {}

  augmentResource<TArgs, TData>(
    resource: IResource<TArgs, TData>,
    options: TResourceOptions<TArgs, TData>,
  ) {
    return {
      logState: (args: TArgs) => console.log(options.key, resource.getState(args)),
    };
  }
}
```

- `install(context)` runs once at `createApi`; `context` carries `keyPrefix`.
- `augmentResource` / `augmentCommand` run per `createResource` / `createCommand` and return a plain object that is `Object.assign`-ed onto the instance. Later plugins overwrite earlier keys.
- Typing goes through `PluginHKT`: the phantom members `_TArgs` / `_TData` / `_TError` are substituted at the application site, and `CombinePluginResourceAugments` intersects every plugin's contribution. A plugin without `_hkt` still works at runtime but contributes `{}` to the type.
- Keep the `plugins` array literal (or `as const`) so the tuple type survives inference — a widened `IPlugin[]` yields no augmentation at all, and `.useResource` disappears from the type.

> The package's `docs/query/usage/plugins.md` still describes an older `PluginResourceContributions` conditional-type scheme. The shipped typings use the HKT protocol above.

---

## Devtools and global options

```ts
import { DefaultOptions, reduxDevtools, combineDevtools } from "@fozy-labs/rx-toolkit";

DefaultOptions.update({
  DEVTOOLS: reduxDevtools({ name: "MyApp", batchStrategy: "microtask" }),
  onQueryError: (error) => report(error),
  getScopeName: () => Scope.getCurrentScope()?.name ?? null,
});
```

| Option         | Type                       | Purpose                                                     |
|----------------|----------------------------|--------------------------------------------------------------|
| `DEVTOOLS`     | `DevtoolsLike \| null`     | Sink for signal, resource and command state. `null` disables. |
| `onQueryError` | `(error: unknown) => void` | Global failure sink — see `error-handling.md`.                |
| `getScopeName` | `() => string \| null`     | Resolves `{scope}` in signal names, e.g. from the DI scope.   |

`reduxDevtools(options?)` targets the Redux DevTools browser extension. `batchStrategy` is `"sync"` / `"microtask"` (default) / `"task"`, with `taskDelay` for the last. Any `DevtoolsLike` implementation works — `combineDevtools(...)` fans out to several at once.

Per-resource, `getDevtoolsKey: (args: Keyed<TArgs>) => string` controls how an entry is labelled. A resource or command with no `key` is largely invisible in devtools.

---

## Pitfalls

- ❌ Typing the api's plugin list as `IPlugin[]` — the augmentation types vanish.
- ❌ Writing a plugin to do per-entry work — that is `onCacheEntryAdded`, see `lifecycle-hooks.md`.
- ✅ Give a `key` to anything you intend to inspect in devtools.
- ✅ Set `DefaultOptions` once at bootstrap, before the api is created.
