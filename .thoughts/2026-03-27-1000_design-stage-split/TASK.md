Currently the key stage `02-design` is essentially handled by a single agent, and it cannot cope with complex tasks. It needs to be split, considering engineering specifics:

- From the most "defining" to the less defining
- If a subsequent designer sees/understands that a previous design is inaccurate/incorrect — they fix it + log the fixes in a separate file (a list of corrected inconsistencies).
- A new file `00-short-design.md` is also introduced (which is where the work starts)
- Also a minimum number of `rdpi-implement-reviewer` for design stage 2, with one `rdpi-implement-reviewer` always dedicated to checking the "list of corrected inconsistencies" (ensuring that fixing some inconsistencies didn't introduce others, etc.)

Additionally:
`README.md` files created by agents in `.thoughts` should also contain the pipeline version (from the manifest) in YAML frontmatter.
