# RTFM

A web app for reading hypothetical manuals. An LLM writes the table of contents first, then
writes each section only when the reader opens it. We are currently designing the reader UI;
there is no back-end or LLM yet.

- `DESIGN_RULES.md`: what every reader design must do.
- `WORKLIST.md`: the task list and the orchestrator's protocol.

## Shell

Commands run in zsh. Quote any argument that starts with `=` (e.g. `echo '====='`), because zsh
otherwise reads it as a command lookup and fails with "not found".

## Code standards

Optimize for a human reading the code for the first time.

- **Simple over clever.** Choose the most direct solution that works. No abstraction until a
  second real use needs it.
- **Self-evident code.** Names say what things are and do. Use few or no comments. Rewrite unclear
  code instead of explaining it.
- **No historical cruft.** No comments, names, flags or leftover code describing what used to be
  ("previously…", "old approach", `legacyX`, commented-out code). The code describes only what
  it is now.
- **Refactor when needed.** If a change makes nearby code awkward, clean it up as part of the
  change, within the files your task allows.
- **Small, focused units.** Short functions and components with one job. Files organized so the
  structure is obvious from the tree.
- **Delete freely.** Remove unused code, files, exports and dependencies.
