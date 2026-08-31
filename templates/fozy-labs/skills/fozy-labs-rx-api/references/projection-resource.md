# Projection resource

`api.unstable_createProjectionResource` wraps an existing resource that fetches items by a list of ids and adds a
shared **per-item cache**.

```ts
usersProjection = api.unstable_createProjectionResource({
  resource: this.getUsersByIds,                          // IResource<{ userIds: number[] }, User[]>
  key: "users-projection",
  parseData: (data) => data.map((item) => ({ id: item.id, item })),
  makeArgs: (ids) => ({ userIds: ids }),
});

usersProjection.useResource([1, 2, 3]); // queryFn gets { userIds: [1, 2, 3] }
usersProjection.useResource([1, 2, 4]); // 1 and 2 cached — queryFn gets { userIds: [4] }
usersProjection.useResource([2, 3]);    // fully cached — no request at all
```

The result is a full `IResource<TArgs, TItem[]>` — agents, hooks, SWR, `ensure` / `fetch` / `prefetch`, devtools and
plugin augmentations all work. Each run: `parseArgs` extracts the ids (default: args *are* the id array), missing ids
go out as one `makeArgs(missingIds)` request to the wrapped resource, `parseData` splits the response into
`{ id, item }` pairs, and the result is assembled per requested id (order and duplicates preserved). Every live set
entry is an open [stream](stream-queries.md) projection of the item cache: refreshing `[1, 2, 3]` makes the `[1, 2, 4]`
entry re-emit with the fresh items 1 and 2 on its own.

Other options: `parseArgs`, `serializeId` (default `stableStringify`), `serializeArgs`, `retentionTime`,
`onCacheEntryAdded` / `onQueryStarted` (over set entries; `onQueryStarted` fires even for runs served entirely from
the item cache — observe real network on the wrapped resource).

---

## Semantics

- Duplicate ids in one request are fetched once but occupy all their positions; an empty id list resolves to `[]`
  without a request. A set overlapping an in-flight request only fetches its own missing ids and awaits the rest.
- `refresh` / `fetch` / `prefetch({ force: true })` on an existing entry refetch **all** ids of the set, bypassing the
  item cache; they do not join requests started before the refresh.
- `retry` / `ensure` after an error re-request only the still-missing ids.
- An item lives while at least one set entry mentions its id; the last mention's eviction evicts the item.
- Wrapped-resource failure fails the set entry (`mapError` applied exactly once — same normalized instance). A
  successful response that does not cover every requested id fails with `ProjectionItemMissingError` (exported,
  `ids` field); on refresh that is a `refresh-error` keeping stale data.

---

## Infinite feed: `useInfiniteResource`

With `reactHooksPlugin()` a projection resource additionally gets `useInfiniteResource` — an ordered list of
**pages**, each page an ordinary projection entry with its fixed id set:

```tsx
const feed = postsProjection.useInfiniteResource(firstPageIds);
// feed.data: TItem[] | null — all pages concatenated; stable identity unless page data changed
// feed.pages, feed.isInitialLoading, feed.isFetchingNext, feed.isLoading / isError / error, feed.isIdle
feed.fetchNext(nextIds); // caller supplies next-page ids (e.g. from a pager resource); no hasNext — caller knows
feed.refresh();          // revalidate every page (data pages refresh, failed pages retry)
feed.reset();            // drop all pages after the first
```

Loaded pages never flicker while the tail loads (their entries are not recreated), items are deduplicated across
pages (shared item cache), and a refresh of any overlapping set re-emits the affected pages. Changing
`initialArgs` (by cache key) resets the feed to the new first page. `SKIP` as `initialArgs` → `isIdle`.

---

## Limitations

- **Cross-tab sync is disabled** and **SSR snapshots exclude the projection** (`snapshotable: false` is set
  automatically) — the wrapped resource owns the data and snapshots as usual.
- Cancellation is not forwarded to the wrapped resource — several sets may await one batch request.
- A set entry's error is all-or-nothing: no partial result.
- Optimistic patches are **set-local**: a patch on one set's entry is invisible to the item cache and to overlapping
  sets (item updates still rebase under the pending patch). First patch logs a one-time warning.
- `$queryStream.allReceived` never resolves for a projection entry (the set stream never completes) — use
  `$queryFulfilled` / `firstReceived`.

---

## Pitfalls

- ❌ Watching network traffic through the projection's `onQueryStarted` — it fires on cache-served runs too; hook the
  wrapped resource instead.
- ❌ Expecting an optimistic patch on one set to show up in overlapping sets — patches are set-local.
- ❌ Building `hasNext` / next-page ids into the hook — pagination knowledge stays in the caller (a pager resource).
- ✅ Keep `parseArgs` pure and deterministic — it runs on every read.
- ✅ Treat `feed.data` as immutable and don't use its identity as a "something happened" signal — that is what
  `pages` and the flags are for.
