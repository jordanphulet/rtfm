# RTFM — Work List

The orchestrator works through this file under `/loop`, starting subagents for tasks until
everything is done or a task needs a human. **This file is the source of truth for status.**

## Orchestrator protocol

The orchestrator **coordinates, reviews and commits**. It does not do the task work itself.

### Every loop pass

1. **Read this file.** If every task is `done`, or nothing can run because the remaining tasks
   are `needs-human` or `blocked`, report to the user and **stop the loop**.
2. **Review finished work.** Run the review loop below for every `doing` task whose agent has
   reported back.
3. **Start ready tasks.** Start every `todo` task whose dependencies are all `done` as a
   **background subagent**, with **at most 3 running at once**. Mark it `doing` and record the
   agent's name.
4. **Save this file**, then schedule a fallback wake-up in 20–30 minutes. Agents announce when
   they finish, so there's no need to poll.

### Review loop (required before any commit)

1. **Check the basics:** every item in the task's **Done when** list, and `git status` shows
   changes only inside the task's **Files**.
2. **Read the full diff** against `CLAUDE.md` › Code standards and, for UI work, the design doc.
   For anything beyond a trivial change, also start a **review subagent** for an independent code
   review, then weigh its findings.
3. **Changes needed:** send specific, actionable notes to **the same agent** (`SendMessage`, so it
   keeps its context), then wait for it to report back and repeat from step 1.
4. **Approved:** mark the task `done` and commit **only that task's files**, with the message
   `<task id>: <summary>`.
5. **Three rounds without approval:** mark it `needs-human`, write down what's unresolved, and
   tell the user.

### When the orchestrator does work itself

Avoid it. If it does happen (for example, a small fix while reconciling two tasks), start a
review subagent on that change and only commit once the review passes. Keeping this file's
statuses up to date, and git operations such as tags, don't count as work.

### Adding work

When the orchestrator discovers work that should be done, it **adds a task** to the right phase:
a new ID, **Depends on**, **Files**, **Do** and **Done when**. It also updates the dependencies
of any existing task that must now wait for it.

### Rules

- **Every agent runs on Opus 5.5** (`model: "opus"`), in the background.
- **Only the orchestrator commits.** Agents never run git commands that change anything.
- **Agents never edit this file.** They report back, and the orchestrator updates statuses.
- Every agent prompt includes the full task block and points to `CLAUDE.md`, the design doc and
  `src/manual/README.md`. It asks the agent to report back with the files it changed, how it
  checked its work, and anything left unresolved.
- Agents work in the same checkout at the same time, so they **must stay inside their task's
  Files**. Two tasks that touch the same file never run at the same time.

**Statuses:** `todo` · `doing` · `done` · `blocked` · `needs-human`

---


## Backend foundation

The reader stops faking its writing. A local server stores manuals and sections, and Claude
writes unwritten sections live through Amazon Bedrock. Every model call goes through one gateway
that caps spending. When this phase is done:

- opening an unwritten section of the sample manual has Claude Haiku 4.5 write it live,
  streaming into the reader the way the fake writer does now;
- a written section survives a reload and is never written twice;
- `npm run usage` shows today's and this month's spend, by model and by job;
- when the budget is used up, the reader says so instead of failing silently.

Out of scope: creating new manuals (the model writing the table of contents), the agent using real
tools, the model bake-off, the passphrase, and deploying to Lambda and DynamoDB. The design must
make each of those a straightforward later step.

### Rules for this phase

- **AWS credentials come only from `.env.local`.** There are profiles in `~/.aws/config`, and
  they **must never be used**. Code passes the keys from `.env.local` to the client explicitly
  and never falls back to the default credential chain, `AWS_PROFILE`, `~/.aws/config` or
  `~/.aws/credentials`. If the keys are missing, it refuses to start. Never read, print, copy or
  edit `.env.local`: code may load it at runtime, and checks may only confirm which variable
  names are set.
- **Real Bedrock calls happen only in BE.5 and BE.6, and only through the gateway.** Every other
  task, and every test, uses the fake writer or a fake model client.
