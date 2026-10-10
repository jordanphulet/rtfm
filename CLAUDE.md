# RTFM

A web app for reading hypothetical manuals. An LLM writes the table of contents first, then
writes each section only when the reader opens it. The reader is built (in `src/reader/`) and
reads one sample manual; there is no back-end or LLM yet.

- `DESIGN.md`: the reader's design and the rules any change to it must keep.
- `WORKLIST.md`: the task list and the orchestrator's protocol.

## Shell

Commands run in zsh. Quote any argument that starts with `=` (e.g. `echo '====='`), because zsh
otherwise reads it as a command lookup and fails with "not found".

Only stop processes you started yourself, using the handle or PID you got when you started them.
Never kill a process because it holds a port: the Claude app and other tools listen on local
ports too. If a port you need is taken by something that isn't yours, report it instead.

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
