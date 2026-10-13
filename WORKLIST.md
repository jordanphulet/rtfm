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

- **No copies of `.env.local`.** WT.1 changes where the code looks, not where the file is. Tests
  never touch the real file.

### WT.1 — Read `.env.local` from the main checkout
- **Status:** doing (agent a499adf9d828fce4d, in its own worktree; review round 2)
- **Depends on:** —
- **Files:** `server/gateway/credentials.ts` and its test, `README.md` (the setup step that names
  `.env.local`), `ARCHITECTURE.md` (the Configuration line), `server/gateway/README.md` (the
  `credentials.ts` paragraph)
- **Do:**
  - `ENV_LOCAL_FILE` is `.env.local` in the main checkout's root: the parent of
    `git rev-parse --path-format=absolute --git-common-dir`, resolved once. Where git isn't
    available, it is the repo root as before.
  - Tests build a throwaway repo and linked worktree in a temp folder: the worktree resolves to
    the main checkout, the main checkout to itself, and no git to the repo root.
- **Done when:** `npm run build` and `npm test` pass, and the server started in a linked worktree
  finds the credentials, checked without printing any value.

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

### DC.1 — A test that docs name only what exists
- **Status:** doing (agent acebb14dbc85b563c, in its own worktree; in review)
- **Depends on:** —
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
- **Status:** doing (agent a437a723c5776a271, in its own worktree; in review)
- **Depends on:** —
- **Files:** `scripts/task-prompt.ts` and its test (new), `package.json`, `PROCESS.md` (its rules
  for agent prompts; the user approves), `README.md` (the scripts table), `scripts/commit-task.ts`
  (its task-block parsing, exported for reuse), `ARCHITECTURE.md` (the `scripts/` codemap entry)
- **Do:**
  - `npm run task-prompt -- <ID>` prints a prompt with:
    - the task's full block from `WORKLIST.md` and its phase's "Rules for this phase";
    - the standing rules: change the task's Files, and list any other file changed under
      "Outside Files" with the reason; no git command that changes anything; stop only processes
      you started, by handle or PID; docs describe what exists; report the worktree's path and
      branch, the files changed, the checks run and anything unresolved;
    - pointers to `CLAUDE.md` and README's docs index, replacing the fixed
      `src/manual/README.md` pointer.
  - `--review` prints the reviewer's version: read-only, report findings.
  - `PROCESS.md` says agent prompts start from its output. It reuses RC.1's Files parsing.
- **Done when:** `npm run build` and `npm test` pass; tests cover a task block in each form
  `WORKLIST.md` uses, an unknown ID refused, phase rules included, and the review version; the
  user has approved the `PROCESS.md` change.
