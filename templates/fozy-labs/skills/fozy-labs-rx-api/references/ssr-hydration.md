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
`{ status, args, data, updatedAt }`.

---

## What `getSnapshot()` collects

- resources only — commands are never serialized;
- resources with a `key` only — an unkeyed resource cannot be matched on hydration;
- entries in `success` **and** `refresh-error` (the latter's data is last-known-good);
- the **confirmed base**: when optimistic patches are pending it writes `patchState.originalData`, not the patched `data`.

Call it *after* rendering, so the entries reflect what the page actually read.

---

## What hydration does

Lazily, at each `createResource()` call:

1. Looks up the slice by the resource's own `key` — the api's `keyPrefix` is stripped on serialize and is not required to match on the client.
2. Revives each entry from its persisted `data`: `success` when fresh, `refreshing` when stale.
3. Marks the entry stale when it came from `refresh-error`, or when `snapshotValidTime` is a number and `updatedAt + snapshotValidTime < Date.now()`.

A stale entry is revived directly in `refreshing` and its `queryFn` runs **immediately, inside `createResource()`** —
not on first subscription. Declaring the resources therefore fires one request per stale entry at module-load time,
and those entries then sit unsubscribed under the usual `retentionTime`. A non-stale entry is revived in `success`
and runs nothing.

`snapshotValidTime` is `false` by default (snapshot data never expires) and can be set per resource, which wins over the
api-level value.

**Verified against the 0.11 source, against what the package docs claim:** there is no `version` / `keyPrefix` validation and
nothing is thrown on a mismatch; the slice is not consumed or deleted after hydration; and `api.resetAll()` does not
clear the stored snapshot. Do not build on those behaviours.

---

## Rendering under SSR

`useSuspenseResource` is client-only — it inherits `useSignal`, which has no `getServerSnapshot`. For streaming SSR use
`useResource`; see `reading-in-react.md`.

---

## Pitfalls

- ❌ Relying on snapshot `version` / `keyPrefix` validation to catch a bad payload — there is none.
- ❌ Expecting `resetAll()` to drop `initialSnapshot`.
- ❌ Using `useSuspenseResource` under SSR.
- ❌ Snapshotting a resource with no `key` — it is silently omitted.
- ❌ Reading `snapshotValidTime` as "refresh when someone looks at it" — every stale entry refetches the moment its resource is created.
- ✅ Give every resource you intend to snapshot an explicit `key`.
- ✅ Set `snapshotValidTime` so server data that sat in an HTML cache refreshes instead of sticking.
- ✅ Serialize the snapshot after rendering, not before.
