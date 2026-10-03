# Extension points — plugins and devtools

Changing what every resource and command *is*, rather than what an individual one does.

For `onCacheEntryAdded` / `onQueryStarted` — the callbacks that run alongside a cache entry — see
[lifecycle-hooks.md](lifecycle-hooks.md); they are a per-resource option, not an extension point.

---

## Custom plugins

A plugin can attach methods to every resource and command the api creates — and to the api itself. `reactHooksPlugin()` is exactly this.

```ts
import type { IPlugin, IPluginHKT, IResource, TResourceOptions } from "@fozy-labs/rx-toolkit";

// 1. Declare the augmentation shape as a higher-kinded type.
interface LoggingPluginHKT extends IPluginHKT {
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
- `augmentResource` / `augmentCommand` / `augmentProjectionResource` run per `createResource` / `createCommand` / `unstable_createProjectionResource` and return a plain object that is `Object.assign`-ed onto the instance. Later plugins overwrite earlier keys.
- `augmentApi(api)` runs once at `createApi` (after every `install`, in `plugins` order) and returns members assigned onto the api itself — this is how `unstable_formsPlugin()` adds `api.defineForm`. A name the api already has — its own or a previous plugin's — throws at `createApi`.
- Typing goes through `IPluginHKT`: the phantom members `_TArgs` / `_TData` / `_TError` are substituted at the application site, and `TCombinePlugin*Augments` intersects every plugin's contribution. The HKT slots are `resourceType`, `commandType`, `projectionResourceType` and `apiType` (in `apiType` only `this['_TError']` is substituted — the api's `mapError` type). A plugin without `_hkt` still works at runtime but contributes `{}` to the type.
- Keep the `plugins` array literal (or `as const`) so the tuple type survives inference — a widened `IPlugin[]` yields no augmentation at all, and `.useResource` disappears from the type.

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

| Option            | Type                          | Purpose                                                     |
|-------------------|-------------------------------|--------------------------------------------------------------|
| `DEVTOOLS`        | `DevtoolsLike \| null`        | Sink for signal, resource and command state. `null` disables. |
| `MACHINE_DEVTOOLS`| `MachineDevtoolsLike \| null` | State-machine inspector (`statelyInspector()`); `combineDevtools` does not apply. See the `fozy-labs-signals` skill, `references/statechart.md`. |
| `onQueryError`    | `(error: unknown) => void`    | Global failure sink — fires on every failed query after the entry records the error (0.12.x never called it). See [error-handling.md](error-handling.md). |
| `getScopeName`    | `() => string \| null`        | Resolves `{scope}` in signal names, e.g. from the DI scope.   |

`reduxDevtools(options?)` targets the Redux DevTools browser extension; without the extension it logs `console.error` and no-ops (0.12.x threw and could crash the app). `batchStrategy` is `"sync"` / `"microtask"` (default) / `"task"`, with `taskDelay` for the last. Any `DevtoolsLike` implementation works — `combineDevtools(...)` fans out to several at once.

Query transitions arrive as `UPDATE: success | error | invalidate | revalidate | rebase | invalidate-error | retry | patch | patch-settled | sync` (`revalidate` is the deferred refetch of a marked entry; `UPDATE: refresh` / `refresh-error` are the pre-0.13 names).

Entries are labelled `` `${resourceKey}:${entryKey}` `` and there is no per-resource override, so a resource or command with no `key` is largely invisible in devtools.

---

## Pitfalls

- ❌ Typing the api's plugin list as `IPlugin[]` — the augmentation types vanish.
- ❌ Writing a plugin to do per-entry work — that is `onCacheEntryAdded`, see [lifecycle-hooks.md](lifecycle-hooks.md).
- ✅ Give a `key` to anything you intend to inspect in devtools.
- ✅ Set `DefaultOptions` once at bootstrap, before the api is created.
