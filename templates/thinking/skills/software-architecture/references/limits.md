# Limits, Domain Inputs, Forks and Numbers

> Loaded when: Before proposing a cut (to check required domain inputs), stating a number, attributing a quote, touching a fork/reversal, or working on multi-service/concurrent code.

This file is the authority on statuses, domain inputs, forks/reversals, numbers, voices and scope limits. Where it and another file in this skill disagree, this file wins.

## Contents

- [How to use this file](#how-to-use-this-file)
- [Corpus and kill-test arithmetic](#corpus-and-kill-test-arithmetic)
- [Domain inputs the codebase must supply](#domain-inputs-the-codebase-must-supply)
- [Forks and reversals](#forks-and-reversals)
- [Hypotheses](#hypotheses)
- [Numbers](#numbers)
- [Voices that are not the author's](#voices-that-are-not-the-authors)
- [This skill's own scaffolding, declared](#this-skills-own-scaffolding-declared)
- [Boundary and gaps](#boundary-and-gaps)

## How to use this file

1. **Gather domain inputs before cutting.** The kill test showed that concepts carry *where* to cut and *who may know whom*, while domain facts carry the content. Check [Domain inputs the codebase must supply](#domain-inputs-the-codebase-must-supply) before proposing a design.
2. **Present an open fork as a fork.** Name both branches, state which one you took and on what evidence, and never pass your preference off as the model's ruling. Where matklad reversed an earlier decision (`F1`, `F5`, `F6`), apply the criterion that drove the reversal.
3. **Never cite this skill against a person.** Argue from change cost, dependency edges or compiler enforcement.

## Corpus and kill-test arithmetic

- **Corpus (`.research/matklad-corpus/` plus full git histories of `rust-analyzer` and TigerBeetle):** 206 blog posts on `matklad.github.io` (2017–2026, ~65k words on architecture), 15 `rust-analyzer` blog posts, TigerBeetle blog posts, `rust-analyzer` `architecture.md` (395 lines his) and `style.md`, TigerBeetle `ARCHITECTURE.md` (513 lines his), 5,298 `rust-analyzer` commits and 1,511 TigerBeetle commits by Kladov, and lecture/talk transcripts (`CSC` 2019 modules lecture, `SPb` 2019 meetup, `ERA-01`, `Building Systems Simply` 2025).
- **Kill test (`.research/software-architecture/kill-test.md`, `ousterhout/matklad-T-recode.md`):**
  - Part (a), 10 architecture decisions across `rust-analyzer` and TigerBeetle (48 turning points): 12 contemporaneous concept steps (`C`), 4 retold concept steps (`C*`), 25 tacit steps (`T`), 7 external (`X`). Under the strict raw-`T` rule (`T ≥ 50%`), `T` is 61% (and runner-up John Ousterhout failed harder at 71% `T`, with a no-model control matching his model in 6 of 6 blind predictions). Splitting `T` into codebase/hardware facts (`T-domain`, 13) vs open structural judgement (`T-judgement`, 12) gives **57% concept-carried** (16 `C + C*` vs 12 `T-judgement`).
  - Part (b), blind prediction on 6 held-out 2024–2026 decisions: 4.0 of 6 nominal (3.5 of 6 excluding one contaminated case); in every partial hit the spine gave the direction while a specific trick or domain criterion decided the concrete shape.
- **Extraction (`.research/software-architecture/matklad/extract/E1..E5-moves.md`):** 227 raw moves across 5 slices (`E1` 49 moves + 9 domain-input + 9 scope-limit; `E2` 54; `E3` 66; `E4` 32 + 17 scope-limit; `E5` 26 commit/PR moves).

## Domain inputs the codebase must supply

In his own decisions, these facts came from the domain or prior systems (`IntelliJ`, `Kotlin`, `Sorbet`, `rustc`, storage physics), never from an abstract boundary rule:

- **Frequency of the common case (`1% vs 99%`):** e.g. read-only IDE analysis of 6,666 untouched dependencies (99%) vs DOM-style syntax-tree mutation for refactoring (1%). Optimizing the core representation for the 1% case (`rowan` identity-less green/red trees) was his main self-identified mistake (`F5`).
- **Input and message physics:** whether inputs fit in memory ("tens of megabytes" of source code in `rust-analyzer`) or have strict finite bounds (1 MiB messages in TigerBeetle, enabling static allocation) vs unbounded inputs where static allocation fails.
- **Failure physics across layers:** when a lower layer's faults cannot be hidden behind a black-box interface (such as disk misdirected writes/corruptions in TigerBeetle requiring consensus-level protocol-aware recovery, `E2-46`), domain physics overrides encapsulation. Conversely, when a transport layer (`MessageBus`) has an intentionally weak contract (messages may drop or reorder), its bugs cannot break safety.
- **Language and build-graph semantics:** whether the language allows separate per-file/per-function analysis (Zig, Java/Kotlin with explicit signatures/FQNs) or forces whole-crate fine-grained invalidation (Rust macros and trait coherence).
- **Social context and incentives:** whether the project is a greenfield open-source tool optimizing for weekend-warrior contributors (requiring stable-compiler builds, fast tests, and crash-isolated feature compartments) or a small full-time team building a safety-critical kernel/database (`E1-D9`).

## Forks and reversals

| Fork | Status | Deciding criterion |
|---|---|---|
| **F1** `serde` forced into `ra_syntax` (2019) vs serialization strictly in leaf crates (2021) | closed (reversed in practice) | Both argued from compile time: in 2019 a small crate graph compiled `serde` once at the bottom; as the crate graph grew, `serde` near the bottom punished every intermediate crate (`da73c93c7f`, `10e9408d38`). Leaf serialization won. |
| **F2** Reify internal boundaries as processes (2022) vs ship multiple services as one multicall binary (2024) | **open** | He states that processes help across many teams (`almost-rules:30-31`) and that code structure follows the org chart so one team should ship one binary (`Kafka-vs-Nabokov:75-78`). Where the team-scale flip happens is unstated. |
| **F3** Weakly typed `TypedKey` map (2018) vs explicit per-call `Config` structs (2020) | closed | Use `TypedKey` only when independent plugins register options unknown upfront; when the option set is known inside one project, a `HashMap` config is awkward and explicit `Config` structs win. |
| **F4** Value of internal boundaries: "skillfully placed internal boundary helps" (2022) vs "anything else that looks like a boundary isn't" (2024) | **open** | In 2022 internal crate cuts fight erosion; in 2024 only hard external boundaries ("your system vs not your system") deserve up-front design, while in 2026 internal feature compartments serve contributor onboarding. |
| **F5** Identity-less syntax trees (`rowan`, 2018–2021) vs "might have been a mistake" (2023) / "rowan is garbage; list of arrays" (2026) | closed (self-reversal) | Criterion: **design for the 99% common case** (read-only analysis), not the 1% case (tree-mutating refactors). The lossless, layered *API* (untyped tree + typed AST wrappers, no semantic actions in the parser) stays; the pointer-heavy mutable storage is rejected. |
| **F6** No persistent caches in `rust-analyzer` (2020) vs read dependencies from `rustc`'s `.rmeta` files (2026) | closed (by common-case split) | In 2020 avoiding disk caches kept cold analysis fast for tens of MB of source; by 2026, loading 6,666 untouched dependencies into Salsa cost orders of magnitude too much RAM. Use precompiled `.rmeta` artifacts for untouched dependencies and Salsa only for edited code. |
| **F7** Adopt Salsa query engine across the IDE (2018–2020) vs "Against Query-Based Compilers" (2026) | closed (sharpening, not flip) | Queries were always presented as a third fallback when language semantics (Rust macros/traits) defeat per-file stubs and headers. Push queries as far down the pipeline as the language's dependency structure allows. |
| **F8** "Hourglass" geometry flip: hourglass cut is good (2022) vs "hourglass functions/modules are a smell; you need inverted hourglass" (2025) | closed (terminology trap) | Both passages state the exact same rule — **small interface relative to a large body (`volume ÷ surface area`)** — drawn along opposite axes (2022: system neck is narrow; 2025: top/bottom are inputs/outputs and middle is body). Use **cut ratio** or **thin waist** to avoid the flip. |
| **F9** `serde_json::from_reader` error type: flatten into `io::Error` vs nested `Result<Result<T, serde_json::Error>, io::Error>` | closed (within-post addendum) | Separate hardware/environment I/O failures from data-format bugs via nested `Result` rather than stuffing serialization bugs into `io::ErrorKind::InvalidData`. |
| **F10** Thread context everywhere (CSDI) vs store parent IDs (`ra #2325`) or stuff `Tracer` into `Storage` (`tb 3fab9811f`) | **open** | When explicit call-site threading turns into high-friction busywork across dozens of functions for little gain, he falls back to storing IDs or fields on the state struct. |
| **F11** What belongs in `std`: OS I/O services (2023) → cardinality / vocabulary types (2024) → social architecture (2026) | closed (dated evolution) | In 2024 he dropped "talks to the OS" as a criterion in favour of **cardinality** ("important that there's only one of a thing", e.g. vocabulary types and crypto RNG); in 2026 he framed stdlib quality as an organizational/social problem. |
| **F12** `stdx`: wrap upstream stdlib minimally and lazily (2023) vs vendor whole types (`PRNG`, `BoundedArray`, `Mutex`, 2025–2026) | closed | Driven by upstream Zig stdlib churn (`BoundedArray` removal) and aligning APIs with project style. |
| **F13** Open-set `dyn Diagnostic` trait at the base (`ra #1034`, 2019) vs closed diagnostic enum at the facade (`5c9f31d4c2`, 2021) | closed (self-reversal) | A trait defined at the bottom of the stack (`hir_expand`) that exists only to be consumed at the top (`ide`) inverts layering and forces compiling `ide` to test lower layers. |
| **F14** Enforce `Replica` ⊥ `Multiversion` with `anyopaque` (2024-08) vs explicit `VTable` interface (2025-09) | closed | The absence invariant held; `VTable` replaced raw `anyopaque` so state evolution is visible and `main` stays smaller without depending on concrete `Replica` types. |
| **F15** Explicit mutual exclusion (Kotlin-style belief) vs implicit single-thread exclusion (TigerBeetle practice) | **open** | He notes the contradiction (`on-async-mutexes:15-20`) and attributes it to paradigm (CSP vs state-machine actor over large shared state) without resolving a general rule. |
| **F16** Switch chalk mutex to `parking_lot` to avoid panic poisoning (`f89d34be6a`, 2019) vs switch to `std::Mutex` to catch unwind bugs (2020 post) | closed | When panics are used for cancellation, unlocking silently on panic leaves shared solver state corrupt; recoverable poisoning is required to notice mid-operation cancellation. |

## Hypotheses

Single-occurrence moves (`S = 1`) in the corpus. Each may seed a hypothesis that names its own falsifier; none may instruct as a general rule:
- **Kolmogorov's zero–one law of software engineering** (`perils-of-constructors:98`, one post, with an immediate JVM counter-case on line 102 where runtime checks beat static ceremony).
- **Thought experiment "imagine the compiler written in another language"** to spot hidden bootstrapping coupling (`rust-in-2021:98`).
- **Private all-fields record constructor plus named public factory functions** in OO languages (`perils-of-constructors:174`).
- **Trait-object lifetime hiding (`&'f mut (Trait + 'f)`)** — self-labelled "a hack" and "closer to code golf than to the practical approach" (`encapsulating-lifetime:332-405`).
- **When undecided between `tree.method(node)` and `node.method(tree)`**, defaulting to `tree.method(node)` because it scales to multiple node arguments (`zig-newtype:171-173`).

## Numbers

Every number carries its status (`norm`, `limit`, or `illustration`).

| Number | Status | Meaning in the corpus |
|---|---|---|
| 10k–200k LOC | limit | Scope where a short hand-maintained `ARCHITECTURE.md` pays off. |
| twice a year | norm | How often to revisit `ARCHITECTURE.md` rather than syncing it on every commit. |
| 10k–1M LOC | limit | Range where a flat `crates/*` workspace layout beats nested directories. |
| 60–70 lines per function / 100 columns | limit (screen) | Physical screen Schelling point (two side-by-side splits on a 16:9 monitor); TigerBeetle's strict 70-line rule is Joran Dirk Greef's (`TIGER_STYLE`), which matklad enforced via a `tidy` ratchet (`71–73` line red zone). |
| 10 or 10,000 lines per file | illustration | File length does not matter when a module is self-contained with a narrow interface. |
| 500 lines | limit (personal) | His personal complexity ceiling for hacky, project-specific tools (`git-review`, `getzig` at 512 lines). |
| 4 entry points (`run`, `test`, `fuzz`, `deploy`) | norm | Target top-level commands in an `O(1)` build file. |
| ~100 ms | norm | Interactive IDE response budget. |
| ~10 min CI (8 min in `rust-analyzer`); ~5 min compiler build | norm / illustration | Baseline CI and local build budgets for a ~200k-line Rust codebase (with ~1M lines of dependencies); build times bite past "several thousand lines". |
| 2 round-trips | norm | Target review cycle in contributor-optimizing ("review for coders") mode before merging and cleaning up in a follow-up. |
| 2 version numbers (`0.x`) | position | His view in *SemVer Is Not About You* that two components suffice for most libraries. |
| `1%` vs `99%` | criterion | Refactoring/editing vs read-only dependency analysis in an IDE (`F5`, `F6`). |
| `2x` to write a patch vs `10x` to find *where* | illustration | Unmeasured ratio motivating `ARCHITECTURE.md` and codemaps. |
| `90%` fluff and glue vs `10%` architecturally salient | illustration | Unmeasured ratio from *Role of Algorithms*. |
| `0.5` / `0.8` / `0.9` | scope / confidence | His explicit self-rated confidence levels on module-system ideas (`0.5`), duration bounds (`0.8`), and API churn (`0.9`). |

## Voices that are not the author's

Never attribute these to matklad:
- **Ted Kaminski (`docs/kaminski/`):** originated "the rules are different at the boundaries" (`S3`), "the single most important thing about any module is what modules it does not depend upon" (`S1`), and ADT vs data (`S6`). Under project rules Kaminski may only narrow or cut.
- **Joran Dirk Greef and TigerBeetle co-authors:** `docs/tigerbeetle/TIGER_STYLE.md` (70-line limit, static allocation founding rule, zero-dependencies policy, control-plane vs data-plane origin) is mostly Greef's text; TigerBeetle's VSR protocol-aware recovery and storage layout (`ARCHITECTURE.md`) are Greef's and colleagues' designs that matklad documented (`8b85a60f4`, `8e684cf5b`); `2025-02-27-why-we-designed…` is co-authored; `tb-pr-1607.md:41` and `tb-pr-1913.md:53` are **DJ (`sentientwaffle`)**; `tb-pr-1114.md:24,30,43,56` are **Phil Eaton (`eatonphil`)**.
- ** Edwin Cheng (`ra 504a54b222`, 2021-02-07):** wrote the `proc-macro` server-isolation invariant in `rust-analyzer` `architecture.md:285-287`.
- **Borrowed origins he credits:** **John Carmack** (pushing side effects into one top-level function; "the best tool for the job is often the tool you already use"); **Casey Muratori** ("semantic compression"); **Andrei Alexandrescu** (struct privacy); **Pieter Hintjens** (Optimistic Merging); **Andy Chu / Oil shell** ("thin waist"); **Graydon Hoare** (not-rocket-science rule); **Josh Triplett** ("midlayer mistake"); **Andrew Kelley** ("reserve first" and Zig newtype index); **Bryan Cantrill** ("control heaven and earth"); **Evan Martin / `neugierig`** (social issues outweigh architecture).

## This skill's own scaffolding, declared

- **The 6-concept spine (`S1`–`S6`) and the 5-step derivation order.** The concepts and tricks are his (and Kaminski's where tagged); assembling them into a fixed checklist is ours.
- **The `T-domain` vs `T-judgement` split** used to separate codebase facts from structural choices.
- **The output contract and the split across reference files.**

## Boundary and gaps

Say "the model does not reach here" when a task lands in any of these:
- **Multi-service distributed systems and modern cloud (`E1-S1`, `E3-63`):** "I don't have much experience building these kind of systems" (`Kafka-vs-Nabokov:44`); "I am not well-versed in cloud things" (`ci-dream:11`); unfamiliar with Kubernetes (`building-systems:@22459`).
- **Designing concurrent code:** "I am struggling with designing concurrent code" (`concurrent-expression-problem:3`); native thread cancellation has no known good approach (`exceptions-in-structured-concurrency:187-188`).
- **Conditional compilation and module systems (`E1-S2`):** "I don't know how to design such conditional compilation system" (confidence `0.5`, `notes-on-module-system:148-180`).
- **Dynamic file watching and build-system-to-IDE project lowering (`E2-50`, `E5-23`):** native file-watcher APIs were racy, and lowering `cargo metadata` into `CrateGraph` stayed fiddly and unresolved.
- **"Midpoint" application error handling (`E1-S5`):** between tiny error-code enums and opaque boundary reporting, mid-scale application error handling "is poorly served by either extreme" and "still feels like a research area" (`second-error-model-convergence:101, 145`).
