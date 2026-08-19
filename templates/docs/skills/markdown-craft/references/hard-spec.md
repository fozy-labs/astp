# Hard spec

Applies to a specification, design doc, or any long technical document under revision.
[One reader per document](../SKILL.md#2-one-reader-per-document) states the defect and its
test; this file is the loop mechanics — what the reviewer and the author each owe so that
the test can be applied at all.

## 1. The outside home

The destination table lives in [One reader per document](../SKILL.md#2-one-reader-per-document).
What its "outside, linked" row does not carry:

- **A PR, a review comment, an issue, a separate document — any of them is a good home** for a
  causal chain: why this is a bug and that one is not, why the decision went the way it did.
  Link whichever one actually holds the reasoning; which form that is belongs to the pipeline,
  not to this rule.
- **Link the resolution, not the argument.** A discussion's later turns cancel its earlier
  ones, and a link into a superseded answer is worse than no link — point at the turn that
  settled it, or state the outcome in the same line as the link.
- **Moving material out removes it from the copy sweep** of
  [Maintenance](../SKILL.md#5-maintenance) — a sweep of the document set can report an
  outside copy, never reconcile it. Accepted knowingly, stated here rather than discovered.

## 2. What does not compress

- **An obligation the code violates right now.** Compressed to a marker ("remainder not
  closed") it hands the next reader an invisible debt. It stays whole.
- **Deleting derivation is not compressing it.** The next reader reopens the same questions
  with the same chance of answering them wrong. Move it out; do not burn it.

## 3. Reviewing

- **A finding carries a disposition**: `cut` / `move` / `rewrite` / `add`. Without one it is
  an alarm, and the only edit an alarm admits is an addition.
- **A finding names its reader**, from the table in
  [One reader per document](../SKILL.md#2-one-reader-per-document). A question raised by the
  previous round rather than by a reader is out of scope.
- **`add` names what it displaces.** Otherwise the document is unbounded and every true
  sentence wins its place.
- **A round settles.** What round N closed is not reopened in N+k. Re-opening it makes the
  author write a defensive clause, and that clause is the growth.
- **A round must be able to delete.** A round whose only possible output is "add" is a growth
  mechanism regardless of what it finds.
- **Report the line delta per round.** Accretion never announces itself — each edit looks
  right, so the delta is the only signal that fires while it is happening.

## 4. Acting on findings

- **Rewrite, not append.** Appending is the failure mode: if the finding is valid, the
  sentence it touches is wrong, not missing.
- **"No edit" is a legal answer.** "The answer's home is that thread" closes a finding. Without
  that move the author can only ever write — and the reviewer is often another agent that
  never loaded this file, so the discipline must hold from the author's side alone.
- **Compression is its own pass, and its only legal diff is negative.** A pass that mixes
  fixes with compression nets positive every time.

## 5. Before restructuring: predicate inventory

Rewriting loses claims silently. Number every predicate the document(-s) asserts, rewrite against
that inventory, then check it back: each entry is kept, moved (naming the target), or dropped
(naming why). No entry leaves without one of the three.
