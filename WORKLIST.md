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

### OS.2 — The `/orchestrate` skill
- **Status:** needs-human (the user approves the `PROCESS.md` change; agent ab5db648346a2c135, in
  its own worktree, reviewed by a8ac922500409b39c)
- **Depends on:** —
- **Files:** `.claude/skills/orchestrate/SKILL.md`, `PROCESS.md`, `README.md`
- **Do:** write a skill the user invokes to start the loop. In order, it:
  1. runs `npm run orchestrator-check`, and on failure reports the message and stops;
  2. for each `doing` task whose recorded agent isn't in `ListAgents`, reports the task and its
     worktree's state to the user and asks what to do: restart it, mark it `needs-human` with its
     worktree kept, or set it back to `todo`. It never removes a worktree or branch on its own;
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
