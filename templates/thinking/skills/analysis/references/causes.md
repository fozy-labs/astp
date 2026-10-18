# Finding a cause

> Loaded when: Finding the cause of a failure, regression, flaky test or wrong output; or reporting a found bug or a workaround.

These moves come from the school, not from Luu: David Pacheco (a CockroachDB crash in the Go runtime during Oxide test runs, [omicron#1146](https://github.com/oxidecomputer/omicron/issues/1146), and [omicron#9259](https://github.com/oxidecomputer/omicron/issues/9259)) and Robert O'Callahan (rr and Firefox bugs). Each move below is practised by both. In Pacheco's thread, "Robert" is Robert Mustacchi, a colleague, not O'Callahan.

**The hypothesis comes from outside this file.** In both of Pacheco's investigations a colleague supplied the decisive lead; O'Callahan's guesses came from captured data and his own experience ("with this data, I'm able to make some inspired guesses"). These moves capture a failure and test a guess; none produces the first guess. Asking someone who knows the system is legitimate. Without a hypothesis, say so.

The moves have no order, except inside the first one.

- **Explain one captured instance completely.** Take one failure you have captured (a core file, a recording, a run under instrumentation) and explain it fully. Only then check whether the other failures share its cause. Each took the instance that was cheapest to capture or to understand.
- **Trace back from the bad value.** From one wrong value, trace backwards to where it was produced. Scope: data diverged in a few values and the path can be walked (a recording, reverse execution); "These techniques don't work if control flow diverged" (O'Callahan). In both school cases the trace found where the bad value came from, and the cause at that point came from someone's memory or domain knowledge. The trace narrows the search; it does not explain.
- **Test the diagnosis with a minimal standalone testcase.** Write a small program that exercises only what the diagnosis says matters. O'Callahan, judging an AI-written diagnosis: remove what it says is irrelevant "so we can be 100% confident that diagnosis is correct". In practice he writes a new test rather than cutting down the reproducer.
- **Inject the suspected trigger where the diagnosis puts it.** Pacheco raised the suspected signal inside the suspected function; O'Callahan inserted a one-second sleep at a breakpoint.
- **Check the found cause against every other observation.** Other platforms, versions, CI against local. Write down which observations it explains and which it does not.
- **Say what you found, and what you did not.** Say whether the bug you found is the one reported ("I don't know for sure that this issue is what caused the timeouts in test automation, but it's worth fixing", O'Callahan). Label a workaround with what it assumes and what it leaves open. In their cases these were notes shipped to users.

Retesting a fix against the prior failure rate, reading a partial reproduction, searching a dependency's bug record and reading what a probe changes are each one author's move or one occurrence: [limits](limits.md#hypotheses).
