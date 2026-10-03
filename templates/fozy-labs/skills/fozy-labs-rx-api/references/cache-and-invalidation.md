# Cache and invalidation

Cache keys, `links`, optimistic patches, staleness, eviction — and why a mutation sometimes leaves the UI unchanged.

**Contents:** [Cache keys](#the-cache-key-is-the-serialized-args) · [`links`](#links--wiring-a-command-to-resources) · [`forwardArgs`](#forwardargs-addresses-exactly-one-entry) · [Why nothing happened](#why-nothing-happened--checklist) · [Manual patches](#manual-patches) · [Staleness, holds and eviction](#staleness-holds-and-eviction) · [Lazy invalidation and the in-flight policy](#lazy-invalidation-and-the-in-flight-policy)

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
| `forwardArgs`      | ✅        | `(commandArgs) => TResArgs` — which entry is touched.              |
| `optimisticUpdate` | —        | Before `queryFn`; Immer recipe on the cached data.                 |
| `update`           | —        | After success; also gets the server result.                        |
| `invalidate`       | —        | After success; invalidates the entry. `true` ≡ `{}`; `{ inFlight }` overrides the resource's policy. |

Timing:

```
execute(args)
  ├─ optimisticUpdate   ← applied immediately, patch stays "pending"
  │     └─ throws → every patch applied so far is rolled back, entry fails
  ├─ queryFn(args, requestId)
  ├─ success ─┬─ update       (patch, committed at once)
  │           ├─ commit of the optimistic patches
  │           └─ invalidate   (resource.invalidate(forwardedArgs))
  └─ failure ── abort of the optimistic patches (automatic rollback)
```

After a *successful* mutation each phase is isolated: a throwing `update` / `forwardArgs` / `invalidate` is logged to `console.error` and the remaining links still run, so a bad callback cannot strand a pending patch.

---

## `forwardArgs` addresses exactly one entry

It maps command args to the resource's args, which are then serialized into a single cache key. There is no "invalidate all entries of this resource" in `links` — and since 0.13.0 the return type is `TResArgs`, so `undefined` passes only for a resource whose args are `void`.

Consequences:

- A resource paged by `{ page }` needs a `forwardArgs` per page you intend to touch, or a hand-rolled loop over `getEntries()`.
- If `forwardArgs` returns args with **no existing entry**, the link silently does nothing: `optimisticUpdate` and `update` call `getEntry(args)` without creating, and `invalidate` never creates one either. This is the single most common "my cache did not update".

---

## Why nothing happened — checklist

1. **Is there an entry for those args?** `resource.getState(forwardedArgs).status` — `idle` means the link had no target.
2. **Do the serialized keys match?** Compare `resource.serialize(forwardedArgs)` with the key the component reads. An extra optional field or a `Date` in the args produces a different key.
3. **Did the command actually succeed?** `update` and `invalidate` only run on success; only `optimisticUpdate` runs before the response.
4. **Was the entry evicted?** With no holds it is gone after `retentionTime` (60 000 ms for resources, `0` for commands) — but an entry that was never held is never collected.
5. **Does the recipe mutate the draft?** `optimisticUpdate` / `update` are Immer recipes — mutate `draft`, do not return a new value.
6. **Is the entry held at all?** `invalidate` is [lazy](#lazy-invalidation-and-the-in-flight-policy): an entry nothing holds (no mounted `useResource`, no pending `ensure` / `fetch`, no `entry.hold()`) is only **marked** — the refetch fires on the next hold. For a refresh that must happen now use `fetch` / `prefetch(args, { force: true })`.

---

## Manual patches

`entry.createPatch(recipe)` returns `IPatchHandle | null` (`null` when the entry holds no data). **A patch stays `pending` until you settle it:**

```ts
const handle = entry.createPatch((draft) => { draft.unread += 1; });
handle?.commit();  // fold into the base data
handle?.abort();   // roll back via the inverse patch
```

An uncommitted handle keeps `patchState` alive forever, so `data` never reconciles with the server and snapshots fall back to `originalData`. Always settle it — this is what `links` does for you.

While any patch is pending the entry state carries `patchState`: `originalData` (untouched server data), the patch stack, and `isConsistencyViolation`. Patches are replayed on top of fresh data whenever a revalidation lands. If a replay cannot be resolved, `isConsistencyViolation` is set, the stack is cleared and the entry invalidates itself.

---

## Staleness, holds and eviction

An entry lives by **holds**: a mounted `useResource`, a pending `ensure` / `fetch`, an `entry.obs` subscription, or an explicit `entry.hold()` (returns an idempotent release). An entry with no holds is "melting" (`entry.isMelting`) and is collected after `retentionTime` — but the timer only starts when the last hold is released, so an entry that was never held is never collected.

| Cause                                  | Effect                                                                                  |
|----------------------------------------|-----------------------------------------------------------------------------------------|
| `link({ invalidate: true })`           | `resource.invalidate(args)` after success — refetch a held entry, mark a melting one    |
| `resource.invalidate(args)`            | Same, called by hand. Never creates an entry; on an `error` entry it retries with the error cleared. |
| `state.invalidate()` (hook/clutch)     | Invalidation of the entry currently observed.                                           |
| `prefetch(args, { force: true })`      | Refetches a warm entry, retries a failed one, creates and runs a cold one.              |
| `retentionTime` elapsed                | Entry dropped; `$cacheEntryRemoved` resolves and `queryFn` is aborted.                  |
| `api.resetAll()`                       | Clears every resource and command entry, the stored SSR snapshot, and sync state.       |

`retentionTime` accepts a number, `false` (never evict), or `(args, state) => number | false` — evaluated synchronously at each release of the last hold; `Infinity` means no timer, a throw counts as `0`.

---

## Lazy invalidation and the in-flight policy

`invalidate()` — on the resource, the entry, the clutch, or through a link — refetches immediately only an entry someone **holds**. An unheld entry just gets `entry.isInvalidated = true` and refetches when it is next held; the new subscriber's first snapshot already shows the in-flight state. A stale SSR snapshot hydrates the same way: marked, refetched on first hold, not at `createApi` time.

On an entry with a request **in flight** (an open stream counts too), `invalidate()` follows the in-flight policy:

| Mode      | What happens                                                                 |
|-----------|-------------------------------------------------------------------------------|
| `cancel` (default) | Aborts the current request (`AbortSignal`) and sends a new one at once — a pre-mutation response cannot settle as fresh. |
| `trail`   | Lets the current request finish; the refetch goes right after it settles.     |
| `join`    | No-op — the in-flight result is accepted as the answer to the invalidation.   |

Set it via the resource option `invalidateInFlight`, per call as `invalidate(args, { inFlight })`, or per link as `invalidate: { inFlight }`. Use `join` only when the in-flight request is known to be fresh enough.

---

## Pitfalls

- ❌ Expecting `forwardArgs: () => undefined` to hit every entry — it hits the `undefined`-args entry only (and no longer type-checks for a resource with non-`void` args).
- ❌ Returning a value from an `optimisticUpdate` / `update` recipe instead of mutating `draft`.
- ❌ Calling `entry.createPatch(...)` and never `commit()` / `abort()`.
- ❌ Args carrying a `Map` / `Set` / `RegExp` under the default `serializeArgs` — each serializes to `{}`, so every value shares one entry.
- ❌ Assuming `invalidate` always refetches — it refetches at once only a **held** entry; an unheld one is marked and refetched on its next hold.
- ✅ Combine `optimisticUpdate` with `invalidate: true` when you want instant feedback plus server reconciliation.
- ✅ One `link({ … })` call per affected resource; several calls inside one `links` callback is the normal shape.
- ✅ Check `serialize(args)` on both sides when a link appears inert.
