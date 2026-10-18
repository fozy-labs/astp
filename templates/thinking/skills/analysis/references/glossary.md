# Glossary

> Loaded when: A term from this skill or from Luu's posts is used or met.

Luu's own terms and common words he uses in a narrower sense, plus the school's few. Each entry says what follows from it. Use one term per concept; do not rotate synonyms.

| Term | Sense | What follows |
|---|---|---|
| **intermediate target** | A measured quantity "possible to improve without affecting the end goal" (Luu). | Name the end goal and check it directly, or with a reference the optimiser never saw. |
| **end goal** | What the number is supposed to stand for: the user's experience, the real workload, correctness on unseen cases. | The first line of every verdict names it. |
| **Goodhearting** (his spelling), **great slideware** | The metric rises while the experience falls. | Look at what the target cannot see. |
| **holdout** | A reference the optimiser never saw and that was not picked from the same source. | Once published, it is no longer one. An agent-built holdout can leak. |
| **reward hack**, **overfit** | What an agent does to a visible target by default. | Instructions not to do it did not stop it in his runs. |
| **false in spirit (even if technically correct)** | A number true of what was measured, not of what it is taken to mean. | The striking claim he treats as false until audited: triage, not a verdict. |
| **trust someone who did** | A delegated audit. | Decides where you spend attention; never settles a measurement. |
| **boring negative result** vs **blockbuster** | The usual outcome of a correct eval, against a striking one. | A blockbuster is a cue to hunt for the setup flaw. |
| **cocktail party idea** | A plausible, abstract, unchecked reason. | Replace it with a look at what happened, or an experiment. |
| **just-so story** | An after-the-fact explanation of a noisy outcome. | Treat it as an empirical question. |
| **fake number** | A number with no sound way to compute it (Luu); "misleadingly precise" is Em Chu's phrase for the same. | No number is better than this one. |
| **sniff test** | Plausibility against experience, before reading the method. | A filter on attention; he checks it afterwards. |
| **checking inputs into my head** | Fact-checking or discarding information as it arrives. | Do it on consumption, not later. |
| **opaque latency** | Latency the dashboards cannot see. | Measure at the caller. |
| **average user fallacy** | Treating the mean user as a user. | Keep the distribution. |
| **suspicious discontinuities** | Bunching at a threshold. | Someone acts on the threshold; find out who. |
| **turning your brain off** | Taking an LLM's action as working without checking. "Meat proxy" is Niklas Gruhn's term for one variant: a human who forwards failures back to the LLM. | An agent's report, your own included, is unchecked until checked. |
| **out of distribution** | A task where an agent "behaves very poorly compared to a reasonable human". | The person reading the output has to notice these cases. |
| **lower standard** | Luu's label for 2026 posts published as notes ("a much lower standard for how cleaned up and rigorous things are"). | Evidence from them carries less weight; see [limits](limits.md#standards-and-duplicates). |
| **test** (narrowed) | A check whose result could differ if the code were wrong. That fixed input/output tests tend to encode the code's own output is Kreinin's point. | A check that cannot come out differently is not evidence. |
| ***a* problem** vs ***the* problem** | A confirmed bug near the scene, against the cause of the reported failure (Pacheco). | Say which one you have. |
| **inspired guesses** | Hypotheses drawn from captured data plus experience (O'Callahan). | Where cause-finding gets its guesses; this skill does not supply them. |
