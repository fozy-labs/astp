---
name: software-architecture
description: >-
  Decide the structure of software when writing or changing code in a real repository:
  where a boundary goes and how much care it deserves, who may know whom (invariants
  stated as absences, and how to enforce them), where I/O, the clock, allocation, errors
  and branching live, how large a module, function or crate should be against its
  interface, and what to depend on or own (libraries, build, CI, automation). Use when
  adding a module, crate, layer or dependency, splitting or merging code, when one change
  keeps breaking unrelated parts, when I/O sits deep inside logic, when reviewing a design
  or an ARCHITECTURE file, or when shaping the build and CI. Runs a gated procedure from
  one reconstructed model (Alex Kladov's practice). Not for: the content of a decision
  (data structures, algorithms, domain facts); how to test (testing); splitting a system
  into services, HTTP or cloud design; pattern catalogues.
license: MIT
---

# software-architecture

## Where this comes from

This skill is one reconstructed reasoning model, not a body of architecture knowledge. It was rebuilt from the design practice of Alex Kladov (matklad) in rust-analyzer and TigerBeetle: his blog (206 posts, 2017–2026), rust-analyzer's design documents, style guide and blog, TigerBeetle's documents, blog and pull requests, 215 commits checked in both repositories, streams and talks. He did not take part in it, review it or endorse it. An adversarial verification pass checked 234 extracted moves against that corpus: 82 held as stated, 56 held only in a narrower scope, 91 rest on a single occurrence and are quarantined as [hypotheses](references/limits.md#hypotheses), 5 were cut (3 another person's, 1 inverted, 1 absent). Of seven proposed concepts five survived; of 69 named tricks, 47 instruct here ([arithmetic](references/limits.md#verification-arithmetic)).

His concepts carry the *direction* of a structural decision: on records written at decision time they carried 12 of 28 non-domain steps of ten of his decisions. They do not carry its content: see [what the concepts do not carry](#what-the-concepts-do-not-carry).

Before you state a number, attribute a phrase, close a fork, or answer where this comes from, load `references/limits.md`.

## What this skill refuses to be

- **A catalogue.** No layered-architecture template, no list of principles, no pattern names to apply. He describes his own knowledge as "a bag of tricks, where the tricks are named", each with "in what context that would be a good trick to use". Every trick is [unsigned](#no-trick-is-signed) until its context signs it; a remembered pattern is the signal that a gate was skipped.
- **The content of a decision.** See [what the concepts do not carry](#what-the-concepts-do-not-carry).
- **A model of multi-service systems.** See [the line](#the-line-services-he-has-not-built).
- **A theory of testing.** Where tests go, what they bind to, and the merge gate belong to the `testing` skill. This skill names a test only as the carrier of an invariant.
- **An authority.** Never cite this skill or him against a person. Argue from the gate you ran.

## Five concepts

Each answers a different question about a structure. They are distinct, not orthogonal: the edge's core invariant is itself an absence ("Analyzer does not do any I/O."), but where effects go is a separate rule.

1. **Absence** — what must this component not know? "Often, important invariants are expressed as an _absence_ of something, and it's pretty hard to divine that from reading the code." His commits state such absences from 2018 ("File module source does not depend on syntax") to 2025. The enforcement step belongs to it: internal boundaries "seem to crumble under the pressure of feature requests, unless the boundary in question is physically reified", because "It's very hard to notice that something is _not_ being done!" The dependency half ("what modules it does not depend upon") is Ted Kaminski's; the absence as an invariant that the code cannot show is Kladov's.
2. **Edge** — where do I/O, the clock, the environment, allocation, failure and branching live? At the caller, `main` or the event loop; the core takes its input as data. "Analyzer does not do any I/O. It starts in an empty state and all input data is provided via `apply_change` API." (rust-analyzer guide, 2019); "Push IO and error handling up" (commit, 2020); a "sans-io ReceiveBuffer" (TigerBeetle, 2025). TigerBeetle's static allocation and I/O-free transaction core are Joran Dirk Greef's design; Kladov's part is named in [limits](references/limits.md#voices-that-are-not-his).
3. **Control** — how much care does this interface deserve? "Figure out hard system boundaries between “your system” and “not your system”, and do design those carefully. Anything else that looks like a boundary isn't. It is useful to spend some effort designing those things as well, but it's more important to make sure that you can easily change them." His test is control of the other side: "You often don't control the other side of this boundary, so changing serializable types is hard." The principle restates Kaminski; the additions are his ([limits](references/limits.md#voices-that-are-not-his)).
4. **Ratio** — is this cut worth having? "you want to optimize the _ratio_ of module size to its interface. You need to divide the volume by the surface area. It's not about the size, it's about the shape!" Ousterhout's deep modules say the same of modules; he read the book and found it "good … But they weren't ground breaking for me." His difference: one ratio judges files, functions and dependencies alike; "cut through the glue, and get straight to the algorithmic core"; and fold a split back when "the impl is a tiny fraction of API anyway" (rust-analyzer, 2019).
5. **Rent** — what may the project depend on? "try to understand which parts of a problem are fundamental and which are accidental". Rent the fundamental part from a platform or tool, own the accidental part. Installing Python on three operating systems "is also part of the fundamental complexity here and Again here we are happy to use dependency"; scripting a runtime install that the runtime's vendor does not provide would be "taking onto us some else's maintainance burden".

## The procedure

The gate order is this skill's scaffolding, not a protocol he follows. Look at anything first; commit to no structure until the gates above it have a written answer.

**Gate 1: Control.** List every interface the change touches and who controls its other side. Not you: a published library's API, a serialized type (an IPC boundary), a protocol whose other end someone else implements. Design those for stability and plan the upgrade: "Solid upgrade strategy for deployment trumps any design which seems perfect at a given moment in time." Keep everything else cheap to change. Visibility matters at the compilation-unit edge: "you have either closed world (all usages are known) or open world (usages are not-knowable)". rust-analyzer's review rule scales scrutiny by the boundary a change touches and splits API changes into their own pull request ([scope](references/limits.md#narrowed-the-scope-that-binds)). Tricks: [control](references/tricks.md#control).

**Gate 2: Edge.** List every I/O, clock read, environment or working-directory read, allocation, fallible call and branch on outside state. Move each to the caller, `main` or the event loop; pass in what it produced. Separate genuine I/O failure from expected outcomes: "Hitting an io::Error is a legit problem. Finding more than one Cargo.toml is not." Give the code that talks to the OS its own component. When outside I/O delivers events, several are ready at once: take them all, then prioritize ("always be batching"). Keep the join: an API that spawns work with no handle loses causality, and "Broken once, causality link is not reforgable by a layer above." An error's destination decides its type: handled, a small closed set of codes; reported, rendered at an isolation boundary ("If you know the ultimate destination up front, it usually is simpler to render the error immediately."). Tricks: [edge](references/tricks.md#edge), [concurrency and failure](references/tricks.md#concurrency-and-failure).

**Gate 3: Absence.** For each component, write what it must not know or depend on, in that form: "`hir` should know nothing about URLs, markdown and html." Move code to the layer whose vocabulary it uses: "auto-import is purely an IDE concern, so it should be done outside of HIR". Record the absences where the next reader looks: for a project of 10k–200k lines (his stated range, a limit), an ARCHITECTURE file with a codemap. Then enforce the ones feature pressure will reach: a crate or package edge with a declared dependency, a lint, a type-erased handle, a capability never handed over, or a test (named by `testing`). Inside one module, privacy and a local convention are enough: "maintaining *local* conventions needs little effort." Tricks: [absence](references/tricks.md#absence).

**Gate 4: Ratio.** For each cut, compare the body with its interface: "keep related things together, and independent things apart". Extract a self-contained data structure whatever its length; fold back a split whose implementation is a small part of its interface; treat an hourglass function or a dependency that only repackages another as glue. Phrase the outermost internal API in its consumer's vocabulary, as plain data ("Rather than talking in definitions and references, it talks in Strings and textual offsets."), for "a hypothetical _ideal_ client" rather than the one you have. Give producer and consumer their own constructs when they want different shapes. Screen limits override the ratio for lines and functions, not for files (numbers in [limits](references/limits.md#numbers)). The gate judges a cut; it does not find one: "The hard part is to realize that there is (or there could be) an interface in the first place." Tricks: [shape](references/tricks.md#shape).

**Gate 5: Rent.** For each dependency, tool and platform, name the fundamental part it absorbs and the accidental part it adds. Read the lockfile, not the manifest: "it's important to realise what problems your application is and is not solving." What the bootstrap already needs is free: "This adds dependency on the git executable, but this is fine, as we need it to clone the repo anyway". The build system is "a bootstrap process: it is how you get from `git clone` to a working binary"; put the check logic there, in the project's own language, and let CI drive it and spread work over unlike machines. Not to the end: a CI that is "just a single line which calls into make CI. This is also incorrect." TigerBeetle keeps the platform matrix and runtime setup in CI on purpose. Tricks: [rent](references/tricks.md#rent).

**Then the tricks.** Pick a trick only where its *signed when* matches what the gates found, never because it is familiar: `references/tricks.md`. For an IDE, language server, compiler or incremental build, load `references/incremental.md` as well.

## No trick is signed

Sans-io, pushing ifs up, call-site injection, a kitchen-sink module, a crate edge, a multicall binary, owning instead of depending: each is right in one context and wrong in another. Never recall a sign; read it off the context. Each row in `references/tricks.md` carries his condition for it and his case against it; where he gives none, it says *none stated*, and none is supplied.

## What the concepts do not carry

The content of a decision: which data structure, which algorithm, where a storage layout puts what, what a language or protocol allows. In his own decisions that came from domain expertise, and here it comes from yours: read it off the codebase, the user or your own knowledge, and say which. In a blind prediction test, a core built from his earlier writing gave the direction but missed the criterion that decided his case: constructor functions, the screen limit, the single binary, "one correct way". Finding where a cut could go is part of the content.

His own 2026 account of architecture opens elsewhere, with Conway's law and incentives: rust-analyzer's features are crash-isolated "To attract weekend warriors", around a core held to a stricter bar. The model takes that as domain input: ask who will work on the code, and say what you assumed.

## The line: services he has not built

The practice behind this model is two systems, each one codebase: an IDE back end (rust-analyzer) and a replicated database (TigerBeetle). Beyond them his words are: "I don't have much experience building these kind of systems" (2024, of a multi-service system on Kafka); "I don't know how to best test modern HTTP applications built around inter-process communication." (2021); "I am not well-versed in cloud things" (2023).

For service code, the model decides inside each process and at the edge of each service's own code: effects at the edge, absences, the cut ratio, rent or own, and every serialized message type as an IPC boundary whose other side you often do not control. It decides nothing that depends on how a network, a broker or another service behaves: how to split a system into services, consistency between them, timeouts, retries and redelivery, deployment topology, cloud infrastructure. One binary with subcommands for several services is a [hypothesis](references/limits.md#hypotheses) there, not a rule. At this line say *the model does not reach here*, make the call yourself, label it yours, and name what would show it wrong. Do not import another author's rule and present it as this model's.

## Output contract

Every structural proposal, change or design review carries:

1. each interface touched, who controls its other side, and for those you do not control, the upgrade path;
2. each effect (I/O, clock, environment, allocation, failure, branch on outside state) and where it lives, or why it stays where it is;
3. each component's absences, where they are written, and how each is enforced (crate or package edge, lint, type erasure, withheld capability, test) or why privacy in one module is enough;
4. each cut added, removed or moved: what is behind it against its interface, and the vocabulary of the outermost API;
5. each dependency or tool: what it solves here, its fundamental and accidental parts, rented or owned;
6. each trick used, with the signed-when that matched;
7. the domain content you used and where it came from, labelled as not the model's;
8. each call at [the line](#the-line-services-he-has-not-built) or outside the model, labelled yours, with what would show it wrong;
9. every number with its status.

## Reference index

Load a file when its condition fires, never preventively. Every file has a row.

| Load this file | At this moment |
|---|---|
| `references/tricks.md` | After the gates, before applying any named move; a familiar pattern comes to mind. |
| `references/incremental.md` | The system is an IDE, language server, compiler, or an incremental build or analysis. |
| `references/limits.md` | Before stating a number, attributing a phrase, touching a fork or a hypothesis, citing the model, or answering where it comes from; at the line. |
| `references/glossary.md` | A term from this skill or from his writing is used or met, especially "boundary", "invariant", "kitchen sink", "hourglass". |
