# Glossary

> Loaded when: When a term from this skill or from matklad's corpus is used or met.

Each entry states matklad's operative sense and what follows from it. Use one term per concept; do not rotate synonyms. Origin tags: `coin.` = his coinage or naming; `re-spec.` = common word used in a narrower or wider sense; `borr.` = borrowed from the named source.

## Homonym traps

| Term | Sense in this model | What follows |
|---|---|---|
| **hourglass** | **Geometry flip across years ([fork F8](limits.md#forks-and-reversals)):** in 2022 (*Almost Rules*), "hourglass shape" means a **good** narrow boundary neck between two large subsystems. In 2025 (*Size Matters*), "hourglass module" means a **bad** module with a wide interface and a tiny body, while a good module is an "inverted hourglass" (small inputs/outputs, large body). | Both mean the same rule: **maximize `body volume ÷ interface surface area`**. Use **cut ratio** or **thin waist** in prose so the metaphor never flips. |
| **kitchen sink** | **Positive for modules** (*Design Pattern: Dumping Ground*): an explicit module (`shortcuts`, `stdx`) that holds glue connecting independent domain modules. **Negative for errors** (*Study of `std::io::Error`*): packing dissimilar failure origins (hardware I/O vs programmer serialization bugs) into one error type ("error kitchensinkosis"). | Create a kitchen-sink module to keep domain modules decoupled; never create a kitchen-sink error type. |
| **reified** | **Positive for boundaries** (*Almost Rules*): turning an informal import rule into a physical crate or process edge enforced by the toolchain. **Negative for control flow** (`ra #3629`, *Push Ifs Up*): turning an `if` branch into an enum just to `match` on it later ("reified control flow", a **dissolving enum**). | Reify boundaries; dissolve control-flow enums. |
| **static allocation** | Not compile-time `static` arrays, but **"no memory allocation after startup"**: `main` allocates all buffers upfront from CLI-derived worst-case bounds and passes them in; the event loop has no allocator. | Requires finite input/message physics; acts as a forcing function so every queue and table has an explicit numeric limit. |

## Terms

| Term | Origin | Sense and what follows |
|---|---|---|
| **Architecture Invariant** | `coin.` (builds on Kaminski) | A high-level design constraint that holds as the code evolves, usually stated as an **absence** ("`base-db` knows nothing about files or paths"; "no allocation after startup"). Write them down in `ARCHITECTURE.md` and cite them in reviews because absences cannot be read off local code. |
| **boundary (external / hard vs internal)** | `borr.` (Kaminski, extended) | An interface separating two parts of a system. Ask whether one commit can change both sides: if not (hard external/IPC/semver boundary), design carefully; if yes (internal), reify as a crate only when needed to stop erosion. |
| **almost rules** | `coin.` | Informal architectural rules ("module A shall not import module B") that are not mechanically checked. They erode under feature pressure; reify them as crate edges, withheld capabilities or `tidy` checks. |
| **cut ratio** | `coin.` | `implementation volume ÷ interface surface area` (*Size Matters*). Extract a data structure or module when this ratio is high, regardless of whether the file is 10 or 10,000 lines long. |
| **thin waist** | `borr.` (Oil shell / networking) | A narrow, plain-data representation (`ide` API, AST/IR, Unix text stream) sitting between many producers and many consumers so `M × N` adapters collapse to `M + N`. |
| **thin film** | `coin.` | Viewing an interface as a two-sided membrane where the producer side and consumer side want different constructs (e.g. a `Diagnostics` factory sink for producers vs a rendered report for consumers) rather than one shared enum. |
| **compilation unit (CU) / closed vs open world** | `re-spec.` | Inside one CU (`crate` in Rust, package in Zig), all usages are known (**closed world**), so fine-grained module visibility (`pub(super)`) is unnecessary. Across a published CU edge, usages are unknowable (**open world**). |
| **codemap** | `coin.` | A coarse bird's-eye directory walk in `ARCHITECTURE.md` ("a map of a country, not an atlas of maps of its states") using plain symbol/directory names rather than brittle hyperlinks. |
| **Concrete Abstraction** | `coin.` (builds on Muratori) | A trait or generic parameter whose every call site uses a known concrete type. Delete the trait and use concrete functions. |
| **Binary Privacy** | `coin.` (builds on Alexandrescu, Kaminski) | Either all fields of a struct are `pub` (plain data) or all fields are private (an ADT guarding a local invariant). Never write getters or setters in application code. |
| **Call-Site Dependency Injection (CSDI)** | `coin.` | Passing dependencies (`&Context`, `Config`, allocator) as parameters to each function call rather than storing them inside long-lived structs. |
| **Push Ifs Up / Push Fors Down** | `coin.` (credits Carmack) | Hoist preconditions and branching up to a single top-level caller (`if`s up) and operate on slices/batches in the callees (`for`s down). |
| **control plane / data plane** | `borr.` (TigerStyle / networking) | `O(1)` decision and routing logic (control plane) separated from `O(N)` batched execution over homogeneous items (data plane). |
| **laziness vs incrementality** | `re-spec.` | **Laziness** is skipping huge swaths of work altogether (coarse per-file stubs, `.rmeta`, durability vectors); **incrementality** is reusing prior computations via dependency tracking. Prefer laziness first. |
| **early cutoff shield** | `coin.` | An intermediate query whose output strips volatile details (whitespace, byte offsets) so edits inside a body do not invalidate downstream semantic queries. |
| **salsa firewall / Source-Map pattern** | `coin.` | Returning `(PositionIndependentAst, SourceMap)` from lowering so type/name resolution depends only on the position-independent half. |
| **durability** | `coin.` (`salsa`) | Classifying inputs by volatility (stdlib vs third-party deps vs user files) and maintaining a small version vector so validation skips unchanged durability tiers. |
| **spine vs features** | `coin.` | Splitting a system into a small, pedantically reviewed core **spine** and many crash-isolated **features** (`catch_unwind` over immutable snapshots) where contributor friction stays low. |
| **isolation boundary** | `re-spec.` (Midori) | The outer seam (request handler, process edge, operator UI) where errors are formatted for humans and where panics may be caught into values. |
| **error virality** | `coin.` | When one large error payload on a rare path inflates the `Result` size and slows return ABIs across every function in the call stack. Keep control-flow errors small. |
| **O(1) build file** | `coin.` | Keeping `build.zig` / CI workflow line count constant as the codebase grows by routing tasks through a fixed set of commands (`run`, `test`, `fuzz`, `deploy`) and multicall binaries. |
| **fundamental vs accidental (dependencies)** | `re-spec.` | Rely on external tools/platforms for fundamental complexity (a multi-OS hardware fleet); own accidental glue in your main language (`xtask`, `build.zig`). |
| **three-state stability** | `coin.` | Classifying dependencies as *experimental*, *production-ready* (usable in active projects that budget bounded upgrade work), or *stable*. |
| **cardinality (stdlib rule)** | `re-spec.` | Putting a type or facility in `std` only when there must be exactly **one** of it across the ecosystem (vocabulary types, crypto RNG) rather than because it wraps OS I/O. |
| **Kolmogorov's zero–one law** | `coin.` (metaphor) | In a large codebase, any pattern not statically rejected by the compiler/tidy check exists almost surely (`S = 1`, [hypothesis](limits.md#hypotheses)). |
