# Errors, retries and cancellation

Typing `error`, where a failure surfaces, what the library retries (almost nothing) and what it aborts.

**Contents:** [`error` is `unknown`](#by-default-error-is-unknown) · [Channels that stay raw](#channels-that-stay-raw) · [`CacheEntryRemovedError`](#cacheentryremovederror) · [Where a failure shows up](#where-a-failure-shows-up) · [Retrying](#retrying) · [Cancellation](#cancellation)

---

## By default `error` is `unknown`

Every state's `error` is `unknown` until the api declares `mapError`. That option normalizes every raw failure once and its return type becomes the api's `TError`, propagated to every resource and command it creates:

```ts
import { reactHooksPlugin } from "@fozy-labs/rx-toolkit/react";

class NetUnknownError extends Error {
  constructor(readonly original: unknown) { super("net unknown"); }
}

export const api = createApi({
  plugins: [reactHooksPlugin()],
  mapError: (error, ctx) => {
    if (error instanceof CacheEntryRemovedError) return new NetUnknownError(error);
    return NetError.is(error) ? error : new NetUnknownError(error);
  },
});
// TError is inferred as NetError | NetUnknownError
```

`ctx` is provenance, not a wrapper:

| Field      | Type                     | Meaning                                              |
|------------|--------------------------|------------------------------------------------------|
| `source`   | `"query" \| "command"`   | Read or write.                                       |
| `args`     | `unknown`                | Args of the failing operation (untyped — one mapper serves many). |
| `entryKey` | `string`                 | Serialized cache-entry key.                          |
| `key`      | `string \| undefined`    | Resource/command `key`, when configured.             |

Guarantees:

- Called **exactly once per failure**, when the entry records it, so clutch state, the Suspense throw, `ensure` / `fetch` rejections and the mutation envelope all see the same instance.
- A throwing `mapError` is logged to `console.error` and the raw error goes into the state — the entry does not break.
- Without `mapError`, behaviour is unchanged and `TError` stays `unknown`.

For reporting rather than mapping use `DefaultOptions.onQueryError`: it fires on **every** query failure (resources
and commands, retries included), after the entry records the error, with the `mapError` output. (0.12.x declared it
but never called it.)

---

## Channels that stay raw

`mapError` does not cover everything. These carry the original value:

| Channel                                                | Why                                                       |
|--------------------------------------------------------|-----------------------------------------------------------|
| Aborted runs                                           | Flow control, not a failure — never reaches the entry state. |
| `$queryFulfilled` in `onQueryStarted`                  | Deliberately observes the unhandled outcome.              |
| `ensure` / `fetch` rejecting with `CacheEntryRemovedError` | These channels are not typed as `TError`.              |

So a `catch` around `ensure` must handle `TError`, a raw `CacheEntryRemovedError`, and the abort reason.

---

## `CacheEntryRemovedError`

Exported from the package. Thrown when an entry is removed before an async operation settles:

- a command re-run (`execute` / hook `trigger`) with the **same key** while the first run is in flight;
- `api.resetAll()` during a mutation;
- retention GC dropping an entry that `ensure` / `fetch` was waiting on.

On the command path it passes through `mapError` (so the typed envelope holds), so give your mapper an explicit branch or a general fallback for unknown shapes.

---

## Where a failure shows up

| Path                                | Surface                                                          |
|-------------------------------------|------------------------------------------------------------------|
| `useResource`                       | `status: "error"` with `error`; `dataSource` says whether data is still on screen (`hasError && hasData`) |
| `useSuspenseResource`               | An error with nothing to show is thrown to the nearest Error Boundary; an error behind previous / placeholder data comes back in state (`hasError`) |
| `resource.ensure/fetch`             | Promise rejection                                                 |
| `resource.prefetch` / `invalidate`  | Nothing — swallowed / recorded in the entry; read `getState(args)` instead |
| `useCommand` / `clutch.trigger`     | `{ status: "error", error }` envelope **and** `state.hasError`    |
| `command.execute`                   | Promise rejection                                                  |

`status: "error"` with `dataSource: "current"` and plain `error` are different: the first keeps the last good response in `data`. Rendering an error screen there throws away data the user could still use. How loud each failure should be — [ui-states.md](ui-states.md#error-loudness).

---

## Retrying

There is **no retry or backoff on failure.** The only automatic re-run is [`invalidateOn`](cache-and-invalidation.md#automatic-revalidation--invalidateon) — focus, reconnect, interval — which retries a held failed entry when its trigger fires. Everything else is explicit:

| Call                              | Semantics                                                                 |
|-----------------------------------|---------------------------------------------------------------------------|
| `state.retry()` (resource)        | Re-runs the failed query, **keeping the error on screen**: `pending` with `hasError` until the run settles. No-op with a console warn outside an error. |
| `state.invalidate()` (resource)   | Re-checks the shown data and **clears the error**. With nothing on screen (`status: "error"`, `dataSource: "none"`) it warns and no-ops — that row wants `retry()`. Entry-level `entry.invalidate()` / `resource.invalidate(args)` and the `useResources` aggregate `invalidate()` retry a failed entry instead. |
| `state.retry()` (command)         | Re-runs the same entry, reusing its request id. No-op outside `error`.    |
| `ensure` / `fetch` / `prefetch`   | Retry an entry sitting in `error` before awaiting it — in both `prefetch` modes. |
| `command.execute(args)` again     | A **new** entry and a **new** request id — a different logical operation. |

Automatic retry policy belongs inside `queryFn`, where you also control backoff and which status codes are retryable. Doing it there keeps the request id stable, so the backend can still deduplicate.

---

## Cancellation

- A resource's `queryFn` receives an `AbortSignal`; forward it to `fetch`. The library aborts on args change, on the last unsubscribe, when retention collects the entry, and on `invalidate()` in the default `cancel` in-flight mode.
- A command's `queryFn` gets **no** signal — mutations are not cancelled.
- The `signal` passed to `ensure` / `fetch` detaches the **caller**, it does not abort a shared in-flight query. See [reading-outside-react.md](reading-outside-react.md).
- A synchronous `throw` from a non-async `queryFn` is handled like any other rejection: the entry is created and moves to `error` / `invalidate-error`.

---

## Pitfalls

- ❌ Typing `error` as your own error class without `mapError` — it is `unknown`.
- ❌ A `mapError` with no fallback branch — `CacheEntryRemovedError` and anything unexpected will violate the declared `TError`.
- ❌ Expecting a `catch` around `ensure` to always receive `TError` — that channel also yields raw removal and abort reasons.
- ❌ Waiting for a built-in retry/backoff to kick in — `invalidateOn` re-runs on focus / reconnect / interval, not on failure.
- ✅ Handle an invalidation failure by showing stale data plus an inline retry, not a full error state.
- ✅ Put transport-level retry, auth refresh and status-code mapping in `queryFn` or in a shared fetcher wrapper.
- ✅ Keep `mapError` total and side-effect free; use `onQueryError` for reporting.
