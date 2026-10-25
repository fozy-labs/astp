# Glossary

> Loaded when: A term from this skill or from his writing is used or met, especially "unit test", "integration test", "fuzzer".

His coinages and the common words he uses in his own sense. Each row says what follows from the term. Use one term per concept; do not rotate synonyms.

## Homonym traps

| Term | His sense | What follows |
|---|---|---|
| **unit test** | Three senses. (1) A test of code rather than a feature, nailing internal API: the thing to avoid. (2) In rust-analyzer (2020), a snippet-in compiler test without the real standard library: praised. (3) In 2026, an example-based regression test, set against a generative one: added after the fuzzer finds the bug. | Read the date and the contrast before using an occurrence. |
| **integration test** | In Cargo, only where the `#[test]` lives; at TigerBeetle, a test binary that contains no system code and drives a separate process. | Classify a test by what it binds to and what I/O it touches, not by this word. |
| **fuzzer** | Any test driven by generated random data, coverage guidance not required; fuzzing and property testing are one harness. | Advice for one transfers to the other. |
| **simulation** | A deterministic whole-system run whose only input is the seed, with storage and network mocked at the domain level, not at system calls. | The fake sits where domain faults can be injected. |
| **"real tests"** | Ironic: real-process tests, set against simulation. | Not a ranking of worth. |
| **oracle** | The known right answer a test compares with. | A generated test without one checks only that nothing crashes. |
| **boundary** | Owned by `software-architecture`. Testing's use only: tests concentrate on stable boundaries, and for an application "The boundary is what a human in front of a display sees." The vocabulary is Ted Kaminski's, credited. | Name the boundary; do not re-derive what it is. |
| **test** (widened) | "a program that checks a property of a repository of code at a particular commit. Any property". | Lint, format, generated files and small benchmarks are tests the test command runs. |
| **full coverage** | Every small input enumerated, not line coverage. | Enumerate when the small space is finite. |

## Terms

| Term | What follows |
|---|---|
| **neural-network test** | A suite that would survive replacing the code with an opaque model tests features; one that would not tests code. |
| **`check` function** | The one place that calls the API; tests become data, and an API change touches one function. |
| **data-driven testing** | A pure core, data in and data out, so tests can be generated. |
| **Test Driven Design Ossification** | His name for tests that block refactors: a cost, not safety. |
| **expect test, snapshot test** | A "self-aware string literal" that rewrites itself on mismatch; a value `check` takes, not a separate tool. Credited to Jane Street and `insta`. |
| **redaction, `<snap:ignore>`** | An explicit marker for a volatile span in a snapshot. |
| **repeatable REPL** | Snapshots used for exploration, not only for change. |
| **sans-IO** | The caller does I/O, the callee computes; the core is tested without I/O. Credited. |
| **purity, extent** | Purity: how much I/O, threads, time and processes a test touches, which drives speed and flakiness. Extent: how much code it runs, not worth minimizing. The pair is one essay's framing. |
| **`now`, `tick`** | Pass the current instant per call, or push time in at a fixed cadence; no clock object to mock. |
| **slow / heavy tests** | Opt-in locally through an environment variable, always run on CI. |
| **minicore** | rust-analyzer's minimal core library shared by tests, so fixtures stay fast and need no real standard library. |
| **inline tests** | Test snippets as comments beside parser code, collected into files. |
| **coverage marks** | A test names the branch it must hit; find the test for a branch, and catch a test that stopped covering it. Borrowed from the Dart analysis server. |
| **not-rocket-science rule** | Main advances only to commit hashes whose test results are known. Graydon Hoare's, credited. |
| **level-triggered testing** | Long fuzzing reports a state (commit × seed), not events: a table, not a gate. |
| **seed record** | Commit, fuzzer, seed, timings, command and pass count, kept for a bounded number of commits. |
| **finite PRNG, entropy, out of entropy** | The input is a byte string that can run out; its length is the test's size, so shrink it to minimize; running out is a pass ("innocent until proven guilty"). From the `arbitrary` crate, generalized. |
| **rigged PRNG** | A generator that enumerates instead of sampling. |
| **coarse-grained minimization, poor man's minimization** | Run time, or a small correctness-only cluster, as a stand-in for real minimization: workarounds by his own label. |
| **swarm testing** | Randomize the operation distribution per run, not only the operations. From the swarm-testing paper; at TigerBeetle the helpers predate his use. |
| **positive / negative space** | Valid data against invalid data: fuzz both. The wording comes from `TIGER_STYLE.md`'s golden rule, not his lines. |
| **unit-fuzzer** | A fuzzer for one component with I/O mocked, beside the whole-system simulator. |
| **safety mode, liveness mode** | Random faults check safety; a healed core must make progress, and a timeout is the failure. |
| **cold code** | Rarely run paths, "the preferred habitat for bugs": design them out or trigger them often. |
| **semi-check** | A check too unreliable for the merge gate (the removal rule is a [hypothesis](limits.md#hypotheses)). |
