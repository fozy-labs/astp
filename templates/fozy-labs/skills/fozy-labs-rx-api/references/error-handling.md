# Errors, retries and cancellation

Typing `error`, where a failure surfaces, what the library retries (almost nothing) and what it aborts.

---

## By default `error` is `unknown`

Every state's `error` is `unknown` until the api declares `mapError`. That option normalizes every raw failure once and its return type becomes the api's `TError`, propagated to every resource and command it creates:

```ts
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

- Called **exactly once per failure**, at `machine.fail()`, so agent state, the Suspense throw, `ensure` / `fetch` rejections and the mutation envelope all see the same instance.
- A throwing `mapError` is logged to `console.error` and the raw error goes into the state — the machine does not break.
- Without `mapError`, behaviour is unchanged and `TError` stays `unknown`.

---

## Channels that stay raw

`mapError` does not cover everything. These carry the original value:

| Channel                                                | Why                                                       |
|--------------------------------------------------------|-----------------------------------------------------------|
| Aborted runs                                           | Flow control, not a failure — never reaches the machine.  |
| `$queryFulfilled` in `onQueryStarted`                  | Deliberately observes the unhandled outcome.              |
| `ensure` / `fetch` rejecting with `CacheEntryRemovedError` | These channels are not typed as `TError`.              |

So a `catch` around `ensure` must handle `TError`, a raw `CacheEntryRemovedError`, and the abort reason.

---

## `CacheEntryRemovedError`

Exported from the package. Thrown when an entry is removed before an async operation settles:

- a command re-triggered with the **same key** while the first run is in flight;
- `api.resetAll()` during a mutation;
- retention GC dropping an entry that `ensure` / `fetch` was waiting on.

On the command path it passes through `mapError` (so the typed envelope holds), so give your mapper an explicit branch or a general fallback for unknown shapes.

---

## Where a failure shows up

| Path                                | Surface                                                          |
|-------------------------------------|------------------------------------------------------------------|
| `useResource`                       | `status: "error"` / `"refresh-error"`, `isError`, `error`         |
| `useSuspenseResource`               | Initial error thrown to the nearest Error Boundary; a refresh error stays as `isRefreshError` with stale data |
| `resource.ensure/fetch`             | Promise rejection                                                 |
| `resource.trigger` / `prefetch` / `refresh` | Nothing — swallowed; read the state instead                 |
| `useCommand` / `agent.trigger`      | `{ status: "error", error }` envelope **and** `state.isError`      |
| `command.trigger`                   | Promise rejection                                                  |

`error` and `refresh-error` are different: the first has no data, the second keeps the last good response in `data`. Rendering an error screen on `refresh-error` throws away data the user could still use.

---

## Retrying

There is **no automatic retry or backoff.** Retries are explicit:

| Call                          | Semantics                                                                 |
|-------------------------------|---------------------------------------------------------------------------|
| `state.retry()` (resource)    | Re-runs the failed query. Only meaningful from `error`.                   |
| `state.retry()` (command)     | Re-runs the same entry, reusing its request id. No-op outside `error`.    |
| `state.refresh()`             | Background SWR refresh; keeps stale data on screen.                        |
| `command.trigger(args)` again | A **new** entry and a **new** request id — a different logical operation.  |

Automatic retry policy belongs inside `queryFn`, where you also control backoff and which status codes are retryable. Doing it there keeps the request id stable, so the backend can still deduplicate.

---

## Cancellation

- A resource's `queryFn` receives an `AbortSignal`; forward it to `fetch`. The library aborts on args change, on the last unsubscribe, and when retention collects the entry.
- A command's `queryFn` gets **no** signal — mutations are not cancelled.
- The `signal` passed to `ensure` / `fetch` detaches the **caller**, it does not abort a shared in-flight query. See `reading-outside-react.md`.
- A synchronous `throw` from a non-async `queryFn` is handled like any other rejection: the entry is created and moves to `error` / `refresh-error`.

---

## Pitfalls

- ❌ Typing `error` as your own error class without `mapError` — it is `unknown`.
- ❌ A `mapError` with no fallback branch — `CacheEntryRemovedError` and anything unexpected will violate the declared `TError`.
- ❌ Expecting a `catch` around `ensure` to always receive `TError` — that channel also yields raw removal and abort reasons.
- ❌ Waiting for a built-in retry/backoff to kick in.
- ✅ Handle `refresh-error` by showing stale data plus an inline retry, not a full error state.
- ✅ Put transport-level retry, auth refresh and status-code mapping in `queryFn` or in a shared fetcher wrapper.
- ✅ Keep `mapError` total and side-effect free; use `onQueryError` for reporting.
