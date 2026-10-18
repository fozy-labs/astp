# Suite Speed, Purity, the Merge Gate and Service Boundaries

> Loaded when: Optimizing suite or compile speed, organizing test binaries, setting up NRSR gates, ratchets, benchmarks-as-tests, or testing I/O and service boundaries.

## Contents

- [Purity and suite speed](#purity-and-suite-speed)
- [Test binary and dependency layout](#test-binary-and-dependency-layout)
- [The merge gate, flakes and ratchets](#the-merge-gate-flakes-and-ratchets)
- [Level-triggered fuzzing and benchmarks as tests](#level-triggered-fuzzing-and-benchmarks-as-tests)
- [Service and I/O boundaries](#service-and-io-boundaries)

## Purity and suite speed

- **Treat suite runtime as a first-class metric, priced per thousand tests.** Slowness comes from generalized I/O (disk, network, processes, threads, wall-clock sleeps), not from the volume of CPU code executed.
- **Push tests down the impurity ladder while leaving extent natural.**
  1. **Sans-I/O:** let the caller perform I/O and pass data into pure compute functions.
  2. **Clockless time:** pass the current instant (`now`) or a periodic `tick()` call as plain data rather than injecting a clock interface or sleeping ([fork F8](limits.md#forks)).
  3. **Explicit randomness:** pass the PRNG or seed into the function rather than reading global entropy.
  4. **Make rare failure paths common:** in test and fuzz configurations, lower buffer sizes, thresholds and timeouts so cold error/retry/compaction paths execute on every run.
- **When I/O cannot be isolated, embrace real-process tests and gate them.** Drive the built binary as a separate child process with zero shared code. Never use wall-clock `sleep` to wait for async or background work: expose an explicit barrier (`sync()`) or await child-process completion.
- **Split the fast default run from the slow suite early.** Skip slow or heavy tests by default during local runs (failing loudly if skipped on CI, or running them when an opt-in environment variable is set) so the local edit-test loop stays in seconds while CI runs everything ([fork F4](limits.md#forks), [fork F13](limits.md#forks)). Print per-test timings by default so slow creep is visible.
- **Pin known wrong behaviour with a `fixme` test instead of ignoring it.** Rather than disabling a failing test with `#[ignore]`, assert the current broken output in a test marked `fixme` so the code path stays exercised and the fix is noticed when it changes ([fork F13](limits.md#forks)).
- **Never test against a hand-rolled approximation of a real external component.** Do not mock your own code, and do not write a partial fake of a complex real dependency unless it is a co-designed domain simulator ([fork F5](limits.md#forks), [fork F8](limits.md#forks)).

## Test binary and dependency layout

- **Consolidate integration tests into a single binary.** In compiled languages like Rust (`tests/*.rs`), each top-level file links a separate executable, making link time quadratic (`artifacts × libraries`). Put all integration tests as submodules of a single `tests/it/main.rs` crate.
- **Keep heavy dependencies (such as the full standard library) out of compiler/analyzer fixtures.** Provide a single minimal `minicore` stub file with feature flags per test section so tests parse only the declarations they use.
- **Keep the cursor-to-test loop to one shortcut.** Structure tests so a developer or agent can run the single test under the cursor (and re-run the last test command) in milliseconds; passing tests stay silent.

## The merge gate, flakes and ratchets

- **Enforce the not rocket science rule (NRSR):** `main` advances only to merge commits on which the full automated check suite has already passed (via a merge queue).
- **Run every repository check from the standard test command.** Formatting, project-specific `tidy` lints, generated-code freshness, architecture-invariant checks (`libs/` not importing `crates/`) and smoke runs of fuzzers and benchmarks belong inside `cargo test` / `zig build test`, so one command verifies a commit and side binaries never bitrot.
- **Keep `main` green by tracking flakes as first-class state.** Once NRSR guarantees that every merge commit passed, any failure on `main` is a flake by definition. Maintain an easily accessible list of recent `main` failures and fix or remove flaky checks immediately ([fork F16](limits.md#forks)).
- **Install a ratchet before fixing a class of violations.** When introducing a new codebase-wide rule or `tidy` check that existing code violates, commit the check first with an explicit allowlist ("naughty list") of current violations that can only shrink, then burn the list down incrementally.
- **Use CI only for the OS/toolchain matrix and the merge gate.** Keep all test logic in the repository's own build/test command so local runs and CI execute the exact same code.

## Level-triggered fuzzing and benchmarks as tests

- **Tier fuzzing budgets by purpose:**
  1. **Local / PR smoke:** run every fuzzer for a short fixed budget (or a single seed) inside the normal test suite so fuzzer code never rots ([fork F3](limits.md#forks)).
  2. **Continuous fleet (level-triggered):** long fuzzing and deterministic simulation cannot fit inside a PR gate. Run them continuously in the background against commits, reporting state as a table of `(commit, fuzzer, seed, status)` rather than edge-triggered chat alerts. Store failing seeds for a bounded window of recent commits ([fork F19](limits.md#forks)), and let releases bake under fuzzing over the weekend before cutting a release.
- **Every benchmark is also a test.** Run each benchmark on a tiny workload inside the normal test suite and assert the hash or value of its output so benchmarks neither bitrot nor compute the wrong answer.
- **Size micro-benchmarks for a human-perceptible run (~300 ms):** shorter than ~10 ms skews on startup noise; longer than ~1 s slows interactive iteration ([fork F15](limits.md#forks)). Track macro metrics (compile time, test time, binary size) per commit on `main` to spot step-function regressions over time; verify cluster-level performance numbers on a real cluster, not only in the simulator ([fork F6](limits.md#forks)).

## Service and I/O boundaries

Matklad's corpus stops at the external system's edge ([limits](limits.md#boundary-and-gaps)). When testing HTTP handlers, database-backed services, API clients or queue consumers, separate what this model decides from what you must decide outside it:

| Question on service / I/O code | Model's ruling |
|---|---|
| Where to bind feature tests | At the outermost boundary (HTTP request/response or CLI process invocation), through a single `check` helper. |
| How to assert responses and side effects | Render the response and relevant state as a text snapshot with volatile fields (timestamps, UUIDs) masked via `snap:ignore`. |
| How to handle time and expiration | Pass `now` in as a parameter or advance a virtual `tick`; never `sleep` in a test. |
| How to wait for async / background work | Expose an explicit `sync()` / join barrier that awaits in-flight work; fire-and-forget APIs are untestable. |
| What to mock | Mock only external I/O boundaries, never your own internal modules; keep live external calls in an opt-in slow suite. |
| Real vs fake Postgres / SQL & migrations / DB races between requests | **Gap — model silent.** State your choice (e.g. running against a real local database vs an in-memory fake) as your own call. |
| External vendor API drift / request applied whose response was lost | **Gap — model silent.** Name the idempotency and contract-verification risk explicitly. |
| Message-broker ack order, redelivery and poison messages | **Gap — model silent.** Do not present a queue-testing recipe as derived from this skill. |
