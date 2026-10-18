---
name: software-architecture
description: >-
  Decide software structure, module and package boundaries, dependency direction, where I/O,
  allocation, branching and error handling live, when an abstraction or internal boundary pays
  its cost, and how to document and physically enforce architectural invariants. Use when
  splitting or merging modules or crates, designing an API or facade, untangling circular or
  heavy dependencies, isolating platform or serialization code, reviewing structural PRs, or
  writing ARCHITECTURE.md. Not for choosing how to test a boundary or fuzz a subsystem (that
  is testing), judging empirical benchmark claims (that is analysis), or visual/UI layout
  decisions (that is design-derivation).
license: MIT
---

# software-architecture

## Contents

- [Where this comes from](#where-this-comes-from)
- [What this skill refuses to be](#what-this-skill-refuses-to-be)
- [The six-concept spine](#the-six-concept-spine)
- [How a decision is derived](#how-a-decision-is-derived)
- [By job](#by-job)
- [Cross-skill ownership](#cross-skill-ownership)
- [Output contract](#output-contract)
- [Reference index](#reference-index)

## Where this comes from

This skill encodes one reconstructed reasoning model, not a textbook survey of architecture patterns. It was rebuilt from Alex Kladov's (matklad's) essays (2017–2026), his `rust-analyzer` and TigerBeetle architecture and style documents, commit messages, pull-request reviews and lecture transcripts. Ted Kaminski's essays and other TigerBeetle authors' texts (`TIGER_STYLE.md`) enter only to tag origins or narrow scope. None of the authors took part, reviewed or endorsed this skill.

A two-part kill test on 10 of his own structural decisions in `rust-analyzer` and TigerBeetle (48 turning points: 12 contemporaneous concept steps, 4 retold concept steps, 25 tacit steps, 7 external) found that his concepts carry **who may know whom** (absence invariants, boundary stakes, physical enforcement, and pushing I/O and branching to the edge), while **domain facts** carry the internal data structures and algorithms. When domain facts that an agent reads from the repository (`T-domain`, 13 steps) are separated from open structural judgement (`T-judgement`, 12 steps), the concept spine carries 57% of the structural choices (16 of 28), and the rest of his repertoire operates as a bag of named tricks with explicit signing contexts ([tricks](references/tricks.md)). Extraction across 5 corpus slices produced 227 raw moves consolidated into the spine below, the named tricks table, 16 forks/reversals, and explicit `domain-input` and `scope-limit` registers ([limits](references/limits.md)).

Before you state a number, attribute a phrase, close an open fork, or answer where this model stops, load [references/limits.md](references/limits.md).

## What this skill refuses to be

- **A substitute for reading the codebase's domain facts.** The spine decides *where* to cut and *who may know whom*; what the parts are (data layout, protocol wire rules, compiler or storage mechanics, frequency of the common case) comes from the domain. Before proposing a cut, collect the domain inputs listed in [limits](references/limits.md#domain-inputs-the-codebase-must-supply).
- **A mandate to pile up internal boundaries.** Boundaries have a high cost: they prevent changes. Inside one compilation unit (closed world), fine-grained visibility and defensive layers are waste.
- **Unconditional rules.** In his own words, his knowledge is "a bag of tricks, where the tricks are named … points both to the actual trick (code to type), as well as a justification for it (in what context that would be a good trick to use)", and a rule of thumb is "an attention trigger" and "a concise summary of the arguments that motivate the rule". Every trick in [references/tricks.md](references/tricks.md) carries when it is signed and when it is wrong.
- **Multi-service or cloud topology doctrine.** He states that he has little experience building multi-service systems or modern cloud infrastructure ([limits](references/limits.md#boundary-and-gaps)).
- **An authority.** Never cite this skill or its author against a person. Argue from who controls both sides of the boundary, what changes in one commit, or what the compiler enforces.

## The six-concept spine

Concepts `S1` and `S3` restate Ted Kaminski with matklad's operational additions; `S2`, `S4`, `S5` and `S6` are his. Grouping them into six axes and ordering them into a procedure is this skill's scaffolding ([limits](references/limits.md#this-skills-own-scaffolding-declared)).

**S1. Who may know whom (invariants as absences)** `[contemporaneous in commits from 2018-12; doc heading 2020-06]`:
- Define each component by what it **does not depend on or know** (`base-db` knows no filesystem or paths; `syntax` knows no Salsa or LSP; only the outer binary knows LSP and JSON serialization; the event loop has no allocator).
- Because an absence is invisible when reading local code, write these down as explicit **Architecture Invariants** in `ARCHITECTURE.md` and cite them in later reviews and commits.
- Put glue that connects two otherwise independent components into a leaf crate or an explicit **kitchen sink** module (`shortcuts`, `stdx`) so the two components never import each other.

**S2. Effects and decisions at the edge, pure core** `[contemporaneous from 2018-08]`:
- Push I/O, OS calls, environment (`cwd`, env vars, `stdout`), memory/resource allocation (`hard mode` / static allocation at startup) and error reporting out to `main` or the caller (`sans-IO`).
- **Push `if`s up and `for`s down:** centralize preconditions and control-flow branching in one top-level function and encode proven preconditions in callee types; make the work below straight-line and operate on batches (`O(1)` control plane over `O(N)` data plane).
- Make the core infallible on bad user input — return `(T, Vec<Error>)` rather than aborting — and distinguish expected domain outcomes from genuine environment/I/O errors (`Result<Result<T, DomainErr>, IoErr>`) and from program bugs (panics/assertions, caught only at a failure-isolation boundary).

**S3. Boundary stakes (closed world vs open world)** `[restates Kaminski; review classes contemporaneous 2020-06]`:
- For every interface, ask: **can one commit change both sides?**
  - **Open world** (public library API, IPC/wire protocol, serialized formats, CLI flags after first user): high cost to change. Design carefully, minimize surface area, keep serialization in leaf crates, and lean on existing stability guarantees instead of inventing your own.
  - **Closed world** (inside one compilation unit or application repo): refactoring is cheap. Skip `pub(super)` / `pub(in path)` ceremony, getters/setters, and speculative interfaces.
- Scale code-review scrutiny to three change classes: (1) internals of one component (merge once happy path works, tests pass, unhappy path doesn't panic), (2) new `pub` API on a boundary (heavy iteration; split into its own PR), (3) new dependency edge in the build graph (rare, architectural scrutiny).

**S4. Physical reification against erosion** `[lecture 2019-03; contemporaneous in commits 2020-11 / 2024-08]`:
- By **Kolmogorov's zero–one law of software engineering**, in a large codebase every pattern not statically rejected by the toolchain eventually exists, and informal "almost rules" ("module A shall not import module B") crumble under feature pressure.
- If a cut must hold across time or contributors, reify it physically: a separate crate/package edge, a capability withheld from the function signature (no allocator or `Io` handle passed in), type erasure (`anyopaque` / `VTable`), `-Dunreachable_pub`, or a repository `tidy` ratchet check. Inside a single module, privacy plus local convention suffices.

**S5. Locality and the narrow cut** `[contemporaneous in guide 2019-01; retold in essays 2021–2026]`:
- **Modularity is locality** ("what happens inside a function, stays inside the function"): partition code so the most frequent change (editing a function body, a single file, or one feature) stays inside one component behind an interface it does not invalidate. Parallelism, incrementality and error resilience are three faces of that one cut; prefer **laziness** (skipping work altogether) over fine-grained incremental query tracking.
- **Cut ratio (`volume ÷ surface area`, thin waist):** extract a module or data structure when its implementation volume is large relative to its interface, whether it is 10 or 10,000 lines long ([fork F8](references/limits.md#forks-and-reversals)). Phrase the outermost internal boundary in the consumer's presentation vocabulary (plain data), and give producer and consumer separate constructs across the "thin film" rather than coupling them on one giant enum.

**S6. Concrete abstraction and binary privacy** `[contemporaneous 2020-05 / 2020-08]`:
- **Concrete Abstraction smell:** if every call site `x.blag()` uses a known concrete type rather than an unmonomorphized type parameter `T`, delete the trait/generic and write concrete functions. At crate edges, wrap a monomorphic `_impl` in a thin generic shell so compile times do not explode across downstream crates.
- **Binary Privacy:** a type is either plain data (all fields `pub`, no getters/setters) or an abstract data type guarding a local invariant (all fields private, mutated only inside its module). Never mix the two.

## How a decision is derived

The step order below is this skill's construction ([limits](references/limits.md#this-skills-own-scaffolding-declared)):

1. **Gather domain inputs first ([limits](references/limits.md#domain-inputs-the-codebase-must-supply)).** Identify the 99% common case vs the 1% rare case, data sizes, failure/availability posture (Erlang-style fault-isolated features vs SQLite/TigerBeetle-style total determinism), and language/build-graph constraints.
2. **Classify each interface by S3 (open vs closed world).** Spend design budget on hard external/IPC boundaries and crate edges; strip ceremony inside a compilation unit.
3. **Place cuts by S2 and S5.** Isolate OS/platform I/O, allocation and serialization at the outer leaf/shell (`main`, VFS, `MessageBus`); cut around the most frequent change so it stays local behind a narrow, consumer-vocabulary interface.
4. **Orient dependencies by S1 and enforce by S4.** Write down "X does not know Y" invariants; put cross-cutting glue in a leaf or kitchen-sink module; physically reify any cut that feature pressure would erode (crate edge, withheld capability, `tidy` check).
5. **Trim inside components by S6 and select named tricks.** Apply Binary Privacy, eliminate Concrete Abstractions, and check [references/tricks.md](references/tricks.md) for the specific code-level or build-level trick and its counter-case.

## By job

| Job | Where to go |
|---|---|
| Applying a named code, API, control-flow, error or build trick (with its `signed when` / `wrong when` conditions) | [references/tricks.md](references/tricks.md) |
| Designing module/crate boundaries, `ARCHITECTURE.md`, workspace layout, dependencies, or incremental/compiler/isolated systems | [references/boundaries-and-systems.md](references/boundaries-and-systems.md) |
| Checking domain inputs, dated reversals/forks, numbers, foreign voices or scope limits | [references/limits.md](references/limits.md) |
| Unpacking a term (`Architecture Invariant`, `thin waist`, `thin film`, `kitchen sink`, `binary privacy`, `early cutoff shield`) | [references/glossary.md](references/glossary.md) |

## Cross-skill ownership

- **Owned by `software-architecture`:** boundary kinds (external vs internal, closed vs open world), boundary cost, narrow cut, cut ratio (`volume ÷ interface`); architecture invariants as absences, physical enforcement, erosion ("almost rules"); `ARCHITECTURE.md` and codemap; dependency structure bounding independent change, coarse independent chunks; org chart vs deployment topology (`Kafka vs Nabokov`).
- **Owned by `testing` (named here, derived there):** purity × extent of a test; tests through a stable `check` function and snapshots; generative testing, minimization, swarm and deterministic simulation; assertions as checked runtime properties; Cargo test-binary layout (`tests/it/main.rs`).

## Output contract

Every architectural proposal or review verdict states:

1. **Domain inputs read:** the common-case frequency, data/workload bounds, and reliability posture read from the repository before drawing cuts.
2. **Boundary stakes (S3):** for each touched interface, whether one commit changes both sides (closed vs open world) and its review class.
3. **Absence invariants (S1) and enforcement (S4):** what each component must *not* know (`X does not know Y`) and what physical mechanism (crate edge, withheld parameter, type erasure, `tidy` check, or module privacy) enforces it.
4. **Effects and locality (S2, S5):** where I/O, allocation, environment and branching live, how frequent changes are stopped from propagating, and why the cut is narrow relative to the volume behind it.
5. **Signed tricks and forks:** for any trick used from [references/tricks.md](references/tricks.md), why its `signed when` condition holds and its `wrong when` condition does not; for any open fork in [references/limits.md](references/limits.md#forks-and-reversals), both branches named.
6. **Status of numbers and scope limits:** every number tagged as `norm`, `limit` or `illustration`, and any area where the model declares a scope limit stated plainly.

## Reference index

Load a reference file when its condition fires, never preventively.

| Load this file | At this moment |
|---|---|
| [references/tricks.md](references/tricks.md) | Choosing or reviewing a specific code, API, control-flow, error-handling, type or build/CI pattern. |
| [references/boundaries-and-systems.md](references/boundaries-and-systems.md) | Structuring crates/modules, writing `ARCHITECTURE.md`, managing dependencies/vendoring, designing incremental pipelines, or setting failure-isolation posture. |
| [references/limits.md](references/limits.md) | Before proposing a cut (to check required domain inputs), stating a number, attributing a quote, touching a fork/reversal, or working on multi-service/concurrent code. |
| [references/glossary.md](references/glossary.md) | When a term from this skill or from matklad's corpus is used or met. |
