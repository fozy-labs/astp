# Checks: the failures they catch

> Loaded when: Judging someone else's claim and you want the failure it resembles; or a check's scope is contested.

The checks are stated in [SKILL.md](../SKILL.md#the-six-checks); this file adds the worked failures from Luu's posts that keep them from being textbook, and the limits of each. Post names are danluu.com slugs. A failure here is a pattern to recognise, not a verdict on the claim in front of you.

## Intermediate target

- His agent-built regex engine beat its reference on the benchmark suite it was optimised against; on a holdout corpus it was 10× slower where the runs finished: "So much for being 40% faster!" (measured, lower-standard post; *benchpocalypse*). Agents hard-coded outputs "even when instructed not to cheat" (*pl-tokens*).
- Optimising three reported percentiles made the rest of the latency distribution worse; page-speed scores were gamed without faster pages for users (*percentile-latency*, *slow-device*).
- Server-side dashboards reported p99 latency of 0.37 ms where callers saw about 580 ms (measured; *latency-pitfalls*). Keyboard latency is felt at the keypress, not at the switch (*keyboard-latency*).
- **Limit.** A holdout is one form. Luu fixed overfitting another way in a different project, and measuring at the end goal also counts. Agent-built holdouts can leak or contain unfair tests (*pl-tokens*); his own was "an arbitrary subset … chosen by an agent for unknown reasons".

## Execution

- People "pass around the top-line number, even when it's not meaningful" instead of looking at the runs (*agentic-testing*).
- Agents asked to "do" a named testing technique mostly wrote ordinary tests inside its framework (*agentic-testing*; Jamie Brandon reports the same, in his voice).
- Rescoring one language against its own executable gave it a perfect score; assembly scored well because agents wrote C and compiled it (*pl-tokens*).
- "The study makes literally the opposite claim" to the one circulating (*gender-gap*); abstracts claim more than their bodies (*dunning-kruger*). An LLM fact check cited papers that taught agents to write poor tests (*agentic-testing*).
- Numbers an insider told him were "off by multiple orders of magnitude" once measured (*corrections*, his own error).
- A public claim that an LLM solved projects at expert level: the projects he opened "either didn't work or worked very badly" (*brain-off*).
- Moving from CVS or SVN to git was a win "because git and hg are superior in multiple respects … not because having small repos is better per se" (*monorepo*), against the most common reply to his case for one repository.

## Aggregation

- "Having 1 out of 113 tasks sort of be similar to a task I've done means the DeepSWE benchmark score is meaningless to me personally" (illustration; *exercise-7*). A size cutoff passed 121 lines of code and failed 122 (illustration of a cliff).
- Averaging per-shard p99s hides the tail: "0.99 + 0.01 * 10 = 1.09" (illustration; *latency-pitfalls*).
- Most bugs are simple by count and not by debugging time (*concurrency-bugs*). Bunching at a threshold means someone acts on it (*discontinuities*).
- **Limit.** "Sometimes … in aggregate, the noise cancels out" (*exercise-7*). Choosing the right weights needs domain knowledge ([SKILL.md](../SKILL.md#what-this-skill-refuses-to-be)).

## Mechanism

- A 3.5 ms polling saving cannot rescue keyboards whose spread is far larger (limit; *keyboard-latency*). A claimed 8 GiB/s exceeds the 5000 MiB/s the attached disks can deliver (limit, a hard bound; *exercise-7*).
- A forecaster read the shape of a curve, "not the mechanism" (*futurist-predictions*). A critic "pulls on minor issues that are not positioned to cause the very large changes he suggests" (*zitron*).
- An explanation of high programmer pay that holds equally for other engineering fields explains nothing (*bimodal-compensation*).
- **Limit.** He kept extreme outlier results because "it's not obvious that the results are incorrect" (*exercise-7*).

## Observer

- Re-grading the same outputs ten times flipped the official result 23% of the time (measured; *exercise-7*). "The difference between 25.0% and 24.4% is pretty much meaningless" (illustration).
- With LLMs, "people are often misled into thinking a skill is useful by a few small runs" (*agentic-testing*, lower-standard post).
- Keyboard jitter of about 5 ms at p90 rules out tail-latency claims from that rig (limit of that instrument; *keyboard-latency*).
- "I was very exicted by the initial result … it confirmed my biases. … But it turned out" to be an experimental error (*pl-tokens*; also *agentic-testing*).
- Calibration training and "the language of probability" did not make an AI-timelines estimate reliable: its key input was "pulled from thin air", and "the whole methodology is backwards" (*futurist-predictions*, the one worked case).

## Budget

- One minute per benchmark found a flaw twice in a row, so "this implies there are other issues" (*benchpocalypse*); "when you're finding a bug every minute you look … there are probably a lot of other bugs" (*pl-tokens*). Both are lower-standard posts; *empirical-pl* shows the same inference at normal standard ("multiple serious flaws, any one of which would invalidate the results").
- He published despite known flaws because they did not bear on the question asked (*pl-tokens*), and bounded a confounded speedup instead of attributing it (*octopress-speedup*).
- **Limit.** His distrust of striking benchmark claims is triage under an attention shortage ("this will sometimes be wrong"). Writing a source off after about 90 seconds (illustration) spends his attention; it refutes nothing, and refuting the same source cost him far more (*zitron*).

## People's defaults these checks overturn

| Default | Check that overturns it |
|---|---|
| Read the top-line score | execution, observer |
| A comprehensive suite is trustworthy | budget: meaningless "unless you audit the result or trust someone who did" (triage) |
| Trust a feeling ("old computers feel faster") | observer: he measured it with a high-speed camera; the feeling was sometimes right |
| Measure at the server; average tail percentiles | intermediate target, aggregation |
| "Studies show", unread | execution |
| Signs of rigour as rigour | observer (one worked case) |
| Settle with abstract reasons | run the experiment |
| Generalise from trivial tasks | intermediate target |
