# Tests as data

> Loaded when: Writing or changing a `check`, a snapshot, a fixture or test infrastructure; a refactor breaks many tests; a test does not pass yet.

Gate 3 in detail. Scopes that bind are in [limits](limits.md#narrowed-the-scope-that-binds).

## The `check` function

- One `check` per feature wraps the API under test. "Each test's body is a single call to `check`. All the variation in tests comes from the input data." An API change then touches one function, not every test.
- `check` takes two arguments, the input and the expected result. Make the snapshot a first-class value, not a macro: "as soon as something is a macro, the only way to program it is with another macro".
- Re-use one input format for almost every test, such as one string literal with markup that describes a set of files.
- Minimize fixtures: "if you copy-paste a snippet of real code into the tests, make sure to remove everything which could be removed." His reasons: less to read, clearer what is tested, less noise in debug output, faster.
- Keep heavy inputs out of fixtures: rust-analyzer tests carry the minimal subset of the standard library they need ("minicore") instead of the real one, "This ensures fast test execution."
- Keep test cases as external data files where the suite is data-driven: "_First,_ it forces data driven approach without any cheating. _Second,_ it makes the test suite more re-usable."
- For a parser, put inline tests next to the code: "they help to illustrate what the relevant code is doing."

## Snapshots

- Render the outcome as text and compare it with a gold value that updates in place on mismatch. His reason: "Traditional tests often end up “freezing” the code, when significant behavioral changes require a lot of busy work to manually update all the tests."
- Choose the rendering for the reader: `Debug` output where it reads well, a purpose-built rendering (HTML viewed in a browser, a hex dump, a histogram) where it does not.
- Update policy: "you should touch the file system only when the test would fail otherwise"; update in place and read the change with `git diff`; still fail the test after rewriting: "even if snap update is erroneously set on CI, you still want your tests to fail".
- Mark volatile parts explicitly in the snapshot: "One possible approach here is to explicitly mark ignorable parts of the snapshots." In his library the marker is `<snap:ignore>`.
- Use snapshots for exploration too: "Snapshot tests give you a repeatable REPL!"
- Inside a `check`, a plain assert is enough to start; write a detailed message the first time you debug a real failure of that function.
- A few hundred lines of project-specific snapshot or property-testing helpers are enough: "A minimalist, but useful snapshot testing library can be implemented in less than 500 lines of code!" (500 lines: illustration).

## Keeping a suite honest

- **Coverage marks.** When a test exists for one condition, check that it hits the branch for that condition, because "the test might begin to pass for a trivial reason". Marks also find "the canonical test for each bit of code." At TigerBeetle he emits marks through existing logging rather than test hooks in production code.
- **A test that does not pass yet:** "If the test currently does not work, assert the wrong behavior and add a fixme explaining why it is wrong." The test keeps running, and the fix shows as a diff.
- **Make one test runnable from the editor**, under the cursor, and re-runnable with one action.
- **When a refactor breaks many tests,** the tests bind to code: move them behind a `check` at the feature boundary rather than updating each one. The trap has his name: Test Driven Design Ossification.
