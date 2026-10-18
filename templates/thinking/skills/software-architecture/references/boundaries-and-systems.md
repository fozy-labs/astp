# Boundaries, Dependencies, Incremental Systems and Failure Isolation

> Loaded when: Structuring crates/modules, writing `ARCHITECTURE.md`, managing dependencies/vendoring, designing incremental pipelines, or setting failure-isolation posture.

## Contents

- [Drawing and reviewing boundaries](#drawing-and-reviewing-boundaries)
- [External dependencies and build graph](#external-dependencies-and-build-graph)
- [Incremental and compiler systems](#incremental-and-compiler-systems)
- [Failure and quality isolation](#failure-and-quality-isolation)

## Drawing and reviewing boundaries

- **Start from who can change both sides.** Before introducing an interface, trait, serialization format or package split, ask whether all callers live in the same repository and compilation unit.
  - **External / IPC / persisted boundary:** changing it breaks users or requires a migration. Keep the surface narrow ("measure zero"), phrase it in the consumer's domain, avoid exposing internal representation types, and require explicit opt-in before a feature becomes de facto stable (by the time a feature has its first user, it is already stable).
  - **Internal boundary under feature pressure:** only split into separate crates or packages when you need the build system to enforce an **absence invariant** ("`syntax` must never import `hir` or `lsp`") or to parallelize/cache compilation.
  - **Inside one crate/module:** keep visibility flat (`pub(crate)` or `pub` inside an internal crate with `-Dunreachable_pub`), use plain data structs with public fields, and move code to the layer whose vocabulary it speaks.
- **Give producer and consumer their own shapes across the thin film.** Default language features tempt you to share one construct (such as a single giant error enum or a shared AST node) across an interface. When producer and consumer have different needs, decouple them: let the producer call constructor functions on a sink or emit an event stream, and let the consumer build its own representation.
- **Provide a facade that makes derived data look precomputed.** Even when internal crates (`hir-*`) use arena indices, ECS tables and on-demand queries, expose a high-level facade (`hir`) that looks to feature authors like an inert, object-oriented, frozen snapshot where all types and resolutions are already available.
- **Separate code motion from logic changes.** When refactoring module boundaries or inlining a component, land pure file/function moves as their own commit first, then change the logic in a follow-up commit so the diff is readable and bisectable.

## External dependencies and build graph

- **Shape the crate graph as a fan, not a deep spine:**
  1. A small **common vocabulary** layer at the bottom (`stdx`, `text-size`, core IDs) with zero heavy dependencies.
  2. Wide, **independent feature/subsystem crates** in the middle that do not know about each other and expose non-generic interfaces.
  3. A **leaf crate** (`main` / server binary) at the top that ties the subsystems together and owns CLI, IPC and serialization (`serde`).
- **Apply the bootstrap test to tool dependencies.** A build or automation dependency on something the developer already needed to get the repository (`git`, POSIX `sh` on Unix, the language's own compiler binary) is free. Every other tool the build system must fetch and pin itself (`zig fetch`, vendored binary, or an `xtask` written in the project's language) so `git clone` + one build command always works.
- **Keep build/automation helpers independent of the product in both directions.** The product binary must never depend on build tools (`xtask`), and build scripts (`build.zig` / `xtask`) must not import the whole product crate graph — otherwise every edit to product code recompiles the build script first ("we avoid bootstrapping").
- **Identify dependencies by content checksum first.** A dependency's primary identity is its cryptographic hash; location, name and version (a rule for when two versions can be unified) sit on top. Including direct dependency hashes in each manifest forms a distributed lockfile.
- **Own a dependency if you must know how it uses *its* dependencies.** A dependency pays for itself only while its internals stay a black box. When upstream churn, transitive bloat or leaky abstractions force you to track its internals, replace or vendor the slice you actually use into `stdx`.
- **Depend on external platforms only for fundamental complexity.** Rent what you cannot build in a few hundred lines of code (such as a heterogeneous multi-OS runner fleet), and write the accidental orchestration logic as an ordinary program in your own repository.

## Incremental and compiler systems

- **Check the input's dependency structure before picking an incremental architecture.** Update work can never be smaller than the change in the output (`O(1)` edit → `O(1)` update only when the language or domain makes changes local).
- **Prefer laziness (skipping work) over fine-grained incrementality:**
  1. **Coarse independent chunks (map-reduce):** if the domain allows cutting work into chunks independent by definition (such as per-line lexing, per-function body checking when signatures are explicit, or precompiled `.rmeta` artifacts for the 99% of dependency code the user never edits), process chunks in parallel and skip unchanged ones without a query graph.
  2. **Per-file dumb indexes + from-scratch smart caches:** for languages with fully qualified names, index each file in isolation into a lightweight stub (unresolved names) and recompute local type caches from scratch on demand.
  3. **Header snapshots:** where declaration-before-use holds, snapshot batch-compiler state after imports.
  4. **Generic query engine (Salsa) as the fallback:** use fine-grained query tracking only where language semantics (such as macros or trait coherence across files) defeat coarse cuts. Keep every query strictly pure, run untrusted/non-deterministic extensions (proc-macros) in a separate killable process, and guard semantic queries with **early cutoff shields**, **source-map pairs** and **durability levels** (stdlib vs dependencies vs user code) ([tricks](tricks.md#modules-crates-and-boundaries)).

## Failure and quality isolation

- **Pick the reliability posture from the domain before drawing components:**
  - **Availability-first ("Erlang style", e.g. an IDE):** design around having bugs. Keep shared state immutable (snapshots), isolate each user-facing feature in its own module guarded by `catch_unwind` at the request boundary, and keep a high review bar on the core **spine** while keeping a low, welcoming bar on isolated **features** ("review for coders" — merge after ~2 round-trips and clean up in a follow-up).
  - **Correctness-first ("SQLite / TigerBeetle style", e.g. a financial database):** build from deterministic, statically bounded components in a single thread; treat any unexpected condition as a fatal assertion failure; do not hide storage or consensus faults behind leaky black-box abstractions when recovery requires cross-layer cooperation ([limits](limits.md#domain-inputs-the-codebase-must-supply)).
- **Turn panics into values only at a failure-isolation boundary.** Bugs in the program panic/assert by default; only where a synchronization point is also an explicit isolation boundary (such as a thread pool or request supervisor) should a panic be caught via an opt-in, verbose call (`catching_join`).
- **Keep code structure aligned with the org chart, not deployment topology (`Kafka vs Nabokov`).** When a single team owns three services, put all three into one repository and one multicall binary (`app foo`, `app bar`, `app baz`) so internal interfaces remain cheap function calls; introduce process/RPC boundaries across internal cuts only when multi-team scale requires physical isolation ([fork F2](limits.md#forks-and-reversals)).
