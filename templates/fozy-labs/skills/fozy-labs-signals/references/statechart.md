# Statecharts

State machines in the **XState v5 config format** (a strict subset, `xstate` is not a dependency), executed by an
rx-toolkit runtime on top of signals: nested, parallel, final and history states, `entry` / `exit`, `always`, `after`,
`onDone`, guards and actions. The machine snapshot is an ordinary signal.

Authoring a machine as Mermaid and rendering a live diagram is the `statechart-craft` skill.

---

## Definition vs instance

| | `createMachine()` → `MachineDefinition` | `MachineSignal.state()` → instance |
|---|---|---|
| Holds | pure config data + implementation table | current state, event queue, timers |
| Created | once; validates the config | any number per definition |
| Gives | type inference anchor, `provide()`, `toMermaid()` | the snapshot signal, `send()`, lifecycle |

```ts
import { assign, unstable_createMachine as createMachine, unstable_MachineSignal as MachineSignal } from "@fozy-labs/rx-toolkit";

export const trafficLight = createMachine(
  {
    id: "trafficLight",
    initial: "green",
    context: { ready: false, cycles: 0 },
    types: {} as { context: LightContext; events: LightEvent }, // type inference only, ignored at runtime
    states: {
      green: { after: { 3000: "yellow" } },
      yellow: { on: { TIMER: { target: "red", guard: "isReady", actions: "warn" } } },
      red: { on: { TIMER: { target: "green", actions: assign({ cycles: ({ context }) => context.cycles + 1 }) } } },
    },
    on: { SET_READY: { actions: assign({ ready: ({ event }) => event.ready }) } },
  },
  {
    actions: { warn: ({ context }) => console.warn(`red after ${context.cycles} cycles`) },
    guards: { isReady: ({ context }) => context.ready },
  },
);

const light$ = MachineSignal.state(trafficLight, { key: "trafficLight" }); // starts immediately (autoStart: true)

light$().value;                    // "green" — tracked read
light$.peek().context.cycles;      // untracked read
light$.send({ type: "TIMER" });    // synchronous: one macrostep, one snapshot publication
light$.matches("green");           // partial match by parent, "a.b" path or nested object
light$.can({ type: "TIMER" });     // would any transition fire on the current snapshot?
light$.dispose();                  // clear timers, complete the signal, drop devtools
```

Naming actions and guards instead of inlining them keeps the config serializable.

---

## Config format

State-node keys: `id`, `type` (`atomic | compound | parallel | final | history`, inferred), `initial` (string only),
`states`, `on`, `always`, `after`, `entry` / `exit`, `onDone` (compound/parallel, forbidden on the root), `history`
(`"shallow" | "deep"`), `target` (history default — must resolve to a normal state), `output` (final and root),
`tags`, `description`, `meta`. The root additionally takes `context`, `types`, `output`, `source` and must be
`compound` or `parallel`.

- ⚠️ A `context` **object is shared by every instance** of the definition — pass a factory (`context: () => ({...})`)
  for per-instance objects.
- A transition value is a target string, an object `{ target?, actions?, guard?, reenter?, description?, meta? }`, or
  an array of such objects — **the first candidate whose guard passes wins**. No `target` = targetless: actions run,
  no `exit` / `entry`. `reenter: true` exits and re-enters the source even when the target is its descendant.
- Targets: `"sibling"`, `"sibling.child"`, `".child"` (relative to self), `"#id"`, `"#id.child.path"`. An array target
  enters several regions of one `parallel` state at once.
- `on` keys: exact type, prefix wildcard (`"user.*"`), catch-all `"*"`.
- `onDone` fires as `xstate.done.state.<id>` carrying the final child's `output`. A **top-level** final state finishes
  the machine: `snapshot.status: "done"`, `snapshot.output` from the root `output`, timers cleared, further events
  ignored.

**Everything else is rejected** by `createMachine()` with a `MachineConfigError` whose `path` / `detail` name the
offending key: the actor model (`invoke`, `spawn`, `actors`, …), `emit`, `enqueueActions`, XState v4 keys (`cond`,
`internal`, `in`, …), builtin creators imported from the `xstate` package (brand mismatch — they would be silent
no-ops), reserved `on` keys (`xstate.init`, `xstate.stop`, actor-system events), unknown keys anywhere. Names missing
from the implementation table are checked **lazily** — at instance creation — so `definition.provide()` can fill them
in after `createMachine()`.

