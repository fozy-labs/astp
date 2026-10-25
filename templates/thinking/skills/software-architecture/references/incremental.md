# IDEs, language servers and compilers

> Loaded when: The system is an IDE, language server, compiler, or an incremental build or analysis.

Domain-gated. Outside these systems nothing here instructs. The material is his IDE and compiler craft, much of it other people's designs that he describes and credits; it gives no general concept. The general direction is [absence](../SKILL.md#five-concepts) and the edge: here, what happens inside a function body must not invalidate anything outside it.

## Positions

- **An IDE is not a batch compiler.** "Adding a latency requirement doesn't mean that you need to optimize harder. Rather, it means that you generally need to turn the architecture on its head to have an acceptable latency at all." Re-engineering an existing compiler for an IDE "is often impossible, or isomorphic to a rewrite."; in 2023 he puts the obstacle in entrenched code, not in a law.
- **Laziness first, then incrementality.** "it's not the incrementality that makes and IDE fast. Rather, it's laziness -- the ability to skip huge swaths of code altogether." Add incrementality where the language leaves the lazy unit too big: for Rust, "The minimal feasible unit of laziness, a crate, is still too big."
- **The output a human reads is bounded.** "No matter the size of the codebase, the amount of information displayed on the screen in user's IDE at a given point in time is O(1)." Bound the result and short-circuit the inner loop.
- **Check the dependency structure before choosing an incremental design.** "the update work can't be smaller than the change in the result."
- **When the language defeats both indexes and headers**, a generic query engine (salsa), keeping every query pure: "The main benefit of this approach is generality and correctness."; its cost: "extra complexity, slower performance (fine-grained tracking of dependencies takes time and memory) and a feeling that this is a somewhat uncharted territory yet".
- **Strong consistency by default.** "We never use stale data to answer requests."; on an edit, cancel in-flight reads: "writes should be prioritized over reads, because they reflect more up-to-date and more useful data." It "works especially well for languages with good support for separate compilation"; for Zig he relaxes it ([fork](limits.md#forks)).
- **The editor boundary sits at presentation.** "LSP is formulated in terms of what's shown in the completion widget, not in terms of the underlying semantic language entities."; "try to treat LSP as a serialization format, not as an internal data model." For protocol state, "What actually is needed is "level triggered" *state synchronization*."
- **Feed IDE needs back into the language.** "If it is possible to type-check the body of a function without looking at the bodies of other functions, you can speed up an IDE by drastically reducing the amount of work it needs to do."

Narrowed, in [limits](limits.md#narrowed-the-scope-that-binds): parallelism, incrementality and resilience as one property; the cost of macros to an IDE; an IDE need not be fully correct.

## Tricks

Columns as in [tricks.md](tricks.md).

| Trick | Move | Signed when | Wrong when |
|---|---|---|---|
| Incremental map-reduce compiler [ours]: "leverage language semantics to manually cut the compilation tasks into somewhat coarse-grained chunks" | Cut compilation into chunks the language makes independent; queries only where that fails | "The above scheme works only if the language has a property that changing the body of function `foo` (not touching its signature) can't introduce type errors into an unrelated function `bar`." | Rust: "typing something in `a.rs` can change parsing results for `b.rs`, and that forces fine-grained dependency tracking and invalidation to the very beginning of the front-end." |
| Map-reduce index of stubs (IntelliJ, Sorbet; he describes them) | Index each file alone into a stub with unresolved types; update the index per file | The language has fully qualified names: "it works only when it works -- not every language has a well-defined FQN concept." | Rust: "We can't put the results of macro expansion into the index, because it depends on a macro definition in another file." |
| Leveraging headers (clangd, Merlin; he describes them) | Reuse the batch compiler and snapshot its state after the imports | "a "declaration before use" rule," and "headers or equivalent interface files." | "In Rust, the compilation unit is a whole crate" |
| Early cutoff shields | Put cheap projection queries between volatile inputs and expensive results; keep positions out of shared results | none stated (his case: whitespace changes the parse tree, which would recompute the module tree) | none stated |
| Location interner | Intern positional item locations into integers: ids stable under unrelated edits and still small | Array-index ids "are not stable: Adding a new item can shift the IDs of all other items"; positional ids "ceases to be a `Copy`able integer" | none stated |
| Durability (Niko Matsakis's salsa mechanism; Kladov applied it) | Tag inputs by how often they change, so validation skips the stable subgraphs | An edit re-checks stable inputs: "any change to `src/lib.rs` necessitates checking all the queries related to standard library (which adds up to about 300ms)." (a measurement, illustration) | none stated |
| In-place updates | Keep per-file and global maps; patch the global one with the per-file diff | "a language with package declarations and fully qualified names, like Kotlin" | none stated |
| Iterative recursive analysis [ours] (credits Kotlin and Roslyn) | Map a syntax node to semantics through its parent's semantics, picking the child whose source is this node | "1. Syntactic nesting must match semantic nesting." and "2. Getting semantic element for an entire file is trivial." | "The second one is actually less true in Rust than it is in Kotlin or C#!"; with macro-generated syntax, "Where this breaks down is laziness." |
| The Sorbet trick (Sorbet's design, endorsed) | Keep metaprogramming off the analyzer's hot path: in 2021, macros that work a file at a time in the indexing phase; in 2026, no macros run, a plugin declares their effects | none stated of his own; he endorses Sorbet's motivation: "I _really_ like the motivation there." | Macros that need types: they "can't know a type of the variable"; then "a code generation step before the build" |
| Thin waist (Oil shell's term, credited) | Reuse an existing common protocol that cuts M × N integrations to M + N, instead of one client per front end | none stated | What the protocol cannot carry: "What you wouldn't get out of LSP is Magit's sleek one-letter mnemonics for actions." Scope: the lens recurs; "magit for jj" over LSP is one post. |
