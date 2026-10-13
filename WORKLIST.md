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

## Orchestrator start

A session starts the orchestration loop with `/orchestrate`, which checks where it runs and what
an earlier run left behind before the first pass.

### Rules for this phase

- **The user approves `PROCESS.md` before it is committed.** OS.2 stops at `needs-human` with the
  exact text to approve.

### OS.1 — Orchestrator preflight
- **Status:** doing (agent a7ad0ab787ca0789a, in its own worktree)
- **Depends on:** —
- **Files:** `scripts/orchestrator-check.ts` and its test, `scripts/commit-task.ts` and its test,
  `package.json`, `README.md`, `ARCHITECTURE.md`
- **Do:** add `npm run orchestrator-check`. It fails, naming what to fix, when:
  - the current folder isn't the main checkout (`--git-dir` differs from `--git-common-dir`),
    printing the main checkout's path;
  - the main checkout isn't on `main`;
  - the working tree has uncommitted changes, listing them;
  - `core.hooksPath` doesn't resolve to the main checkout's `.githooks`.

  When those pass, it reports what an earlier run may have left behind, without failing:
  - each `doing` task in `WORKLIST.md`, with the agent recorded for it;
  - each task worktree (branch `worktree-agent-*`), with its commits ahead of `main` and its
    uncommitted files;
  - pairs each `doing` task with the worktree whose branch carries its agent's ID, and lists
    either side that has no match.

  `npm run commit-task` refuses, with the same message, unless it runs in the main checkout with
  `main` checked out.
- **Done when:**
  - tests cover each failing check;
  - tests cover a `doing` task with and without a worktree, and a task worktree with no `doing`
    task;
  - a test shows `commit-task` refusing from a linked worktree and from a branch other than `main`;
  - `npm run build` and `npm test` pass;
  - `README.md` documents the command.

### OS.2 — The `/orchestrate` skill
- **Status:** todo
- **Depends on:** OS.1
- **Files:** `.claude/skills/orchestrate/SKILL.md`, `PROCESS.md`, `README.md`
- **Do:** write a skill the user invokes to start the loop. In order, it:
  1. runs `npm run orchestrator-check`, and on failure reports the message and stops;
  2. for each `doing` task whose recorded agent isn't in `ListAgents`, reports the task and its
     worktree's state to the user and asks what to do: restart it, keep the worktree's work for a
     new agent, or set it back to `todo`. It never removes a worktree or branch on its own;
  3. calls `/loop` with no interval, with the prompt "Do one orchestrator pass: `PROCESS.md` ›
     Every loop pass."

  The skill points to `PROCESS.md` for the protocol instead of restating it. In `PROCESS.md`,
  the Orchestrator protocol opens by saying the loop starts with `/orchestrate`, in the main
  checkout on `main`, and that `commit-task` refuses anywhere else.
- **Done when:**
  - the skill's steps match the above;
  - nothing in it repeats or contradicts `PROCESS.md`;
  - `README.md` lists the skill beside `rule-audit`.

### OS.3 — Try `/orchestrate`
- **Status:** needs-human (the user runs `/orchestrate` in a new session in the main checkout)
- **Depends on:** OS.2
- **Files:** `.claude/skills/orchestrate/SKILL.md`
- **Do:** check that the preflight runs and `/loop` starts in dynamic mode when the skill calls it.
  Also check that the session refuses to start from a worktree. Fix the skill if any step doesn't
  work.
- **Done when:** the user has seen one full pass start from `/orchestrate`, and a later wake-up run
  the one-pass prompt.
