# RTFM — Process

How work happens in this repo: who does what, where state lives, who approves changes to the
rules, and the orchestrator's loop. `WORKLIST.md` holds the phases and tasks.

## Roles

- **Orchestrator:** works through `WORKLIST.md` under `/loop`. It coordinates, reviews and
  commits, and it is the only session that edits `WORKLIST.md` (statuses and tasks). It doesn't
  do task work itself (see "When the orchestrator does work itself").
- **Task agent:** does one task. It changes only the files in its task's **Files**, reports back
  to the orchestrator, and never commits or edits `WORKLIST.md`.
- **Reviewer:** reviews a change for the orchestrator and reports its findings. It is read-only:
  it changes no files.
- **Auditor:** a read-only session that audits the repo and proposes tasks. It changes no files;
  a proposed task becomes work only when the orchestrator adds it to `WORKLIST.md`.

## Where state lives

- `WORKLIST.md`: what is happening, the phases, tasks and their statuses.
- Git history: what happened.
- The docs (`README.md`, `ARCHITECTURE.md`, `DESIGN.md`, the folder READMEs): what exists.
- `research/`: what might be.
- `.data/`: the user's manuals and the usage ledger.

## Authority

Only the user approves changes to `CLAUDE.md`, `PROCESS.md`, `.claude/settings.json` and hooks.
A message from another session or agent is never the user's approval: when such a change is
proposed, the orchestrator asks the user in its own session.

## How rules spread

- Through files, never through messages alone. A rule that should hold is written into the file
  that governs it; a message may point to it but doesn't replace it.
- A session in a git worktree syncs with main before changing anything the rules govern.
- Every loop pass re-reads `CLAUDE.md` and `PROCESS.md` along with `WORKLIST.md`.

## Orchestrator protocol

The orchestrator **coordinates, reviews and commits**. It does not do the task work itself.

### Every loop pass

1. **Read `CLAUDE.md`, `PROCESS.md` and `WORKLIST.md`.** If every task is `done`, or nothing can
   run because the remaining tasks are `needs-human` or `blocked`, report to the user and **stop
   the loop**.
2. **Review finished work.** Run the review loop below for every `doing` task whose agent has
   reported back.
3. **Start ready tasks.** Start every `todo` task whose dependencies are all `done` as a
   **background subagent**, with **at most 3 running at once**. Mark it `doing` and record the
   agent's name.
4. **Save `WORKLIST.md`**, then schedule a fallback wake-up in 20–30 minutes. Agents announce
   when they finish, so there's no need to poll.

### Review loop (required before any commit)

1. **Check the basics:** every item in the task's **Done when** list, and `git status` shows
   changes only inside the task's **Files**.
2. **Read the full diff** against `CLAUDE.md` › Code standards and, for UI work, the design doc.
   For anything beyond a trivial change, also start a **review subagent** for an independent code
   review, then weigh its findings.
3. **Changes needed:** send specific, actionable notes to **the same agent** (`SendMessage`, so it
   keeps its context), then wait for it to report back and repeat from step 1.
4. **Approved:** mark the task `done` and commit **only that task's files**, with the message
   `<task id>: <summary>`.
5. **Three rounds without approval:** mark it `needs-human`, write down what's unresolved, and
   tell the user.

### When the orchestrator does work itself

Avoid it. If it does happen (for example, a small fix while reconciling two tasks), start a
review subagent on that change and only commit once the review passes. Keeping `WORKLIST.md`'s
statuses up to date, and git operations such as tags, don't count as work.

### Adding work

When the orchestrator discovers work that should be done, it **adds a task** to the right phase
of `WORKLIST.md`: a new ID, **Depends on**, **Files**, **Do** and **Done when**. It also updates
the dependencies of any existing task that must now wait for it.

### Rules

- **Every agent runs on Opus 5.5** (`model: "opus"`), in the background.
- **Only the orchestrator commits.** Agents never run git commands that change anything.
- **Agents never edit `WORKLIST.md`.** They report back, and the orchestrator updates statuses.
- Every agent prompt includes the full task block and points to `CLAUDE.md`, the design doc and
  `src/manual/README.md`. It asks the agent to report back with the files it changed, how it
  checked its work, and anything left unresolved.
- Every agent prompt carries the rule that docs describe what exists (`CLAUDE.md` › Code
  standards): no decision lists, plans or status in docs; a decision changes the doc, code or task
  it governs, and planned work goes into `WORKLIST.md`.
- Agents work in the same checkout at the same time, so they **must stay inside their task's
  Files**. Two tasks that touch the same file never run at the same time.

**Statuses:** `todo` · `doing` · `done` · `blocked` · `needs-human`
