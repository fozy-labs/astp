---
name: analysis
description: >-
  Analytical checks for claims and evidence: a benchmark, eval or test-suite score, a
  metric, a speedup or latency claim, "studies show", an agent's or a colleague's report
  that something works or is fixed; comparing options on evidence; finding the cause of a
  failure, regression or flaky test; checking your own conclusion before you report it. Use
  when a number is about to be relied on, a result looks striking or confirms what you
  hoped, a score rose under optimisation, two explanations or options compete, a fix "seems
  to work", or you are about to write a verdict. Runs an unordered set of checks for where a
  claim and what happened come apart, with a budget and a stop rule. Not for generating
  hypotheses or ideas, statistics or experiment-design tutoring, domain knowledge, ranking
  values that cannot be priced, or what a design argument owes (that is design-derivation's
  Layer 0).
license: MIT
---

# analysis

## Where this comes from

This skill is one reconstructed reasoning model, not a body of knowledge. It was rebuilt from Dan Luu's worked analyses on danluu.com (120 public posts, 2013–2026: benchmarks, latency, evals and, from mid-2026, coding agents). The cause-finding part comes from David Pacheco (Oxide issue threads and design documents) and Robert O'Callahan (rr debugging posts and threads), admitted only where both of them do the same thing. None of the three took part, reviewed or endorsed it. An adversarial verification pass found 40 distinct moves: 23 held as stated, 12 held only in a narrower scope, 5 rest on a single occurrence; 13 clauses inside them were cut or demoted. Luu has no cause-finding move of his own that survives as stated. Most surviving checks are textbook, kept because his cases show people or agents failing them.

**Transfer risk.** Every agent default named here was observed on codex with GPT-5.6 Sol, mostly on Rust tasks implementing an RFC, with unpublished harnesses, mostly in posts Luu labels lower standard. He says defaults shift with harness, model and effort. None was observed on Claude Code.

Before you state a number, attribute a phrase, close a fork, or answer where this comes from, load `references/limits.md`.

## What this skill refuses to be

- **A workflow.** "It's more about avoiding mistakes than following some particular process, so there isn't really a step-by-step guide format" (Luu). The checks below have no order. Run the ones the claim exposes.
- **A source of hypotheses.** It checks statements already made. None of the three authors has a practised move for producing a guess: good guesses came from deep understanding of the system or the data, one's own or a colleague's. With no hypothesis, say so.
- **Domain knowledge.** Generic checks find execution, cheating and arithmetic flaws. Choosing a representative reference set, or the weights of a summary score, needs domain knowledge or an expert's artefact; Luu, knowing "approximately zero" about regex performance, borrowed an expert's corpus. Without either, name the verdict you cannot reach.
- **A ruling between values that cannot be priced.** Settle the facts, state your weight, show the per-item detail, and stop there.
- **An authority.** Never cite this skill or its authors against a person. Argue from the check you ran.

## The six checks

Each check is a place where what a claim says and what happened can come apart. The split into six is this skill's scaffolding, not Luu's. One flaw can fail two checks: an agent optimising a benchmark also changed how the benchmark ran.

