# Cross-tab sync

Priming a cold cache entry from another browser tab instead of from the network.

Pull model: before running `queryFn` for a cold entry, the tab broadcasts a `REQ`; a tab that already holds the data
answers `RES`, and the entry hydrates as `success` without a round-trip.

**Contents:** [Wiring it up](#wiring-it-up) · [What a responding tab answers with](#what-a-responding-tab-answers-with) · [`broadcastSyncDriver`](#broadcastsyncdriver) · [A custom driver](#a-custom-driver)

---

## Wiring it up

```ts
import { broadcastSyncDriver, createApi } from "@fozy-labs/rx-toolkit";

export const api = createApi({
  keyPrefix: "main-api",
  syncDriver: broadcastSyncDriver({ channel: "my-app" }),
  defaultSync: "resources",
  plugins: [reactHooksPlugin()],
});

const getCatalog = api.createResource({ key: "catalog", queryFn: fetchCatalog });                 // synced
const getProfile = api.createResource({ key: "profile", queryFn: fetchProfile, sync: false });    // opted out
```

| Level    | Option        | Values                               | Default            |
|----------|---------------|--------------------------------------|--------------------|
| api      | `syncDriver`  | `ISyncDriver`                        | none — sync is off |
| api      | `defaultSync` | `"none"` \| `"resources"` \| `"all"` | `"none"`           |
| resource | `sync`        | `boolean`                            | api `defaultSync`  |

Without a `syncDriver` nothing syncs, whatever `defaultSync` says. A resource-level `sync` overrides the api default in
both directions.

**Commands are never synced.** `createCommand` has no `sync` option and never touches the syncer, so `defaultSync: "all"`
behaves identically to `"resources"`. Verified against the 0.11 source: parts of the package docs still list a
command-level `sync` option — there is none.

---

## What a responding tab answers with

| Machine state of the holder                          | `RES` payload  |
|------------------------------------------------------|----------------|
| `success`                                            | `data`         |
| `success` with pending patches                       | `originalData` |
| `pending` / `error` / `refreshing` / `refresh-error` | nothing        |

On the receiving side the entry appears in `success`, `onCacheEntryAdded` fires, `onQueryStarted` does **not** (no query
ran — see [lifecycle-hooks.md](lifecycle-hooks.md)), and normal `retentionTime` rules apply.

A `RES` can never clobber local data: the `REQ` is only ever sent for a **cold** entry, and the answer is applied only
while that entry is still `pending`. There is no freshness comparison — `RES` carries no timestamp, so a tab holding
older data answers just as readily. Verified against the 0.11 source, against what the package docs claim. If no
answer arrives within 150 ms the entry falls back to its own `queryFn`.

---

## `broadcastSyncDriver`

```ts
broadcastSyncDriver();                          // channel "rx-toolkit"
broadcastSyncDriver({ channel: "shared" });     // explicit channel
```

The default channel name is the literal `"rx-toolkit"` — the driver never sees `keyPrefix` (the prefix travels inside
the message instead). Tabs of different apps sharing an origin therefore share the default channel; give each app an
explicit `channel`. Every `BroadcastChannel` call is wrapped in try/catch, so an unsupported environment degrades to no
sync rather than throwing.

---

## A custom driver

`ISyncDriver` is transport-agnostic — implement it over WebSocket, SharedWorker or anything else:

```ts
interface ISyncDriver {
  connect(onMessage: (msg: ISyncMessage) => void): void;
  disconnect(): void;
  send(message: ISyncMessage): void;
}

interface ISyncMessage {
  type: "REQ" | "RES";
  reqId: string;
  keys: [keyPrefix: string, resourceKey: string, entryKey: string];
  data?: unknown;
}
```

A resource with no `key` cannot be addressed by `keys[1]` and so cannot sync.

---

## Pitfalls

- ❌ Enabling `defaultSync` for user-private resources — another tab (same origin, possibly another account after a re-login) can answer. Set `sync: false` on anything account-scoped.
- ❌ Leaving the default `"rx-toolkit"` channel when several apps share an origin.
- ❌ Expecting a command to propagate — commands are never synced.
- ❌ Setting `defaultSync` without a `syncDriver` — nothing happens.
- ✅ Give every resource you intend to sync an explicit `key`.
- ✅ Treat sync as a cache warm-up, not as a source of truth: a tab only answers from `success`.
