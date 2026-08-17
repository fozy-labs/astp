# Writing mutations — `createCommand`

Declaring a command, running it, and reading its outcome.

**Contents:** [Declaring](#declaring) · [Request id](#the-second-queryfn-argument-is-a-request-id-not-an-abortsignal) · [Running it](#running-it-two-different-contracts) · [Cache keys](#cache-keys-and-shared-state) · [Command state](#command-state) · [`createAgent`](#createagentkey--commands-outside-react) · [`pack`](#packargs-key)

---

## Declaring

```ts
@injectable("SCOPED")
export class OrderApi {
  createOrder = api.createCommand({
    key: "createOrder",
    queryFn: (dto: CreateOrderDto, requestId) =>
      postOrder(dto, { headers: { "Idempotency-Key": requestId } }),
  });
}
```

| Option                                 | Default               | Meaning                                                                  |
|----------------------------------------|-----------------------|--------------------------------------------------------------------------|
| `queryFn`                              | **required**          | `(args: TArgs, requestId: string) => Promise<TData>`                     |
| `key`                                  | —                     | Prefix for cache keys and devtools. Combined with the api's `keyPrefix`. |
| `links`                                | —                     | Cache wiring — `cache-and-invalidation.md`.                              |
| `retentionTime`                        | `0`                   | ms an entry survives with no subscribers. `false` = never evict.         |
| `generateRequestId`                    | `crypto.randomUUID()` | `(args) => string \| Promise<string>`, called once per cache entry.      |
| `onCacheEntryAdded` / `onQueryStarted` | —                     | Lifecycle hooks — `lifecycle-hooks.md`.                                  |

There is **no** `sync` option, because commands never participate in cross-tab sync.

---

## The second `queryFn` argument is a request id, not an `AbortSignal`

|           | Resource (read)                                      | Command (write)                               |
|-----------|------------------------------------------------------|-----------------------------------------------|
| Signature | `(args, abortSignal: AbortSignal) => Promise<TData>` | `(args, requestId: string) => Promise<TData>` |
| Purpose   | cancel a superseded request                          | idempotency token for safe retries            |

The request id is minted **once per cache entry** and reused by every `retry()` of that entry, so a failed-then-retried mutation carries the same token to the backend. A fresh run creates a new entry and therefore a new id — it is a different logical operation. Forward it as `Idempotency-Key` (or whatever your backend expects); a mutation is not safe to retry blindly without it.

Override the generator when the token must come from business data or from the server:

```ts
payOrder = api.createCommand({
  generateRequestId: (args: PayDto) => `pay:${args.orderId}`, // sync or Promise<string>
  queryFn: (args, requestId) => postPayment(args, requestId),
});
```

Request id ≠ cache key: the cache key addresses state inside the library, the request id leaves for the backend.

---

## Running it: two different contracts

```ts
// 1. Hook / agent `trigger` — envelope. NEVER rejects.
const [trigger] = orderApi.createOrder.useCommand();
const result = await trigger(dto);
if (result.status === "error") show(result.error);
else navigate(result.data.id);

// 2. command.execute — raw promise. DOES reject.
const order = await orderApi.createOrder.execute(dto);       // throws on failure
```

`TTriggerPromise<TData, TError>` resolves to `{ status: "success", data }` or `{ status: "error", error }`. Both variants declare the opposite field as optional `undefined`, so `result.status === "error"` and `if (result.error)` narrow equally well.

Need throwing semantics from the hook? `await trigger(dto).unwrap()`.
Need the envelope from the imperative one? `await wrapTrigger(command.execute(dto))`.

Fire-and-forget from a hook needs no defensive `.catch()` — `void trigger(dto)` cannot produce an unhandled rejection.

---

## Cache keys and shared state

Every run without an explicit key mints a fresh key (`execute`: timestamp plus a counter; agent/hook `trigger`: `crypto.randomUUID()`), so each call gets its own entry and its own state. Pass the same key to make several consumers observe one mutation:

```ts
await orderApi.createOrder.execute(dto, "checkout");                  // imperative
const [trigger, state] = orderApi.createOrder.useCommand("checkout"); // hook binds at hook level
const agent = orderApi.createOrder.createAgent("checkout");           // agent binds at construction
agent.setKey("checkout-retry");                                       // or later
```

Re-running an existing key **completes the previous entry first**. If that mutation was still in flight, its promise rejects with `CacheEntryRemovedError` (passed through `mapError`) — see `error-handling.md`.

---

## Command state

`useCommand` / `agent.state$` yield `TCommandAgentState`, a discriminated union on `status`:

| `status`  | `data`             | `error`            | `isLoading` | `isSuccess` | `isError` |
|-----------|--------------------|--------------------|-------------|-------------|-----------|
| `idle`    | `null`             | `null`             | —           | —           | —         |
| `pending` | `TData \| null`¹   | `TError \| null`¹  | ✅           | —           | —         |
| `success` | `TData`            | `null`             | —           | ✅           | —         |
| `error`   | `null`             | `TError`           | —           | —           | ✅         |

¹ Normally `null`; they only carry stale values when a manually refreshed command entry is defensively remapped to `pending`.

Every variant also carries `retry()`.

```tsx
const [pay, { isLoading, isError, error, retry }] = orderApi.payOrder.useCommand();

if (isError) return <Failed error={error} onRetry={retry} />;
return <Button disabled={isLoading} onPress={() => pay({ orderId })}>Pay</Button>;
```

`retry()` re-runs the tracked entry — no new entry, same request id. It is a no-op outside `error`. A second run (`execute` / hook `trigger`) instead creates a new entry with a new id.

---

## `createAgent(key?)` — commands outside React

```ts
const agent = orderApi.createOrder.createAgent("checkout");
const result = await agent.trigger(dto);        // envelope, same as the hook
agent.state$();                                  // TCommandAgentState
agent.retry();
```

The argument is a **string key**, not an options object. There is no SWR and no `SKIP` on command agents — mutations only run when you ask.

---

## `pack(args, key?)`

An inert `{ kind: "command", command, args, key }` descriptor that runs nothing. Together with `TPackedResource` it forms `TPacked`, discriminated on `kind`, so one dispatcher can accept reads and writes:

```ts
function run(packed: TPacked<unknown, unknown>) {
  if (packed.kind === "resource") void packed.resource.prefetch(packed.args);
  else void packed.command.execute(packed.args, packed.key).catch(() => {}); // execute rejects
}
```

---

## Pitfalls

- ❌ Treating the second `queryFn` argument as an `AbortSignal` — commands never receive one.
- ❌ `try/catch` around hook or agent `trigger` — dead code; the envelope never rejects.
- ❌ Leaving `command.execute(...)` unhandled at a fire-and-forget call site — unlike the hook trigger, it rejects.
- ❌ Forgetting `.unwrap()` and then reading `result.id` — `result` is the envelope, not the data.
- ❌ `createAgent({ key })` — the parameter is a bare string.
- ❌ `sync: true` on a command expecting cross-tab propagation — commands are not synced.
- ✅ Forward `requestId` to the backend for anything non-idempotent; otherwise `retry()` can double-charge.
- ✅ Use an explicit key when two places must see one mutation; leave it out for independent calls.
- ✅ `retentionTime` defaults to `0` for commands — a result you want to read later needs an explicit value.
