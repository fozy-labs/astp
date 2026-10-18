# Shaping Tests: Boundaries, `check`, Snapshots and Marks

> Loaded when: Designing or reviewing test helpers (`check`), fixtures, snapshot/expect tests, redactions, inline tests, or coverage marks.

## Contents

- [Boundary placement](#boundary-placement)
- [The `check` function and data-driven fixtures](#the-check-function-and-data-driven-fixtures)
- [Self-updating snapshots](#self-updating-snapshots)
- [Coverage marks](#coverage-marks)

## Boundary placement

- **Concentrate tests on stable system boundaries.** For a library whose API is the product, test through the public API exactly as consumers call it, because using the same surface gives design feedback on the contract. For an application or an internal subsystem, test at the outermost human- or caller-visible boundary and keep internal logic tested as data in / data out.
- **Apply the neural-network check before committing to a test surface.** Ask whether the test suite could be reused unchanged if the software under test were replaced with an opaque neural network. If refactoring internal types or splitting a module forces rewriting the tests, the suite suffers from Test Driven Design Ossification.
- **Expect design feedback in the large, not in the small.** Boundary tests crystallize the data model and external inputs; they do not design internal function signatures.
- **When building a system meant to be fuzzed, sketch minimal fuzzable interfaces first.** Adding a fuzzer after the system is finished forces mechanical interface extraction that ossifies accidental dependencies.
- **Isolate tricky external-integration glue.** Where an outer integration layer (such as an editor plugin) resists fast deterministic tests, keep the core in a pure library with a fast suite and move the integration shell into its own project or slow suite.

## The `check` function and data-driven fixtures

- **Wrap the API under test in one `check` function.** Make every test body a single call to `check(input, expected)` so all variation lives in the data. When the API changes, you update one helper instead of a hundred call sites.
- **Drive test friction toward zero.** If writing a regression test takes more effort than the fix itself, tests stop getting written. Build small, project-specific test helpers so adding a test means typing only the input and the expected output.
- **Reuse one input DSL across the suite.** Represent multi-file or structured inputs in a single string literal with lightweight markup (such as `//- /main.rs` file headers and `$0` cursor markers). One shared format pays back investments in editor and debugging tooling.
- **Strip real-world reproducers to the minimum.** When a test fixture starts from a snippet of real code or a standard library, delete everything that can be removed before committing the fixture.
- **Keep large data-driven cases in external files, with a smoke-test escape hatch.** External data files prevent tests from cheating by calling internal APIs and make the corpus reusable across implementations. To debug one failing file with full IDE support, paste its input into a single inline smoke test, fix the bug, and remove the paste ([fork F10](limits.md#forks)).
- **Place inline tests beside handwritten parsers.** Write small input snippets in comments right above the grammar rule they exercise and collect them into test files by a script or test runner, so the grammar rule and its example stay on one screen.

## Self-updating snapshots

- **Serialize output to text and update gold values in place.** Instead of hand-writing assertion chains over structured outputs, render the output as a readable string (`Debug` or a purpose-built text/HTML view) and compare it against an inline `expect![[...]]` literal or file that rewrites itself when run with an update environment variable.
- **Make the snapshot a first-class value, not a macro.** Pass `expect![[...]]` as a value argument into `check(input, expect![[...]])`. Macros do not compose with helper functions without writing more macros; a value passes through ordinary functions.
- **Use snapshots as a repeatable REPL during development.** Even when requirements will not change, printing intermediate data structures into a self-updating snapshot keeps the data next to your cursor while you iterate.
- **Enforce safe snapshot-update invariants:**
  1. Touch the filesystem only when the snapshot actually mismatches, so read-only checkouts and external test runs pass without source write access.
  2. Update the file in place and inspect changes with `git diff`.
  3. **Still fail the test run when an update writes to disk**, so accidentally leaving the update variable set on CI fails the build instead of silently blessing broken output.
- **Mark volatile spans with explicit redactions (`snap:ignore`).** For outputs containing timestamps, durations or OS-assigned IDs, replace only the volatile span with an inline wildcard marker (capped at a small count per snapshot, with no newlines) rather than dropping snapshot testing or regex-matching the whole output ([fork F22](limits.md#forks)).
- **Start with plain assertions; add custom diff rendering on the first failure.** Write bare `assert`s first and invest in a detailed failure message or custom formatter the first time you actually have to debug a failure ([fork F27](limits.md#forks)).
- **Test fatal or panicking paths in a child process and snapshot the output.** Spawn the binary (or a test subprocess), verify that it exits non-zero, and snapshot its exit status, `stdout` and `stderr` together.

## Coverage marks

- **Tie a targeted test to the branch it must hit.** When a test exists to cover a specific `if` or error branch, place a named coverage mark (` hit!("branch_name") `) on that branch and `check_hit("branch_name")` in the test. This catches tests that start passing trivially without exercising the branch, and makes grepping for the mark jump straight from the code branch to its canonical test.
- **Emit marks through existing logging in production code.** Rather than littering production logic with test-only hooks (`if BUGGIFY`), emit coverage marks through the structured logger (`log.covered.debug`), keeping production code reading as it executes.
- **Verify a new check by reverting the fix.** When adding a test or tidy check for a bug, disable the fix and watch the check fail before committing.
