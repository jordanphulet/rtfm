# RTFM — Work List

The work still to do, with each task's status. **This file is the source of truth for status.**
`PROCESS.md` says how the orchestrator works through it; finished work is removed.

## Waiting on AWS

Work that can't start until the user does something in AWS. Each task stays `blocked` until the
user says its step is done.

### AW.1 — Check the ledger against the AWS bill
- **Status:** blocked (the user compares Bedrock charges in Cost Explorer with `npm run usage`)
- **Depends on:** —
- **Files:** `server/gateway/prices.ts`, `server/README.md`, `server/gateway/README.md`
- **Do:** with the user's figures, correct the Haiku 4.5 prices if they differ, and decide from
  the bill whether a call that doesn't complete should still be charged its full `max_tokens`.
- **Done when:** the price table matches AWS's charges and `server/README.md` says what was
  checked.

### AW.2 — Claude Platform on AWS
- **Status:** blocked (the user signs up, following `research/aws-hosting.md` › "Your steps")
- **Depends on:** —
- **Files:** `server/gateway/**`, `server/config.ts`, `package.json`, `package-lock.json`,
  `ARCHITECTURE.md`, `README.md`, `research/aws-hosting.md`
- **Do:** swap the gateway's client to Claude Platform on AWS as the research describes, keeping
  the credential lockdown and its tests; one live Haiku 4.5 call under $0.01; check whether the
  newer models answer.
- **Done when:** `npm run build` and `npm test` pass, a real call through the gateway succeeds,
  and the research doc's status line says what was adopted.

### AW.3 — Model bake-off
- **Status:** blocked (access to the newer Claude models, through AW.2 or an AWS Support case)
- **Depends on:** AW.2 or the Support case
- **Files:** `research/bedrock-models.md`, `server/config.ts`
- **Do:** run the bake-off in `research/bedrock-models.md` on the models now open to the account,
  under $0.50, and pick each job's model.
- **Done when:** the research doc records the results and status, and `server/config.ts` uses
  the chosen models.

---

## Rules into code

The first rule audit (2026-10-12) ranked the written rules agents break by how often and what it
cost. Three broke with real cost: task work committed without a review, agents stopping processes
they didn't start, and sessions working from stale rules. This phase turns each into code that
makes the right way the easy way. When this phase is done:

- task work is committed only through `npm run commit-task`, which stages only the task's Files
  and records who reviewed it;
- a session in a worktree that is behind `main` is told so when it starts;
- an agent that needs a server for a check starts one with `npm run serve-temp` and stops it by
  its PID.

### Rules for this phase

- **The user approves hooks and rule files before they are committed:** `.githooks/`,
  `.claude/settings.json`, `CLAUDE.md` and `PROCESS.md`. Each task stops at `needs-human` with
  the exact text to approve.
- **A session-start hook never blocks work.** If it fails, it prints nothing and exits 0.
- **One at a time.** These tasks share `README.md`, `package.json`, `ARCHITECTURE.md` or
  `PROCESS.md`, so they run in a chain: RC.1, RC.2, RC.3.

### RC.2 — Tell a session when its rules are out of date
- **Status:** needs-human (the user approves `.claude/settings.json` and the `PROCESS.md` change; agent
  a0083ed43e106a6c4, reviewed by ae65fd5555d52ee19)
- **Depends on:** —
- **Files:** `scripts/hooks/**` and their tests (new), `.claude/settings.json` (new, the user
  approves), `PROCESS.md` ("How rules spread"; the user approves), `README.md`,
  `ARCHITECTURE.md` (the `scripts/` codemap entry)
