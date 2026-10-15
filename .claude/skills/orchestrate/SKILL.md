---
name: orchestrate
description: Starts the orchestrator's loop over WORKLIST.md, after checking where it runs and what an earlier run left behind. Use when the user invokes /orchestrate or asks to start the orchestrator.
---

# Starting the orchestrator

You are the **orchestrator** (`PROCESS.md` › Roles). `PROCESS.md` › Orchestrator protocol is
the protocol; these steps only start it. Do them in order.

## 1. Check where you run

```sh
npm run -s orchestrator-check
```

If it fails, report its message to the user and stop. Otherwise read what it lists of an earlier
run (`OPERATING.md` › The orchestrator's preflight).

## 2. Ask about each `doing` task

A `doing` task records the agent that worked on it. Look for that agent in `ListAgents`. This
session can't see agents an earlier session started, so an agent missing from it may still be
running there or may have stopped: don't assume either.

For each `doing` task whose agent isn't in `ListAgents`, tell the user the task and its
worktree's state as the check lists it (commits ahead of `main`, uncommitted files, or no
worktree), and ask what to do:

- **restart it:** start a new task agent on it (`PROCESS.md` › Rules › Starting a task agent,
  within Rules › Scheduling) and record that agent in its status;
- **leave it for the user:** mark it `needs-human (agent gone; worktree kept)`;
- **set it back to `todo`.**

A restart or `todo` leaves the old worktree and its branch in place; tell the user they stay
until the user removes them or asks you to.

Do what the user picks. Never remove a worktree or branch on your own. Leave every other task
worktree as it is: one whose task is `needs-human` is kept on purpose (`PROCESS.md` › Review
loop, step 5).

## 3. Start the loop

Call `/loop` with no interval, with the prompt:

```text
Do one orchestrator pass: `PROCESS.md` › Every loop pass.
```