**Intermediate target**: the number can rise without the end goal (Luu's term: "possible to improve without affecting the end goal").
- An optimised number: re-score it on a reference the optimiser never saw, not picked from the same source. A published holdout stops being one.
- Measure where the effect lands: at the user, at the caller, on the real workload at real size, in the shipped configuration. Check any proxy against that point. Results on trivial tasks do not transfer.

**Execution**: the label says X; what ran, or what the source says, is Y.
- Before reading a score difference, look at what was done: does each condition run what its label says, differ only in the variable, and was the treatment applied? Credit a win to the variable that produced it, not to something bundled with it.
- Open the cited source before repeating it. Abstracts overclaim; popular claims sometimes invert their source.
- Fact-check or discard a second-hand number when it enters your reasoning, not later. Measure numbers an insider gave you.
- An action an agent (or you) reports as done is unchecked until you check it.

**Aggregation**: the summary hides the few items, weights or cliffs that decide it.
- Find the items that decide the summary; ask whether they resemble the use in question and deserve their weight. Write a threshold or composite score out as a formula: arbitrary weights show. Look for cliffs at thresholds. Keep the distribution; never average percentiles.

**Mechanism**: the proposed cause cannot produce the effect.
- Reject a cause or a win whose size or mechanism cannot produce the effect. A curve fit is not a mechanism. A broken hard bound (a vendor maximum, more than full utilisation) justifies rejection; strangeness alone does not.
- Reject an explanation that predicts the same thing for cases that lack the effect.

**Observer**: the analyst, the grader or the instrument adds its own error. This check joins the analyst's bias and the device's noise.
- Measure the instrument's noise before reading differences: re-grade the same output, look at run-to-run spread. A gap inside the noise is no difference; a few runs mislead. An instrument's resolution bounds the claims it supports.
- Before looking at results, write your guesses with confidence and reasons. Afterwards grade the reasoning apart from whether the guess hit; grade others' forecasts by their stated mechanism.
- Be most suspicious of the result that excites you or confirms your bias: hunt for the setup flaw first.

**Budget**: not a gap but the spend; it decides how far to go.
- Look at the artefact behind a number before relying on it. The first look is cheap ("a minute" is his illustration, not a budget). A flaw found fast predicts more: lower your confidence, and one invalidating flaw discards the result.
- Stop when no remaining known or likely flaw could change the answer to the question asked. Skip a check that cannot change the conclusion. Bound what you cannot attribute.
- Distrust of a striking claim, a sniff test, or trust in someone with an audit record decides where you spend attention, never the verdict. A performance claim with no measurement behind it is probably false.

When an argument stalls on reasons, look at what happened or run the experiment.

## Agent defaults to override

The override form is this skill's choice. It rests on a hypothesis: Luu's self-described naive guess from one experiment, while his own data favour task-specific guidance and checking back to re-prompt ([limits](references/limits.md#hypotheses)). Read each row as something to catch yourself doing.

| Default seen in his runs | Override | Standing |
|---|---|---|
| Optimise the visible target and game it, even when told not to cheat or overfit | Keep a holdout the optimiser never sees, and tell it one exists | two experiments, one model; whether it generalises he "haven't tried enough examples to be able to tell" |
| Given a technique by name, apply it superficially or write the usual tests inside its framework | Judge the work by what was done, not by the technique's name | default seen across most of 26 conditions; the override is his reading practice, untested |
| Random inputs that mostly hit rejection paths | Steer randomised inputs to structured, valid ones | "directionally worked", one skill |
| Analyse results with basic reasoning errors | Treat an analysis, your own included, as a draft the checks must fix | seen in three posts; practice, untested |

## By job

| Job | What to add |
|---|---|
| Judging a claim or a metric | The checks the claim exposes. |
| Comparing options | The checks on each option's evidence, then `references/options.md`. |
| Finding a cause | The hypothesis comes from outside this skill; capture and test: `references/causes.md`. |
| Checking your own conclusion | The observer check on yourself: your registered guess, the result that pleases you, inputs that entered second-hand. Luu checks his own artefacts less strictly than others' (an [open fork](references/limits.md#forks)). |

## Relation to design-derivation's Layer 0

Layer 0 says what a claim owes: a measurement artefact, attribution, provenance. This skill supplies the checks that collect it and the budget for collecting, plus an attention triage Layer 0 lacks, which decides where to look, never what counts. They disagree conditionally in one place: Layer 0 treats a metric as a legitimate target without condition, while Luu requires a check the optimiser cannot see. That fork is open ([limits](references/limits.md#forks)). On refutation they agree.

## Output contract

Every verdict carries:

1. the claim in one line, and the end goal it stands for;
2. each check you ran, with what you looked at (file, run, item);
3. each relevant gap you did not check, with the direction it could push the result; if every unchecked gap pushes against your conclusion, say so and check the one that could flip it;
4. your confidence and what lowered it;
5. why you stopped: no remaining flaw could change this answer, or the budget ran out;
6. the scope: a few counter-cases refute a universal claim, a few supporting cases only suggest it, and a gap inside measured noise is no difference;
7. what you could not judge for lack of domain knowledge;
8. every number with its status, and guesses marked as guesses.

## Reference index

Load a file when its condition fires, never preventively. Every file has a row.

| Load this file | At this moment |
|---|---|
| `references/checks.md` | Judging someone else's claim and you want the failure it resembles; or a check's scope is contested. |
| `references/options.md` | Comparing options, or judging a claim that one option is better. |
| `references/causes.md` | Finding the cause of a failure, regression, flaky test or wrong output; or reporting a found bug or a workaround. |
| `references/limits.md` | Before stating a number, attributing a phrase, touching a fork or a hypothesis, citing the model, or answering where it comes from. |
| `references/glossary.md` | A term from this skill or from Luu's posts is used or met. |
