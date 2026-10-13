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

## Before AWS

Two things the app needs before it's hosted: logs that Claude can read without the user copying
from a terminal, and a passphrase so a public URL can't be used by anyone who finds it. When this
phase is done:

- the server writes structured logs to a file Claude can read, and the same lines would go to
  CloudWatch unchanged;
- errors in the browser reach the same log;
- nothing in the app works without the passphrase, and the sign-in page fits the design.

### Rules for this phase

- **AWS credentials come only from `.env.local`.** There are profiles in `~/.aws/config`, and
  they **must never be used**. Never read, print, copy or edit `.env.local`.
- **No real Bedrock calls.** Tests and live checks use the fake models.
- **`.data/` is the user's data.** Never start a server on it (the user's dev server may be
  running there); use `RTFM_DATA_DIR` on a temporary folder. Never delete or edit the ledger.
- **Logs never hold secrets:** no credentials, no passphrase, no session tokens, no cookies.

### BA.2 — The passphrase: design
- **Status:** doing (agent: a45d3aa24426d132f; in review)
- **Depends on:** —
- **Files:** `research/passphrase.md` (new)
- **Do:** write the design for the user's approval in `research/passphrase.md`, dated and opening
  with a status line, since the docs describe only what exists; BA.3 writes the approved design
  into the docs that own each part. Short and concrete:
  - where the passphrase is set (a setting loaded at runtime, never committed) and what the
    server does when it isn't set;
  - how the server checks it (a stored hash, a constant-time comparison) and slows guessing
    (for example a few attempts a minute);
  - the session: an `HttpOnly`, `SameSite=Strict` cookie holding a signed token (the reader's
    streams can't send headers), how long it lasts, signing out, and what a changed passphrase
    does to existing sessions;
  - which routes need it (everything except signing in), what a request without it gets, and
    how the page responds (the sign-in page, then back to where the user was);
  - the sign-in page's design, within the design docs' rules;
  - how it carries over to AWS (where the passphrase and signing key would live).
- **Done when:** the design is reviewed, then marked `needs-human`; the user approves it.

### BA.3 — The passphrase: build
- **Status:** todo
- **Depends on:** BA.2 and the user's approval, RA.2 (both change `README.md`)
- **Files:** `server/**`, `src/**`, `scripts/**`, `README.md`, `ARCHITECTURE.md`, `DESIGN.md`,
  `research/passphrase.md` (`server/**` and `src/**` include the folder READMEs and page design
  docs)
- **Do:** build what BA.2's approved design says, with the sign-in page and signing out; the
  screenshot script signs in; logs record sign-ins and refusals without the passphrase or token.
  Write the design into the docs that own each part (the server and folder READMEs,
  `ARCHITECTURE.md`, the design docs), and set `research/passphrase.md`'s status line to what was
  adopted.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; tests cover every route
  refusing without a session, signing in and out, a wrong passphrase, the attempt limit, a
  tampered or expired token, and streams working with the cookie; live, the whole app works
  after signing in and nothing works before.

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

### RA.1 — Read the transcripts
- **Status:** doing (agent: af2aa30f1e3fb1187)
- **Depends on:** —
- **Files:** `scripts/audit/**` (new), `package.json`, `ARCHITECTURE.md` (the `scripts/` codemap
  entry), `README.md`
- **Do:**
  - `npm run audit -- [--out <folder>] [--exclude-session <id>]` reads every transcript for this
    repo: the `~/.claude/projects/` folders for the main checkout and its worktrees, each session
    and its `subagents/` (with each subagent's `.meta.json` description). It writes JSON files to
    the output folder (default: a new temporary folder, printed at the end).
  - **Events:** one per tool call with its result, assistant text and human message, saying who
    (a session or a subagent and its description) and when, in UTC.
  - **Dropped:** messages repeated across forked sessions (counted once), harness messages (task
    notifications, agent hand-backs, system reminders) and the excluded session.
  - **Credential scan:** counts key- and secret-shaped values, shows only redacted context, and
    marks the tests' known fake key.
  - **Candidates**, each with time, session, who, the command or path and the first lines of the
    result. They are starting points for reading, not verdicts:
    - the user's messages, where corrections live;
    - git commands run by subagents that change state;
    - stopping processes: `pkill`, `killall`, and `kill` with a lookup (`$(…)`, `lsof`, `ps`);
    - touches of the data folder and of `.env*.local` and `~/.aws`;
    - edits to `CLAUDE.md`, `PROCESS.md`, `WORKLIST.md` and `.claude/`;
    - each task commit on `main` and the review agents started for that task before it (commit
      times from `git log`, compared across time zones);
    - the orchestrator staging whole folders (`git add -A <folder>`);
    - the peak number of task agents running at once;
    - how far each worktree is behind `main`;
    - tool errors grouped by their first line;
    - each commit that changed `CLAUDE.md` or `PROCESS.md`, with its date and a short diff.
  - Tests on synthetic transcripts: a forked duplicate counts once; redaction never lets a value
    through; commits match reviews across time zones; each detector's known false positives stay
    out (`git mv -n`, `git stash list`, `git tag -l`, a command inside a heredoc body).
- **Done when:** `npm run build` and `npm test` pass; nothing is written inside the repo; no
  output line holds a credential value; run on the real transcripts, it finds the first audit's
  cases:
  - design C's builder freeing a port on 2026-10-10, and the four `pkill -f` from already-running
    agents after the rule was added (19:19–19:40 UTC);
  - BE.4's and RL.6's `git rm --cached` and `git restore --staged`, and AL.6's
    `git worktree add`/`remove`;
  - BE.2's `rm -r .data`;
  - OH.1, OH.2, OH.4, OH.5, OH.9 and RS.2 committed with no review agent started for them;
  - no credential value in any transcript, only the tests' fake key;
  - every worktree behind `main`.

### RA.2 — The rule-audit skill
- **Status:** todo
- **Depends on:** RA.1
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
