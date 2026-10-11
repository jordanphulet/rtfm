# RTFM

A web app for reading hypothetical manuals. An LLM writes the table of contents first, then
writes each section only when the reader opens it. Two pages are built: the landing page at `/`
(`src/home/`), a library of manuals beside a librarian agent that gives canned replies, and the
reader at `/read` (`src/reader/`), which reads one sample manual. There is no back-end or LLM yet.

- `README.md`: running it, the scripts and where things live.
- `DESIGN.md`: the design of both pages and the rules any change to them must keep.
- `WORKLIST.md`: the task list and the orchestrator's protocol.
- `research/bedrock-models.md`: research on which Bedrock models to use.

## Shell

Commands run in zsh. Quote any argument that starts with `=` (e.g. `echo '====='`), because zsh
otherwise reads it as a command lookup and fails with "not found".

Never read, print, copy or edit `.env.local`. It holds real AWS credentials. Code may load it at
runtime; checks may only confirm which variable names are set.

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
