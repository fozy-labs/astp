# Limits and forks

> Loaded when: Before stating a number, attributing a phrase, touching a fork or a hypothesis, citing the model, or answering where it comes from; at the line.

This file is the authority on statuses, forks, numbers and voices. Where it and another file in this skill disagree, this file wins.

## Contents

- [How to use this file](#how-to-use-this-file)
- [Corpus](#corpus)
- [Verification arithmetic](#verification-arithmetic)
- [What the concepts carry](#what-the-concepts-carry)
- [Narrowed: the scope that binds](#narrowed-the-scope-that-binds)
- [Practice or exposition](#practice-or-exposition)
- [Forks](#forks)
- [Hypotheses](#hypotheses)
- [His admissions](#his-admissions)
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

- **His writing:** the matklad.github.io blog, 206 posts from 2017-03-12 to 2026-10-07; rust-analyzer's `architecture.md`, `style.md`, the 2019 guide and the rust-analyzer blog (15 of 17 posts signed by him); TigerBeetle's `ARCHITECTURE.md`, `TIGER_STYLE.md` (only the lines blamed to him), blog, pull-request bodies and comments; forum threads; his 2019 Rust course in Russian (slides, a lecture).
- **Streams and talks:** Building Systems Simply 2025, IronBeetle episodes, a rust-analyzer repository walkthrough, a 2019 Saint Petersburg meetup talk in Russian. All are auto-captions: wording is approximate, speakers are not marked, and the 2019 meetup captions are too garbled to carry a specific claim.
- **Practice records:** 215 commits cited (rust-analyzer 130, TigerBeetle 85), 2017-12 to 2026-09, every one found with the stated date; all his except those named under [voices](#voices-that-are-not-his).
- **Other voices in the corpus:** Ted Kaminski's posts on system boundaries; TigerBeetle documents by Joran Dirk Greef and colleagues. They may narrow a move, never add one.
- **Excluded as evidence:** the posts of 2025-08-31 and 2026-01-20 on coding with an LLM, as in the `testing` skill: AI-topic material older than 2026-07-15, which the owner's source criteria flag. That drops one move about splitting work between a human and an LLM and one admission. No move here concerns AI-assisted design.

## Verification arithmetic

Counts describe the verification pass, not any quantity in a design.

- **234 extracted moves:** 82 held as stated, 56 held only in a narrower scope, 91 rest on a single occurrence, 5 cut (3 another person's, 1 inverted, 1 absent). Two pairs are one move each: handling vs reporting of errors (2020 and 2025 wording), and one admission counted twice.
- **Tags** after 14 corrections: 76 contemporaneous (a record written at decision time), 68 retold, 90 exposition-only.
- **Concepts:** 7 proposed. Who may know whom, effects at the edge, and rent held as stated; boundary stakes and the cut ratio held narrowed; reify-or-erode held narrowed and folds into absence as its enforcement step; locality of change was demoted to a direction and survives only behind the domain gate in `incremental.md`. Five remain.
- **Absence commits:** with the extraction's vocabulary, 8 rust-analyzer and 3 TigerBeetle commits by him state an absence; with a wider vocabulary, 14 and 8; plus 11 rust-analyzer commits titled "Decouple…" (2019-11-21 to 27). The extraction's "27 + 5" does not reproduce and probably counted other people's commits.
- **Tricks:** 69 named: 43 held as stated, 8 narrowed, 17 single, 1 another voice. 3 more drop as plain canon (newtype index, static factory, typesafe heterogeneous container); separate-functions-over-a-flag folds into push ifs up; the not-rocket-science rule and weekly releases are `testing`'s. 47 instruct: 37 in `tricks.md`, 10 in `incremental.md`.
- **Trick conditions:** of 69 signed-whens, 29 were his words, 21 fair paraphrase, 19 a benefit, a how-to or an example recast as a condition; those were rewritten from his text or set to *none stated*. Of the wrong-whens, 9 he states had been missed and are added; 6 were supplied and are removed.
- **Forks:** 32: 17 real, 7 context splits, 8 not reversals; 14 dated reversals; plus 1 found in verification.
- **Admissions:** 48 listed, 46 distinct, 45 kept after the exclusion above ([below](#his-admissions)).
- **Numbers:** 77; 19 one-off values had been marked norm or limit and are illustrations here; 9 norms hold.
- **Glossary:** 84 terms; 1 label is the extraction's ("cut ratio"), 6 glosses were supplied and are dropped, 1 was inverted and is corrected (fundamental vs accidental).

## What the concepts carry

Ten of his decisions (rust-analyzer 2017–2020, TigerBeetle 2023–2024) were coded step by step, 48 turning points.

- **Pre-registered rule: failed.** Counting every step except other people's decisions and luck (41), concepts carried 29% at decision time and 10% more only in a later retelling; tacit expertise carried 61%. The test stopped there.
- **Re-registered rule**, which takes domain facts as the agent's input from the codebase and scores the 28 non-domain steps: concepts carry **12 of 28 (43%) on decision-time records alone**. The 57% (16 of 28) quoted in the model counts 4 steps whose concept appears only in a later retelling. The recode is single-coded by the lead.
- **The rest, 12 of 28, is structural judgement no concept carries:** the shape of the `hir` façade types; what Ungrammar describes; whether TigerBeetle's free set lives in the grid or the superblock, and who controls the checkpoint flip.
- **Blind prediction**, from a core built only from his writing to 2023: the core gave the direction of every held-out decision and missed the deciding criterion in four of six. The predictor recognised five of six situations from memory, so the result overstates the core.

## Narrowed: the scope that binds

| Move | Holds only as |
|---|---|
| Control (the concept) | His wording and his control test (“You often don't control the other side of this boundary”). Not "only the hard boundary deserves care": the next sentence says "It is useful to spend some effort designing those things as well", and his style guide puts "quite a bit of scrutiny" on internal API growth. Not "one commit cannot change both sides": that test is not in his text (nearest: Kaminski's mono-repo passage). |
| Ratio (the concept) | The cut ratio. "A narrow cut lets you imagine the implementation behind it" is one text; "minimize the interface" is one text, about fuzzing; the "thin waist" is a different concept (an M × N protocol). |
| Enforcement (absence's step) | Erosion under feature pressure and physical reification: two texts (a 2022 post, the 2019 lecture) and three carriers in practice (rust-analyzer 2020, TigerBeetle 2024 and 2025). "Trust only absences the compiler rejects" is one aside. |
| Cite the invariants section as the argument | Writing the section is well recorded; citing it as the argument happened once for an invariant (three more commits cite style-guide sections the same way). |
| An absence can serve the rare case | One invariant: identity-less, mutation-friendly syntax trees, judged a mistake because "refactoring is not the common case!" |
| A lossless tree with a typed layer on top | The design: an RFC (2017) and two posts. "Semantic actions are a layering violation" is one post about parser generators. |
| Config struct | Passed explicitly, never stored in state. No `Default`: one text. |
| Static allocation | TigerBeetle's rule is Greef's. His: the finite-inputs condition, "no allocation after startup" from the configuration, and a speculative carry-over to compilers. |
| Resources owned at the top | Resources and locks owned by `main` or the event loop (three posts). Threading `&Context` down is a pattern he describes, not advice. |
| Limits on everything | Greef's rule. His: carrying explicit limits outside TigerBeetle ("It might be a good idea to make the limits explicit, and design software around them."). Checking limits at the edges is one text. |
| A compiler from pure, hermetic parts | An I/O-free front end as an ordinary library crate (2020, 2023). "Don't plug impurity loopholes" is one text, about reproducible builds. |
| Control plane and data plane | The split with batching and assertions is Greef's. His: "control plane is O(1) to data plane's O(N)" and keeping `if`s outside inner `for`s. |
| Review by the boundary a change touches | One text: rust-analyzer's style guide (2020). The 2026 post repeats only the low bar for isolated internals. |
| Bugs propagate to an isolation boundary | That they propagate to a boundary recurs (2019, 2023, 2025). A panic turned into a value only at a synchronization point, through a verbose opt-in API, is one post. |
| Binary privacy | The 2020 rule is per field; all fields or none is one 2022 post; the library exception is Kaminski's. |
| Power against properties | The trade-off is Kaminski's. His: applying it to language features where IDE or human reasoning matters; in 2025, "This dependency is not zero sum." |
| `unsafe` as a boundary | Rust's design. His: a boundary more precise than the module, wanted, not found. |
| Most code is glue | Three texts. "Simplicity in the small predicts the large" is one, and he hedges it. |
| User macros in a separate process | Edwin Cheng built it and Kladov calls it "a hack". His position: macros deterministic and limitable by design. |
| Parallelism, incrementality, resilience are modularity | All three joined in one post (2023); parallelism with incrementality in two. Function bodies that do not invalidate global data recur. |
| Durability | The mechanism is Niko Matsakis's (salsa). His part: library and sysroot sources marked durable. |
| Non-persistent caches as an asset | One text (2020-05); a month earlier he called it a "big issue". |
| Macros cost an IDE disproportionately | Four texts. The language-design lessons (append-only, a file at a time, deterministic, bounded) are one post. |
| An IDE need not be fully correct | "an IDE doesn't have to be 100% correct to be useful." (2020) and availability over correctness (2023). That the choice depends on the language rests on garbled captions. |
| Latency first, throughput benchmarked apart | Two texts. Accepting known failures is a testing priority, `testing`'s. |
| Thin waist | The lens recurs (four texts; the term is Oil shell's). "Magit for jj" through LSP is one post. |
| Workload physics, storage not a black box | TigerBeetle's founding analysis and storage design are Greef's. His: "Static allocation depends on the physics of the underlying problem.", a speed-of-light baseline, and "you just can't treat storage as a separate black box in a fault-tolerant distributed system". |
| A mechanical rule for a fuzzy goal | "a rule focuses attention"; keep the goal and adjust the rule. Not "value the rule for its second-order effects". |
| Measure build time continuously | Recurs. Build time as a multiplier on everything is one post. |
| CI caching | Only "cache all the dependencies, but don't cache project's own crates." recurs. |
| One binary, many subcommands | The shape recurs, for link time and field debugging. Several services in one binary, argued from the org chart, is one post. |
| A trick recorded as label, code and context | One descriptive post ("not a prescriptive post for you"). |
| Review kind chosen by context | That the purpose of review is a choice made by context recurs. Merging after two round-trips is one 2021 recipe. |
| The change process written down | Style comments go to the style guide. The rest is one text. |
| Input kept in memory | The data-size fact ("tens of megabytes at most") licenses keeping input in memory, not "no I/O"; that is the edge's. |
| Std facts decide vendoring | Decisive in one commit (protocols need strict parsing); elsewhere the general churn motive comes first. |

## Practice or exposition

- **rust-analyzer's concept vocabulary is a retelling.** Its commits state absences from 2018-12-18; the "Architecture Invariants" heading appears 2020-06-06; the bold "**Architecture Invariant:**" and "**API Boundary**" labels and "serialization at the leaf" come in 2021, after the decisions. TigerBeetle commits state their principles at the time.
- **No decision record:** error design (handling vs reporting, error shape by use); failure compartments (0 of 7 moves contemporaneous); most of the IDE material. The IDE records that exist: cancellation commits (2019), the join-on-drop commit, the 2020 design-doc revision that keeps LSP at the edge, the 2020 cursor-to-semantics code.
- **Same-day write-ups:** fix it one level deeper (the post came the day of the pull requests, which do not name it).

## Forks

| Fork | Status | Deciding criterion |
|---|---|---|
| Serde in the syntax crate (2019) → serialization only in leaf crates (2021) | closed, in practice | Side A already names the leaf as the ideal ("ideally, `serde` should be enabled by `ra_lsp_serder`"): a build-cost workaround retired, not a change of view. |
| Identity-less syntax trees (2019) → "might have been a mistake" (2023) | closed | Frequency of the use case: "refactoring is not the common case!" |
| Diagnostics as an open set (2019) → a closed enum at the façade (2021) | closed | The layering direction: "defined in the lowest level of the stack (hir_expand), but is used by the highest level (ide)." |
| An API layer with swappable backends (2019-01) → removed (2019-05) | closed | "the impl is a tiny fraction of API anyway" |
| Lenient bus tick → strict, same day (2025) | closed | "This is easy to assert, so we shouldn't be able to mess it up!" |
| stdx: wrap minimally and lazily (2023) → vendor whole types (2025) | **open** in part | Side B states its reason (std churn, alignment with TigerStyle); whether 2023's "only when there's an actual problem" was met each time is open. |
| Test on one OS (2019) → CI gated on Windows (2020) | **open** | None; the change that restored Windows CI is Giles Cope's. |
| `parking_lot` mutex to dodge poisoning → `std::Mutex` for unwind safety | closed | "We need to understand that the other thread was cancelled mid-operation"; the two texts give different reasons for the first choice. |
| `from_reader` error: I/O error only → I/O error wrapping the parse result | closed | "IO error is probably a hardware/environment problem outside of the domain of the program, while serialization error most likely indicates a bug somewhere in the system." |
| Crypto randomness in std: verdict kept, reason replaced | closed | "there's more or less one correct way to do this" |
| Explicit exclusion for async vs TigerBeetle's implicit single-thread exclusion | **open** | Named by him; the paradigm (CSP vs actors) is partly stated; which belief to keep is open. |
| Parser output as an event log vs "maybe a false start" | **open** | A doubt; nothing followed. |
| Version from the CI run number → from the changelog | closed | "finnicky" |
| GitHub Actions: avoid, lean on, leave | closed for the criterion, moving for the item | Fundamental vs accidental; the same item (installing language runtimes) went from rented (2025-07-21) to owned (2026-09-14). |
| Release debuginfo on, on, off (2021) | **open** | None. |
| Retry loop: "I don't know how" (2023) → a reshaped loop (2025) | code closed, limit open | He ends "I still don't like it". |
| Self-reported changes (six, one date each) | closed | Each names its reason; two are `testing`'s. |
| Diagnostics factory "even when 'programming in the small'" (2026-02) vs "too much friction" for scripty code (2026-05) | **open** | Newer by date only. |
| Persistent caches (2020) vs dependencies from compiled `.rmeta` (2026) | context split | 2020 is about load time, 2026 about memory: "The 99% use case is all the code in your 6666 dependencies which you won't ever look at". |
| Parent ids out of the data vs stored in each item | context split | This reading is the extraction's: a body's owner vs item ids. |
| Query-based compilation: built on it, ranked last | context split | "the dependency structure of the source language." |
| Processes at team scale vs one binary for several services | context split | Side A names its scope: "larger companies can benefit from microservices architecture" when "maintaining good architecture across teams is hard". Side A is one hedged sentence. |
| Typed key over a dynamic map vs the dynamic config map dropped | context split | Shape not known upfront: "the shape of the config is not known upfront." |
| Never stale vs relaxed consistency for Zig | context split | "works especially well for languages with good support for separate compilation" |
| Orderly thread shutdown vs "crash only all the way" | context split | His 2026 terms separate cleanup inside one process from "Graceful shutdown is an application-level design pattern". |

Not forks, though they read as such: the type-erased handle replaced by a vtable (the absence held); xtask dependencies isolated, then minimized (compatible); "a skillfully placed internal boundary can help" against "anything else that looks like a boundary isn't" (the next sentence dissolves it); "hourglass" good in 2022 and a smell in 2025 (different axes; this skill uses the ratio); "100% precise" against "doesn't have to be 100% correct" (a goal against a usefulness floor); a lifetime that "poisons" against one that "works fine" (different problems); O(1) entry points against `zig build ci` (merging entry points follows the rule); small steps against the extra mile ("almost opposite (actually, complementary)").

## Hypotheses

Each rests on one occurrence. It may seed a guess that names its own falsifier; it may not instruct, and it is not restated elsewhere in this skill.

**Absence and layers.**
- A type defined at the bottom of the stack must not exist to serve the top; replace an open set at the base with a closed enum at the façade (one commit; the 2019 record argued the opposite).
- Qualify `hir::` and `ast::` paths and group imports by crate so layers show at the use site; no re-exports "for non-library code" (style guide; the rationale was added later).
- If you would have to learn how a dependency uses its own dependencies, maintain your own instead (one parenthetical).
- A rigid package contract lets people "work together by working apart" (one post).
- Trust only absences the compiler rejects (an aside his next sentences undercut).
- At sufficient team scale, reify internal boundaries as processes (one hedged sentence; two years later, one binary).
- Several services to deploy: "Just put all three into a single binary", because "The code architecture of your solution is going to be isomorphic to your org chart, not to your deployment topology." (one post, answering about a system he says he lacks experience with).
- Indexes instead of pointers let side tables stay local to their modules (one post, relaying "the usual advice").

**Edge and control.**
- Hard mode: only a small binary asks the OS for resources, a no-alloc library gets everything injected (one post, which calls itself an exercise).
- If you control both sides of a channel, send checksummed bytes as they are (one sentence; TigerBeetle's design, his condition).
- Add no stability guarantees of your own; stabilize, or require opt-in, before anything that could become a boundary gets its first user (one document).
- Decide a major or minor version by your transitive dependents (one post, library side only).
- Match the guard to the fan-out: careful review where much depends on a thing, a frictionless append-only place elsewhere (one post).

**Shape.**
- A common interface between independent components makes them fit the interface instead of their job (one commit).
- Expose a function, not a "doer" object; a `Ctx` stays behind it (style guide).
- Builder lite: grow `new` into `with_foo(self) -> Self` methods, for code that evolves fast in an uncertain direction (one post).
- A cache must not turn a read into `&mut self`; those spots are architecture (one post).
- When unsure about a design, raise the core abstraction's count from one to two (one post).
- Split text → document model from model → output in markup tools (one post).
- Remove an implicit dependency rather than wrap it in an abstraction (one post; Deno's approach, which he endorses).
- Name computed indexes `index`, `count`, `offset`, `size` so wrong combinations show (one post; TigerStyle has the same rule, its author unchecked); "If you don't need indexing arithmetic, you can use newtype pattern".
- Hide a field's leaking lifetime behind a trait object (one post; he calls it "closer to code golf than to the practical approach").
- Express one concept in each language's own vocabulary (one line).

**Errors.**
- Diagnostics factory: the reporting side gets `add_<error>(…)` constructors and the error code stays independent of the message, "my personal default approach to the reporting problem" (one post; open [fork](#forks)).
- In scripty code, attach error context on the happy path (`errdefer log.err`) instead of a sink (one post).

**IDE, compiler, concurrency.**
- Source map: emit a position-independent result and a separate source map (one decision, documented the next day).
- The IntelliJ trick: insert a dummy identifier at the cursor and reparse (one guide passage; IntelliJ's).
- One semantic API with several backends, switched transparently (one post; IntelliJ's PSI).
- Start a language server with the data model (one note, retold once).
- For a comptime-heavy language, abstract interpretation as the fast IDE layer (one proposal).
- Separate the analysis engine from the editor, unlike IntelliJ (one garbled caption).
- Three snapshots (`ready`, `working`, `pending`) for a whole-program language (one post, a proposal for Zig).
- Cancellation comes in three kinds: synchronous, asynchronous, graceful shutdown (one 2026 post; TigerBeetle's instance is DJ's).
- One shutdown path, crash-only (2026 only).
- Name "may run concurrently" apart from "must run concurrently" (one post; Zig's design).
- A boundary between runtimes with different object models costs a data mirror (one post).
- Constant Work: keep a constant population with a neutral reserved value and process all of it (one post; he files it under TigerStyle, which has no such term).
- Choose the reliability posture from the domain: "Erlang style" or "SQLite style" (one post).

**Dependencies and process.**
- Judge a version-selection scheme by its ecosystem effects (one post).
- Define a tool by what the machinery does with it (one post).
- Three-state stability: "production ready (still unstable, but you can budget-in a bounded amount of upgrade work)" (one post).
- "If it is important that there's only one of a thing, it goes into std." (one post).
- Ask which social architecture yields a good standard library (one post).
- "The usefulness of dependencies is generally inversely-proportional to the lifetime of the project." (one passage; the zero-dependencies policy it supports is Greef's).
- A rule of thumb works as an attention trigger (one post).
- Keep a borrowed habit with its goal, its origin and two sanity checks (one post).
- Collect tricks by reading widely and recall them at the right moment (one post).

**Domain facts that decided one case.**
- Where rust-analyzer's `base-db` absence falls (`cfg` in, `feature` out) is Cargo knowledge.
- Cargo's "never canonicalize paths" rests on a file-system fact (Cargo's invariant, which he reports).
- 32-bit indexes rest on memory bandwidth and an unmeasured hunch.
- Once events are batched, their priority is server knowledge: writes over reads over accepts.
- Code quality differs by incentives, not knowledge ("I suspect").
- TigerBeetle ships binaries because the tested machine code is the product and "Zig is not stable yet".
- Build-time tricks come from knowing the compilation model ("I _think_").

## His admissions

The 45 distinct places where he says he does not know, quoted exactly. A hedge of taste or confidence is marked *hedge*; a position with a hedge attached, *position*; one that `testing` owns, *→ testing*.

**Systems and infrastructure.**
- Multi-service systems (2024, of the asker's system on Kafka): “I don't have much experience building these kind of systems”.
- Cloud (2023): “I am not well-versed in cloud things”.
- Shell and downloads (2023): “Note that I don't know bash, powershell, and how to download files from the Internet securely, so the above PoC was mostly written by Chat GPT.”
- OS randomness (2023): “covering which is beyond the scope of this article (and my own knowledge).”
- rustc's build (2020): “I have absolutely no idea about how Rust's current build process works, so I tell how it should work from the position of ignorance.”
- TigerBeetle's CI matrix (2023), of client-testing runners: “I am not sure what matrix we should go for!”
- A metrics store (2024): “I don't know a good solution here. I use a JSON file in a github repository for similar purposes.” Resolved in 2025: “JSON file in a git repository is a fine database to power such an internal website.”

**Concurrency.**
- Native threads (2018): “Unfortunately, this solution does't work for native threads, because there are just no good cancellation points. And I don't know of any approach that would work :(”
- Concurrent design (2021): “I am struggling with designing concurrent code.”; “I am not sure that's exactly the right formulation”; 2025: “A short note on contradiction or confusion in my language design beliefs”. His practice picks the event loop.
- Retry loops (2023): “I don't know how to achieve all four.” **Open**: the 2025 shape grew from a reader's suggestion, and he ends “I still don't like it (if you forget that `+1`, you'll get a panic!), but that's where I am at!”

**Errors.**
- Error values (2025): “The largest remaining variance is in what the error value looks like. This still feels like a research area.”
- Path context in I/O errors (2020): “I don't know an obviously good solution here.”; on serde_json, a *position*: “I think this is backwards (but I don't know the whole context, I'd be delighted to be proven wrong!)”
- Error context (2026): “I wonder which language features facilitate this style?”
- Unwinding (2025): “I don't know of a good set of reproducible benchmarks, but I find these two sources believable”.

**IDE and compiler internals.**
- File-system dynamism (2020): “One specific aspect I am struggling with is dynamism.”; “The current VFS is ... not great, I don't feel comfortable building rust-analyzer on top of it.”; 2026: “our native watcher's API was fundamentally racy, and I didn't do the messy platform-specific work of making it correct.”
- Query-based compilation (2020): “a feeling that this is a somewhat uncharted territory yet :-)”
- Query granularity (2019): “I don't know which approach is better.”; “I don't have an explanation for this”.
- Build model to analyzer model (2020): “CrateGraph by itself is fine, CargoWorkspace as well, but the mapping between the two seems arbitrary”. Its 2021 half, untested and then smoke-tested, is *→ testing*.
- Syntax trees (2023): “the topic is vast and lacks a clear winning solution. To learn about it, take a look at Roslyn, SwiftSyntax, rowan and IntelliJ.”
- Parser generators (2018): “I'll be using a rather direct and assertive language in the following, but the fact is I am totally not sure about anything written here”.
- The interner's speed (2023): “Again, I haven't implemented this, so I have no idea how fast or slow it actually is.”
- Static allocation for compilers (2025): “Is there any practical benefits here? I don't know! But seems worth playing around with!”
- Hard mode (2022): “I actually can't get it past miri.”; “I wonder how far this style of programming can be pushed.”
- Field lifetimes (2018, 2022): “an annoying Rust pattern and an annoying workaround, without a good solution :)”; “I don't know how to solve those problems”; “I don't think that's really possible”.
- LSP (2022), a *position*: “I am less certain what was happening on the editor's side. Still, I do want to claim that we had no editors capable of being an IDE.”
- Editors (2023): “I am not sure that Emacs is the best we can do”.

**Language and module design.**
- Module systems (2021): “I am not sure if the rest of Rust visibility systems pulls its weight.”; “Alas, I don't know how to design such conditional compilation system.”; *hedge*: “my level of confidence about these ideas is about `0.5` I guess.”
- Language design (2023): “An amateur note on language design”.
- Zig against Rust (2023): “It is emphatically _not_ a balanced and thorough comparison of the two languages. I haven't yet written my 100k lines of Zig to do that.”
- Portable assembly (2023), a *position*: “I am not sure 'portable assembly' is really a thing”.
- A simpler safe language (2020), a *position* about the field: “we don't know how to create a simpler memory safe low-level language”.
- Macros (2021), a declared bias: “But take this with a huuuge grain of salt --- I am obviously biased, having spent several years developing Rust IDEs.”
- API shapes (2025), *hedge*: “I don't know if I like `index/count` or `start/end` more for representing ranges”; “I don't know which one I prefer more. I default to the former because it works even if there are several node arguments.”
- `BoundedArray` (2025), *hedge*: “I think its also a good idea to use BoundedArray _less_, but I am not confident enough in that opinion to go and remove all existing usages!”

**Knowledge itself.**
- Books (2026): “Sadly, I don't know of a single book I can recommend which contains the truths.”; “practice seems to be an essential element here.” He then recommends talks and blogs, and in 2023 calls Kaminski's archive “by far the best resource on 'programming in the large'”. Of one of his own posts (2020): “a hand-wavy philosophical article” “without quantifiable justification”.
- Invariants (2023): “I don't know how to describe this better than 'that thing that you do when you solve non-trivial math puzzler'”.
- Small to large (2023): “I don't know how true is that, as I never tried to look at a proper study”; “Again, I don't know, but I'd take this Pascal's wager.”
- One snippet (2026): “I don't claim that my snippet is the right way to do this! I have no idea, as I don't have access to the full context.”
- One recollection (2026): “I might be rationalizing/misremembering things, but IIRC it's exactly around adding proc macros that the thing began to feel unreasonably bulky.”

**→ testing.**
- HTTP applications (2021): “Keep in mind that my background is mostly in writing compiler front-ends for IDEs. This is a rather niche area, which is especially amendable to testing. Compilers are pure self-contained functions. I don't know how to best test modern HTTP applications built around inter-process communication.” It is about testing; it does not bound the edge concept, and [the line](../SKILL.md#the-line-services-he-has-not-built) uses it only as his scope.
- Editor-driven I/O (2021): “I don't have good answers here, but here are the tricks I use”.
- Benchmarks (2024): “I don't have a grand vison about how to make benchmark work in a large, living project, it always feels like a struggle to me.”
- Continuous fuzzing (2024): “I don't yet have a good hang on how to most effectively integrate continuous fuzzing into development process.”; “I don't know what is the not rocket science rule of fuzzing.”
- Smoke fuzzing (2024): “I don't know what's a reasonable time bound for smoke fuzzing.”; “we severely lack any means of checking whether we are fuzzing efficiently at all”.
- Random seeds (2025): “I don't know how good of a developer experience we will get here”.

## Numbers

No number leaves this skill without its status.

| Number | Status |
|---|---|
| about 100 ms for an IDE to react to an edit | norm |
| an O(1) change gives an O(1) update of the O(N) codebase | norm |
| O(1) information on screen; about 100 lines of useful output | norm |
| O(1) entry points (`run`, `test`, `fuzz`, `deploy`) | norm |
| 70 lines per function, 100 columns | norm; TigerStyle's numbers (Greef's voice), which he defends and enforces |
| no functions of 71–73 lines | norm, a ratchet step |
| weekly releases | norm; release trains are `testing`'s |
| test suites in seconds, slow suites in low minutes | norm, `testing`'s |
| 10k–200k lines | limit: the projects his ARCHITECTURE-file advice is for |
| 10k–1M lines | limit: where the flat workspace holds |
| several thousand lines by one person | limit: where build time becomes a design force |
| tens of megabytes of input | limit, a domain fact: why rust-analyzer keeps input in memory |
| 60–70 lines on a screen; two copies side by side on a 16:9 display | limit: the screen behind 70 lines and 100 columns |
| about 500 lines | limit: the size of a side tool before he stops |
| a quarter of a megabyte | limit: binary blobs in the repository |
| 1 MiB per message | limit, a domain fact: what makes static allocation possible in TigerBeetle |
| 4 MiB per file | limit, proposed: input for a statically allocated compiler |
| ten years; releases a couple of times a year | limit: upgrade cadence that keeps a dependency alive |
| 1.5 KiB, 10 KiB | limit, a judgement: where static sizing stops paying |
| 1,000 days | limit: a sanity bound on durations |
| 100 KB / 50 lines | limit: his `window` tool's default |
| more than a day, less than a week | limit: a learning project with real architecture (one text) |
| revisit ARCHITECTURE a couple of times a year | illustration (one text) |
| about 10 minutes of CI for a 200k-line Rust project (8 minutes measured) | illustration (one text) |
| a minute of compiler work wastes more than a minute of human work | illustration, a maxim |
| five minutes to build a compiler | illustration, a hypothetical |
| 80% / 20% of runtime in a small fraction of code | illustration, a borrowed maxim |
| three kinds of change | a classification, once; not a numeric norm |
| merge after two review round-trips | illustration, his 2021 practice |
| 50–80 character commit summaries | illustration: kernel practice |
| two version numbers suffice | illustration, others' observation he is "sympathetic" to |
| a 32-bit index | illustration; index over pointer recurs, the width does not |
| a 12-byte struct assert | illustration, one listing |
| 4 MiB stack; 3 days of investigation | illustration, one commit |
| 1 → 2 cardinality | illustration, a heuristic in a hypothesis |
| 8k-item batches | illustration, a TigerBeetle design fact |
| about 2 s per benchmark; 8 s for a test; 300 ms / 60 s / 10 min of smoke fuzzing; fuzzing time split 50:50 | illustrations, `testing`'s |
| 2x to write a patch / 10x to find where; 90% glue / 10% salient; 1% / 99% use cases; 300 ms re-validation; 8.49 s cold / 95.6 ms warm; 30% of a binary in JSON code; X² macro cost; m · n link work; 5× productivity; +999 / −1123 lines | illustrations, measured or estimated once |

Not his, never attribute to him: 92% of critical bugs in error handling (Yuan et al., which he endorses); six replicas and their quorums (TigerBeetle's design); a fuzzer of about 1,000 lines (DJ's code).

## Voices that are not his

Never attribute these to Kladov.

- **Ted Kaminski:** the principle that boundaries matter more than code you can refactor at will, which the control concept restates in Kladov's voice in four texts; the dependency half of absence ("what modules it does not depend upon"); the power-against-properties trade-off; the library exception to binary privacy; the mono-repo passage behind the "one commit cannot change both sides" test, which is not Kladov's. Kladov's own additions to control: review scaled by the boundary a change touches (one text), serialization at the leaf because the other side is not yours, compilation-unit visibility (closed vs open world), binary privacy's application scope, "Solid upgrade strategy for deployment trumps any design which seems perfect at a given moment in time.", and, as hypotheses, no stability guarantees of his own.
- **Joran Dirk Greef:** TigerBeetle's static allocation, "Put a limit on everything", control and data planes through batching, the I/O-free transaction core with prefetch and batch timestamps, the storage layout, and the zero-dependencies policy. Kladov's additions: the finite-inputs condition, the O(1) / O(N) framing tied to pushing ifs up and fors down, limits carried outside TigerBeetle, the name Enum of Arrays, "if you control both sides", "storage can't be a black box". TigerStyle's "inverse of an hourglass" line is Kladov's.
- **DJ (sentientwaffle):** TigerBeetle's grid cancellation and reset.
- **Niko Matsakis:** salsa's durability mechanism; Rust's `unsafe` design.
- **Edwin Cheng:** rust-analyzer's separate proc-macro process. **Giles Cope:** the change that restored Windows CI.
- **Rust's standard-library authors:** the `io::Error` and `ErrorKind` design he dissects; only "error size is viral" is his.
- **Gary Bernhardt:** the *Boundaries* talk, his "all-time favorite"; whether it shaped the edge concept is unverified.
- **Credited origins:** the sans-io project; Carmack (inlined control flow, one language for automation); Django's `shortcuts`; Andrew Kelley (reserve first); sled (nested results for I/O and domain errors); Rust's tidy and Graydon Hoare (the ratchet, the not-rocket-science rule); BusyBox; Erlang's universal server; IntelliJ, Sorbet, clangd, Merlin, Kotlin, Roslyn, Dart; Oil shell (thin waist); LSP (UI as the boundary); Candea and Fox (crash-only); Midori (error model); Pieter Hintjens (optimistic merging, Conway's law).
- **Uncredited borrowings:** fundamental vs accidental (Brooks's terms); control and data plane; "Constant Work" (that it is the AWS Builders' Library's term is unverified).

## Named here, owned elsewhere

- **`testing` owns**, and this skill only names: no test hooks in production code; the not-rocket-science rule; release trains, weekly releases, patch releases, a manual QA checklist, no testing during the release; splitting a compiler so each half is tested alone; accepting known test failures; a fuzzer fleet's threat model; benchmarks and continuous fuzzing; time passed as data.
- **Testing substance inside moves here, named only:** one-OS testing and the fuzzability of an I/O-free component; the speed of tests on a pure core; CI that "can only be broken by changes to files in this repository"; assertions on the control plane; the ratchet's check as a test; layered defenses; soft assertions; a fire-and-forget spawn as untestable; benchmark and fuzzer binaries; direct printing that "makes the code untestable".
- **What `testing` names as owned here:** what a boundary is; invariants as absences, their enforcement and erosion; structured concurrency; failure compartments. It also hands over three moves extracted on its side: sketch a fuzzable interface first, enforce an architecture invariant with an ordinary test, and the testing story as an architectural concern. They were verified in the testing research, not here; this skill uses only the second, as an enforcement carrier.

## This skill's own scaffolding, declared

- **The five names** (absence, edge, control, ratio, rent) and the assignment of moves to them are ours; each concept and its words are his, except as credited above. Folding enforcement into absence, and dropping locality of change from the concepts, are the verification's.
- **"Distinct, not orthogonal":** that the edge's core invariant is itself an absence is the verification's reading.
- **The gate order** and the rule to commit to nothing before the gates above it are answered are ours. Control comes first because it decides how much care an interface gets; that order is not his.
- **Tricks grouped by gate**, names marked [ours], and the domain gate for IDE and compiler material are ours; each condition is his or *none stated*.
- **The line:** the list of what it does not decide is ours, read off what his material never treats.
- **The output contract** is ours.

## Boundary and gaps

Outside these the model has no verdict. *The model does not reach here* is a legitimate output.

- **Content.** The data structure, the algorithm, the storage layout, the language or protocol fact; and where a cut could go at all ([what the concepts carry](#what-the-concepts-carry)).
- **Services, networks, cloud.** His scope is quoted at [the line](../SKILL.md#the-line-services-he-has-not-built). Of systems built around inter-process communication the corpus has his one-binary advice (one post) and the hedged team-scale sentence; nothing on queues, consistency across services, retries, or deployment.
- **Conway's law and incentives.** His 2026 account of architecture starts there; the model keeps only crash-isolated features around a stricter core, and treats the rest as domain input.
- **Concurrency design** and **the shape of an error value**: unresolved in his own words ([admissions](#his-admissions)).
