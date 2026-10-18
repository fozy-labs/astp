---
name: testing
description: >-
  Decide what to test, where to place the test boundary, how to shape tests as data, how to
  choose between self-updating snapshots and seed-driven generative testing, how to keep a
  suite fast and flake-free on the merge gate, and where the model stops on I/O and service
  code. Use when adding or refactoring tests, designing a test harness or a fuzzer, reviewing
  a brittle or slow test suite, replacing mocks of internal code, or setting up CI checks and
  ratchets. Not for deciding software module boundaries themselves (that is
  software-architecture), judging third-party benchmark claims (that is analysis), or SQL,
  migration and message-broker fault semantics where the model declares a gap.
license: MIT
---

# testing

## Contents

- [Where this comes from](#where-this-comes-from)
- [What this skill refuses to be](#what-this-skill-refuses-to-be)
- [The six core concepts](#the-six-core-concepts)
- [How a decision is derived](#how-a-decision-is-derived)
- [By job](#by-job)
- [Cross-skill ownership](#cross-skill-ownership)
- [Output contract](#output-contract)
- [Reference index](#reference-index)

## Where this comes from

This skill is one reconstructed reasoning model, not a general testing handbook. It was rebuilt from Alex Kladov's (matklad's) essays (2017–2026), rust-analyzer and TigerBeetle architecture and style documents, pull-request discussions, forum threads and live streams. He did not take part, review or endorse it. A kill test on 10 of his own testing decisions (56 turning points) found 25 concept-carried steps (24 in the contemporaneous record, 20 published before the decision; 51% of strategy turning points) and 25 tacit steps: his concepts carry the *shape* of a test, while worth/budget and domain fault models are tacit. A transfer test across four service and CLI scenarios scored 33 decided, 22 partial, 3 gaps. Extraction produced 158 moves (93 in practice, 34 in later retellings, 31 in exposition only; 32 single-source), 28 forks (17 closed by his stated criterion, 11 open) and 6 core concepts covering 112 moves.

Before you state a number, attribute a phrase, touch an open fork or a single-source hypothesis, or answer where this comes from, load [references/limits.md](references/limits.md).

## What this skill refuses to be

- **A test-budget calculator.** None of the six core concepts decides whether a test is worth its cost or when to stop fuzzing; in his own work those calls are tacit or trial and error ([limits](references/limits.md#boundary-and-gaps)). Only the direction holds: the testing bar follows the cost of failure.
- **A source of domain oracles or fault models.** The model gives the form of an oracle (assertions in the code, a reference model, two independent computations), not the domain invariants or storage/network fault physics.
- **A doctrine for external services, databases and queues.** He states that his background is compilers and deterministic systems and that he does not know how best to test HTTP applications built around inter-process communication. The model decides our side of an I/O boundary and stops at the external system's behaviour ([suite](references/suite.md#service-and-io-boundaries)).
- **An authority.** Never cite this skill or its author against a person. Argue from the refactor cost, the purity step, or the failure mode of the test in front of you.

## The six core concepts

The six concepts are his; grouping them as six orthogonal axes and assigning moves to them is this skill's scaffolding ([limits](references/limits.md#this-skills-own-scaffolding-declared)).

**K1. Stable boundary**: a test suite is worth what it lets you change.
- Bind tests to features at a stable boundary — the public API when the API is the product, or what a human sees for an application — not to internal functions or classes.
- Operational test (the **neural network test**): could you reuse the suite if the implementation were replaced with an opaque neural network? Tests that call internal APIs directly are a liability that blocks refactoring.

**K2. Test as data**: one `check` function, input and expected output as plain data, output as a self-updating text snapshot.
- Encapsulate the API under test in a single `check(input, expected)` helper so each test body is one call and all variation sits in the input data.
- Serialize the output to text and compare it against an inline or file snapshot that updates in place on mismatch (`expect` style), keeping the snapshot a first-class value rather than a macro.

**K3. Purity × extent**: cost comes from impurity, and test speed is categorical.
- Classify tests by **purity** (how much generalized I/O, threads, clocks or child processes they touch) and **extent** (how much code they exercise), not as "unit vs integration" ([glossary](references/glossary.md#homonym-traps)).
- Ruthlessly push purity down: let the caller do I/O and the callee compute (sans-I/O), and pass time (`now` / `tick`) and randomness in as plain values. Leave extent natural while keeping each test focused.

**K4. Inputs are entropy**: once a test is data, generate it from a finite random byte stream so the seed is the input.
- Treat a fuzzer or property test as a deterministic function of a finite PRNG byte stream (`u64` seed encoding length and RNG seed). Replay, entropy-length minimization, exhaustive small-input enumeration and swarm testing (randomizing the operation mix per run) all act on that byte stream.

**K5. Verdict from assertions**: "does not crash" is as strong as the assertions in the code; otherwise compare against a model or a second computation.
- Pair generative inputs with dense invariants asserted in production code (paired at call and definition sites, positive implications `if (a) assert(b)`), an exact simpler reference model, or two independent computations of the same result. Co-design a reliable system and its test harness so it has an oracle.

**K6. Commit-checked property**: a test is any program that checks a property of the repository at a commit, and `main` advances only to commits whose checks already passed.
- Run lint, tidy, formatting, codegen freshness, architecture-invariant checks and benchmark smoke runs from the normal test command.
- Enforce the **not rocket science rule** (NRSR): gate `main` on a fast, deterministic suite; gate unavoidable slow tests behind an environment variable locally while running them on CI; run unbounded fuzzing continuously as level-triggered state (commit × seed) outside the merge gate.

## How a decision is derived

The ordering below is this skill's construction ([limits](references/limits.md#this-skills-own-scaffolding-declared)); his only stated ordering rule inside it is step 3 ("If I can't fuzz, I write a snapshot test").

1. **Place the cut (K1).** Name the feature and the outermost stable boundary where its effect is visible. Refuse tests that pin internal signatures unless that API is the shipped product.
2. **Strip impurity (K3).** Push I/O, clocks and randomness to the caller so the test runs in-memory on one thread. Where real processes or I/O are part of what is tested, embrace them, join pending work explicitly instead of sleeping, and gate slow runs ([suite](references/suite.md#purity-and-suite-speed)).
3. **Choose the form (K2, K4, K5).** When the space of valid inputs or operations can be generated and an assertion, model or differential oracle exists, write a seed-driven generative test (or enumerate all small inputs). Otherwise, write a single `check` function with a self-updating text snapshot and a couple of magic smoke examples ([shape](references/shape.md), [generative](references/generative.md)).
4. **Place in the loop (K6).** Fast, deterministic checks enter the default test command and the merge gate. Unbounded generative runs go to a continuous level-triggered runner, and any escaped bug first becomes a fix to the generator or oracle before a regression test is added.

Steps 2 and 4 require a worth/budget judgement that the core does not supply: weigh it against the cost of failure and state that call as yours.

## By job

| Job | Where to go |
|---|---|
| Designing `check` helpers, fixtures, snapshots, redactions or coverage marks | [references/shape.md](references/shape.md) |
| Writing a fuzzer, property test, oracle, minimizer or deterministic simulation | [references/generative.md](references/generative.md) |
| Speeding up a suite, organizing Cargo/process tests, setting up CI gates, ratchets, or testing service/I/O code | [references/suite.md](references/suite.md) |
| Checking a number, a fork, a single-source hypothesis, an attribution, or a scope limit | [references/limits.md](references/limits.md) |
| Unpacking a term (`unit test`, `purity`, `check`, `coverage marks`, `level-triggered`, `swarm`) | [references/glossary.md](references/glossary.md) |

## Cross-skill ownership

This skill shares its source author with `software-architecture`. Each shared concept has one home:
- **Owned by `software-architecture` (named here, derived there):** boundary kinds, boundary cost, narrow cut and cut ratio; architecture invariants as absences and physical enforcement against erosion.
- **Owned by `testing`:** purity × extent; tests through a stable `check` function and self-updating snapshots; generative testing, minimization, swarm and deterministic simulation; assertions as checked properties in code; Cargo test-binary layout; benchmarks as tests; time passed as data (`now` / `tick`); coverage marks through logging; stacking verification layers; manual QA checklists and release trains where automated tests cannot reach.
- **Shared with `analysis`:** reading the entire subsystem against your mental model before running the fuzzer ([generative](references/generative.md#debugging-and-escaped-bugs)).

## Output contract

Every testing decision or review verdict states:

1. **Feature and boundary (K1):** what user-visible feature or public contract is tested, and why this boundary survives internal refactoring.
2. **Purity and extent (K3):** which rung of the purity ladder the test sits on, which impurities (I/O, time, RNG) were pushed out, and why any remaining I/O cannot be isolated.
3. **Form and oracle (K2 / K4 / K5):** whether the test is `check` + snapshot, exhaustive small-input enumeration, or seed-driven generation, and what serves as the oracle.
4. **Gate placement (K6):** default local + CI gate, CI-only slow suite, ratchet with an allowlist, or level-triggered continuous fuzzing.
5. **Open forks and worth calls:** any open fork touched ([limits](references/limits.md#forks)) with both branches named, and any worth/budget or external-service choice marked as your call rather than the model's.
6. **Standing of numbers and hypotheses:** every number tagged as `norm`, `limit` or `illustration`, and any single-source move marked as a hypothesis with its falsifier.

## Reference index

Load a reference file when its condition fires, never preventively.

| Load this file | At this moment |
|---|---|
| [references/shape.md](references/shape.md) | Designing or reviewing test helpers (`check`), fixtures, snapshot/expect tests, redactions, inline tests, or coverage marks. |
| [references/generative.md](references/generative.md) | Designing or reviewing fuzzers, property tests, PRNG generators, minimization, assertions/oracles, or deterministic simulation. |
| [references/suite.md](references/suite.md) | Optimizing suite or compile speed, organizing test binaries, setting up NRSR gates, ratchets, benchmarks-as-tests, or testing I/O and service boundaries. |
| [references/limits.md](references/limits.md) | Before stating a number, attributing a quote, closing or touching a fork, using a single-source hypothesis, or answering where the model stops. |
| [references/glossary.md](references/glossary.md) | When a term from this skill or from matklad's corpus is used or met. |
