# Lifecycle hooks — `onCacheEntryAdded` / `onQueryStarted`

The two callbacks that let code run alongside a cache entry: attaching a live subscription for as long as an entry
exists, and instrumenting every individual query run.

Both are accepted at two levels — on `createApi(...)` (api-wide) and on `createResource` / `createCommand` (local).

**Contents:** [`onCacheEntryAdded`](#oncacheentryadded--once-per-cache-entry) · [`onQueryStarted`](#onquerystarted--once-per-query-run) · [`composeHooks`](#composehooks--several-hooks-on-one-option) · [Both levels run](#both-levels-run) · [Polling and retry](#not-a-substitute-for-polling-or-retry)

---

## `onCacheEntryAdded` — once per cache entry

Fires when an entry is created for a given set of args. Use it for anything whose lifetime should match the entry's:
a polling timer, a socket that patches *around* the entry's own data. For plain live data a stream `queryFn`
(an `Observable` — see [stream-queries.md](stream-queries.md)) replaces this plumbing entirely.

On a **command** it fires once per run, not once per key: every `execute` completes the previous entry for that key and
builds a new one.

| `ctx` field          | Type               | Resolves                                                                    |
|----------------------|--------------------|-----------------------------------------------------------------------------|
| `entry`              | `IQueryCacheEntry` | The entry itself.                                                           |
| `$cacheDataLoaded`   | `Promise<TData>`   | On the first data the entry ever holds; **rejects** if it is removed first. |
| `$cacheEntryRemoved` | `Promise<void>`    | When the entry leaves the cache.                                            |

```ts
getChatMessages = api.createResource({
  key: "chatMessages",
  queryFn: (chatId: string, signal) => fetchMessages(chatId, signal),
  onCacheEntryAdded: async (chatId, { entry, $cacheDataLoaded, $cacheEntryRemoved }) => {
    const connection = openChatSocket(chatId);
    try {
      await $cacheDataLoaded; // rejects if the entry dies before any data arrives
    } catch {
      connection.close();
      return;
    }

    connection.onMessage((message) => {
      const patch = entry.createPatch((draft) => { draft.items.push(message); });
      patch?.commit(); // MUST settle — an uncommitted patch stays pending forever
    });

    await $cacheEntryRemoved;
    connection.close();
  },
});
```

Two things bite here: `$cacheDataLoaded` rejects on removal, so wrap it and clean up in the `catch`; and `createPatch`
returns a handle that must be committed or aborted (see [cache-and-invalidation.md](cache-and-invalidation.md)).

An entry hydrated from cross-tab sync fires `onCacheEntryAdded` but **not** `onQueryStarted` — no `queryFn` ran.
See [cross-tab-sync.md](cross-tab-sync.md).

---

## `onQueryStarted` — once per query run

Fires every time `queryFn` starts: the initial load, each refresh, each retry.

| `ctx` field       | Type                       | Notes                                                                                |
|-------------------|----------------------------|--------------------------------------------------------------------------------------|
| `entry`           | `IQueryCacheEntry`         | The entry the run belongs to.                                                        |
| `$queryFulfilled` | `Promise<{ data: TData }>` | Resolves on success; rejects with the **raw** error (before `mapError`) or on abort. |
| `$queryStream`    | `{ firstReceived, allReceived }` | Stream milestones; for a promise `queryFn` both equal `$queryFulfilled`. See [stream-queries.md](stream-queries.md). |

Errors thrown inside either hook are suppressed and never affect the request. A rejected `$queryFulfilled` you never
await is therefore harmless, but a resource you opened in the hook leaks unless you handle the rejection yourself.

---

## `composeHooks` — several hooks on one option

`composeHooks(...hooks)` merges hooks of one kind into one, for stacking independent behaviours (logging, optimistic
updates, metrics) on a single option:

```ts
import { composeHooks } from "@fozy-labs/rx-toolkit";

getUser = api.createResource({
  queryFn: (id: number): Promise<User> => fetchUser(id),
  onQueryStarted: composeHooks(logQueryStarted, warmRelatedCaches),
});
```

- `undefined` arguments are skipped; a single remaining hook is returned as-is, none — `undefined`.
- All hooks **start simultaneously** (completion order not guaranteed) and each one's error is suppressed
  independently. The api merges api-level and local hooks with this same utility.
- Type-inference limit: with inline un-annotated hooks TS needs `TData` known up front — annotate the `queryFn`
  return type, the hook's `ctx`, or pass the generics explicitly.

---

## Both levels run

`createApi({ onCacheEntryAdded, onQueryStarted })` installs api-wide hooks. They are merged with the
resource/command-level ones, and both start at the same time — a long-lived api-level hook does not block the local one.

```ts
export const api = createApi({
  keyPrefix: "main-api",
  onQueryStarted: async (_args, { $queryFulfilled }) => {
    const started = performance.now();
    try { await $queryFulfilled; } catch { /* suppressed anyway */ }
    metrics.record(performance.now() - started);
  },
});
```

---

## Not a substitute for polling or retry

The package ships neither. `onCacheEntryAdded` is where you build them: start an interval that calls `refresh(args)`
and clear it after `$cacheEntryRemoved`. Retry policy belongs inside `queryFn` — see [error-handling.md](error-handling.md).

Use `refresh(args)` here, not `prefetch(args, { force: true })`: `prefetch` re-arms the entry's `retentionTime` on
every call, so a poll faster than the retention window keeps the entry alive forever and `$cacheEntryRemoved` never
resolves. The trade-off is that `refresh` no-ops (with a console warning) while the entry sits in `pending`,
`refreshing` or `error` — a tick that lands there is simply skipped.

---

## Pitfalls

- ❌ `entry.createPatch(...)` in a hook without `commit()` / `abort()` — the patch stays pending forever.
- ❌ Awaiting `$cacheDataLoaded` without a `catch` — it rejects when the entry is removed, and your subscription leaks.
- ❌ Doing real work in `onCacheEntryAdded` and expecting a thrown error to surface — hook errors are suppressed.
- ❌ Expecting `onQueryStarted` on a sync-hydrated entry — only `onCacheEntryAdded` fires.
- ✅ Pair every `onCacheEntryAdded` subscription with teardown after `$cacheEntryRemoved`.
- ✅ Use `onQueryStarted` for per-run instrumentation and `onCacheEntryAdded` for per-entry resources.
