# Limits and forks

> Loaded when: Before stating a number, attributing a phrase, touching a fork or a hypothesis, citing the model, or answering where it comes from.

This file is the authority on statuses, forks, numbers and voices. Where it and another file in this skill disagree, this file wins.

## Contents

- [How to use this file](#how-to-use-this-file)
- [Corpus](#corpus)
- [Verification arithmetic](#verification-arithmetic)
- [Narrowed: the scope that binds](#narrowed-the-scope-that-binds)
- [Forks](#forks)
- [Hypotheses](#hypotheses)
- [Numbers](#numbers)
- [Voices that are not the authors'](#voices-that-are-not-the-authors)
- [Standards and duplicates](#standards-and-duplicates)
- [This skill's own scaffolding, declared](#this-skills-own-scaffolding-declared)
- [Boundary and gaps](#boundary-and-gaps)

## How to use this file

1. **Check the standing before asserting.** Anything that instructs in this skill outside this file held as stated. A narrowed move holds only inside the scope listed below, and you state the scope. A hypothesis may seed a guess and must name the observation that would settle it; it may not instruct, argue or justify an edit.
2. **Present an open fork as a fork.** Name both branches, say which you took and on what evidence. Never let your preference pass as the model's ruling.
3. **Never cite this skill against a person.** It is a reconstruction with a measured survival rate. Argue from the check you ran.

## Corpus

- **Luu:** 120 public posts on danluu.com, 2013-09-07 to 2026-09-18, about 671k words; 83 Patreon-locked posts excluded. His practice shows in his own measurements and runs inside the posts.
- **School:** 90 files, about 109k words. David Pacheco: Oxide issue threads ([omicron#1146](https://github.com/oxidecomputer/omicron/issues/1146), [omicron#9259](https://github.com/oxidecomputer/omicron/issues/9259)), design documents and posts, 2011–2025. Robert O'Callahan: his blog and rr / Mozilla bug threads, from 2014. A school move instructs only where both practise it.
- **Freshness:** every AI-related post that instructs is dated 2026-07-23 to 2026-09-18. *ai-coding* (2026-07-03) is corroboration only.
- **Inspectability:** the 2026 harnesses and data are unpublished; the agent experiments cannot be rerun.

## Verification arithmetic

Counts describe the verification pass, not any quantity in an analysis.

- 44 extracted moves, 4 of them duplicates. Of 40 distinct: 23 held as stated, 12 held only in a narrower scope, 5 rest on one occurrence, none was cut whole.
- 13 clauses inside surviving moves were cut or demoted to one occurrence; 3 clauses turned out to be other voices.
- Luu's 21 positions and tests: 16 as stated, 4 narrowed, 1 single. The 9 cause-finding moves: 4 as stated (all school), 3 narrowed, 2 single. Luu has no cause-finding move of his own that survives as stated. Two narrowed school moves rest on O'Callahan alone and sit with the hypotheses.
- Of nine observed agent defaults, two held, two held narrowed, one belonged to people rather than agents, and four rest on one occurrence. The defaults that would change an agent's behaviour most were the weakest.
- The six checks: all six are this skill's scaffolding, none is Luu's.

Read it as: a higher unchanged rate than design-derivation's (55% against 38%), because most surviving moves are textbook checks with failures shown. The distinctive layer, the defaults to override, is where the cuts fell.

## Narrowed: the scope that binds

| Move | Holds only as |
|---|---|
| Judging needs generic reasoning | Generic checks find execution, cheating and arithmetic flaws; a representative reference or its weights needs domain knowledge or an expert's artefact. |
| Good guesses need domain knowledge | Stated for forecasting, in one post; read it as deep understanding of the topic or the data. The school supports it for causes only as "one's own knowledge or a colleague's". |
| Distrust of striking claims | Triage of benchmark claims under an attention shortage (2026); performance claims with no benchmark behind them (2017). Never a verdict. |
| Tell the optimising agent a holdout exists | Two experiments, one model, lower-standard posts; his own caveat that he cannot tell whether it generalises. |
| Suspicion in both directions | The first half: suspect the result that excites or confirms you. The second half is a hypothesis. |
| Do not claim LLM output works unchecked | The failure is claiming or shipping it as working; personal "works for me" tools and agent analysis he then corrects are exempt. |
| Agents apply named techniques superficially | The default holds for a technique named in a short prompt; the override is his reading practice, untested. |
| Steer randomised inputs | To structured, valid inputs only. |
| Trace back from the bad value | Data diverged in a few values and the path can be walked; the trace locates, it does not explain. |
| Refuse "better in all ways" | The question is the weighting; in a subjective ranking, state your weight and publish the detail. |
| Dominant option or third design | One argument counted once across two posts; a third design may only reduce the conflict. |
| Dominant cost term | At your scale, with the point where it flips. |
| Count verification cost | Holds; a buggy tool does not disqualify an option by itself. |

## Forks

| Fork | Status | Deciding criterion |
|---|---|---|
| Default distrust vs trust in named people | practised | Trust decides where he spends attention and may stand in for an audit; in published verdicts he refuses authority ("the point of this isn't to say that you should agree because an expert agrees"). Social proof once offered as evidence ("every single person I know who's used it", a lower-standard post) is the part not to copy. |
| "This implies there are other issues" vs publishing anyway | stated | Whether the remaining flaws matter for the question asked. |
| Reject the implausible vs keep the outlier | practised | A broken hard bound justifies rejection; strangeness does not. |
| "I never trust feelings like this" vs arguing from experience | practised | A feeling prompts a measurement; where a measurement exists, he cites it. |
| Experts predict well vs polled experts failed | stated | Detailed understanding and learning from errors, not credentials or the number of experts asked. |
| Defer to experts vs overrule them | practised | A cheap test or the data decide when they exist; otherwise he abstains. |
| Write a source off fast vs score its record | practised | The write-off spends his attention; the scoring is for publication. |
| Hand the weighting to the reader vs rank with his own | practised | Rank, disclose the weight, publish the detail. |
| Type-level advice "guaranteed to be wrong" vs his own type-level claims | practised | His claims describe distributions or what is feasible, not what one person should do. |
| Grade by mechanism vs judging a CEO by how his bets turned out | practised, partial | He credits bets that were non-obvious when made. |
| Rigour as the bar vs lower-standard notes | stated | Experiments now outrun write-up time; this bears on how much his evidence weighs, not on his moves. |
| Generic reasoning judges vs domain knowledge needed for references and weights | closed by narrowing | The scope in [SKILL.md](../SKILL.md#what-this-skill-refuses-to-be). |
| Strict checks on others vs laxer checks on his own artefacts | **open** | None. It weakens every check used on your own work. |
| No process vs a mechanical debugging technique | **open** | Our reading: walking a visible system can be mechanical, judging a claim cannot. He never says so. |
| A short skill that overrides defaults vs task-specific, reactive guidance | **open** | His data favour the second; this skill takes the first as scaffolding ([hypotheses](#hypotheses)). |
| Audit in a fresh context vs worse-scoring independent audits | **open** | None; the audit is a hypothesis. |
| A metric as a target: design-derivation's Layer 0 vs Luu | **open** | Layer 0 calls a metric legitimate as a target without condition. For Luu a target under optimisation pressure is an intermediate target that can rise without the end goal, so it needs a check the optimiser cannot see: a holdout in his agent loops, another fix for overfitting elsewhere, or measurement at the end goal. "Only with a holdout" is too strong. Neither skill rules for the other. |

Layer 0's "escalate when defects are many and small" concerns the level of rework; the discovery-rate inference concerns confidence in a source. They are different moves.

## Hypotheses

One occurrence, one author of the school, or a hindsight lesson. Each may seed a guess that names its own falsifier; none may instruct, and none may be restated elsewhere in this skill.

**The override form itself.** Luu calls it "Naive thoughts on skill writing": "I don't know enough about skills to say how to write a good skill". It rests on one experiment on codex with GPT-5.6 Sol. His own skill "didn't work as intended", and he would not take the ordering of results "too seriously". His data favour task-specific guidance ("giving Zstd-specific guidance … has worked well for me") and checking back to re-prompt rather than front-loading. He does not want a generic test skill, and says the same "goes for a lot of task that I do, which I want done in task-specific way and not a generic way", which bears on this skill. He expects defaults to differ by harness, model and effort.

**Agent defaults that rest on one occurrence.**
- An audit in a fresh context catches what the author missed. Agents usually did not do it, and 42 of the 160 runs that used an independent agent scored worse (possibly not causal). Em Chu's instruction in the same post is the opposite: "Don't spawn subagents". His skill's fresh-context step was almost never followed, and one run that did independent derivations still failed.
- Telling an agent an issue exists without naming it gets a fix for the class, not the instance (an anecdote). A symptom is a window onto other bugs (a post before the freshness cutoff).
- Build one experiment condition, inspect it, then clone it: a lesson in hindsight.
- An LLM's praise of your work is a sign the work is poor: tpatcek's point, which Luu endorses.
- Test inputs that would differ if the code were wrong, on both sides of a boundary.

**Clauses inside surviving moves.**
- Score by actual exposure: the effect of a skill measured only on runs that read it (one condition).
- A surprise reveals a guess you held but did not register.
- One fast flaw should lower confidence in other results from the same source.
- When unsure how to read a source, reproduce its analysis.
- A model whose output hinges on one guessed input deserves less trust than a bare guess.
- Do the quick check before rejecting a result you dislike: in the corpus only a demand made of his critics.
- A model or stated probabilities are not rigour; ask whether the numbers come from understanding (one worked case).
- Reject a decision rule whose key term absorbs any outcome; giving two sides equal weight without adjudicating the facts.

**Cause-finding, one author or one occurrence.**
- A found bug is the cause only when its own fix, retested on the original reproduction against the prior time to failure, stops the failure (Pacheco, one investigation; O'Callahan closed bugs on weaker evidence). Do not commit a workaround while a fix is pending (Pacheco, hedged: "I don't feel strongly about it").
- Switch to explaining one instance when pattern-hunting stalls (the trigger, Pacheco once).
- A partial reproduction points to a missing condition (hindsight; the finding was Mustacchi's). Check the cause against when the failure started (a guess).
- Search a dependency's errata, issues and commit log; a match is a lead (O'Callahan, two cases; Pacheco's searches found nothing). What the match does not cover is new information (once).
- When a probe changes the failure, make its side effect the controlled variable; a targeted knock-out that cures the failure is evidence (O'Callahan). Where a broad probe ends and a targeted knock-out begins is never stated. Preserve state before the probe destroys it (once).

## Numbers

No number leaves this skill without its status. None is a threshold: neither Luu nor the school gives a sample size, a run count or a confidence level as a norm.

| Number | Status |
|---|---|
| "a minute" for the first look at an artefact | illustration of how cheaply flaws turn up, not a budget |
| about 90 seconds to write a source off; 30–60 minutes to refute it | illustration of refutation cost |
| 160 runs per condition (80 per effort level), 26 conditions + 4 skills | measured, lower-standard post |
| 42 of 160 runs used an independent audit agent and scored worse | measured, lower-standard post, possibly confounded |
| 157 of 160 runs used an available skill; 108 of 160 opened another; 153 of 160 read a third | measured, lower-standard post; they support the exposure hypothesis |
| regex engine "40% faster" on its benchmark suite, 10× slower on the holdout cases that finished | measured, lower-standard post |
| 2–4× on simple queries against about 7% on representative holdout queries | measured, lower-standard post |
| 23% of re-grades of the same outputs flipped the result | measured |
| 25.0% against 24.4% | illustration of a gap inside the noise |
| 1 of 113 tasks resembling his work; 121 against 122 lines at a cutoff | illustration |
| 0.99 + 0.01 · 10 = 1.09 | illustration of an average hiding the tail |
| p99 0.37 ms reported against about 580 ms seen by callers | measured, inside work |
| 5000 MiB/s disk maximum against a claimed 8 GiB/s | limit: a hard bound |
| 3.5 ms polling saving against a far larger spread | limit: the size cannot explain the effect |
| jitter median < 1 ms, p90 about 5 ms | limit of that instrument, not a general resolution |
| about three orders of magnitude of growth before serving cost matters | illustration, one company |
| Pacheco's fixed build ran 25 h without the failure, against 4 h, the longest run without it before | practice inside a hypothesis; not a statistical test |
| 2–3 reproductions in 100 | illustration of a partial reproduction |

## Voices that are not the authors'

Never attribute these to Luu, Pacheco or O'Callahan.

- **In Luu's posts:** Kreinin (fixed input/output tests encode the code's own output); Em Chu ("misleadingly precise"; "Don't spawn subagents"); Jamie Brandon (agents using techniques superficially); Bittker (suggested Luu's skill; comments on the language experiment); Bernhardt, MacIver, Burton, Dullien; Aaron Levin (the expert who reviewed his benchmark verdict); Niklas Gruhn ("meat proxy"); tpatcek (LLM flattery); Eirenarch (found a TypeScript misclassification in a study); McElreath and Gelman (the "no process" framing he endorses); Mackey (co-author of the cgroup-throttling post); @ESRogs (caught his errors in *corrections*).
- **In Pacheco's threads:** "Robert" is Robert Mustacchi. Leads came from Michael Knyszek's memory, a joint realisation with Ben Naecker, and Mustacchi; in #9259 the cause came from jgallagher's reproducer.

## Standards and duplicates

- **Lower standard, his label:** *benchpocalypse*, *pl-tokens*, *agentic-testing*, *perf-opt*, *bug-blind*. *sounds-easy* calls itself stream-of-consciousness "without much editing", as does the post before it, probably *bimodal-compensation* (unverified).
- **One argument, not two:** *startup-tradeoffs* and *startup-options* (the investing argument); *perf-opt* retells the regex experiment; O'Callahan's 2018 Intel watchpoint post retells his bug thread. Luu quotes his own posts at length (*yegge-predictions* in *futurist-predictions*, *file-consistency* in *deconstruct-files*, *productivity-velocity* in *ai-coding*): count each argument once.

## This skill's own scaffolding, declared

- **The six checks and their grouping.** Luu names no concepts. "Intermediate target" is his term; the other names are ours. The checks are distinct as checks, not as causes: one flaw can fail two.
- **No order.** Luu runs checks in different orders in different posts and denies a step-by-step method.
- **The override form** rests on a hypothesis ([above](#hypotheses)).
- **The output contract.** Giving each unchecked caveat a direction is his habit, never stated as a rule; the other items are this skill's.
- **The observer check** joins the analyst's bias and the instrument's noise.
- **The four jobs** come from this skill's brief, not from Luu.
- **The relation to Layer 0** is this skill's reading.
- **The wording** of each check reads cleaner than the corpus; the core is his, the shape is ours.

## Boundary and gaps

Outside these the model has no verdict. Saying "the model does not reach here" is a legitimate output.

- **Generating hypotheses.** No practised move in any of the three authors.
- **Values that cannot be priced.** He settles the facts, states his weight and publishes the detail; that is disclosure, not resolution.
- **Domain knowledge.** The checks cannot choose a representative reference or the weights of a summary.
- **Claude Code.** Every agent default was observed on codex with GPT-5.6 Sol; none was tested on Claude Code.
