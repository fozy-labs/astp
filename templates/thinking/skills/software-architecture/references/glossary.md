# Glossary

> Loaded when: A term from this skill or from his writing is used or met, especially "boundary", "invariant", "kitchen sink", "hourglass".

His coinages and the common words he uses in his own sense. Each row says what follows from the term. Use one term per concept; do not rotate synonyms.

## Homonym traps

| Term | His sense | What follows |
|---|---|---|
| **boundary** | Re-specified. A hard system boundary separates "your system" from "not your system"; an internal boundary "is a very non-physical thing, most of the time it's just informal rules like 'module A shall not import module B'." "good boundaries have measure zero": they cannot be found by reading code. Kaminski's vocabulary, credited. `testing` uses the word and defers to this skill. | Name each boundary and who controls its other side; write the internal ones down. |
| **invariant** (in the large) | "some property which holds at all times during dynamic evolution of the system", where the evolution is "how the source code of the program itself evolves". As an asserted property in code it is `testing`'s. | An architecture invariant must survive refactors and new features; most are absences. |
| **kitchen sink** | Two senses, opposite valence. A module: "stuff that doesn't fit goes here by default", good when a solid design exists. An error type that packs dissimilar failures: bad ("error kitchensinkosis"). | Read which object the word is about. |
| **reified** | Praise for a boundary made physical; blame for "reified control flow", an enum made only to be matched later. | A reified boundary holds; a reified branch should be pulled up. |
| **hourglass** | 2022: a narrow cut across a whole system, good. 2025: "hourglass functions/modules are a smell"; the good shape is the inverse. Same principle, different axes. | Use the ratio, not the picture. |
| **thin waist** | A common protocol that cuts M × N integrations to M + N (Oil shell's term). Not the cut ratio. | Reuse an existing waist; do not read it as advice on module size. |
| **fundamental vs accidental** | Rent the fundamental complexity, own the accidental: installing Python on three OSes "is also part of the fundamental complexity here and … we are happy to use dependency"; build time is "pure accidental complexity". Brooks's terms, uncredited. | Depend on a platform for what is fundamental to the problem; own the accidental parts, in your own language. |
| **static allocation** | Not `static` arrays: "a weaker 'no allocation after startup' form". | Possible when inputs and outputs are finite. |

## Terms

| Term | What follows |
|---|---|
| **Architecture Invariant** | rust-analyzer's design-doc label (2020 heading, 2021 bold); "They often talk about things which are deliberately absent in the source code." Write them down, because reading the code will not reveal them. |
| **codemap** | "a map of a country, not an atlas of maps of its states." Coarse modules and their relations only; name files and types, do not link them. |
| **code–architecture gap** | The document may state intent the code does not yet meet; say so in it. |
| **cut, cut ratio** | "Cut ratio" is this skill's label for his "optimize the _ratio_ of module size to its interface"; "cut" is his word from another text. `testing` calls the concept the narrow cut. |
| **glue** | Code "gluing our pure data model to the messy outside world"; glue may know the model, the model may not know the glue. |
| **façade** | "`ra_hir` is a facade." The layer above sees one crate's types only; from outside, `hir` "looks like an inert data structure". |
| **closed vs open world** | "closed world (all usages are known) or open world (usages are not-knowable)": visibility matters at the compilation-unit edge. |
| **ADT vs data** | A type that guards interior invariants against one that groups related attributes: binary privacy, fields all private or all public. |
| **concrete abstraction** | An abstraction whose every use "is _concrete_" compresses nothing. |
| **doer object** | "objects which are created only to execute a single action": expose a function instead. |
| **false sharing** (of a function) | "additional `if` branching inside for two different cases": split the function. |
| **dissolving enum** | A condition "reified as a data structure": pull the branch up instead. |
| **thin film** | "every abstraction is a thin film separating two large bodies of code": user and implementor may want different shapes. |
| **control plane / data plane** | Decide rarely and up top, then process in bulk: "control plane is O(1) to data plane's O(N)". The batching form is Greef's. |
| **sans-io** | "a pure algorithm in a 'sans-io' style": the caller drives the loop and the I/O. Credited. |
| **ground / derived state** | Inputs are pushed in; everything else is computed. |
| **file system witness** | Path APIs "take some existing path as a 'file system witness'": no single assumed file system. |
| **isolation boundary** | Where an error is "presented to the operator", and where a contained failure stops; elsewhere a bug propagates. |
| **error destination** | Handled (a small closed set of codes or kinds) or reported (encapsulated, or rendered at once); the destination decides the type. |
| **error virality** | "a single large error on however rare code path leads to worse code everywhere": keep error types small. |
| **spine vs features** | rust-analyzer's core, held to a stricter bar, against crash-isolated features whose quality "doesn't spill over". |
| **essential variability** | "Embrace essential variability.": ask as little of the environment as possible instead of pinning it. |
| **midlayer mistake** | The kernel term: a framework that owns the control flow. "CI as a SaaS feels like accidental complexity of midlayer mistake variety." |
| **build system** | "a bootstrap process: it is how you get from `git clone` to a working binary". |
| **entry point** | "each line is typically a new entry point, and a bit of required knowledge to be able to run the project locally.": an entry point costs knowledge as well as compute. |
| **dependency** | "A checksum"; a version is "a specific rule about dependency substitutability". |
| **pull its weight** | "use procedural macros only where they pull their weight": judge a dependency by what it costs the build against what it solves. |
| **physical architecture** | What compiles where, apart from the logical cut. |
| **logically / physically** | TigerBeetle's recurring pair: logical intent against physical bytes and placement. |
| **domain type vs "for humans" type** | "Formatting as date is human concern.": presentation goes on the human-facing type. |
| **ratchet** | "monotonically increase the set of properties the codebase possesses, one small check at a time". |
| **Universal Server** | Automation that redeploys itself from main "via a self-bootstrapping pattern". Erlang's, credited. |
| **inverse triangle inequality** | "If you need to go from A to C, it is almost always easier to reach midpoint B first!" |
| **Extra Mile** | "We generally try to put a bit of extra into code we write.": explore the full solution, then land it in steps. |
| **modularity** | "partitioning the code into disjoint components with well-defined interfaces, such that each particular component is aware only about the interfaces of other components": who-knows-whom is the definition. |
| **laziness, incrementality** | Laziness is "the ability to skip huge swaths of code altogether"; incrementality reuses results. Separate axes (`incremental.md`). |
| **early cutoff, query, durability, stub** | Salsa and IDE terms, in `incremental.md`. |
| **strong consistency** (IDE) | "If the language server acknowledged a source code edit, all future semantic requests … reflect this change." His default. |
| **NRSR** | The not-rocket-science rule: `testing`'s. |
