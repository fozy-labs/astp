---
name: markdown-craft
description: Rules for authoring and maintaining Markdown documents
---

# Markdown craft

Applies to every md file you write, edit, restructure, or review.

## 1. One home per fact

Every fact lives in exactly one place; everything else references it.

| Fact                                        | Home                                                           |
|---------------------------------------------|----------------------------------------------------------------|
| who/whom/when/order, branching, concurrency | diagram                                                        |
| rationale, invariants, trade-offs           | prose                                                          |
| numbers: limits, TTLs, quotas, thresholds   | tables                                                         |
| failure dispositions                        | failure table; diagrams reference it via `⚠§N` (see reference) |
| exact formats / data schemas                | code blocks / prose                                            |

- **Diagram-first for flows.** Any multi-actor flow, lifecycle, or state machine is
  specified by a diagram by default.
- **A restatement is a copy, and copies drift.** Link to the home instead of retelling
  it. If a copy must exist (e.g. a summary for outside readers), mark it as a copy and
  name its home.
- **Complement test.** A sentence deletable because a diagram or table already carries
  the fact — delete it. Referencing an element (step number, arrow name, table row) is
  encouraged — it anchors rationale to structure; re-describing the element is the
  violation, not naming it.

## 2. Structure

- Reference documents longer than ~100 lines start with a contents list — partial
  reads must still reveal the full scope.
- Cross-references go by **name** — an ordinary Markdown link to the target's
  `#anchor` — never by position or number: numbering breaks on insertion, links
  don't. Exception: contexts where a link cannot render (e.g. the `⚠§N` marker
  inside diagram text), backed by an explicitly frozen numbering.
- Brevity is IMPORTANT: assume a competent reader, cut scaffolding prose.

## 3. Links and anchors

- Every link target must exist at write time — the file AND the `#anchor`. Anchors
  derive from heading text, so a heading rename is an API break: before renaming a
  heading or moving/deleting a file, grep for inbound links and fix referrers.
- Never "see above/below" — link the section.

## 4. Maintenance

Editing scope is the fact, not the dry diff:

- A changed, moved, or deleted fact invalidates every restatement of it — sweep the
  document set for copies and reconcile (per One home per fact, the out-of-home copy
  is the suspect; substantive divergence goes to the user).
- One term per concept, document-wide. Synonym rotation ("field" / "box" / "element")
  reads as three different concepts.
- No self-aging phrasing: "currently", "new", "recently", "will soon" rot silently.
  State the version or date explicitly, or state the timeless fact.
- Deleting a section is a heading rename with zero targets — run the same
  inbound-link sweep as in Links and anchors.

## 5. Diagrams — load the reference

Before writing or editing ANY Mermaid diagram, load [references/mermaid-craft.md](references/mermaid-craft.md).
