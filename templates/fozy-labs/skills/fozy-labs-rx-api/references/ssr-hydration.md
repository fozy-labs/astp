# SSR snapshots and hydration

Priming the client cache from a server render instead of from `queryFn`.

---

## The two ends

```ts
// Server, after rendering
const snapshot = api.getSnapshot(); // TApiSnapshot — serialize into the HTML

// Client
export const api = createApi({
  keyPrefix: "main-api",
  plugins: [reactHooksPlugin()],
  initialSnapshot: window.__RX_SNAPSHOT__,
  snapshotValidTime: 30_000,
});
```

`TApiSnapshot` is `{ version, keyPrefix, timestamp, resources }`, where each resource slice holds entries of
`{ status, args, data, updatedAt }`. The version is **2** since 0.13.0.

---

## What `getSnapshot()` collects

- resources only — commands are never serialized;
- resources with a `key` only — an unkeyed resource cannot be matched on hydration;
- resources with `snapshotable` left `true` — `snapshotable: false` excludes a resource from both serialization and
  hydration (for derived resources whose data belongs to another resource; projection resources set it automatically);
- entries in `success` **and** `invalidate-error` (the latter's data is last-known-good);
- the **confirmed base**: when optimistic patches are pending it writes `patchState.originalData`, not the patched `data`.

Call it *after* rendering, so the entries reflect what the page actually read.

---

## What hydration does

Lazily, at each `createResource()` call:

1. Looks up the slice by the resource's own `key` — the api's `keyPrefix` is stripped on serialize and is not required to match on the client.
2. Revives each entry from its persisted `data` in `success`.
3. Marks the entry (`entry.isInvalidated`) when it came from `invalidate-error`, or when `snapshotValidTime` is a number and `updatedAt + snapshotValidTime < Date.now()`.

A marked entry fires **no request at creation time** — the refetch starts on its first **hold** (a mounted hook, an
`ensure`), and that subscriber's first snapshot already shows the in-flight state. 0.12.x refetched every stale entry
inside `createResource()`, so declaring resources fired one request per stale entry at module load; that is gone. A
non-stale entry is revived in `success` and runs nothing.

`snapshotValidTime` is `false` by default (snapshot data never expires) and can be set per resource, which wins over the
api-level value.

**Snapshot version 2, verified against the 0.13 source:** a 0.13 client reads a version-1 snapshot (`refreshing` /
`refresh-error` revive as `invalidating` / `invalidate-error`); a 0.12 client does **not** hydrate version-2 entries
carrying `invalidate-error` — in a mixed SSR deploy they load again on the old client, so update server and client
together. `api.resetAll()` now clears the stored snapshot as well (0.12.x kept it, so resources created after the
reset hydrated the previous user's data).

---

## Rendering under SSR

Hooks render and hydrate without mismatches: `useSignal` supplies a `getServerSnapshot`, and the query hooks render
the entry as the server did during the hydration render — the refetch a stale snapshot owes shows right after. A
boundary that suspends on the server renders its fallback there; the data arrives on the client. To have data in the
server HTML, prime the cache before render and serialize the snapshot after it.

---

## Pitfalls

- ❌ Mixing a 0.12 client with a 0.13 server snapshot (or back) — version-2 `invalidate-error` entries are lost on the old client; deploy both ends together.
- ❌ Expecting a stale snapshot to refetch at `createApi` / `createResource` time — the request fires on the first hold.
- ❌ A boundary that suspends on the server expecting data in the server HTML — the fallback is what gets rendered there.
- ❌ Snapshotting a resource with no `key` — it is silently omitted (as is one with `snapshotable: false`).
- ❌ Expecting a hydrated stream resource to be live — hydration revives data only; the stream reconnects on the next real run (see [stream-queries.md](stream-queries.md)).
- ✅ Give every resource you intend to snapshot an explicit `key`.
- ✅ Set `snapshotValidTime` so server data that sat in an HTML cache refreshes instead of sticking.
- ✅ Serialize the snapshot after rendering, not before.
