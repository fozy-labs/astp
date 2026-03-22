---
title: "Open Questions: ASTP Fixes"
date: 2026-03-22
stage: 01-research
role: rdpi-questioner
---

## High Priority

### Q1: Issue 4+5 interaction — Is the approve agent the sole infinite-loop safeguard?

**Context**: Issue 4 removes the orchestrator's redraft limit (currently 3). Issue 5 sets the approve agent's auto-redraft limit to 2. After these changes, the **only** mechanism preventing infinite auto-redraft loops is the approve agent's rule at lines 179-180. If the approve agent malfunctions or the LLM ignores the instruction, there is no backstop.

**Options**:
1. Accept approve agent as sole safeguard — Pros: simpler orchestrator, less token bloat / Cons: single point of failure for loop prevention
2. Add a soft "warn the user" note in the orchestrator (not a hard limit) — Pros: defense-in-depth / Cons: adds tokens, may confuse the orchestrator into re-imposing a limit

**Risks**: If the approve agent's auto-rejection limit is ignored by the LLM, the system could loop indefinitely without human input. In practice this is low-probability since the approve agent always presents to the user after 2 rounds — the failure mode requires the agent to violate an explicit MUST NOT rule.

**Researcher recommendation**: Option 1 is likely sufficient. The task explicitly says to remove the limit from the orchestrator, and adding a soft note risks re-introducing the problem. The approve agent's rule is clear and already tested.

---

## Medium Priority

### Q2: Issue 1+2 — Should `rdpi-codebase-researcher.agent.md` get `rdpi-version` added to its output template?

**Context**: The codebase analysis shows that `rdpi-codebase-researcher.agent.md` (lines 29-35) is the only agent with a frontmatter template that does NOT include `rdpi-version`. All other reviewer/planner agents include it. The task says "only ONE version field: `rdpi-version`" across all MDA files and `.thoughts/` derivatives.

**Options**:
1. Add `rdpi-version: "{{ASTP_WORKFLOW_VERSION}}"` to the codebase-researcher's output template — Pros: consistency / Cons: minor template change
2. Leave it as-is since the codebase analysis output is consumed internally — Pros: no change / Cons: inconsistent with other agents

**Risks**: Low. Missing version field in one agent's output doesn't break anything, but violates the "all files" requirement in the task.

**Researcher recommendation**: Option 1 — add it for consistency. The task says all `.thoughts/` files.

---

### Q3: Issue 5 — Does the existing approve agent rule already match the desired behavior?

**Context**: The approve agent already has a rule (lines 179-180): "After 2+ redraft rounds on the same stage... you MUST NOT auto-reject even on Critical issues — always present to the user." The task says "auto-redraft limit of 2 for critical issues." These appear equivalent: the agent can auto-reject during rounds 0 and 1 (triggering 2 auto-redrafts), then at round 2+ it must stop and ask the human.

**Options**:
1. Keep existing wording as-is — Pros: no change, already correct / Cons: the wording says "2+" which could be read ambiguously
2. Reword to explicitly state "limit of 2 auto-redrafts" — Pros: clearer intent / Cons: minor rewrite

**Risks**: If the existing wording is misread by the LLM (e.g., "2+" interpreted as "after more than 2" instead of "2 or more"), the actual limit could be 3. Rewording removes this ambiguity.

**Researcher recommendation**: Option 2 — reword for clarity since this is now the primary loop safeguard (per Issue 4).

---

## Low Priority

None. The remaining issues (3, 6) are straightforward from the analysis:
- **Issue 3**: Add `hint` property to both `p.multiselect` calls in `prompts.ts`. No ambiguity in implementation.
- **Issue 6**: Tighten orchestrator steps 52-57 to pass task text as-is (with English translation if needed). The analysis pinpoints exact lines. No ambiguity.
- **Issue 1** (beyond Q2): Change `thoughts-workflow.instructions.md` line 25 to explicitly use field name `rdpi-version`. Straightforward.
