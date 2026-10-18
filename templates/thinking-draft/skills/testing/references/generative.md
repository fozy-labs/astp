# Generative Testing, Oracles and Deterministic Simulation

> Loaded when: Designing or reviewing fuzzers, property tests, PRNG generators, minimization, assertions/oracles, or deterministic simulation.

## Contents

- [Inputs as finite entropy](#inputs-as-finite-entropy)
- [Oracles and assertions](#oracles-and-assertions)
- [Minimization and reproduction](#minimization-and-reproduction)
- [Deterministic simulation](#deterministic-simulation)
- [Debugging and escaped bugs](#debugging-and-escaped-bugs)

## Inputs as finite entropy

- **Reach for a generative test first; fall back to a snapshot when you cannot fuzz.** Once tests are data-driven (`check(input)`), feed them generated inputs and seed the generator with your handwritten examples.
- **Unify fuzzing and property testing as a finite PRNG byte stream.** A generator is a deterministic function of a finite slice of random bytes drawn from a PRNG; coverage guidance is optional. When the byte stream runs out of entropy mid-generation, abort the run and treat it as a pass ("innocent until proven guilty").
- **Make the seed the sole input.** Encode the entropy length and PRNG seed into a single `u64` (32-bit length + 32-bit seed) and print the exact reproduction command (`seed`, commit, target) before running, so any failure replays deterministically.
- **Use a simple, self-contained PRNG with closed intervals.** A small, deterministic PRNG without external dependencies suffices; expose range helpers with inclusive bounds (`int_inclusive(min, max)`) so boundary values are natural to express.
- **When the space of small inputs is enumerable, test all of it.** Bugs in combinatorial logic (parsers, trees, concurrent interleavings, graph routes) usually trigger on small inputs (such as up to 6–7 elements). Replace the random byte source with a **rigged PRNG** that enumerates every decision path in lexicographic order: you get 100% coverage of the small space, and the first failure found is automatically the smallest.
- **Shape random distributions toward boundaries and collisions:**
  - Bias sizes toward small, tricky values while keeping a tail of purely random inputs.
  - Fuzz both the **positive space** (valid inputs that must round-trip) and the **negative space** (corrupted inputs that must be rejected), aiming at the boundary between them: generate a valid input, then flip one bit or field.
  - Draw keys and identifiers from a deliberately small range so collisions and repeats happen often.
  - **Swarm testing:** randomize the operation weights and configuration per seed (enabling a random subset of operations and disabling others for the whole run), because a uniform mix of operations rarely drives a data structure into extreme states (such as a completely full or completely empty queue).
  - Verify that the generator actually reaches interesting states (assert minimum counts of valid and invalid cases hit across a batch, or place coverage marks on tricky branches).
- **Fuzz a component alone against its whole contract.** Alongside system-level tests, write a standalone **unit-fuzzer** that calls a component's public methods in random order with random arguments against its full interface contract ([fork F28](limits.md#forks)).

## Oracles and assertions

- **Write assertions in production code so "does not crash" becomes a deep oracle.** Generative inputs without an oracle still catch bugs if the code under test asserts its own invariants densely.
  - **Pair assertions** across boundaries: assert the property both at the caller before passing data and inside the callee before using it.
  - **Assert implications positively** as `if (a) assert(b)` rather than negated compound booleans, matching how the invariant is thought about.
  - **In long-running processes that must stay available (such as an IDE server), use recoverable assertions (`never!`)** that log or fail in tests while taking a safe fallback branch in production.
- **Co-design the system and its test harness to have an oracle:**
  - **Exact model comparison:** apply the same generated sequence of operations to the optimized data structure and to a trivial reference implementation (such as an in-memory map or array) and assert that their outputs and states match after every step.
  - **Two independent computations:** compute a tricky quantity two different ways (such as incremental tracking vs a full scan, or two algorithms) and assert they agree — in production as well as in tests.
  - **Keep a couple of magic smoke checks** (known fixed input/output pairs) next to the generative test to catch trivial regressions where both paths break together.

## Minimization and reproduction

- **A copy-pasteable seed and a one-line repro command beat a complex shrinking framework.** Because the generator is driven by a `u64` seed, printing the seed gives immediate, zero-friction replay ([fork F7](limits.md#forks)).
- **Minimize by entropy length.** Since a shorter byte stream forces the generator to make fewer and smaller choices, shrink a failing case by retrying with shorter slices of fresh entropy in a loop, keeping any shorter seed that still fails.
- **Coarse-grained minimization across runs:** when several seeds fail in a campaign, prefer the seed with the shortest wall-clock or tick runtime — seeds that fail faster are simpler to debug ([fork F26](limits.md#forks)).
- **Before debugging a failure, simplify by deleting code.** Once you have a deterministic failing seed, delete or stub out unrelated features and code paths in the working tree while re-running the seed until the failure is as small as possible.
- **Keep diagnostic output under one screen.** Debugging tools and trace dumps should fit on a single screen (or a bounded window around the crash), because humans cannot read gigabyte logs.

## Deterministic simulation

- **Externalize all I/O, time and scheduling so a whole cluster runs deterministically in one thread from one seed.** Pass storage, network and clocks in as explicit interfaces; drive the simulation loop by stepping virtual time and delivering messages in an order chosen from the seed's PRNG.
- **Run both a whole-system simulator and targeted subsystem fuzzers.** Use the whole-system simulator to explore emergent interactions (and track performance regressions), not to assert intricate unit-level details; pair it with focused fuzzers for individual data structures and components whose contracts are too weak or OS-coupled for the simulator.
- **Split simulation into a safety mode and a liveness mode:**
  - **Safety mode:** inject extreme, unbounded network partitions, crashes and storage faults; assert that safety invariants never break.
  - **Liveness mode:** after a chaotic phase, heal the network and storage for a core quorum and assert that all replicas converge and process requests within a bounded tick count. Because liveness bugs surface only as timeouts, triage them by shrinking the run, confirming deterministic replay, and simplifying.
- **Simulate thread interleavings with managed threads.** To test lock-free or concurrent data structures without flaky `sleep` or thread-hammer loops, wrap thread operations so only one managed thread runs at a time, chosen at each step from the PRNG seed, and exhaustively enumerate small interleavings.

## Debugging and escaped bugs

- **Read the code against your mental model before leaning on the fuzzer.** A fuzzer proves only the presence of bugs, not their absence, and is a tool for finding holes in your understanding. When hunting bugs or reviewing a change, read the entire subsystem (not just the diff) and compare what is in git against a precise mental model of the invariants.
- **Think in invariants, not in failing examples.** When code fails, resist fumbling with `+ 1` / `- 1` until the example passes; state the loop or data invariant that must hold and derive the fix from it ([fork F18](limits.md#forks)).
- **When a bug escapes your fuzzers, treat it as a bug in the fuzzer first.** Before landing the point fix and its regression test, change the fuzzer's generator, weights or oracle so it finds that bug (and its neighbours) automatically.
- **Stack verification layers.** No single technique is ever thorough enough: layer static types, code reading, assertions, snapshot tests, subsystem fuzzers, deterministic simulation, and — where automated tests cannot reach — release trains and a manual QA checklist.
