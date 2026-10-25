# Limits and forks

> Loaded when: Before stating a number, attributing a phrase, touching a fork or a hypothesis, citing the model, or answering where it comes from; at the line.

This file is the authority on statuses, forks, numbers and voices. Where it and another file in this skill disagree, this file wins.

## Contents

- [How to use this file](#how-to-use-this-file)
- [Corpus](#corpus)
- [Verification arithmetic](#verification-arithmetic)
- [Narrowed: the scope that binds](#narrowed-the-scope-that-binds)
- [Practice or exposition](#practice-or-exposition)
- [Forks](#forks)
- [Hypotheses](#hypotheses)
- [Numbers](#numbers)
- [Voices that are not his](#voices-that-are-not-his)
- [Named here, owned elsewhere](#named-here-owned-elsewhere)
- [This skill's own scaffolding, declared](#this-skills-own-scaffolding-declared)
- [Boundary and gaps](#boundary-and-gaps)

## How to use this file

1. **Check the standing before asserting.** Anything that instructs outside this file held as stated. A narrowed move holds only inside the scope below, and you state the scope. A hypothesis may seed a guess and must name the observation that would settle it; it may not instruct, argue or justify an edit.
2. **Present an open fork as a fork.** Name both branches, say which you took and on what evidence. Never let your preference pass as the model's ruling.
3. **Never cite this skill against a person.** It is a reconstruction with a measured survival rate. Argue from the gate you ran.

## Corpus

- **His writing:** the matklad.github.io blog, 206 posts from 2017-03-12 to 2026-10-07; rust-analyzer's `architecture.md`, `style.md`, 2018 test documents, 2019 guide and blog (15 of 17 posts signed by him); TigerBeetle's blog, `TIGER_STYLE.md` (only the lines blamed to him), `ARCHITECTURE.md` (5 of 8 commits his), pull-request bodies and comments; forum threads on ziggit, lobste.rs and users.rust-lang.org.
- **Streams:** IronBeetle episodes 018, 087, 107 and 123, HYTRADBOI 2025, Building Systems Simply 2025, a rust-analyzer repository walkthrough and a 2019 Saint Petersburg meetup talk in Russian. All are auto-captions: wording is approximate and speakers are not marked.
- **Practice records:** commits and pull requests in rust-analyzer (from the 2017 lexer test harness on) and TigerBeetle (to 2025), checked against `git log` and blame.
- **Excluded as evidence:** the post on vibe-coding a terminal editor (2025-08-31), a second vibe-coding post (2026-01-20) and the editor's repository. They are AI-topic material older than 2026-07-15, which the owner's source criteria flag. No move here rests on them, and none concerns AI-assisted testing.
- **Kill tests:** his concepts decide the shape of a test in contemporaneous records, and from 2021 on they predict his next decisions; every worth and budget decision was tacit. On four service cases the model decides our side of every I/O boundary and nothing about the outside system ([the line](../SKILL.md#the-line-our-side-of-the-io-boundary)).

## Verification arithmetic

Counts describe the verification pass, not any quantity in a test.

- 162 extracted moves, 4 merged as duplicates. Of 158: 85 held as stated, 28 held only in a narrower scope, 43 rest on a single occurrence, 2 were cut as inverted; none was absent from the corpus or another person's. 72 % hold at the core.
- After the pass, for this skill: 2 moves are not about testing (maximal version selection; his rules as attention triggers); 3 belong to `software-architecture` (sketch the fuzzable interface first; enforce an architecture invariant with a test; the testing story as a primary architectural concern); 1 lost its only evidence with the excluded sources (performance numbers need a real cluster); 3 are named with their owner unsettled ([below](#named-here-owned-elsewhere)).
- What instructs: 79 moves as stated and 28 narrowed. What sits in [hypotheses](#hypotheses): 40 single moves and one step that verification kept as single.
- The six concepts: five held as stated; impurity held narrowed. They are distinct but two depend on others: data carries binding, entropy presupposes data.
- 28 forks: 16 closed (4 of them on one source, 2 with an open residue), 10 open, 2 dissolved with the excluded sources.

## Narrowed: the scope that binds

| Move | Holds only as |
|---|---|
| Impurity (the concept) | I/O, time and randomness are the cost: pass them in, leave extent natural. Purity and extent as a pair of axes, the impurity ladder, "test speed is categorical, rather than numerical" and half an order of magnitude per step are the framing of one essay, *Unit and Integration Tests* (2022). |
| Do not unit-test internals or mock your own code | Do not keep per-function tests as the suite; do not mock your own code. Ted Kaminski narrows it: such tests helped while building. |
| A fast suite for iteration and a separate conformance suite | Compiler test suites. |
| An integration test drives the built binary as a separate process | TigerBeetle's own naming ("Although the term is not particularly well-defined, here it means a specific thing"). |
| Test only the subset you use | Code that is not a library need not test API surface it does not serve. Fixing the rest when you come to use it is one stream. |
| Benchmarks sized to a human-perceptible difference | Push the difference to human scale for intuition, not precision. About 300 ms is one post; another says about 2 s. |
| A component outside the simulator gets its own fuzzer | One component (TigerBeetle's message bus), chosen for its bug history, not its weak contract; DJ wrote the fuzzer. |
| A strict merge gate removes flakes | It pushes fixing them; flakes still reach main. |
| Tests use no external resources | rust-analyzer's invariant that tests use no external resources and are reproducible, plus optimising purity. Its heavy tests use Cargo and a real disk. |
| Fuzzers are tests too | A test in the suite is his advice; TigerBeetle runs a separate smoke job on CI, bounded at 60 s. |
| Passing tests are silent | Keep passing tests silent. Failing on stderr is Zig's runner, which he endorses; running the test binary directly for a hang is one comment. |
| Test fatal code in a child process | The child process for code that exits, in two sources. Snapshotting status, stdout and stderr is one stream (CLI parsing), and the design was forced. |
| Tests help design in the large | The half that says not in the small is one post. |
| External test data, debugged through a smoke test | The external-data half; the smoke-test half is one post. |
| Coverage marks through logging | Marks through logging. The reason, that logic reads as executed with no test hooks, is a TigerBeetle team principle. |
| Disable the change and watch the check fail | For a test of a specific condition and for fuzzer coverage. |
| Known fuzz failures that do not affect users stay unfixed | rust-analyzer, for a product reason (availability over correctness). |
| His experience stops outside compilers | Only "modern HTTP applications built around inter-process communication" (2021). Other statements are background, not testing limits. |
| Pure algorithms are the easy case | Pure code is the easy case (two sources); for generative testing in particular, one post. |
| Give a reliable system an oracle | Co-design the system and its harness. "Part of your job" and exposing internal facts for the oracle are one post. |
| Start with a plain assert | Plain asserts inside `check`-style tests, a `check` with expected output from the start, a detailed message at the first real debug. |
| Do not test against an approximation | Two claims: an approximate lexer makes interactive grammar testing "almost useless"; mocking your own code lowers fidelity and makes code brittle. |
| Fuzz the positive and negative space | Generate valid and invalid inputs. Aiming at the boundary between them is one post; the reason, that bugs concentrate there, is Joran's. |
| Repeats from a small range, near-duplicates by a bit flip | Repeats from a small range. The bit flip is one stream, worked out with Tobi. |
| Run the system under test in a child process | His reason is Zig's: "There's no unwinding in Zig". |
| A humble PRNG is enough | "Brutally effective" with targeted generation and an oracle. He still wants coverage guidance. |
| Fuzz a component alone against its whole contract | The calls respect their preconditions; the checks are no crash plus a structural property; reusable components. |
| Externalize all I/O, time included | TigerBeetle's simulator, whose interface is domain-level: storage sectors and message passing. |
| A liveness failure shows as a timeout | The diagnosis; the debugging recipe is one live session. |

## Practice or exposition

Rule text (style guides, `TIGER_STYLE.md`) and "how we do it" documents count as exposition or retelling, not practice.

- **Exposition only, no record of doing it:** printing test timings; a separate conformance suite; fire-and-forget APIs are untestable; layering defenses; disabling the change to watch the check fail; asserting liberally.
- **Retold later, no record from the time:** suite time as a metric; baking a release under fuzzing; leaving known fuzz failures unfixed; recoverable assertions; the model before the fuzzer (partly rule text).
- **Practice:** using the simulator to explore (commits 9d9723c00 and 56aced5eb).
- **Record pointers:** the safety and liveness split is commit 2cae534ca. For the CLI parser and the used-subset rule, the code is the record and the rationale is narrated a week later on stream. The testing-story record is a lexer test harness committed while the lexer was a stub (2017-12-29).

## Forks

| Fork | Status | Deciding criterion |
|---|---|---|
| No internals in the suite vs a checker or a mark that reads internals | **open** | Two candidates in his words: make the needed fact "a part of the system's output", and "co-designing system and its testing harness is a point of leverage". Nothing links either to the neural-network test. |
| Simulation vs real-process tests | **open** | Which correctness or performance checks need a real process: no criterion. The performance criterion came from an excluded source. |
| Append-only suite vs editing tests | **open** | None. |
| Do tests give design feedback? | **open** | None stated; public API as design in the large is our candidate. |
| Skipping a test is banned vs slow tests are skipped | **open** | None stated; that skipped slow tests still run on CI is our candidate. |
| Tolerate known fuzz failures vs remove checks that cannot be on the gate | **open** | None; project phase is our candidate. |
| Benchmark length: about 2 s vs about 300 ms | **open** | Newer by date only. |
| Two low-stakes components, two levels (the CLI parser without simulation, the message bus with its own large fuzzer) | **open** | Each has a reason, no comparison; bug history is our candidate. |
| Test the used subset vs the whole contract | **open** | None; one consumer vs a contract others rely on is our candidate. |
| Persist the structured input vs forget old failures | **open** | None. |
| A smoke fuzz "as fast as test" vs 60 s on CI | closed for tiers, open for the value | "You want to make each individual CI run as quick as possible, while racking up the total fuzzing time over multiple runs." The value: "I don't know what's a reasonable time bound for smoke fuzzing." |
| Minimization by entropy length (2023) vs a stand-in heuristic (2024) | closed as a stated workaround | He labels the heuristic a stand-in for real minimization; why the earlier method went unused is open. |
| "Unit tests" a scam vs "a fix and a unit test" | closed | A homonym: see the [glossary](glossary.md). |
| Accept slow tests vs speed matters | closed | Slow only where I/O cannot be isolated, and gated as slow. |
| Simulate at the I/O boundary vs at domain objects | closed (one source) | An existing application: simulate the machine; a system built with its simulator: mock storage and network at the domain level. |
| External test data: love and hate | closed | "I first paste the input into this smoke test, and then get my IDE tooling back." |
| Human-visible boundary vs few tests at a typed protocol boundary | closed (one source) | Typed messages make protocol errors hard. |
| Strict gate vs flakes on main | closed | "Maintain an easily accessible list of recent main failures" (one post). |
| Fixed seed vs fresh seeds | closed | Fresh once a run is reproducible; fixed for statistical assertions. |
| Strict properties in an idealized lab vs a realistic simulation | closed (one source) | "The acceptance criteria has to be fuzzy in a realistic simulation, but can be very strict in the lab." |
| Swarm weights vs uniform fuzzer scheduling | closed | "I'd personally would like to get at least basic coverage going before trying to guess what we should spend more time fuzzing." |
| No redactions vs redactions | closed | Case need: timestamps in REPL tests. |
| Random seeds inside the CI gate | closed | Quick runs stay on the gate; long simulation leaves it. |
| CLI: no fuzzers, then a fuzzer | closed (one source) | Fuzzing "in a very narrow sense". |
| Older seeds vs faster-failing seeds | closed | "Seeds that failed faster are simpler." |
| Plain assert vs a diff-printing check | closed | Plain asserts first; a detailed message the first time a real failure is debugged. |

Two forks dissolved: *no mocks vs one mock for the clock* and *invariants first vs trial and error*. Their second branch came only from the excluded sources.

## Hypotheses

Each rests on one occurrence. It may seed a guess that names its own falsifier; it may not instruct, and it is not restated elsewhere in this skill.

**Level and budget.**
- Rank tests on a ladder of impurity and move each one step down (one essay).
- Put the testing strategy in the specification and start with one simple end-to-end test (one post, about service systems he says he has little experience with).
- Skip whole-system simulation for code that cannot hurt the database (CLI parsing); test it with examples, snapshots and a narrow fuzzer (one stream).
- In a small project, do not organise tests for speed (one post).
- Keep each fuzz iteration cheap by re-using memory (one post).
- Do not deduplicate tests that run twice when they are fast (one comment).
- Weight fuzzers uniformly until coverage can be measured (one review).
- Write few tests at a protocol boundary whose messages are typed (rust-analyzer's LSP boundary).
- Pick a smoke-fuzz bound (60 s), then revise it up or down (one pull request, which later moves the CI target to about 10 minutes).

**Gate and history.**
- Remove a check too unreliable for the merge gate (one post).
- With a green-main guarantee, every failure on main is a flake; re-run tests on main to collect them (one post).
- Fuzz a detached commit in its own worktree and open the pull request when it passes (one post).
- Keep the suite append-only: add a new test for a found bug (rust-analyzer, 2018).
- Commit the failing test first, as a separate commit (one post).
- Set up a ratchet, a list of known violations the tests enforce, before fixing anything (one post).
- He has no not-rocket-science rule for continuous fuzzing yet (2024); reaching zero known fuzz failures will take years (2025). Two claims, one source each.

**External world.**
- Thread-hammer tests are unsatisfying: a timing-dependent failure cannot be reproduced, debugged or minimized (one post).
- Children exit when stdin closes, so spawned test processes clean up after a crash (one post).
- Send diagnostics to stderr in production and to an in-memory buffer in tests (one post).
- Separate the tricky-to-test integration bits into a separate project with slow, less reliable tests (one post).
- Run threads as managed threads, one at a time, scheduled from a seed (one post; his harness is "just a toy").
- For an existing application, simulate at the machine level; for a co-designed one, at domain objects (one forum thread).

**Data and snapshots.**
- Order a parser's suite progressively; only the `ok` cases are normative (rust-analyzer, 2018).
- Keep a couple of known-value examples next to a generative test, as "magic smoke checks" (one post).
- Make an internal fact a test needs part of the output through an observability point (one post).
- In an application, do not write `#[should_panic]` tests (rust-analyzer's style guide).
- Bound debugging output to one screen (one stream).

**Generative and simulation.**
- Check strict properties in an idealized lab and fuzzy criteria in a realistic simulation (one post).
- For a lasting regression test, persist the structured input, not the seed ("I think", one post).
- Derive the fuzzer's operations from the public API, so a new method breaks the build until covered (one queue fuzzer; "This is not such a big deal of course").
- Rig the generator to enumerate in order, so the first failure is the smallest (one post).
- Tighten the simulator's checker when an invariant can be stated more precisely (one commit).
- When the simulator fails, first check the failure against its fault model (one stream).
- Model simulated latencies in nanoseconds, so random timestamps reorder events (one commit).
- Script a scenario with predicates over a fault-free simulator (one post, partly speculation).
- Simulation tests the implementation, model checking the algorithm (one sentence, mixed-voice document).
- Hand-write inputs such as big `macro_rules` that cannot yet be generated well (one stream).

**Reading notes.**
- His property-testing library is "simplistic" but enough so far (one post).
- A demo that hunts a bug he already knows is weak evidence (one post).
- In 2018 coverage marks were untried by him in large projects; later practice superseded this.
- His post on Cargo integration tests is about Cargo only.

## Numbers

No number leaves this skill without its status.

| Number | Status |
|---|---|
| about 300 ms per micro-benchmark, under ~10 ms skews and over 1 s slows iteration | his rule of thumb (2026), one post; open against about 2 s (2025) |
| fast suite = seconds, slow suite = low-digit minutes | norm, a project target |
| a thousand similar tests | the unit he prices a test in |
| half an order of magnitude per impurity step | illustration, one essay, no data |
| about 300 ms per fuzzer ("as fast as test") | a limit he set aside after one case |
| 60 s per smoke fuzzer | provisional ("for now") |
| 5 s locally, 10 min on CI, unbounded on the fleet | norm, tiering by purpose; values shift between pull requests |
| fuzz budget 10 min, hang 30 min, concurrency 8; "half an hour per fuzzer" | tool defaults and his target |
| fuzzing time split 50:50 between pull requests and main | scheduling norm |
| a 64-bit seed = 32-bit entropy length + 32-bit seed | norm, his input format |
| 100 ms | his crate's default time budget |
| seeds kept for N commits, M per commit | a limit; values not given |
| ≤ 10 ignorable markers per snapshot | limit of his tool |
| weekly release, fuzzed over the weekend | TigerBeetle process |
| about 10 min CI for a 200k-line Rust project | "rough baseline" |
| inputs 0..8; 6 against 7 letters | his small-input heuristic ("Longer failures are not likely.") |
| small exhaustive bounds (lengths to 7, n = 5, 81133 interleavings in 8.65 s) | illustration: small spaces are enumerable |
| suite timings, generator settings, coverage thresholds, library sizes (< 500 lines), seed 92, log sizes | illustration, single projects |
| debugging window 4 KB / 500 lines / 100 KB | tool settings inside a hypothesis |

Not his, never attribute to him: 92 % of critical bugs (Yuan et al.); "One minute of VOPR time is equivalent to days" (Evan Schwartz); "3.3 seconds of VOPR … 39 minutes" (Phil Eaton and Joran Dirk Greef); at least two assertions per function (`TIGER_STYLE.md`, not his lines); return codes 90/80 and range 0..30 (Tobi); 1,000 → 5,000 runs (speaker unclear).

## Voices that are not his

Never attribute these to Kladov. None of them instructs here.

- **Joran Dirk Greef:** `TIGER_STYLE.md`'s golden rule (positive and negative space, bugs at the boundary), "Assertions are a force multiplier for discovering bugs by fuzzing", crash on corruption; the TigerBeetle simulator itself (2021). The simulator and the rule of a targeted fuzzer per subsystem are TigerBeetle house design, which Kladov retells and extends.
- **DJ (sentientwaffle):** the message-bus fuzzer, which Kladov changes on stream; the release call as release manager; a post on fuzzer blind spots, which narrows several moves.
- **Jamie Brandon:** swarm weights in TigerBeetle's fuzz helpers (2022-10-13), before Kladov's swarm work (2025-04). Swarm testing itself comes from a paper he credits.
- **Tobi (Tobias Ziegler), IronBeetle 123:** the swarm options and the zero-weight question, the return-code check that a fuzzer reaches its cases, the near-duplicate bit flip (worked out together). Speaker changes in that stream are unmarked.
- **Evan Schwartz, Phil Eaton, batiati:** VOPR notes and a stubbed clock; lines in pull request 1114; a request for a fixed seed.
- **Ted Kaminski:** the boundary vocabulary, which Kladov credits; the narrowing of the move against unit-testing internals. He narrows, never adds.
- **Credited origins:** expect tests (Jane Street) and `insta`; coverage marks (the Dart analysis server); the not-rocket-science rule (Graydon Hoare); sans-IO; the `arbitrary` crate; the IntelliJ Rust team's parser fixtures; cold-code ideas (Candea and Fox, Yuan et al., Joe Duffy).
- TigerBeetle's `releases.md` and `HACKING.md` have no blame rows and are not counted as his.

## Named here, owned elsewhere

- **`software-architecture`:** what a boundary is (kinds, cost, narrow cut); invariants as absences, their physical enforcement and erosion; testing as a primary architectural concern, decided with the first line of code; where layers go; sketching interfaces for fuzzing before the system exists; enforcing an architecture invariant with an ordinary test (this skill may name such a test as the invariant's carrier).
- **Owner not settled** (proposed: `software-architecture`). Named where testing needs them, never derived here:
  - structured concurrency: "This API is fundamentally untestable." of fire-and-forget work, and sleeps in tests as its symptom;
  - compartmentalisation by the cost of failure: rust-analyzer's merge bar ("PRs with new features land when there's a reasonable certainty that the happy case works correctly."), and a long-running rust-analyzer process that recovers from a broken assertion where TigerBeetle crashes.

## This skill's own scaffolding, declared

- **The six names** (binding, data, impurity, entropy, verdict, commit) and the assignment of moves to them are ours; each concept and its words are his.
- **The dependencies:** that data carries binding (he introduces `check` as the remedy for API-bound tests) and that entropy presupposes data ("once you formulated the tests in terms of data … you can generate test cases easily") are his; the edge from entropy to verdict is ours.
- **The gate order** and the rule to commit to no test before the gates above it are answered are ours. His only stated order is generative first, snapshot when you cannot fuzz; in one stream he went the other way, from examples to a fuzzer fed by them.
- **The operations table:** each sign is his; the table is ours.
- **The line:** the four service cases are ours; what the model decides there was read off his material.
- **The output contract** is ours.

## Boundary and gaps

Outside these the model has no verdict. *The model does not reach here* is a legitimate output.

- **His stated scope and the outside system:** quoted and listed at [the line](../SKILL.md#the-line-our-side-of-the-io-boundary). The scope sentence is from *How to Test* (2021-05-31). His later TigerBeetle work is a database built with all I/O externalized; the corpus has no material on HTTP handlers, SQL, queues or payment APIs. Migrations and acknowledgement order could be closed only by our own inference, poison messages only by importing another author; this skill does neither.
- **Worth and budget.** Tacit at every turning point of his practice. Directions only: the price of a thousand similar tests; making a test trivial to add; the merge bar by the cost of failure ([named](#named-here-owned-elsewhere)).
- **When to stop.** No criterion ([his words](../SKILL.md#what-this-skill-refuses-to-be)). TigerBeetle's fuzzing thoroughness went unmeasured from 2024-05 to 2026-04: "as embarrassing as it is, we currently don't have a reasonable way to track our fuzzing thoroughness".
- **Oracles and fault models in a simulator.** Tacit, except one stream that states the fault model.
- **Benchmarking a large, living project.** Unsolved by his own account.
