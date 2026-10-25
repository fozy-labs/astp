# The suite over commits

> Loaded when: Changing CI, the merge gate or the test runner; a suite is slow or flaky; placing a slow test, a fuzzer or a benchmark.

Gate 6 in detail. Scopes that bind are in [limits](limits.md#narrowed-the-scope-that-binds); every number here carries its status from [limits](limits.md#numbers).

## The merge gate

- The not-rocket-science rule: "have a robot which checks that __the merge commit__ passes all the tests, before advancing the state of the main branch." It is Graydon Hoare's rule; he credits it.
- A strict gate, with no option to merge past a failing test, pushes the team to fix flakes; flakes still reach main.
- Keep tests free of external resources and reproducible, as rust-analyzer states: "tests do not depend on any kind of external resources, they are perfectly reproducible."
- Every checked property of the repository is a test run by the normal test command: "There's no additional checks in CI, formatting and tidy tests are run with `cargo test`." CI only supplies what you cannot write in a script: "the heterogeneous fleet of runners."
- Keep passing tests silent.

## Speed

- Price a test by its class: ask how long a thousand similar tests would take. Slow suites creep: "Slow tests are a boiling frog kind of problem."
- When a suite is slow, look for I/O, sleeps, outliers and big inputs, not for too much code under test.
- Print timings on every run: "Just by default printing the total test time and five slowest tests in a run goes a long way."
- Slow tests: an opt-in variable locally ("Heavy tests are only run when `RUN_SLOW_TESTS` env var is set."), always on CI.
- In a large Rust project, put integration tests in one crate with modules, because "each integration test is compiled into a separate binary."

## Fuzzers over commits

- Give each fuzzer budgets by purpose: seconds locally to show it runs, minutes on CI for easy bugs, unbounded on a fleet. "You want to make each individual CI run as quick as possible, while racking up the total fuzzing time over multiple runs."
- Smoke-run fuzzers with small parameters and a fixed or commit-hash seed, so fuzzing code cannot rot. At TigerBeetle this is a separate CI job.
- Long fuzzing stays off the gate and runs continuously over main and labelled pull requests: "Traditional testing is edge triggered. … In contrast, fuzz testing is level triggered." Show the state as "a table of recent commits and failing seeds for those commits."
- Keep seeds for a bounded number of recent commits, failures preferred: "Don't fear forgetting the old failures."
- Let a release bake under fuzzing before it ships, and weigh how many seeds passed: "No failures and 10 successes is different from no failures and a million of successes." At TigerBeetle the release call is the release manager's.
- Keep the automation in the main repository and deployed at the tip of main.

## Benchmarks

- Every benchmark is also a test: "Parametrize every benchmark by input size, such that with a small input it finishes in milliseconds." Code that does not run on the gate rots.
- A benchmark checks its own answer, or prints a hash of it: "More than once I've made some piece of code ten times faster by accidentally eliminating some essential logic :D"
- Track whole-system metrics on every commit and watch the baseline for large changes: "Don't worry if the results are noisy".
- For a relative comparison, grow the input until the difference is human-perceptible: the goal is intuition, not precision.
- Read one benchmark as "a narrow slice from the space of possible configurations". For a large, living project he has no method: "it always feels like a struggle to me."
