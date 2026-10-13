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

### AP.1 — Agent prompts from the task block
- **Status:** doing (the user approved the `PROCESS.md` change; agent a437a723c5776a271 fixes
  `npm test` after the merge with `main`)
- **Depends on:** —
- **Files:** `scripts/task-prompt.ts` and its test (new), `package.json`, `PROCESS.md` (its rules
  for agent prompts; the user approves), `README.md` (the scripts table), `scripts/commit-task.ts`
  (its task-block parsing, exported for reuse), `ARCHITECTURE.md` (the `scripts/` codemap entry),
  `scripts/doc-references.test.ts` (its `npm run` pattern skips flags)
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
