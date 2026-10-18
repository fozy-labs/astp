# Glossary

> Loaded when: When a term from this skill or from matklad's corpus is used or met.

Each entry states matklad's operative sense and what follows from it. Use one term per concept; do not rotate synonyms. Origin tags: `coin.` = his coinage or naming; `re-spec.` = common word used in a narrower or wider sense; `borr.` = borrowed from the named source.

## Homonym traps

Check which sense is meant before acting on any occurrence of these words.

| Term | Sense in this model | What follows |
|---|---|---|
| **unit test** | Three distinct senses across his writing: (1) *the scam* (2021, 2024) — tests of internal code rather than features, pinning internal APIs; (2) *2020 `rust-analyzer`* — pure, `std`-less compiler snippet tests; (3) *2026* — a deterministic example-based regression test, contrasted with a randomized fuzzer. | Never write sense (1). Write sense (2) and sense (3). Replace the "unit vs integration" debate with **purity** and **extent**. |
| **integration test** | In Cargo, merely a test file placed under `tests/`; at TigerBeetle, a test binary that contains zero system code and drives the built binary as a separate child process. | In Cargo, put all integration tests in a single `tests/it/main.rs` crate so link cost stays `O(1)`. Judge tests by purity and extent, not by directory. |
| **fuzzer** | Any test driven by PRNG-generated data, with or without coverage guidance. Fuzzing, property-based testing and deterministic simulation are "just different names for the same thing". | Techniques from one (seed replay, entropy-length shrinking, swarm weights) apply directly to the others. |
| **snapshot / expect test** | A "self-aware string literal" passed as a value to `check` that rewrites itself in source on mismatch. | Treat a snapshot as an ordinary value argument to `check`, not as a separate assertion macro or external tool. |
| **simulation** | A deterministic whole-system run where the `u64` seed is the only input and storage/network are mocked at the domain level (or VM level for legacy apps), not raw OS syscalls. | Place the simulation seam where domain faults (dropped/reordered messages, misdirected writes) can be injected cleanly. |
| **boundary** | Owned by `software-architecture`. In `testing`: the stable surface where tests attach (public API for a library; what a human sees on screen for an application). | Concentrate tests here so internal refactors never touch the test suite. |
| **"real tests"** | His ironic label for multi-process / cluster tests contrasted with simulation. | Not a badge of superiority; simulation carries the bulk of correctness testing where available, while real clusters verify performance (`F6`). |
| **oracle** | The mechanism that knows the right answer (assertions in the code, a simpler reference model, or a second computation). | Co-design the system and its harness so an oracle exists; without one, lean on dense assertions plus "does not crash". |

## Terms

| Term | Origin | Sense and what follows |
|---|---|---|
| **neural network test** | `coin.` | Ask whether your test suite would still work if the entire implementation were replaced with an opaque neural network. If yes, it tests features; if no, it pins implementation details. |
| **`check` function** | `coin.` | The single helper function that calls the API under test. Every test case is one call to `check(input, expected)`, isolating the suite from API signature changes. |
| **data-driven testing** | `coin.` | Tests whose input and output are plain data (often strings with markup) over a pure core. Once tests are data, they can be generated. |
| **test friction** | `re-spec.` | The effort required to add one more test. Invest in project-specific helpers until adding a test takes less effort than the fix. |
| **Test Driven Design Ossification** | `coin.` | When tests call internal APIs directly and freeze the internal design against refactoring. Delete or lift such tests to a stable boundary. |
| **purity / extent** | `borr.` (SWE at Google, re-specified) | **Purity** measures how much I/O, threads, clocks or processes a test touches (sets speed and flakiness). **Extent** measures how much code it traverses. Optimize purity ruthlessly; leave extent natural. |
| **slow / heavy tests** | `re-spec.` | Tests that cannot avoid real I/O or heavy work. Skip them by default locally via an env var and run them unconditionally on CI. |
| **coverage marks** | `borr.` (Dart analysis server) | A greppable string label placed on a code branch (`hit!("name")`) and asserted in the test (`check_hit("name")`). Proves the test hit the branch and links branch to test. Emit through logging (`log.covered.debug`) in production code. |
| **full coverage** | `re-spec.` | Exhaustive enumeration of all small inputs (via a rigged PRNG), not line-coverage percentage. |
| **inline tests** | `coin.` | Small input snippets written in comments right next to parser grammar rules and extracted into test runs. |
| **minicore** | `coin.` | A single minimal standard-library stub with per-test feature flags, keeping compiler/IDE tests fast and free of the real `std`. |
| **repeatable REPL / magic smoke checks** | `coin.` (REPL credits Ian Henry) | Using self-updating snapshots to inspect data while iterating; keeping 1–2 fixed known-value examples alongside a generative test. |
| **test (widened)** | `re-spec.` | Any program that checks a property of the repository at a commit — formatting, `tidy` lints, codegen freshness, architecture checks, and benchmark smoke runs all run under the test command. |
| **not rocket science rule (NRSR)** | `borr.` (Graydon Hoare) | Advance `main` only to commit hashes whose full automated check suite has already passed. |
| **flake (operational)** | `re-spec.` | Under NRSR, any test failure on `main` is a flake by definition. Track `main` failures on a dedicated list. |
| **ratchet** | `coin.` | A repository check committed upfront with an explicit allowlist of existing violations, preventing new ones while old ones are fixed incrementally. |
| **level-triggered testing** | `borr.` (electronics) | Running long fuzzers continuously and reporting a state table `(commit × fuzzer × seed)` rather than blocking PR gates or firing edge-triggered alerts. |
| **finite PRNG / out of entropy** | `borr.` (`arbitrary`, generalized) | Treating the fuzzer input as a finite random byte slice whose length bounds test complexity. Exhausting the slice aborts the run as a pass. |
| **rigged PRNG** | `coin.` | A byte generator that systematically enumerates all decision branches for small inputs instead of sampling randomly, guaranteeing the first failure is minimal. |
| **coarse-grained minimization** | `coin.` | Using failure runtime as a proxy for complexity across failing seeds: keep the seed that fails fastest. |
| **swarm testing** | `borr.` (Groce et al.) | Choosing a random subset and weight distribution of operations per seed so each run drives the system into a skewed corner of the state space. |
| **positive / negative space** | `borr.` (TigerStyle, re-specified) | Valid inputs that must succeed vs invalid/corrupted inputs near the boundary that must be rejected. Fuzz both. |
| **unit-fuzzer** | `coin.` | A standalone fuzzer for a single component with I/O mocked, complementing the whole-system simulator. |
| **safety mode / liveness mode** | `coin.` (TigerBeetle) | Two simulator regimes: unbounded faults checking that nothing bad happens (safety) vs a healed quorum checking that progress resumes within a tick bound (liveness). |
| **cold code ("there's no (re)try")** | `coin.` | Rarely executed error, retry or fallback paths where bugs hide. Either design the branch out or lower thresholds in tests so it runs constantly. |
| **managed thread** | `coin.` | A thread wrapper scheduled deterministically one step at a time from a PRNG seed to test concurrent code reproducibly. |
| **`snap:ignore` (redaction)** | `borr.` (`insta`) | An inline wildcard marker masking volatile output spans (timestamps, paths) inside a snapshot. |
| **`now` / `tick`** | `borr.` | Passing time into logic as a plain timestamp value per call (`now`) or a periodic step (`tick`), eliminating clock mocks and sleeps. |