- **Do:**
  - **Behind `main`.** A `SessionStart` hook that blocks nothing. In a worktree whose `HEAD` is
    behind the local `main`, it tells the session:
    - how many commits behind it is;
    - which of `CLAUDE.md`, `PROCESS.md`, `WORKLIST.md` and `README.md` differ from `main`;
    - to read those with `git show main:<file>`.
    In the main checkout, or when up to date, it says nothing.
  - **Changed since the session started.** A session's copy of `CLAUDE.md` is a snapshot taken
    when it starts or resumes, and subagents get their orchestrator's snapshot. The first audit
    found 55 of 85 subagents started with an out-of-date `CLAUDE.md`, and agents already running
    never see a rule added after they started. So:
    - at `SessionStart`, the hook saves a copy of `CLAUDE.md` and `PROCESS.md` for that session,
      outside the repository (the system's temporary folder);
    - a `PostToolUse` hook compares the files on disk with that copy. When one has changed, it
      tells the session, once per change, which file changed and the change itself (`git diff
      --no-index` between the copy and the file, cut short if long), and that the file on disk
      wins over the copy in its context;
    - a subagent is told about changes since its orchestrator's copy, including changes made
      before the subagent started, since that copy is the one it was given. This needs the hook
      input to identify a subagent's tool calls; if it can't, the agent reports that and the
      notice covers the orchestrator only.
  - **Resolve a contradiction.** `PROCESS.md` says a session in a worktree "syncs with main", but
    `CLAUDE.md` lets only the orchestrator run git commands that change anything. The repository
    also has no `origin` for the app's sync tool. Replace the line: a session in a worktree reads
    the rule files from `main` (`git show main:<file>`), and bases anything it drafts on `main`'s
    version.
  - Measure and report what each hook adds to a tool call.
  - Tests, against temporary git repositories and folders:
    - a worktree behind, one up to date, and the main checkout;
    - an unchanged file (silence), a changed file (one notice, then silence until the next
      change), a change in two distant places (the diff shows both correctly);
    - a subagent started after a change is told about it;
    - a failure (no git, not a repository, no saved copy), which prints nothing and exits 0.
- **Done when:** `npm run build` and `npm test` pass; a new session in a stale worktree sees the
  behind-`main` notice; a session in the main checkout sees nothing; after `PROCESS.md` changes,
  a running session and a running subagent are each told once, at their next tool call; the user
  has approved `.claude/settings.json` and the `PROCESS.md` change.

### RC.3 — A throwaway server that agents stop by its PID
- **Status:** todo
- **Depends on:** RC.2
- **Files:** `scripts/serve-temp.ts` and its test (new), `package.json`, `CLAUDE.md` (the line
  about stopping processes; the user approves), `ARCHITECTURE.md` (the `scripts/` codemap entry),
  `README.md`
- **Do:**
  - `npm run serve-temp -- [--models fake|bedrock] [--keep]` starts the API and Vite on free
    ports, with a new temporary data folder and fake models unless told otherwise. It reuses
    `startServer` and `startViteServer` as `scripts/shot.ts` does, and never uses `.data/`.
  - It prints the page's URL, the API's URL, the data folder and its own PID, then runs until
    stopped. On `SIGINT` or `SIGTERM` it stops both servers and deletes the data folder, unless
    `--keep` is given.
  - Agents run it in the background and stop it with the handle or the printed PID.
  - The line in `CLAUDE.md` about stopping processes names the script as the way to run a
    server for a check, and says that a PID looked up by port or name (`lsof`, `ps`, `pgrep`) or
    a `pkill -f` pattern never counts as a process you started: the second audit found 10 of 16
    breaks were lookups like these.
  - Tests:
    - it starts on free ports and never on `.data/`;
    - stopping it frees its ports and removes its folder;
    - two copies run at once without colliding.
- **Done when:** `npm run build` and `npm test` pass; two copies run side by side while the
  user's dev server runs; stopping one by its PID leaves nothing of it running; the user has
  approved the `CLAUDE.md` line.

---

## Agents in their own worktrees

Every task agent works in its own git worktree on its own branch, and the orchestrator merges each
approved task into `main`. Tasks that share a file can run at the same time: git merges their
edits and stops only where two tasks changed the same lines. When this phase is done:

- the orchestrator starts every task agent in its own worktree and merges approved work into
  `main`;
- an agent that needs a file outside its task's **Files** changes it and says why, and the
  orchestrator adds it to the task before committing;
- the server reads `.env.local` from the main checkout, so no worktree holds a copy.

### Rules for this phase

- **The user approves `PROCESS.md` before it is committed.** WT.2 stops at `needs-human` with the
  exact text to approve.
- **No copies of `.env.local`.** WT.1 changes where the code looks, not where the file is. Tests
  never touch the real file.

### WT.1 — Read `.env.local` from the main checkout
- **Status:** todo
- **Depends on:** RC.2, RC.3 (all change `README.md`; RC.3 also `ARCHITECTURE.md`)
- **Files:** `server/gateway/credentials.ts` and its test, `README.md` (the setup step that names
  `.env.local`), `ARCHITECTURE.md` (the Configuration line)
- **Do:**
  - `ENV_LOCAL_FILE` is `.env.local` in the main checkout's root: the parent of
    `git rev-parse --path-format=absolute --git-common-dir`, resolved once. Where git isn't
    available, it is the repo root as before.
  - Tests build a throwaway repo and linked worktree in a temp folder: the worktree resolves to
    the main checkout, the main checkout to itself, and no git to the repo root.
- **Done when:** `npm run build` and `npm test` pass, and the server started in a linked worktree
  finds the credentials, checked without printing any value.

### WT.2 — Task agents in their own worktrees
- **Status:** todo
- **Depends on:** RC.2 (both change `PROCESS.md`)
- **Files:** `PROCESS.md` (the loop, the review loop and Rules; the user approves),
  `scripts/commit-task.ts` and its test
- **Do:**
  - `npm run commit-task -- <ID> --worktree <path> …` reads the task from this checkout's
    `WORKLIST.md` and stages and commits in the given worktree. Without `--worktree` it works as
    it does now. Tests cover both.
  - `PROCESS.md`:
    - **Starting:** every task agent starts with `isolation: "worktree"` from `main`. Its first
      step is `npm ci`; any server it starts uses its own `dataDir` and `port: 0`.
    - **Files outside the list:** an agent may change a file its task's **Files** don't name, and
      lists it in its report under "Outside Files" with the reason. Working around a missing
      file (duplicating code, putting code in the wrong place, editing through the shell) is a
      failure, not compliance. The orchestrator adds each accepted file to the task's **Files**
      before committing, or sends the change back.
    - **Committing:** once approved, the orchestrator runs `commit-task --worktree`, then merges
      `main` into the task's branch in the agent's worktree. On a conflict, the agent resolves
      the marked files (editing files only, no git) and the orchestrator commits the merge. With
      `npm test` passing there, `main` fast-forwards to the branch, and the worktree and branch
      are removed.
    - **Scheduling:** tasks that touch the same file may run at the same time. **Depends on**
      means one task needs another's result. At most 3 agents run at once.
    - The rule that agents share one checkout is removed.
- **Done when:** the user has approved the `PROCESS.md` text, `npm test` passes, and
  `PROCESS.md` says each point above.

---

## Docs and prompts that hold

The second rule audit (2026-10-12, the first run of the `rule-audit` skill) found two more rules
breaking often enough to turn into code: docs that fall out of step with the code, and agent
prompts missing the standing rules. It also found that half its candidates were false positives.
When this phase is done:

- `npm test` fails when a doc names a file, script, setting or route that doesn't exist;
- an agent prompt starts from `npm run task-prompt`, which carries the task block and the standing
  rules;
- the audit's candidates come closer to its confirmed breaks.

### Rules for this phase

- **The user approves `PROCESS.md` changes before they are committed.** The task stops at
  `needs-human` with the exact text to approve.
- **No real Bedrock calls.** Tests use the fake models.
- **Transcripts are the user's private record.** Read them only; never copy their content into the
  repo. Audit fixtures are small synthetic transcripts written for the tests.
- **Never print a credential value.** Anything key- or secret-shaped is shown redacted, in output,
  logs and reports alike.
- **The audit writes nothing inside the repo.** Its output goes to a folder outside it.
- **One at a time where files overlap:** DC.1 and AP.1 change `README.md`, so they run after RC.3,
  in that order. DC.1 may also fix `scripts/audit/README.md`, so it waits for RA.3 too.

### RA.3 — Sharper audit detectors
- **Status:** doing (agent ae6de641e0af74280; re-review of round 2)
- **Depends on:** —
- **Files:** `scripts/audit/**`
- **Do:**
  - **Task commit reviews:**
    - match a review agent by the task's title words or a design letter, or by its prompt
      naming the ID, not only its description;
    - add each commit's changed-line count;
    - also list the orchestrator's own commits other than `WORKLIST.md`-only ones.
  - **Process stops:**
    - treat `kill $(cat <file>)` as the agent's own when the same agent wrote that file from `$!`;
    - treat a literal PID as its own when it appeared earlier in that agent's own launch output;
    - mark PIDs that came from `lsof`/`ps`/`pgrep`, and `pkill -f`, as found by port or pattern.
  - **Sensitive paths:** split reads from writes; ignore `--exclude-dir=.data` and
    `--exclude .env.local`; treat a script given the `.env.local` path as runtime loading.
  - **Rule file edits:** count only paths inside this repo or its worktrees; for `cp` count only
    the destination.
  - **New detectors:**
    - zsh `=` and "no matches found" errors after the zsh rule;
    - each orchestrator loop pass, and whether it re-read `CLAUDE.md` and `PROCESS.md`;
    - agent prompts missing the standing rules;
    - a task agent's Edit/Write outside the task's Files (from the task block in `WORKLIST.md`'s
      history at that time);
    - a reviewer or auditor session writing files.
- **Done when:** `npm run build` and `npm test` pass; synthetic fixtures cover each new case and
  each dropped false positive; on the real transcripts, unreviewed task commits fall from 55 to
  close to the 27 confirmed, and process stops no longer list kills of the agent's own PID.

### DC.1 — A test that docs name only what exists
- **Status:** todo
- **Depends on:** RC.3 (both change `README.md` and `ARCHITECTURE.md`), RA.3 (`scripts/audit/README.md`)
- **Files:** `scripts/doc-references.test.ts` (new); `README.md`, `ARCHITECTURE.md`, `DESIGN.md`,
  `src/**/README.md`, `src/**/DESIGN.md`, `server/**/README.md`, `scripts/audit/README.md` (only
  to fix references the test flags)
- **Do:**
  - A test that reads every doc in README's docs index and every folder README and design doc,
    and checks each code span that names something checkable:
    - a repo path (`server/…`, `src/…`, `scripts/…`, globs allowed) exists;
    - `npm run <name>` is a script in `package.json`;
    - an `RTFM_*` setting is read by `server/config.ts` or a script;
    - an API route is one the server defines.
  - Placeholders such as `<manual>` are allowed. `research/` and `WORKLIST.md` are skipped:
    they describe what might be and what is planned.
  - Fix whatever it finds.
- **Done when:** `npm run build` and `npm test` pass; renaming a file or setting that a doc names
  makes `npm test` fail with the doc and line; the docs pass as they stand.

### AP.1 — Agent prompts from the task block
- **Status:** todo
- **Depends on:** DC.1 (both change `README.md`), WT.2 (both change `PROCESS.md`, and AP.1 reuses
  `scripts/commit-task.ts`)
- **Files:** `scripts/task-prompt.ts` and its test (new), `package.json`, `PROCESS.md` (its rules
  for agent prompts; the user approves), `README.md` (the scripts table)
- **Do:**
  - `npm run task-prompt -- <ID>` prints a prompt with:
    - the task's full block from `WORKLIST.md` and its phase's "Rules for this phase";
    - the standing rules: stay inside Files; no git command that changes anything; stop only
      processes you started, by handle or PID; docs describe what exists; report the files
      changed, the checks run and anything unresolved;
    - pointers to `CLAUDE.md` and README's docs index, replacing the fixed
      `src/manual/README.md` pointer.
  - `--review` prints the reviewer's version: read-only, report findings.
  - `PROCESS.md` says agent prompts start from its output. It reuses RC.1's Files parsing.
- **Done when:** `npm run build` and `npm test` pass; tests cover a task block in each form
  `WORKLIST.md` uses, an unknown ID refused, phase rules included, and the review version; the
  user has approved the `PROCESS.md` change.
