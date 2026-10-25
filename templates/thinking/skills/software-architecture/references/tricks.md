# Tricks

> Loaded when: After the gates, before applying any named move; a familiar pattern comes to mind.

His named moves, by the gate that calls for them. The name is his label, or ours where he gives none. *Signed when* is the context he names for the trick, *wrong when* the context he names against it; both are his words or a close paraphrase. *None stated* means he gives none, and none is supplied: then the gates alone sign the trick. A *scope* line marks a trick that holds only in a narrower form than it reads. Credited origins are named in the row; the canon form a trick resembles is not a licence to apply the canon version.

## Contents

- [Edge](#edge)
- [Concurrency and failure](#concurrency-and-failure)
- [Absence](#absence)
- [Control](#control)
- [Shape](#shape)
- [Rent](#rent)
- [Change and layout](#change-and-layout)

IDE, language-server and compiler tricks sit behind their domain gate in `incremental.md`.

## Edge

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| Sans-io (credits the sans-io project) | Extract the protocol, parser or algorithm of an I/O-heavy component into a piece the caller drives; the fallible call moves to the caller | Errors pile into one type: "An often-working cure for error kitchensinkosis is the pattern of pushing errors to the caller."; "Most errors come from IO; if you push all IO to the caller, you can skip most of the error handing!" | none stated; the cost: "This exchanges more typing for more type-safety." |
| Push ifs up | Move branching, preconditions, I/O and error handling to one top-level place; the work below is straight-line; encode a precondition in the callee's types | Stateful side-effecting code (a 2020 rust-analyzer PR, after Carmack: "all user interractions, all mutations, and all network requests to happen in a single file"); "Call-site has more context, it often happens that the precondition falls out naturally or can be bubbled up higher in the stack." | none stated; he hedges ("consider if it could be moved to the caller instead"), and his style guide adds "Avoid creating single-use helper functions" |
| Separate functions over a flag (a special case of push ifs up; Fowler's "remove flag argument", in his framing "false sharing") | Split the function in two | "it is always called with `true`, `false`, `Some` and `None` literals" | none stated |
| Dissolving enum | An enum that only carries a decision from producer to consumer: pull both branches up instead | "it becomes apparent that it is the exact same condition, triplicated (the third time reified as a data structure)" | none stated |
| Call-site dependency injection | Pass a dependency (config, allocator, context, parent ids) to each call, not stored in data or at construction | "owner is the only thing that tethers Body to the rest of the code"; "In Rust, the latter (call-site injection) sometimes works with lifetimes better."; with config out of the state, "it is possible to use different configs for the same functionality depending on the context." | "The problem here is `Drop` --- freeing the vectors requires access to the allocator, and it's unclear how to provide one."; "The pattern is somewhat Rust-specific."; threading a tracer everywhere "felt like busywork, for little meaningful gain" (TigerBeetle, 2025) |
| Config struct [ours] | Pack many parameters into a `Config` struct, passed explicitly, never stored in state | "If the function has many parameters, they most likely change frequently. By packing them into a struct we protect all intermediary functions from changes." | "If there is variation not only in the input parameters, but in the return type as well, consider introducing a `Command` type." Scope: "Do not implement `Default` for the `Config` struct" is one text, the style guide. |
| Path types at the OS edge [ours] | `OsString` where data enters the OS, absolute paths, a "file system witness" path instead of one assumed file system | "cleanly delineates the boundary when the data goes into the OS-land."; "rust-analyzer is a long-lived process which handles several projects at the same time. It is important not to leak cwd by accident." | none stated |
| Static allocation (TigerBeetle's rule is Joran Dirk Greef's; the condition is Kladov's) | Allocate everything at startup from worst cases the configuration fixes; afterwards nothing allocates, so every component has a limit | "As long as inputs and outputs of a system are finite, non-allocating processing is easy. And you can put two such systems together without much trouble."; "Static allocation depends on the physics of the underlying problem." | "Alas, it seems impossible to pull it off for compilers." (he then sketches a compiler form whose benefit he does not know); "TigerBeetle doesn't do "static allocation" on disk, it can fail with `ENOSPACE` at runtime" |
| Reserve first (learned from Andrew Kelley, credited) | Put every failure into a reservation step that leaves the structure untouched, then mutate on an error-free path | "the only source of errors is fallible allocation" | "Zig applications should consider aborting on OOM."; "For libraries, prefer leaving allocation to the caller" |
| Push fors down (credits the data-oriented school) | Make the batch the base case, so a decision is paid once per batch, not per item | "Few things are few, many things are many"; "It is the volume of entities that makes the path hot in the first place." | none stated; his motivation is mainly performance |
| Enum of Arrays (his name; TigerBeetle's homogeneous batches predate it) | Turn an array of tagged items into a tag over homogeneous arrays: "there’s only a single tag per an entire batch of things." | none stated; it composes with push fors down: "The tag is control plane, a small, infrequent piece of information which informs decisions." | none stated |
| Withhold the capability [ours] | What a component is not handed (allocator, I/O, environment) it cannot do | His two cases: an event loop that must not allocate (TigerBeetle hands the allocator to `init` only); a configuration whose meaning must not depend on the environment: "If your configuration can access environment variables or read files on disk, than the meaning of the configuration would depend on the environment" | none stated |

## Concurrency and failure

Two rules sit under these tricks. Let bugs propagate to an isolation boundary and become a value only there. Rust-analyzer allocates quality by role: features with a low bar, each crash-isolated, around a core "spine" held to a stricter bar. Soft assertions and test-side concurrency belong to `testing`.

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| jod thread ("join on drop") | Never leave a thread unjoined; declare the worker before the channel, so the channel drops first | none stated: "The value is not in the code, it's in the pattern of never leaving a loose thread behind!" | "if you are joining a thread which waits for something else, you might wait forever."; with many threads in one scope, one failing should cancel the rest |
| Never fail, contain per feature [ours] | The core treats broken input as a normal case and returns a result plus errors; a panic in one feature is caught at that feature's boundary | "Internals of rust-analyzer need to deal with broken code, but this is not an error condition."; "It will always have bugs and panics. But a panic in an isolated feature should not bring down the whole process." | Code that can reach shared mutable state. His containment holds because "almost no code has access to any mutable state, so usage of `catch_unwind` can't lead to a rotten state." |

## Absence

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| Kitchen sink (after Django's `shortcuts`, credited) | Give items that fit nowhere an explicit module (`stdx`, `ast::make::ext`), so the who-knows-whom classification stays crisp | "many classifications work best if there is an explicit "can't classify this" category. If there's no obvious place to put things which don't fit, a solid design might erode with time." | "an existence of a good solid design is prerequisite, lest all the code ends up in an `utils` module." |
| Enforce it with the toolchain | Make a forbidden use fail the build: a lint, a type-erased handle, lazy compilation plus an assert | "We are not _really_ using Multiversion struct directly from replica anyway, and we _shouldn't_. Let's enforce that"; "It's very useful when `pub` is equivalent to "this is crate's public API", let's enforce this!" | none stated. TigerBeetle later replaced the type-erased handle with a vtable interface for clarity; the absence held. |
| Ratchet (credits Rust's tidy) | A repository-wide check plus a list of known violations, set up before any fixing, then tightened; the check runs as a test (`testing`) | Fixes do not last: "often times the fixes are not durable" | "If there's a clear disagreement between what the docs say the world is, and the actual world, the ratcheting effect of the written word disappears." |
| ARCHITECTURE file | A short file: bird's-eye view, a codemap of coarse modules, invariants, boundaries; only what rarely changes; name files and types, do not link them | "If you maintain an open-source project in the range of 10k-200k lines of code" | none stated |

## Control

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| Serialization at the leaf ("keep serialization at the boundary of the system, in the leaf crates") | Derive serialization only in the leaf crates | "If a type is serializable, then it is a part of some IPC boundary. You often don't control the other side of this boundary, so changing serializable types is hard."; "If you put serialization near the foundation, then all intermediate crates would have to pay its build-time costs." | none stated. His 2019 exception (serde in the syntax crate "to reduce number of compilations", the leaf named as the ideal) was retired by 2021. |
| stdx | Wrap, and later vendor, standard-library types in your own module | 2023: "we wrap std types to fix API errors, or otherwise tweak them for our particular usage", "lazily, only when there's an actual problem"; 2025: "we want to insualte us from std API chunrn, reduce the risk of "meaningless" (to us) changes subtly breaking the sematics we rely on" | "we _might_ unfork once Zig stdlib is stable". Scope: TigerBeetle on Zig's unstable std; wrapping turned into vendoring ([fork](limits.md#forks)). |

## Shape

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| Concrete abstraction | Replace a trait or generic that is only used concretely with concrete code; keep traits for runtime substitution | "If in every `x.blag()` the `x` is either `Blorg`, or `Gonk`, but never a `T` (each usage is _concrete_), you don't need this abstraction." | "There are exceptions here (you can do less things with `T: Default` than with `Blorb`)"; "don't blindly replace abstractions with concretions, check if provided justifications work for your particular case!" |
| Binary privacy | Make all fields public (plain data) or none (a type guarding an invariant) | "The primary context here is application development." | "Libraries with semver-constrained API have other guidelines --- the rules are different at the boundaries." (the library exception is Kaminski's). Scope: his 2020 rule is per field, "If a field can have any value without breaking invariants, make the field public."; all-or-none is one 2022 post. |

## Rent

A dependency's identity is its checksum; a version "is a specific rule about dependency substitutability." Not every row here applies the fundamental-or-accidental split: several are build and CI hygiene that the same gate reaches.

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| Read the lockfile ("pull their weight") | For each transitive dependency, ask what it solves for the people using your software; keep it only if it pulls its weight | "it's important to realise what problems your application is and is not solving." His example: a CLI for thousands of users needs full argument parsing, a team-only CI script can trade it for faster builds | "it would be stupid to roll your own solution to something already solved by crates.io. And it's not like it's guaranteed that your solution will be smaller."; "procedural macros are not _inherently_ slow to compile." |
| Automation in the main language (Carmack, credited) | Write scripts and automation in the project's language, not in shell or Python | "A common anti-pattern is to write these sorts of automations in bash and Python, but that's almost pure technical debt." | Bootstrap code: "it has to be sh, rather than Zig, as this is bootstrap code that needs to be run with what we have on a machine built-in"; in 2026 he lists "writing a bash script" as one acceptable position |
| xtask (Rust) | Automation as an unpublished workspace member, reached through Cargo aliases | "once a software project grows, it's almost inevitable that it will require some tasks *besides* building Rust code." | none stated |
| Self-modifying code | Generate source code as committed text that an ordinary test rewrites and checks for freshness | To "generate _source_ code if you are not a huge fan of macros" | none stated; the cost: "Unlike macros, this doesn't try to enforce at compile time that the generated code is fresh." |
| O(1) build file | Keep build and CI configuration the same size as the project grows: a handful of entry points with filters, since "each line is typically a new entry point, and a bit of required knowledge to be able to run the project locally." | none stated | Separate `lint` and `fmt` entry points are "a point of contention"; "Odd steps which I'd love to get rid off, but which don't really fit anywhere else" |
| Chain onto a running entry point | Attach code that rots unseen (benchmarks, scripts, generators, repository checks) to an entry point that runs on every change | "any code that is _not_ running during NRSR is effectively dead." (the not-rocket-science rule is `testing`'s) | none stated |
| One binary, many subcommands (BusyBox, credited) | Build related tools as one multicall binary | "If you have `n` binaries and `m` libraries, and each binary uses each library, then the amount of work to do during the linking is `m * n`."; "it also helps with putting out fires in the field, as the binary you have in production also contains all the debug tools." | none stated; separate production and test builds stay. Scope: for several services, argued from the org chart, it is one post ([hypotheses](limits.md#hypotheses)). |
| Avoid monomorphization (Rust; std's `inner` idiom) | At crate boundaries, a thin generic shell over a monomorphic inner function; prefer `&dyn Fn` | "Avoid making a lot of code type parametric, *especially* on the boundaries between crates."; "compile times are as big part of ergonomics, as the syntax used to call the function." | "Avoid `AsRef` polymorphism, it pays back only for widely used libraries"; "generic, inline hotpath; concrete, outline coldpath" |
| CI caching (Rust) | Cache dependencies on CI, not the project's own crates | "CI builds often are closer to from-scratch builds, as changes are typically much bigger than from a local edit-compile cycle." | none stated. Scope: only this rule recurs; his other CI-workflow tips are one post. |
| Universal server (Erlang's, credited) | Keep custom automation in the main repository and language; it redeploys itself from main in a clone-build-run loop | Automation "that doesn't fit CI"; "works like a charm at our scale!" | "Long term, this _probably_ should be integrated into some kind of infrastructure as code setup" |
| DevHub | An internal web page for the project: static files in the repository, deployed from main, a JSON file in git as its store | "for every large project"; "This is more situational, but consider if, in addition to public-facing website, you also need an internal, engineering-facing one." | none stated |
| Moloch the Lockless | For a package manager: each manifest lists its direct dependencies' versions and checksums, so the manifests form a distributed lockfile | none stated | none stated. Scope: a design he sketches, not one he built, in two posts of one series. |

## Change and layout

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| Fix it one level deeper | Read a bug as pointing at a class of bugs, a missing CI check included, and close the class | "if you don't laser-focus on that, and try to perceive the surrounding context, it turns out that the bug is valuable, and it is pointing in the direction of a bigger related problem." | none stated |
| Inverse triangle inequality | Split a change into independent pieces: the API change apart from its callers, code motion before logic, duplicate → change the copy → switch → delete; "the “size” of commit/pull-request is only a proxy!" | "If you follow obvious development practices (no flaky tests, not rocket science rule, programmers prioritize reviewing code over writing more code)" | "occasionally I do a massive change in one go, if it can't be reasonably split."; step by step risks "getting stuck in the local optimum", so he also explores the full change and lands it in steps: "I often combine the two approaches. I do the same work twice." |
| Flat workspace (Rust) | `crates/*`, directory name equal to crate name, a virtual manifest at the root | "for projects in between ten thousand and one million lines of code, the flat layout makes the most sense." | "nested structure scales better than a flat one. But the constant matters --- until you hit a million lines of code" |
