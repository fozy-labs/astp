---
name: settup-glossary
description: Set up a project's shared glossary and persistent agent instructions for using and maintaining it without displacing existing terminology conventions.
disable-model-invocation: true
license: MIT
metadata:
  adapted-from: "/setup-matt-pocock-skills and /domain-modeling by Matt Pocock, https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/setup-matt-pocock-skills/SKILL.md"
---

# Set up Glossary

Establish one authoritative vocabulary per project or context and make the agent use it. Explore, propose, confirm, then write. Setup does not authorize harvesting definitions from the repository.

## Explore

Find anything that already serves as a project glossary, not only files named `GLOSSARY.md`:

- glossary, context, terminology and vocabulary files or document sections, including scoped ones;
- agent instructions and rules that define, reference or mandate project language;
- documentation and agent-instruction conventions that should determine where additions belong.

Read enough to distinguish project vocabulary from skill references and general programming terms. Identify overlapping files, contradictory definitions or instructions, and whether multiple glossaries serve separate contexts or compete.

## Propose

Summarize the findings and offer options with a recommendation. Change nothing until the user chooses and approves the drafts.

- **A compatible glossary exists:** keep its path and format by default; propose only the missing instruction or repair. If it is complete and wired up, report that no change is needed.
- **Candidates overlap or conflict:** offer a canonical glossary with pointers, scoped glossaries with an index, or consolidation as the evidence supports. Name the conflicts. Never merge, rename or delete implicitly.
- **No glossary exists:** default to one `GLOSSARY.md` at the repository root, or the established documentation location when the project clearly has one. Offer multiple glossaries only for distinct vocabularies, not merely because the repository has multiple packages.
- **Instructions are needed:** use the project's existing always-loaded instruction mechanism and file. Do not create a parallel `CLAUDE.md` / `AGENTS.md` or a competing rule system. With no such convention, propose a short `## Glossary` section in `CLAUDE.md` and let the user confirm it or choose another home.

Show which files will be created or edited and the proposed additions. Reconcile overlapping instructions instead of appending another source of truth.

## Write

Preserve existing content except changes the user approved. Fit the project's language, documentation style and instruction format.

For a new glossary, use this minimal shape:

```md
# <Project or context>

<One or two sentences about the project or context.>

## Language
```

Add terms only as the user decides them. The default entry is:

```md
**Term** (translation, when useful):
One or two sentences defining what the concept is.
_Avoid_: rejected synonyms
```

The persistent instruction must point to the chosen glossary or glossaries and tell the agent to:

- read the relevant glossary before work that names project concepts;
- use its terms in code, UI text, documentation, issues and replies, and honor `_Avoid_`;
- call out ambiguous or conflicting language and ask which meaning the user intends;
- add or change an entry only after the user's decision, then record that decision immediately.
- group entries under subheadings when clusters emerge.
- include only project- or context-specific concepts, not general programming terms, identifiers, file paths or other implementation details.

Keep entry-format guidance in one place when the project already records it elsewhere.

## Verify

Read the changed files. Check that every pointer resolves, each context has one authoritative glossary, and the instructions do not contradict one another. Report the chosen layout and every file changed.
