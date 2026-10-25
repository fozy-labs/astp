# Generated inputs and verdicts

> Loaded when: Writing a fuzz, property, exhaustive or simulation test; choosing an oracle or assertions; a generated test failed and needs reproducing or shrinking; a bug escaped the fuzzers.

Gates 4 and 5 in detail. Scopes that bind are in [limits](limits.md#narrowed-the-scope-that-binds); techniques he did not originate are tagged there under [voices](limits.md#voices-that-are-not-his).

## Contents

- [The generator](#the-generator)
- [Aiming the generator](#aiming-the-generator)
- [The verdict](#the-verdict)
- [Reproducing and shrinking](#reproducing-and-shrinking)
- [Components and whole systems](#components-and-whole-systems)
- [The model before the fuzzer](#the-model-before-the-fuzzer)

## The generator

- Write the test to read its choices from a finite stream of random bytes. Fuzzing and property testing are then one harness: "Fuzzing and property based testing are the same thing. You can use fuzzer to drive your property based tests".
- Generate as you go: pick each next operation from the current state, not a whole case up front. When the bytes run out, the test passes: "We assume that the code is innocent until proven guilty".
- Make the seed the only input, so a failure is a commit plus a seed (and an entropy size) that replays it exactly.
- Use a fresh seed per run, printed before the code under test can crash: "over its lifetime, the test is going to be re-run many thousand times over, and it is wasteful to not take advantage of that". Fix the seed only for statistical assertions.
- Give the random API closed intervals: "close interval removes a possibility of a subtle crash."
- Once tests are data, generate them, and seed the generator with the examples: "A nice way to get one is to `sort | unique` all the unit tests."

## Aiming the generator

- When small inputs can be enumerated, test all of them: "_Most_ of the bugs involve small, tricky examples." A generator that takes a PRNG can enumerate: "If you wrote a function that takes a PRNG and generates a random object, you already have a function capable of enumerating all objects."
- Bias toward small, tricky inputs (a small alphabet, repeats, all-equal values) and keep some fully random ones: "You still want some amount of purely random inputs, just in case."
- Get repeats by drawing from a much smaller range than the type allows.
- Generate invalid inputs as well as valid ones: "Testing only positive space is a common pitfall."
- Swarm testing: at the start of each run, draw a weight per operation, so some runs push the system to an extreme and some leave features out: "you should sample the probabilities themselves!" Under a uniform choice "our queue is very short on average. We never exercise large queues!"
- Make rare failure paths common: trigger the failures on purpose (an allocator that really fails), or design the separate unhappy path out, because "Such “cold code” is the preferred habitat for bugs!"
- Check that the fuzzer reaches what it exists for: "repeat the test many times, counting all the sad and happy cases, and assert that they are reasonable".

## The verdict

- **No crash.** With no known expected result, assert general properties, at least that it does not crash or fails with a well-formed error. The strength of this oracle is the assertion density of the code under test.
- **An exact model.** When the component has a simple specification, write a naive model that always knows the answer, apply the same operations to both, and compare: "For data structures, by far the best power-to-weight ratio testing strategy is property based testing, especially if you can come up with a model that behaves exactly as the ADT".
- **Two computations.** "carry out the same computation in two different ways and check that the result is indeed the same", a check that "can be lifted straight out of tests into the production code".
- **Co-design the harness.** When designing a reliable system, design its test harness with it: "co-designing system and its testing harness is a point of leverage (build an oracle!)".
- **A humble PRNG goes far** with targeted generation and an oracle: "even a humble PRNG is brutally effective, if you put it to good use". He still wants coverage guidance.

Assertions in the code under test are what "no crash" checks:

- For an invariant the types cannot express, assert it in the code; "Assert liberally."
- For a real contract, assert on both sides: "you do one check at the call site, and one check at the definition site".
- Assert an implication as `if (a) assert(b)`.
- "Negations are not easy! State invariants positively."

## Reproducing and shrinking

- Reproduction before minimization: report a short seed plus the exact command that replays it. "for the user experience, it is critical that you don't have to piece together the command line yourself".
- Minimize by entropy length: rerun with fresh, shorter random input while it still fails. "naive, but practically effective" is his label; Hypothesis shrinks smarter.
- Among failing seeds, keep the one that fails fastest: "Seeds that failed faster are simpler." He calls it a stand-in for real minimization: a workaround by his own label.
- Before debugging, make the failing case small: "first try to _remove_ as much code as I can, and only then investigate the problematic test case".
- Code that exits on failure is tested from a parent process, and the search for crashes runs the system in a child process (in Zig, because "There's no unwinding in Zig").

## Components and whole systems

At TigerBeetle these are house design he retells and extends, not his invention.

- A whole-system simulator plus a targeted fuzzer per subsystem: "Main fuzzer works out the seams between components, while minor fuzzers divide&conquerer the resulting combinatorial explosion."
- Fuzz a reusable component alone: its public calls in random order, respecting their preconditions, checked for no crash plus a structural property.
- The simulator's interface is domain-level: "TigerBeetle has IO, but we don’t mock IO. We mock storage (fixed sized sector aligned reads/writes) and network (message passing)."
- Use the whole-system simulator to explore, performance at the protocol level included; strict assertions are hard to get from it.
- Split simulation into a safety mode (random faults) and a liveness mode (heal a core, keep other faults permanent, require progress). A liveness failure shows only as a timeout.
- Co-develop the fuzzer with the feature it tests. Sketching interfaces for fuzzing before the system exists is `software-architecture`'s.

## The model before the fuzzer

- "Don’t write fuzzers to find bugs in the code, write fuzzers to find bugs in your understanding of the problem."
- Read the whole subsystem, not just the diff, against your understanding: "If you are reviewing a PR, don't review _just_ the diff, review the entire subsystem."
- When code fails, look for the broken invariant instead of fumbling with plus or minus ones until green.
- When a bug escaped the fuzzers: "your first order of business is to treat this event as a bug in the _fuzzer_ … Only then you are allowed to add a fix and a unit test!" ("unit test" here is an example-based regression test, see the [glossary](glossary.md)).
- Layer defenses; no single technique suffices, and generative testing belongs below the outer layer too.
