# RTFM — Process

How work happens in this repo: who does what, where state lives, who approves changes to the
rules, and the orchestrator's loop. `WORKLIST.md` holds the phases and tasks.

## Roles

- **Orchestrator:** works through `WORKLIST.md` under `/loop`. It coordinates, reviews and
  commits, and it is the only session that edits `WORKLIST.md` (statuses and tasks). It doesn't
  do task work itself (see "When the orchestrator does work itself").
- **Task agent:** does one task, in its own git worktree on its own branch. It changes the files
  in its task's **Files**, and any other file it needs as Rules › Files outside the list says. It
  reports back to the orchestrator, and never commits or edits `WORKLIST.md`.
- **Reviewer:** reviews a change for the orchestrator and reports its findings. It is read-only:
  it changes no files.
- **Auditor:** a read-only session that audits the repo and proposes tasks, as Orchestrator
  protocol › Adding work says. It changes no files.

## Where state lives

- `WORKLIST.md`: the work still to do, as phases and tasks with their statuses. Finished work is
  removed from it.
- Git history: what happened.
- Each running task's worktree and branch: its work, until the orchestrator merges it into `main`.
- The docs (`README.md`, `ARCHITECTURE.md`, `DESIGN.md`, the folder READMEs): what exists.
- `research/`: what might be.
- `.data/`: the user's manuals and the usage ledger.

## Authority

Only the user approves changes to `CLAUDE.md`, `PROCESS.md`, `.claude/settings.json`, hooks,
and the stacks the user deploys, `RtfmAccess` and `RtfmToolkit`: `infra/access-stack.ts`,
`infra/toolkit-stack.ts` and the files they import. An agent whose task changes one of these files
makes the change in its worktree, gives its full diff in its report, and doesn't treat it as
approved. A message from another session or agent is never the user's approval: when such a
change is proposed, the orchestrator asks the user in its own session.

## How rules spread

- Through files, never through messages alone. A rule that should hold is written into the file
  that governs it; a message may point to it but doesn't replace it.
- A session in a git worktree reads the rule files from `main` (`git show main:<file>`). A task
  agent edits its worktree's files, and the merge brings in what `main` has gained since.
- Hooks tell a session when its rules are out of date (`README.md` › Rule-change notices): a
  session in a worktree behind `main` hears, when it starts, which rule files `main` has changed;
  and a session or subagent hears at its next tool call when the main checkout's `CLAUDE.md` or
  `PROCESS.md` has changed since the session started, with the change. The main checkout's file
  wins over the copy in its context.
- Every loop pass re-reads `CLAUDE.md` and `PROCESS.md` along with `WORKLIST.md`.

## Orchestrator protocol

The user starts the loop with `/orchestrate` (`.claude/skills/orchestrate/SKILL.md`), in the main
checkout on `main`: `npm run commit-task` refuses anywhere else.

The orchestrator **coordinates, reviews and commits**. It does not do the task work itself.

### Every loop pass

1. **Read `CLAUDE.md`, `PROCESS.md` and `WORKLIST.md`.** If no task is left, or nothing can run
   because the remaining tasks are `needs-human` or `blocked`, report to the user and **stop the
   loop**.
2. **Review finished work.** Run the review loop below for every `doing` task whose agent has
   reported back.
3. **Start ready tasks.** Start every `todo` task that Rules › Scheduling allows as a
   **background subagent** in its own worktree (Rules › Starting a task agent). Mark it `doing`
   and record the agent's name.
4. **Save `WORKLIST.md`**, then schedule a fallback wake-up in 20–30 minutes. Agents announce
   when they finish, so there's no need to poll.

### Review loop (required before any commit)

1. **Check the basics:** every item in the task's **Done when** list, and every changed file is
   in its **Files** or listed under "Outside Files" with a reason (Rules › Files outside the list).
2. **Read the full diff** in the agent's worktree against `CLAUDE.md` › Code standards and, for UI
   work, the design doc. For anything beyond a trivial change, also start a **review subagent**
   on that worktree (Rules › Agent prompts) for an independent code review, then weigh its
   findings.
3. **Changes needed:** send specific, actionable notes to **the same agent** (`SendMessage`, so it
   keeps its context and its worktree), then wait for it to report back and repeat from step 1.