- **What works on Bedrock today** (us-west-2): `us.anthropic.claude-haiku-4-5-20251001-v1:0` and
  `global.anthropic.claude-haiku-4-5-20251001-v1:0` through `bedrock-runtime`. The newer Claude
  models are refused for this account until AWS grants access, so the model ID must be
  configuration.
  - In `@anthropic-ai/bedrock-sdk`, use the `AnthropicBedrock` client with `awsRegion`,
    `awsAccessKey` and `awsSecretKey`; it ignores `awsSecretAccessKey`.
  - `research/bedrock-models.md` covers pricing, request rules and pitfalls.
- **Spending caps:** $2 a day and $20 a month, as configuration.

### BE.1 — Architecture
- **Status:** done
- **Depends on:** —
- **Files:** `ARCHITECTURE.md`
- **Do:** write the plan for this phase, short and concrete, for the user to approve before any
  code is written:
  - The server: where it lives, its layout, how `npm run dev` runs it alongside Vite (requests
    to `/api` go to the server), and how plain handlers can be wrapped for Lambda later. Prefer
    Node's built-in HTTP and the packages already in the repo, and justify anything new.
  - The API: routes, request and response shapes, and streaming a section over server-sent
    events. That includes joining a section that's already being written, and the errors the
    reader shows ("budget reached", "couldn't write this section").
  - Storage: a narrow interface for manuals, sections and the usage ledger. Locally it's files in
    a gitignored folder; later it's DynamoDB. Say what the DynamoDB version of each piece would
    be.
  - The section writer: one interface with a fake and a Bedrock version, chosen by
    configuration. One writer runs per section at a time.
  - The model gateway: the only code that imports the Bedrock SDK.
    - Daily and monthly dollar caps, enforced by reserving the worst case (input plus
      `max_tokens` at the model's price) before each call and settling to the real usage after.
    - A `max_tokens` limit for each job; a dated price table, refusing models not in it; a limit
      on calls running at once; a kill switch.
    - A durable ledger. When the reader disconnects mid-stream, the call stops and the tokens
      already generated are still recorded.
    - How a test keeps every other module from importing the SDK.
  - Configuration: which settings are secret (only the credentials and region, in `.env.local`)
    and which are committed (model IDs, caps, per-job limits, prices).
  - How the reader's store in `src/manual/` changes to read from the API, and what moves out of
    the browser.
  - What stays the same: the reader's streaming rules in `DESIGN.md`, and the landing page,
    which keeps its seed library and canned agent this phase.
- **Done when:** the orchestrator's review passes, and then **the user approves it**. After the
  review, mark it `needs-human` and ask the user. It becomes `done` only on the user's approval.

### BE.2 — Server, storage and the fake writer
- **Status:** done
- **Depends on:** BE.1
- **Files:** the server folder named in `ARCHITECTURE.md`, `package.json`, `package-lock.json`,
  `vite.config.ts`, `tsconfig*.json`, `.gitignore`, `.claude/launch.json`
- **Do:** build the server, the storage interface and its file version, the section API with
  server-sent events, and the fake writer. The fake writer has the same pacing and failure
  behaviour as today's browser streamer (1.2s delay, then about 20 characters every 85ms). Seed
  storage with the sample manual. Keep one writer per section; a second request joins the
  stream. `npm run dev` starts everything.
- **Done when:**
  - `npm run build` and `npm test` pass, and the new tests cover storage, the API, joining a
    stream, and a disconnect mid-stream;
  - with `npm run dev`, `curl` streams a section over the API, and a written section is still
    there after a server restart.

### BE.3 — The model gateway
- **Status:** doing (agent: a5459e35a19d1c4e9)
- **Depends on:** BE.2
- **Files:** the gateway folder named in `ARCHITECTURE.md`, its tests, the `usage` script,
  `server/config.ts` (caps and per-job limits), `package.json`, `package-lock.json`
- **Do:** build the gateway as `ARCHITECTURE.md` describes, with a fake model client for the
  tests. Also:
  - `npm run usage`: today's and this month's spend, by model and by job;
  - a test that fails if any file other than the gateway imports the Bedrock SDK;
  - the credentials rule above, with a test that the client never uses a profile or the default
    chain.
- **Done when:**
  - `npm run build` and `npm test` pass;
  - tests cover the caps (including a call refused because its worst case would cross a cap),
    settling a reservation, refusing a model not in the price table, the limit on calls running
    at once, the kill switch, and recording a stream aborted partway;
  - `npm run usage` works on an empty ledger and on a test one.

### BE.4 — The reader reads from the server
- **Status:** doing (agent: a1398fd4693fd8c57)
- **Depends on:** BE.2
- **Files:** `src/manual/**`, `src/reader/**`, `DESIGN.md`, `scripts/**`, `src/library/seed.ts`,
  `src/library/store.test.tsx`, `src/library/README.md`
- **Do:**
  - The reader gets the manual and its sections from the API and streams unwritten sections from
    it. Remove the browser-side fake streamer and anything else the server now owns.
  - Keep `?freeze` (or its equivalent) for the screenshots.
  - Design the two new section states, "budget reached" and "couldn't write this section", within
    the existing design and rules. Add them to `DESIGN.md` and to the screenshot states.
- **Done when:**
  - `npm run build`, `npm test` and `npm run shot` pass;
  - the existing reader shots are unchanged, and the new states are captured at every width;
  - live, a section written in one tab shows as written in another after a reload, and two tabs
    opening the same unwritten section show the same text.

### BE.4b — Dev and test hygiene
- **Status:** todo
- **Depends on:** BE.3, BE.4
- **Files:** `server/testing.ts`, `server/dev.ts`, `vite.config.ts`, `tsconfig*.json`,
  `src/manual/repair.test.tsx` (its Node types reference only), `package.json` (scripts only)
- **Do:**
  - Server tests clean up the temporary data folders they create. Remove the `rtfm-test-*`
    folders earlier test runs left in `$TMPDIR`.
  - When the API server stops or restarts mid-section during `npm run dev` (for example a
    `node --watch` restart), the browser's stream ends with an error instead of hanging on
    "Being written".
  - Tests that need Node (`node:fs` on the seed) type-check under their own tsconfig, so Node's
    globals don't leak into the app's type-check. Remove the `/// <reference types="node" />`.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; a test run leaves no
  `rtfm-test-*` folders behind; live, restarting the server mid-section shows "couldn't write
  this section" in the open tab.

### BE.5 — Claude writes the sections
- **Status:** todo
- **Depends on:** BE.3, BE.4
- **Files:** the section writer's folder named in `ARCHITECTURE.md`, its prompt files and tests,
  committed configuration, `server/app.ts` (wiring the Bedrock writer, the gateway and the
  credentials)
- **Do:**
  - Build the Bedrock section writer on the gateway.
  - The prompt carries the manual's voice brief, its table of contents, and summaries of
    nearby sections, and asks for exactly the markdown `DESIGN.md` › Markdown allows.
  - Validate the output where it's cheap: footnote references have definitions, `section:` links
    point at real sections, and there is no H1 and no preamble.
  - Configuration chooses the writer; the fake stays the default for tests and screenshots.
  - Keep real calls few and short while you iterate.
- **Done when:**
  - `npm run build` and `npm test` pass (the tests use a fake model client);
  - live with the Bedrock writer: opening an unwritten section has Haiku 4.5 write it streaming,
    following the streaming rules, and it is still there after a reload;
  - the ledger and `npm run usage` show each call's real cost;
  - the report gives the cost per section and samples of the writing, and this task's real
    calls cost under $0.50 in total.

### BE.6 — Final check
- **Status:** todo
- **Depends on:** BE.4b, BE.5
- **Files:** anything, for small fixes and docs: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`,
  `DESIGN.md` and the folder READMEs
- **Do:**
  - Run `npm run build`, `npm test` and `npm run shot`.
  - Live at 1440 and 375:
    - Claude writes a section;
    - a second tab joins the same section;
    - close the tab mid-section and confirm the ledger records it;
    - a tiny cap set through configuration gives "budget reached";
    - the kill switch stops calls.
  - Update the docs: `CLAUDE.md` no longer says there's no back-end; the README covers running
    the server, configuration and `npm run usage`; `ARCHITECTURE.md` matches the code.
  - Read the repo as a newcomer would.
- **Done when:** all commands pass, every live check behaves as described, the docs match the
  code, and the report gives the phase's total Bedrock spend from the ledger.