Typing: `createMachine<TContext, TEvent, TOutput>` infers from `context` / `types`. Inside `on.<EVENT>` the `event`
narrows to that union member; in `entry` / `exit` / `always` / `after` it is the whole union.

---

## Implementations

Second argument of `createMachine` (and of `provide()`): `{ actions?, guards?, delays? }`. Every implementation gets
`args = { context, event }` and `params` from a `{ type, params }` reference in the config (annotate the `params`
parameter explicitly — it is not inferred). Config forms: a name from the table, `{ type, params }` (params may be a
function of args), an inline function, or a builtin. Inline functions show up in diagrams and devtools only by
function name — prefer table names for machines you intend to look at.

| Builtin action | Does |
|---|---|
| `assign(partial \| fn)` | shallow-merge into `context`; object-form fields are values or `({ context, event }) => value` |
| `mutate(recipe)` | update `context` through an Immer draft — mutate in place, untouched parts are structurally shared |
| `raise(event, { delay?, id? }?)` | send an event to the machine itself: no `delay` — into the current macrostep's internal queue; with `delay` — on a timer |
| `cancel(id)` | cancel a delayed `raise` by id (or an `after` timer by its event type) |
| `log(value?, label?)` | write to the instance `logger` (default `console.log`) |

| Builtin guard | Does |
|---|---|
| `and([...])` / `or([...])` / `not(g)` | combinators over any guard forms |
| `stateIn(stateValue)` | machine is in a state (`"#id"` checks node membership, anything else — `matches()` semantics) |

Builtins are declarative branded objects — never call them directly. Named guards must not reference each other in a
cycle (checked at instance creation). `after` keys and `raise` delays are milliseconds or a name from `delays`
(number or `(args, params) => number`).

Execution order in a macrostep: `exit` of the source states → transition actions → `entry` of the targets. `assign` /
`mutate` apply in that same order and later actions see the updated `context`. Custom actions run synchronously
**before** the new snapshot is published — `peek()` inside an action still returns the previous snapshot.

---

## MachineSignal.state

`MachineSignal.state(definition, options?)` — `options` is a `StatechartOptions` object or just a devtools key string.

| Option | Default | Meaning |
|---|---|---|
| `key` | `"Statechart/<machine id>"` | Redux DevTools key (concurrent unkeyed instances get `#2`, `#3`, …) |
| `isDisabled` | — | opt this instance out of Redux DevTools |
| `inspector` | global `MACHINE_DEVTOOLS` | external machine inspector; `null` disables |
| `autoStart` | `true` | `start()` in the constructor; `false` still computes the initial snapshot, effects wait for `start()` |
| `clock` | `globalThis` | `{ setTimeout, clearTimeout }` — swap in tests |
| `onError` | — | runtime error sink; without it the error throws from `send()` / `start()` |
| `logger` | `console.log` | sink of the `log()` builtin |
| `maxMicrosteps` | `10000` | guard against infinite `always` / `raise` loops |

Members: `()` / `get()` (tracked snapshot), `peek()`, `obs` (one emission per macrostep, only on change),
`definition`, `send(event)`, `matches(stateValue)`, `can(event)`, `start()`, `stop()`, `dispose()` /
`[Symbol.dispose]`, and `status` — the **engine** status (`idle | running | stopped | disposed`). Do not confuse it
with `light$().status` — the **machine** status:

```ts
type MachineSnapshot<TContext, TOutput> = {
  status: "active" | "done" | "error" | "stopped";
  value: StateValue;            // "green" | { playing: "fast" } | { form: "step1", theme: "dark" }
  context: TContext;
  tags: readonly string[];
  output: TOutput | undefined;  // only when status is "done"
  error: unknown;               // only when status is "error"
};
```

The snapshot is immutable and only replaced when a macrostep changed something — otherwise the reference is stable
(`Object.is`) and derived signals do not recompute. The type is a discriminated union on `status`.

- `send()` before `start()` queues; after stop / done / error / dispose it is ignored. A reentrant `send()` (from an
  action, a sync `obs` subscriber or an effect reacting to the snapshot) queues and runs after the current macrostep.
- `stop()` publishes `status: "stopped"`, clears timers and the queue; `exit` actions do **not** run. `start()` after
  stop / done / error reinitializes from scratch; after `dispose()` it throws.