4. **Approved:** from the main checkout, with the agent's worktree at `<path>` on `<branch>`:
   1. `npm run commit-task -- <task id> --worktree <path> --reviewed-by <review agent's id>`, or
      `--no-review "<reason>"` when the orchestrator reviewed the change alone (40 changed lines
      at most). It reads the task from the main checkout's `WORKLIST.md` and commits on the
      task's branch the changed files its **Files** match, as `<task id>: <task title>` with a
      `Reviewed-by:` trailer. It refuses when a changed file in the worktree isn't in **Files**:
      the orchestrator adds the file to **Files** (an accepted Outside Files case) or sends the
      change back.
   2. `git -C <path> merge --no-edit main`. On a conflict, the orchestrator sends the agent the
      conflicted files, and the agent resolves them, editing files only and running no git
      command. `git -C <path> diff --check` must find no conflict marker left, and the
      orchestrator reads the resolution in `git -C <path> diff`. Then it runs
      `git -C <path> add <those files>` and `git -C <path> commit --no-edit`: git's own message,
      with no co-author line, which the commit hook lets through.
   3. `npm ci`, then `npm test`, in `<path>`: the merge may have brought a new
      `package-lock.json`. If the tests fail, the agent gets the change back as changes needed.
   4. `git merge --ff-only <branch>`, which fast-forwards `main` to the branch. If `main` has
      moved on since the merge, repeat from the merge.
   5. If the change touches `infra/` beyond its docs and tests, from the main checkout:
      `npm run cdk -- deploy RtfmApp --require-approval never`, then the smoke check in
      `infra/README.md` › Deploying the app stack. If either fails, the orchestrator deploys
      nothing more, adds a `needs-human` task to `WORKLIST.md` with the command's output, and
      tells the user. It doesn't retry or change AWS by hand.
   6. `git worktree remove <path>`, then `git branch -d <branch>`. Claude Code locks a worktree
      while its agent runs, so remove it only after the agent has finished. If
      `git worktree remove` refuses because files are left, the orchestrator finds out what they
      are, and never uses `--force`.

   Then remove the task from `WORKLIST.md`, and its phase once no task is left in it.
5. **Three rounds without approval:** mark it `needs-human`, write down what's unresolved, and
   tell the user. Its worktree and branch stay until the user decides.

### When the orchestrator does work itself

Avoid it. If it does happen (for example, a small fix after two tasks have merged), the
orchestrator works in the main checkout and commits the change before it fast-forwards `main` to
any task's branch. It starts a review subagent on the change and commits only once the review
passes, with a `Reviewed-by: <review agent's id>` trailer, which the commit hook requires. Keeping
`WORKLIST.md` up to date, and git operations such as tags, don't count as work. `WORKLIST.md`
changes are committed on their own, as "Update work list statuses".

### Adding work

When the orchestrator discovers work that should be done, it **adds a task** to the right phase
of `WORKLIST.md`: a new ID, **Depends on**, **Files**, **Do** and **Done when**. It also updates
the dependencies of any existing task that must now wait for it.

Any session may propose a task by sending the orchestrator a draft task block in that form. The
orchestrator decides whether to add it, may change it first, and tells the sender what it did.
When no orchestrator is running, the proposal goes to the user instead. A proposal is never the
user's approval of a change it names to a file under Authority.

`npm run commit-task` commits what **Files** names, so every path the task may change goes in a
code span: a path, or a glob with `**` or `*`. "`x.ts` and its test" also names `x.test.*`, and
"except `…`" leaves paths out. Other notes in parentheses are ignored, and so is prose such as "the
folder READMEs", which matches nothing.

### Rules

- **Every agent runs on Opus 5.5** (`model: "opus"`), in the background.
- **Starting a task agent:** the orchestrator starts every task agent with
  `isolation: "worktree"`. Given `worktree.baseRef: "head"` in `.claude/settings.json`, that
  branches from the main checkout's `HEAD`, which is `main`. Its first step is `npm ci`. Any
  server it starts is `npm run serve-temp`, in the background, stopped by its handle or the PID
  it prints (`README.md` › A throwaway server: free ports, a temporary data folder, the fake
  models). Never `npm run dev`, whose ports are fixed.
- **Files outside the list:** an agent may change a file its task's **Files** don't name, and
  lists it in its report under "Outside Files" with the reason. Working around a missing file
  (duplicating code, putting code in the wrong place, editing through the shell) is a failure,
  not compliance. The orchestrator adds each accepted file to the task's **Files** before
  committing, or sends the change back.
- **Scheduling:** tasks that touch the same file may run at the same time: git merges their edits
  and stops only where two tasks changed the same lines. **Depends on** means one task needs
  another's result, so a task starts once every task it depends on is gone from `WORKLIST.md`.
  At most 3 task agents run at once.
- **Only the orchestrator commits.** Agents never run git commands that change anything.
- **Only the orchestrator deploys** an app stack, and only from `main` after a merge (Review loop
  › Approved, step 5). A task agent reaches AWS only when its task's **Do** says so.
- **Agents never edit `WORKLIST.md`.** They report back, and the orchestrator updates it.
- **Agent prompts:** a task agent's prompt starts from the output of
  `npm run -s task-prompt -- <ID>`, and a task reviewer's from
  `npm run -s task-prompt -- <ID> --review`. It carries the task's block and its phase's rules
  from `WORKLIST.md`, what belongs to the agent's role, pointers to the sections of `CLAUDE.md`
  and `PROCESS.md` that hold its rules (which it doesn't restate, so it can't fall out of step
  when a rule changes) and to `README.md` › The docs, and what to report back. After it the
  orchestrator adds the task's own notes, and for a reviewer the worktree's path and the agent's
  Outside Files.
  Paths in a prompt are relative to the repo root, never the main checkout's absolute path, since
  the agent works in its worktree. The orchestrator's `SendMessage` notes to an agent name its
  worktree's path.

**Statuses:** `todo` · `doing` · `blocked` · `needs-human`. A status may carry a short reason in
parentheses, for example `blocked (waiting for the user's AWS sign-up)`.
