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

## Rule audit

A repeatable audit of which written rules agents actually break, and what each break costs, so
the rules that matter most can be turned into code. An auditor session ran it once by hand on
2026-10-12, at the user's request; this phase makes it a skill any session can run. When this
phase is done:

- `npm run audit` reads this repo's Claude Code transcripts and writes candidate rule breaks to a
  folder outside the repo;
- the `rule-audit` skill turns those candidates into a ranking by frequency and consequence, with
  proposed tasks, and changes no files.

### Rules for this phase

- **Transcripts are the user's private record.** Read them only; never copy their content into the
  repo. Test fixtures are small synthetic transcripts written for the tests.
- **Never print a credential value.** Anything key- or secret-shaped is shown redacted, in output,
  logs and reports alike.
- **The audit writes nothing inside the repo.** Its output goes to a folder outside it.
- **The skill file needs the user's approval.** It instructs sessions, like `CLAUDE.md`; the
  orchestrator shows it to the user before committing it. If the sandbox refuses writes under
  `.claude/skills/`, the agent reports that and doesn't work around it.

### RA.2 — The rule-audit skill
- **Status:** needs-human (the user approves `SKILL.md`; the fresh-session run matched the first audit's top two, and ranked stale rules fourth, below docs drift)
- **Depends on:** RA.1, BA.3 (both change `README.md`)
- **Files:** `.claude/skills/rule-audit/SKILL.md` (new, the user approves), `README.md`
- **Do:** a project skill that a session runs when asked to "run the rule audit". The session
  acts as an auditor: it changes no files and proposes tasks. The method:
  1. **Collect the rules** from everywhere they live: the history of the rule files (when each
     rule appeared and what prompted it), the phase rules in `WORKLIST.md`, the "Rules" blocks in
     agent prompts, the user's corrections, and review findings.
  2. **Run `npm run audit`** and read every candidate in its context, dropping false positives.
  3. **Judge each break** by the rule in force at the time, and by whether the agent could have
     known it (an agent already running never sees a rule added after it started).
  4. **Weigh consequence:** what each break cost (the user's tools, money, security, data,
     rework); the incident that prompted the rule; whether it recurred; whether code already
     enforces it (the gateway, `sdk-boundary.test.ts`, the server lock) and whether breaks stopped
     after that.
  5. **Rank** by frequency and consequence, and recommend which written rules to turn into code
     first. Prefer the repo's own scripts and tests, which make the right way the easy way, over
     harness hooks. Prefer rules that actually break over ones that only could. Name rules that
     contradict each other.
  6. **Report** in the session, with proposed tasks in this file's format for the orchestrator.
  - `README.md` lists the skill alongside the scripts.
- **Done when:** reviewed and approved by the user; a fresh session told only "run the rule audit" produces a ranking whose
  top three match the first audit's (review before commit, stopping processes the agent didn't
  start, sessions working from stale rules) without being shown them.

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
- **One at a time.** These tasks, RA.1, RA.2 and BA.3 share `README.md`, `package.json`,
  `ARCHITECTURE.md` or `PROCESS.md`, so they run in a chain: RA.1, BA.3, RA.2, RC.1, RC.2, RC.3.

### RC.1 — Commit task work through one script
- **Status:** todo
- **Depends on:** RA.2
- **Files:** `scripts/commit-task.ts` and its test (new), `.githooks/commit-msg` (new, the user
  approves), `package.json`, `PROCESS.md` (the review loop's commit step; the user approves),
  `ARCHITECTURE.md` (the `scripts/` codemap entry), `README.md`
- **Do:**
  - `npm run commit-task -- <ID> --reviewed-by <agent id>`, or `--no-review "<reason>"` for a
    change the orchestrator reviewed alone:
    - reads the task's block in `WORKLIST.md` and its **Files**;
    - stages exactly the changed and new files they match, never a whole folder, and lists the
      other changed files it left alone;
    - refuses if nothing matches;
    - commits as `<ID>: <summary>` with a `Reviewed-by:` trailer holding the review agent's id or
      `none (<reason>)`, and the co-author line.
  - `.githooks/commit-msg` refuses a commit whose subject starts with a task ID and has no
    `Reviewed-by:` trailer, and names the script. Other commits pass (work list statuses, the
    user's own). `README.md` says how `core.hooksPath` is set to `.githooks`.
  - The review loop in `PROCESS.md` commits with the script.
  - Tests:
    - **Files** in every form the work list uses: `**`, `*`, notes such as "(new)", and lead-ins
      such as "for pointers to moved headings only:";
    - only matching files are staged;
    - both trailer forms;
    - a refusal when nothing matches;
    - the hook passing and refusing.
- **Done when:** `npm run build` and `npm test` pass; a reviewed commit and a `--no-review`
  commit each carry their trailer; a hand-written `git commit -m "XX.1: …"` without one is
  refused; the user has approved the hook and the `PROCESS.md` change.

### RC.2 — Tell a session when its rules are out of date
- **Status:** todo
- **Depends on:** RC.1
- **Files:** `scripts/hooks/**` and their tests (new), `.claude/settings.json` (new, the user
  approves), `PROCESS.md` ("How rules spread"; the user approves), `README.md`
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
    server for a check.
  - Tests:
    - it starts on free ports and never on `.data/`;
    - stopping it frees its ports and removes its folder;
    - two copies run at once without colliding.
- **Done when:** `npm run build` and `npm test` pass; two copies run side by side while the
  user's dev server runs; stopping one by its PID leaves nothing of it running; the user has
  approved the `CLAUDE.md` line.
