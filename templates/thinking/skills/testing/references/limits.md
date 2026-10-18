# Limits, Forks, Hypotheses and Numbers

> Loaded when: Before stating a number, attributing a quote, closing or touching a fork, using a single-source hypothesis, or answering where the model stops.

This file is the authority on statuses, forks, single-source hypotheses, numbers and voices. Where it and another file in this skill disagree, this file wins.

## Contents

- [How to use this file](#how-to-use-this-file)
- [Corpus and extraction arithmetic](#corpus-and-extraction-arithmetic)
- [Forks](#forks)
- [Hypotheses](#hypotheses)
- [Numbers](#numbers)
- [Voices that are not the author's](#voices-that-are-not-the-authors)
- [This skill's own scaffolding, declared](#this-skills-own-scaffolding-declared)
- [Boundary and gaps](#boundary-and-gaps)

## How to use this file

1. **Check the standing before asserting.** Multi-source moves in `SKILL.md` and the other reference files instruct within their stated scope. A single-source move ([Hypotheses](#hypotheses)) may seed a guess and must name the observation that would falsify it; it may never instruct or justify an edit on its own.
2. **Present an open fork as a fork.** Name both branches, state which one you took and on what evidence, and never present your choice as the model's ruling.
3. **Never cite this skill against a person.** Argue from the test's refactor cost, purity or failure mode.

## Corpus and extraction arithmetic

- **Corpus (`.research/matklad-corpus/`):** 206 blog posts on `matklad.github.io` (2017-03-12 to 2026-10-07), 15 `rust-analyzer` blog posts, 13 `matklad`-authored TigerBeetle blog posts, `rust-analyzer` and TigerBeetle architecture/style/testing docs (blamed per line), PR threads, forum comments (`lobste.rs`, `users.rust-lang.org`, `ziggit.dev`), and 7 talk/stream transcripts (`IronBeetle` 018/087/107/123, `HYTRADBOI` 2025, `Building Systems Simply` 2025, `ERA-01`).
- **Kill test (`.research/testing/kill-test.md`):**
  - Part (a), 10 decisions in `rust-analyzer` and TigerBeetle (56 turning points): 24 concept-carried (`C`, 20 published before the decision), 1 retold (`R`), 25 tacit (`T`), 6 external (`X`). `C + R` is 45% overall and 51% on strategy points, with 24 of 25 visible in the contemporaneous record.
  - Part (b), transfer across 4 service/CLI cases: 33 decided, 22 partial, 3 gaps.
- **Extraction (`.research/testing/moves.md`, `core.md`):** 158 distinct moves (76 procedure steps, 47 positions, 19 concepts, 10 tests, 6 anti-patterns). By evidence: 93 practised, 34 in later retellings, 31 in exposition only; 32 rest on a single source. Six core concepts (`K1`–`K6`) cover 112 of the 158 moves; 46 moves sit outside the core (8 worth/budget, 15 pure scope limits, 23 standalone procedures/positions).

## Forks

Closed forks carry his stated criterion. On the 11 open forks (and the open residues of `F3`, `F6` and `F7`), name both branches when they apply.

| Fork | Status | Deciding criterion |
|---|---|---|
| **F1** No internals in the test suite vs a simulator checker reading internal replica state | **open** | For general observability he says "make this extra data a part of the system's output"; for co-designed systems, "co-designing system and its testing harness is a point of leverage (build an oracle!)". No passage reconciles the VOPR state checker's internal inspection with the neural-network test. |
| **F2** "Unit tests" as a scam vs "add the fix and a unit test" | closed | Homonym ([glossary](glossary.md#homonym-traps)): "scam" targets tests that pin internal APIs; "add a unit test" contrasts a deterministic example-based regression test with a randomized fuzzer. |
| **F3** Fuzzers "as fast as test" (~300 ms) vs a 60 s CI fuzz budget | closed for tiers; **open** for the number | Tiering: keep each CI run quick while accumulating fuzz time across runs. The 60 s bound itself is trial and error ("I don't know"). |
| **F4** Accept slow tests vs test speed is categorical | closed | Accept slow tests only where I/O cannot be isolated, and gate them out of the default local run. |
| **F5** Deterministic simulation at the I/O boundary vs at domain objects | closed (one source) | Existing non-DST-aware app: mock at the VM/OS level (Antithesis style). Co-designed system: mock storage and network at the domain level. |
| **F6** Simulation as the bulk vs "real tests" (real-process / cluster runs) | closed for performance; **open** for correctness | Performance numbers must be verified on a real cluster (`T-355`). Which correctness tests must also run as real processes is unstated. |
| **F7** 2023 entropy-length minimization vs PR 1924's "poor man's" heuristic | closed as a workaround; **open** why | He labels the PR 1924 small-cluster triage a stand-in ("one day we'll get a real minimization") and says a copyable seed is more important than minimization; why the 2023 algorithm was not used in VOPR is unstated. |
| **F8** No mocks vs one mock for the clock | closed | Never mock your own code; mock only impure external I/O, and prefer passing `now` / `tick` as values over a clock object. (In his 2025 terminal-editor repo, no clock mock was actually present.) |
| **F9** Append-only test suite vs deleting/deduplicating tests with coverage marks | **open** | Early `rust-analyzer` docs declared the suite append-only; *A Trick for Test Maintenance* uses coverage marks to delete redundant tests. No passage accounts for dropping the append-only rule. |
| **F10** Love and hate for external test-data files | closed | Keep the suite in external files and paste one failing input into an inline smoke test to get IDE tooling back while debugging. |
| **F11** Tests give design feedback vs tests do not help design | **open** | He says public-API tests give design feedback, and also that tests do not help design in the small while crystallizing the data model in the large. |
| **F12** Test at the human-visible boundary vs avoid too many LSP protocol tests | closed | At a protocol boundary with statically typed messages and heavy setup (LSP), keep protocol tests few and test one layer inward (`ide`, in UI terms). |
| **F13** Ban `#[ignore]` (`fixme` tests instead) vs skip slow tests locally | **open** | Both are practised; that skipped slow tests still run on CI is our reconciliation, not stated by him. |
| **F14** Tolerate known fuzz failures early on vs delete unreliable semi-checks | **open** | Stated in different project phases without an explicit rule connecting them. |
| **F15** Micro-benchmark target of ~2 s (2025) vs ~300 ms (2026) | **open** | The 2026 post gives ~300 ms (<10 ms skews, >1 s slows iteration) without addressing the 2025 ~2 s figure. |
| **F16** Strict NRSR eliminates flakes vs maintaining a main-failures flake list | closed | Once NRSR holds, every failure on `main` is a flake by definition; track them on a list to eliminate them. |
| **F17** Fixed hardcoded seed vs fresh random seed per run | closed | Use a fresh printed seed per run once reproduction is easy; use a fixed seed (`92`) when asserting statistical properties that would otherwise flake once in a billion CI runs. |
| **F18** Think in invariants first vs trial-and-error execution against opaque APIs | **open** | Implied in a 2026 AI post for opaque cloud APIs ("just run the code and see the result"); not reconciled with his invariant-first rule. |
| **F19** Persist structured inputs for lasting regression tests vs drop old failing seeds after N commits | **open** | How a permanent regression corpus relates to the bounded rolling seed store is unstated. |
| **F20** Strict properties in an idealized lab vs fuzzy acceptance in realistic simulation | closed (one source) | Run both: strict assertions in an idealized lab fuzzer, fuzzy acceptance criteria under realistic faults. |
| **F21** Swarm-weighted operation mixes vs uniform fuzzer scheduling | closed | Get basic uniform coverage working first before guessing where to bias fuzzer time. |
| **F22** Exact string snapshots vs `snap:ignore` redactions | closed | Redact only when output contains volatile environmental fields such as timestamps. |
| **F23** Random-seeded fuzz runs inside the CI gate vs long fuzzing outside the gate | closed | Short smoke runs stay in the gate; long runs move to continuous level-triggered infrastructure. |
| **F24** CLI parsing: "no fuzzers" vs writing a narrow CLI fuzzer in the same stream | closed | No whole-system simulation for CLI parsing; a narrow in-memory fuzzer alongside snapshots is fine. |
| **F25** CLI tested with snapshots only vs MessageBus given a 1,000-line unit-fuzzer | **open** | He explains each case separately (CLI "isn't interesting"; MessageBus "gave us most of the troubles") without a general level-selection rule. |
| **F26** Prioritize older failing seeds vs faster-failing seeds | closed | Faster-failing seeds are simpler (later statement with mechanism). |
| **F27** Start with bare `assert`s vs rich diff-printing checks | closed | Start with bare `assert`s; add detailed messages on the first failure you debug. |
| **F28** Test only the subset a single caller uses vs fuzz a component against its whole contract | **open** | No stated criterion separating an internal single-caller helper from a component fuzzed against its full contract. |

## Hypotheses

Every item below rests on a **single source** (`S = 1`) in the corpus. It may seed a hypothesis that names its own falsifier; it must not instruct or be restated as a rule in other files.

- **Purity and suite organization:** the 5-step purity ladder (`T-101`, one essay); skipping deduplication of fast tests (`T-125`); keeping the test suite strictly append-only (`T-145`); adding the failing regression test as a separate commit before the fix (`T-147`); removing checks that cannot be reliable enough for the merge gate (`T-131`); defining every failure on `main` as a flake only after NRSR holds (`T-132`); closing child `stdin` so children exit when the parent dies (`T-157`); sending diagnostics to a capturable sink (`T-158`); maximal version selection concentrating ecosystem testing (`T-159`); thread-hammer tests as unsatisfactory on their own (`T-153`).
- **Shaping and fixtures:** avoiding too many tests at a statically typed protocol boundary like LSP (`T-204`); ordering a parser's test suite progressively for TDD with only `ok` tests normative (`T-213`); making internal facts part of the normal output for observability (`T-307`); avoiding `#[should_panic]` tests in applications (`T-317`).
- **Generative testing and simulation:** keeping individual fuzz iterations cheap (`T-123`); weighting fuzzers uniformly until coverage is measured (`T-126`); fuzzing a detached commit in a separate worktree (`T-141`); not using deterministic simulation for CLI parsing (`T-110`); checking strict properties in an idealized lab alongside fuzzy criteria in realistic simulation (`T-304`); keeping a couple of known-value smoke examples next to a generative test (`T-305`); letting the simulator's checker compare internal replica state (`T-315`); triaging a simulator failure against the fault model before blaming the code (`T-316`); persisting structured inputs rather than seeds for lasting regression tests (`T-331`); deriving a fuzzer's operations mechanically from the public API (`T-336`); choosing the simulation boundary by whether the app was co-designed for DST (`T-344`); modelling simulated latencies in nanoseconds so random timestamps permute events (`T-351`); scripting a scenario with predicates over a fault-free simulator (`T-352`); simulation testing the implementation while model checking tests the algorithm (`T-353`).
- **Scope remarks from a single source:** interactive PRNG decision sequences not replaying across commits (`T-238`); 2018 note that coverage marks were untried in large projects (`T-241`, later practised in `rust-analyzer` and TigerBeetle); the Cargo integration-tests post being about Cargo layout rather than testing philosophy (`T-242`); hand-writing tricky `macro_rules!` inputs because generating them well was unsolved (`T-245`).

## Numbers

No number leaves this skill without its status (`norm`, `limit`, or `illustration`).

| Number | Status | Meaning in the corpus |
|---|---|---|
| ~300 ms per micro-benchmark | norm | His 2026 target for interactive benchmark iteration (`F15`). |
| < ~10 ms / > 1 s per benchmark | limit | Below ~10 ms startup noise skews results; above 1 s iteration slows down. |
| ~2 s per benchmark | norm (superseded) | His 2025 target, superseded in 2026 by ~300 ms (`F15`). |
| fast = seconds, slow = low-digit minutes | norm | Target runtimes for a project's fast and slow test suites. |
| ~10 min CI for a 200k-line Rust project | norm | His rough baseline for a well-tuned Rust CI pipeline. |
| 1,000 similar tests | norm | The unit in which he prices the cost of a single test's speed or maintenance. |
| `u64` seed = 32-bit length + 32-bit seed | norm | Input encoding for `arbtest` and TigerBeetle fuzzers. |
| 100 ms `arbtest` default budget | norm | Default per-test run budget in his property-testing crate. |
| 5 s local / 60 s per fuzzer / 10 min CI / unbounded fleet | norm (60 s provisional) | Tiered fuzzing budgets; the 60 s bound is explicitly trial and error (`F3`). |
| 50:50 fuzzer time split (`main` vs PRs); 10 min budget, 30 min hang, concurrency 8 | norm | TigerBeetle continuous fuzzing orchestrator defaults. |
| weekly release, fuzz bake over the weekend | norm | TigerBeetle release cadence under continuous fuzzing. |
| ¼ MiB file-size check | norm | Repository `tidy` check threshold. |
| ≤ 10 `snap:ignore` markers per snapshot | limit | Tool cap on redactions in a single snapshot. |
| 4 KB / 500 lines / 100 KB debug window | limit | Tool caps implementing the "one screen of output" rule. |
| 6 vs 7 letters; inputs `0..8`; length ≤ 7 | limit / illustration | Small-input bound where combinatorial bugs already trigger ("Longer failures are not likely"). |
| ½ order of magnitude per purity step | illustration | Unmeasured rule of thumb for the purity ladder. |
| seeds `92` and `42` | illustration | `92` is his personal constant seed; `42` is his anti-example of a cliché constant. |
| < 500 lines (snapshot lib), ~300 lines (`arbtest`), ~1,000 lines (subsystem fuzzer) | illustration | Sizes of self-contained project-specific test tools; 500 lines is his personal tool-complexity ceiling. |

## Voices that are not the author's

Never attribute these to matklad:
- **Ted Kaminski (`docs/kaminski/`):** "test at system boundaries" wording (credited by matklad in `rust-analyzer` `architecture.md`). Under project rules Kaminski may only narrow or cut.
- **Joran Dirk Greef (`docs/tigerbeetle/TIGER_STYLE.md`):** most of `TIGER_STYLE.md`, including "≥ 2 assertions per function", simulation from day one, and static memory limits. Only lines blamed to Alex Kladov count as his.
- **PR and doc interlocutors misattributed in earlier excerpts:** `tb-pr-1114.md` lines 24/30/43/56 are **Phil Eaton (`eatonphil`)**; `tb-pr-1913.md:53`, `tb-pr-1607.md:41` and ~87% of `internals/testing.md` are **DJ (`sentientwaffle`)**; `tb-pr-3262.md:18` is **`batiati`**; `internals/vopr.md` ("One minute of VOPR time is equivalent to days") is **Evan Schwartz**; TigerBeetle's swarm/random-enum helpers (`9fe39720f`, 2022-10-13) were written by **Jamie Brandon** before matklad joined; in `IronBeetle 123`, the `90/80` return codes and `0..30` range are co-host **Tobi's**; the `92%` of critical bugs figure is **Yuan et al.**
- **Borrowed origins he credits:** purity/extent axes from *Software Engineering at Google*; expect tests from **Jane Street** and `insta`; coverage marks from the **Dart analysis server**; the not-rocket-science rule from **Graydon Hoare**; `sans-IO` from **Gary Bernhardt** / the sans-io community (he disagrees with Bernhardt on how quickly integrated tests become slow).
- **Pre-cutoff AI posts (`2025-08-31-vibe-coding-terminal-editor.dj`, `2026-01-20-vibecoding-2.dj`):** predating the 2026-07-15 AI freshness cutoff; excluded from any AI-testing claims, and the 2025 post's account of a clock mock and `sync()`/`snapshot()` does not match the repository at that commit.

## This skill's own scaffolding, declared

- **The six-concept grouping (`K1`–`K6`), their orthogonality claim, and the assignment of 112 moves to them.** The concepts are his; the grouping is ours.
- **The 4-step decision ordering in `SKILL.md`.** Only "If I can't fuzz, I write a snapshot test" is his stated order.
- **The output contract and the split into five reference files.**

## Boundary and gaps

Outside these bounds the model has no ruling; say so out loud when a task lands here:
- **Whether a test is worth its cost and how much budget to spend (`T-236`, `T-237`):** his own decisions here were tacit or trial and error.
- **Fuzzing thoroughness (`T-235`):** he states that TigerBeetle has no good way yet to measure whether fuzzers explore the state space efficiently.
- **Benchmarking a large, living project (`T-243`, `T-244`):** he states he has no grand vision for it and that each benchmark exercises only a narrow slice.
- **Modern HTTP / cloud / IPC service internals (`T-232`):** SQL and migration correctness, database races across concurrent requests, fake-database fidelity, third-party API drift, partial failure after a lost response, and message-broker ack order, redelivery and poison messages.