- `after` schedules `xstate.after.<delay>.<node id>` through `clock.setTimeout`; leaving the state cancels the timer.
  A repeated `raise` with the same `id` while the timer is alive **replaces** it.

`Statechart` (class form) is the same engine as a field-holdable object: snapshot lives in `engine.state`
(a `ReadonlySignal`), plus `getSnapshot()` and `sessionId` — same relation as `Signal.state` / `State`.

---

## Errors and timers

An error thrown by an action, guard, delay, `output` mapper or the microstep limit: a snapshot with
`status: "error"` and the `error` field is published on top of the last good `value` / `context`, timers are cleared,
the engine stops, further events are ignored. With `options.onError` the error goes there after the batch; without it
it throws from `send()` / `start()` (or from the constructor under `autoStart`; a timer-delivered error surfaces as an
unhandled timer-callback exception). `start()` then reinitializes from scratch — restart from `onError` or from an
effect watching `status: "error"`.

---

## With signals and React

- ⚠️ `matches()` / `can()` read the snapshot **without** registering a dependency. Inside a `Signal.compute`, read the
  signal explicitly (`light$()`) or derive from its value — otherwise the compute never recomputes.
- There is no dedicated React hook; `useSignal(light$)` works because `MachineStateSignal` implements `obs` / `peek`.
- A component-lifetime instance: `useState(() => MachineSignal.state(def))`. The callable signal is a function, so it
  must go through `useState` / `setState` **only as a thunk** — `setMachine$(MachineSignal.state(def))` would be
  treated as an updater and store a snapshot instead of the signal (symptom: `signal$.peek is not a function`).

---

## Devtools

The snapshot lives in a `State` with base key `Statechart`; every macrostep is published with the event type as the
action name (`UPDATE: TIMER`, `UPDATE: xstate.after.3000.trafficLight.green`). `dispose()` removes the entry.

An external machine inspector plugs in through `DefaultOptions.update({ MACHINE_DEVTOOLS: statelyInspector() })` — a
built-in zero-dependency adapter for Stately Inspector (opens `https://stately.ai/inspect`; options: `iframe`,
`autoStart`, `filter`, `serialize`, custom `adapter` transport). The protocol is **one-way** — the inspector cannot
send events back. Per-instance override: `inspector: statelyInspector({...})` or `inspector: null`. Dev-only and
browser-only, like Redux DevTools; without `window` the adapter is a silent no-op.

A live **interactive** diagram (send events by clicking transitions) is `StatechartViz` from
`@fozy-labs/statechart-viz`; `definition.toMermaid()` exports the diagram in the converter dialect and
`definition.toXStateSource()` prints an `xstate`-importable module — all covered by the `statechart-craft` skill.

---

## Testing

- `definition.provide({ actions?, guards?, delays? })` returns a **new** definition with merged tables (new values
  win) — stub side effects and guards per test.
- `vi.useFakeTimers()` works even when enabled after import (the default clock resolves `globalThis.setTimeout` at
  call time), or pass a manual `clock` and flush it yourself.
- `isDisabled: true, inspector: null` decouple tests from global devtools options.
- `autoStart: false` lets you assert the initial snapshot and `can()` before any effects run, queue events, then
  `start()`.
- `onError` turns action errors into assertable calls instead of throws from `send()`.
- `MachineConfigError` exposes `path` and `detail` for precise validation tests.

```ts
it("switches to red only when ready", () => {
  const warn = vi.fn();
  const light$ = MachineSignal.state(
    trafficLight.provide({ actions: { warn }, guards: { isReady: () => true } }),
    { isDisabled: true, inspector: null },
  );
  light$.send({ type: "TIMER" });
  expect(light$.peek().value).toBe("green"); // no TIMER transition in green
  light$.dispose();
});
```

---

## Pitfalls

- ❌ A `context` object literal on a multi-instance definition — it is shared; use a factory.
- ❌ `matches()` / `can()` inside a `Signal.compute` without reading the signal — nothing is tracked.
- ❌ Reading `light$.status` for the machine state — that is the engine; the machine status is `light$().status`.
- ❌ Calling builtin creators directly, or importing them from `xstate` — the foreign brand is rejected by `createMachine`.
- ❌ Handing a machine signal to `setState` without a thunk — React calls it as an updater.
- ✅ String names in the config, implementations in the table — the config stays serializable and diagrammable.
- ✅ `dispose()` an instance you created when its owner goes away — timers and the devtools entry go with it.
