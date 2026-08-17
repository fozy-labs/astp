# Migrations — Query

The last two releases that require code changes. Read this only when working in a codebase written against an older
version, or when an unfamiliar name shows up in existing code.

**Contents:** [0.10.x → 0.11.x](#010x--011x--execute--prefetch) · [0.9.x → 0.10.0](#09x--0100--the-trigger-envelope) · [Name lookup](#name-lookup)

---

## 0.10.x → 0.11.x — `execute` / `prefetch`

The release unifies the vocabulary for "start this query": `trigger` used to mean three different contracts, so it is
gone from both primitives.

| Level                          | Old (0.10.x)                           | Current                                 |
|--------------------------------|----------------------------------------|-----------------------------------------|
| `Command` (core)               | `trigger(args, key?)` → raw promise    | `execute(args, key?)` — same contract   |
| `CommandAgent` / `useCommand`  | `trigger(args)` → envelope             | unchanged                               |
| `Resource`                     | `trigger(args, doForce?)` → `void`     | `prefetch(args)` / `prefetch(args, { force: true })` |

Both old names still exist, marked `@deprecated`.

### `Command.trigger` → `Command.execute`

A pure rename — raw `Promise<TData>`, rejects, goes through `mapError`.

```ts
await createOrder.trigger(dto, "checkout");   // old
await createOrder.execute(dto, "checkout");   // current
```

The agent/hook `trigger` is a **different method** and is not deprecated; it still returns the non-rejecting envelope.

### `Resource.trigger` → `prefetch`

Not a pure rename. The shared part: the entry is created synchronously and the returned `Promise<void>` never rejects.
The differences bite in two places.

| Entry state       | `trigger(args)` | `trigger(args, true)`                    | `prefetch(args)`      | `prefetch(args, { force: true })` |
|-------------------|-----------------|------------------------------------------|-----------------------|-----------------------------------|
| absent            | creates + runs  | creates + runs                           | creates + runs, waits | creates + runs, waits             |
| holds data        | no-op           | `refresh()`                              | resolves at once      | `refresh()`, waits for fresh      |
| **`error`**       | **no-op**       | **no-op** + console warning              | **retries**           | **retries**                       |
| **`retentionTime`** | untouched     | untouched                                | **re-armed**          | **re-armed**                      |

1. **A failed entry is now retried.** Code that deliberately went quiet after an error — a periodic warm-up, say — will
   start repeating the request after a mechanical rename. Guard it:
   `if (!resource.getState(args).isError) void resource.prefetch(args);`
2. **`prefetch` holds a keepalive subscription for the duration of the call, cache hits included**, and releasing it
   restarts the `retentionTime` countdown. A polling loop calling `prefetch(args)` more often than `retentionTime`
   therefore pins the entry forever and — without `force` — never refetches, where `trigger` let it expire and
   re-created it about once per retention window. Use `{ force: true }`, or an interval longer than `retentionTime`.

### Also in this release

- `ensure` / `fetch` / `prefetch` lost their `@experimental` marker — the imperative read API is stable.
- `getEntry(args, true)` gained an overload typed `IQueryCacheEntry` without `| null`, mirroring `getEntry$`. Runtime
  behaviour is unchanged, including that it still does **not** retry an `error` entry.
- `getDevtoolsKey` was **removed** from the resource options. It was dead — nothing ever read it. Delete the option;
  entries are labelled `` `${resourceKey}:${entryKey}` `` with no override.

---

## 0.9.x → 0.10.0 — the `trigger` envelope

Agent- and hook-level `trigger` stopped rejecting. It resolves a `TTriggerResult`, discriminated on `status`:

```ts
type TTriggerResult<TData, TError> =
  | { status: "success"; data: TData; error?: undefined }
  | { status: "error"; data?: undefined; error: TError };
```

Three call sites change.

```ts
// try/catch became dead code
try { const data = await trigger(dto); } catch (e) { /* never runs */ }   // old
const result = await trigger(dto);                                        // current
if (result.status === "error") show(result.error); else use(result.data);

// throwing semantics, if you want them back
const data = await trigger(dto).unwrap();

// fire-and-forget no longer needs a defensive catch
void trigger(dto);
```

Type annotations mentioning the trigger change from `(args: TArgs) => Promise<TData>` to
`(args: TArgs) => TTriggerPromise<TData, TError>`.

The core `Command` method was untouched by this release — it kept raw-promise semantics under the name `trigger`, and
0.11 renamed it to `execute`. `wrapTrigger(promise)` was added here to put a raw promise into the envelope:

```ts
const result = await wrapTrigger(orderApi.createOrder.execute(dto));
```

---

## Name lookup

| Name in old code                   | Read it as                                  |
|------------------------------------|---------------------------------------------|
| `command.trigger(args, key?)`      | `command.execute(args, key?)`               |
| `resource.trigger(args)`           | `prefetch(args)` — but see the `error` row  |
| `resource.trigger(args, true)`     | `prefetch(args, { force: true })`           |
| `getDevtoolsKey`                   | removed, delete it                          |
| `await trigger(dto)` + `try/catch` | envelope check on `result.status`           |

---

## Pitfalls

- ❌ Renaming `resource.trigger` → `prefetch` mechanically in a polling loop — it stops refetching and pins the entry.
- ❌ Renaming `resource.trigger` → `prefetch` on a path that must stay quiet after a failure — it now retries.
- ❌ Assuming `command.trigger` and the hook's `trigger` are the same method; only the former was renamed.
- ✅ Write `execute` and `prefetch` in new code; the old names are kept only for compatibility.
- ✅ After migrating off `trigger`, check `retentionTime` anywhere a warm-up runs on a timer.
