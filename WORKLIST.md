# RTFM — Work List

The work still to do, with each task's status. **This file is the source of truth for status.**
`PROCESS.md` says how the orchestrator works through it; finished work is removed.

## Waiting on AWS

Work that can't start until the user does something in AWS. Each task stays `blocked` until the
user says its step is done.

### AW.1 — Check the ledger against the AWS bill
- **Status:** blocked (the user compares Bedrock charges in Cost Explorer with `npm run usage`)
- **Depends on:** —
- **Files:** `server/gateway/prices.ts`, `ARCHITECTURE.md`
- **Do:** with the user's figures, correct the Haiku 4.5 prices if they differ, and decide from
  the bill whether a call that doesn't complete should still be charged its full `max_tokens`.
- **Done when:** the price table matches AWS's charges and ARCHITECTURE.md says what was checked.

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

## Follow-ups

### Rules for this phase

- **AWS credentials come only from `.env.local`.** There are profiles in `~/.aws/config`, and
  they **must never be used**. Never read, print, copy or edit `.env.local`.
- **No real Bedrock calls.** Tests use fake models.
- **`.data/` is the user's data.** Never start a server on it (the user's dev server may be
  running there), and never delete or edit the ledger.

### OH.11 — README catch-up
- **Status:** doing (agent: a6d4a03f62d46a97d)
- **Depends on:** —
- **Files:** `README.md`
- **Do:** bring README.md up to date with the code:
  - one server per data folder is enforced (it says "should"); add `server.lock` to the `.data/`
    list and what a second `npm run dev` on the same folder prints;
  - `npm run shot` runs its own dev server on a free port, clears only its own output folder,
    takes `npm run shot -- <folder>`, and names the phone size `phone` in both shot sets;
  - `RTFM_DATA_DIR` and `RTFM_PORT`: run the server on another data folder or port without
    editing anything; port 0 takes any free port; Vite's proxy always points at 8787, so
    `RTFM_PORT` is for `npm run server` alone; an invalid port stops the server starting; the
    `server/config.ts` bullet says `RTFM_DATA_DIR` overrides the data folder. Give the how-to
    and point to ARCHITECTURE.md › Configuration for the rules;
  - `npm test` runs some browser tests in happy-dom;
  - README is the only home of the reset steps, the `startServer({...config, caps})` how-to,
    the fake writer's and librarian's pace under "The models" (1.2s, then about 20 characters
    every 85ms; 0.6s for the librarian), and the routes and lazy loading under "Where things
    live"; other docs point there, so keep those headings and facts;
  - costs and timings point to ARCHITECTURE.md's measurement table or match it exactly
    (planning is 21.3s, not "about 20 seconds"); the worst-case reservation and full-`max_tokens`
    charging point to ARCHITECTURE.md › the gateway;
  - anything else in README.md that no longer matches the code.
- **Done when:** README.md matches the code and states nothing another doc owns.

### OH.14 — A turn limit for the librarian
- **Status:** doing (agent: a1aae2e585bdddf26)
- **Depends on:** —
- **Files:** `server/agent/**`, `server/config.ts`, `server/config.test.ts`, `ARCHITECTURE.md`
- **Do:** a librarian reply stops after 8 model turns (normal replies use 2 or 3), so a model
  that keeps calling tools can't spend the day's cap on one reply. The limit is per job in the
  config (the librarian's is 8); the loop throws `AgentStopped` when it's reached, before
  calling the model again, so the reply fails as an error. ARCHITECTURE.md's agent-loop and
  librarian sections state the limit and why.
- **Done when:** `npm run build` and `npm test` pass; a test shows a model that keeps calling
  tools stops after exactly 8 calls, with every call settled.

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

### BA.1 — Structured logs
- **Status:** todo
- **Depends on:** OH.11, OH.14 (they change `README.md` and `ARCHITECTURE.md`)
- **Files:** `server/**`, `src/**` (reporting browser errors only), `README.md`,
  `ARCHITECTURE.md`, `package.json` (a `logs` script)
- **Do:**
  - One small logger in `server/` writes one JSON object per line to standard output and to
    `<data folder>/logs/<UTC date>.jsonl`, with a time, a level and an event name. Keep 14 days
    of files.
  - Log: server start and stop; each API request (method, path, status, duration, a request
    id); each model call (job, model, outcome, tokens, cost, duration, its ledger call id);
    section runs starting, joined, finished, failed and aborted; librarian replies (turns, tools
    called, outcome); refusals (the local-only checks, the lock, the caps, the kill switch); and
    every error with its stack. Log sizes and ids rather than manual text, prompts or replies.
  - Replace the server's `console.error` and `console.warn` calls with the logger.
  - The browser reports uncaught errors, unhandled rejections and failed API requests to a new
    `POST /api/client-errors` route (subject to the local-only checks), which logs them.
  - `npm run logs` shows recent entries, with options to filter by level and event and to follow
    new lines, and takes a data folder like `npm run usage` does.
  - README.md says where the logs are and how to read them; ARCHITECTURE.md describes the logger
    and the events.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; tests cover the log file,
  retention, the request and model-call entries, the client-error route, and that no secret
  reaches a log line; live, a section write, a librarian reply and a forced browser error each
  appear in `npm run logs`.

### BA.2 — The passphrase: design
- **Status:** todo
- **Depends on:** BA.1
- **Files:** `ARCHITECTURE.md`, `DESIGN.md`
- **Do:** add the design for user approval, short and concrete:
  - where the passphrase is set (a setting loaded at runtime, never committed) and what the
    server does when it isn't set;
  - how the server checks it (a stored hash, a constant-time comparison) and slows guessing
    (for example a few attempts a minute);
  - the session: an `HttpOnly`, `SameSite=Strict` cookie holding a signed token (the reader's
    streams can't send headers), how long it lasts, signing out, and what a changed passphrase
    does to existing sessions;
  - which routes need it (everything except signing in), what a request without it gets, and
    how the page responds (the sign-in page, then back to where the user was);
  - the sign-in page's design, within DESIGN.md's rules;
  - how it carries over to AWS (where the passphrase and signing key would live).
- **Done when:** the design is reviewed, then marked `needs-human`; the user approves it.

### BA.3 — The passphrase: build
- **Status:** todo
- **Depends on:** BA.2 and the user's approval
- **Files:** `server/**`, `src/**`, `scripts/**`, `README.md`, `ARCHITECTURE.md`, `DESIGN.md`
- **Do:** build what BA.2's approved design says, with the sign-in page and signing out; the
  screenshot script signs in; logs record sign-ins and refusals without the passphrase or token.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; tests cover every route
  refusing without a session, signing in and out, a wrong passphrase, the attempt limit, a
  tampered or expired token, and streams working with the cookie; live, the whole app works
  after signing in and nothing works before.
