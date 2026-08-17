# Cache and invalidation

Cache keys, `links`, optimistic patches, staleness, eviction — and why a mutation sometimes leaves the UI unchanged.

**Contents:** [Cache keys](#the-cache-key-is-the-serialized-args) · [`links`](#links--wiring-a-command-to-resources) · [`forwardArgs`](#forwardargs-addresses-exactly-one-entry) · [Why nothing happened](#why-nothing-happened--checklist) · [Manual patches](#manual-patches) · [Staleness and eviction](#staleness-and-eviction)

---

## The cache key is the serialized args

One entry per `serializeArgs(args)` result, defaulting to `stableStringify` (so key order does not matter).

`stableStringify` handles plain objects, arrays, primitives, `null` and `undefined`. `Map`, `Set` and `RegExp` all serialize to `{}`, so args differing only in one of those collapse onto a **single** entry — pass a custom `serializeArgs` on the api or the resource. A `Date` is not in that group despite the package's own note: `JSON.stringify` calls its `toJSON`, so it keys by ISO string and stays distinguishable (it only collides with the equal ISO string as a value).

`key` (the resource/command name) is separate from the args key. It is combined with the api's `keyPrefix` as `` `${keyPrefix}/${key}` `` and is what devtools, snapshots and cross-tab sync address.

---

## `links` — wiring a command to resources

```ts
setStatus = api.createCommand<UserStatus, User>({
  queryFn: (status) => putUserStatus(status),
  links: (link) => {
    link({
      resource: this._userApi.getCurrentUser,
      forwardArgs: () => undefined,
      optimisticUpdate: (draft, status) => { draft.status = status; },
      invalidate: true,
    });
    link({
      resource: this._userApi.getTeam,
      forwardArgs: () => ({ teamId: this._teamId }),
      update: (draft, _status, user) => {
        const member = draft.members.find((m) => m.id === user.id);
        if (member) member.status = user.status;
      },
    });
  },
});
```

| Field              | Required | Runs                                                              |
|--------------------|----------|-------------------------------------------------------------------|
| `resource`         | ✅        | Target resource.                                                   |
| `forwardArgs`      | ✅        | `(commandArgs) => TResArgs \| undefined` — which entry is touched.  |
| `optimisticUpdate` | —        | Before `queryFn`; Immer recipe on the cached data.                 |
| `update`           | —        | After success; also gets the server result.                        |
| `invalidate`       | —        | After success; background SWR refresh of the entry.                |

Timing:

```
execute(args)
  ├─ optimisticUpdate   ← applied immediately, patch stays "pending"
  │     └─ throws → every patch applied so far is rolled back, entry fails
  ├─ queryFn(args, requestId)
  ├─ success ─┬─ update       (patch, committed at once)
  │           ├─ commit of the optimistic patches
  │           └─ invalidate   (resource.refresh(forwardedArgs))
  └─ failure ── abort of the optimistic patches (automatic rollback)
```

After a *successful* mutation each phase is isolated: a throwing `update` / `forwardArgs` / `invalidate` is logged to `console.error` and the remaining links still run, so a bad callback cannot strand a pending patch.

---

## `forwardArgs` addresses exactly one entry

It maps command args to the resource's args, which are then serialized into a single cache key. `() => undefined` is not a wildcard — it addresses the entry whose args are `undefined`, i.e. the entry of a no-args resource. There is no "invalidate all entries of this resource" in `links`.

Consequences:

- A resource paged by `{ page }` needs a `forwardArgs` per page you intend to touch, or a hand-rolled loop over `getEntries()`.
- If `forwardArgs` returns args with **no existing entry**, the link silently does nothing: `optimisticUpdate` and `update` call `getEntry(args)` without creating, and `invalidate` calls `refresh(args)`, which no-ops on a missing entry. This is the single most common "my cache did not update".

---

## Why nothing happened — checklist

1. **Is there an entry for those args?** `resource.getState(forwardedArgs).status` — `idle` means the link had no target.
2. **Do the serialized keys match?** Compare `resource.serialize(forwardedArgs)` with the key the component reads. An extra optional field or a `Date` in the args produces a different key.
3. **Did the command actually succeed?** `update` and `invalidate` only run on success; only `optimisticUpdate` runs before the response.
4. **Was the entry evicted?** With no subscriber it is gone after `retentionTime` (60 000 ms for resources, `0` for commands).
5. **Does the recipe mutate the draft?** `optimisticUpdate` / `update` are Immer recipes — mutate `draft`, do not return a new value.
6. **Was the entry in a state `refresh` accepts?** `invalidate` calls `resource.refresh(args)`, which is valid **only** from `success` / `refresh-error`. From `pending`, `refreshing` or `error` it logs `refresh() called in invalid state: …` and does nothing. Subscribers are irrelevant — when the state is valid, `queryFn` re-runs immediately whether or not anything is listening.

---

## Manual patches

`entry.createPatch(recipe)` returns `IPatchHandle | null` (`null` when the entry holds no data). **A patch stays `pending` until you settle it:**

```ts
const handle = entry.createPatch((draft) => { draft.unread += 1; });
handle?.commit();  // fold into the base data
handle?.abort();   // roll back via the inverse patch
```

An uncommitted handle keeps `patchState` alive forever, so `data` never reconciles with the server and snapshots fall back to `originalData`. Always settle it — this is what `links` does for you.

While any patch is pending the machine state carries `patchState`: `originalData` (untouched server data), the patch stack, and `isConsistencyViolation`. Patches are replayed on top of fresh data whenever a refresh lands. If a replay cannot be resolved, `isConsistencyViolation` is set, the stack is cleared and the entry auto-invalidates.

---

## Staleness and eviction

| Cause                                  | Effect                                                                                  |
|----------------------------------------|-----------------------------------------------------------------------------------------|
| `link({ invalidate: true })`           | `resource.refresh(args)` after success — background SWR on an existing entry            |
| `resource.refresh(args)`               | Same, called by hand. No-op with no entry, and from `pending` / `refreshing` / `error`. |
| `state.refresh()` (hook/agent)         | Refresh of the entry currently observed.                                                |
| `prefetch(args, { force: true })`      | Refreshes a warm entry, retries a failed one, creates and runs a cold one.              |
| `retentionTime` elapsed                | Entry dropped; `$cacheEntryRemoved` resolves and `queryFn` is aborted.                  |
| `api.resetAll()`                       | Clears every resource and command entry and resets sync state.                          |

---

## Pitfalls

- ❌ Expecting `forwardArgs: () => undefined` to hit every entry — it hits the `undefined`-args entry only.
- ❌ Returning a value from an `optimisticUpdate` / `update` recipe instead of mutating `draft`.
- ❌ Calling `entry.createPatch(...)` and never `commit()` / `abort()`.
- ❌ Args carrying a `Map` / `Set` / `RegExp` under the default `serializeArgs` — each serializes to `{}`, so every value shares one entry.
- ❌ Assuming `invalidate` always refetches — it is a silent no-op when the entry is missing or sits in `pending` / `refreshing` / `error`. When the state is valid it refetches at once, subscribers or not.
- ✅ Combine `optimisticUpdate` with `invalidate: true` when you want instant feedback plus server reconciliation.
- ✅ One `link({ … })` call per affected resource; several calls inside one `links` callback is the normal shape.
- ✅ Check `serialize(args)` on both sides when a link appears inert.
