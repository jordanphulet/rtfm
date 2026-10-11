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


## A real librarian

The librarian stops giving canned replies. It works through the library with real tools, and
can create a new manual when you ask for one. It runs on an agent loop that sends every model
call through the existing gateway. Alongside that, three small fixes, and research into hosting
on AWS. When this phase is done:

- the reader has a way back to the library;
- the fake writer never saves placeholder text as a written section;
- the librarian lists, finds, opens and deletes manuals by being asked. A delete still waits for
  your confirmation in the existing dialog;
- asking the librarian for a new manual has Claude plan its title, voice and table of contents,
  and the manual appears in the library, ready to read;
- `research/` has a recommendation on Claude Platform on AWS and the AgentCore harness.

Out of scope: web access for any model, the passphrase, and deploying.

### Rules for this phase

- **AWS credentials come only from `.env.local`.** There are profiles in `~/.aws/config`, and
  they **must never be used**. Never read, print, copy or edit `.env.local`.
- **Every model call goes through the gateway**, including each turn of the agent loop. There
  are no new spending limits: the gateway's caps cover agent runs too.
- **Real Bedrock calls happen only in RL.6, RL.7 and RL.9**, each under $0.10. Every other task
  and every test uses fake model clients. The model is Claude Haiku 4.5, as configuration.
- **`.data/` holds the real usage ledger** and the user's manuals. Never delete or edit the
  ledger.
  - Live checks with Bedrock run on `.data/`, so the ledger records what they cost.
  - On `.data/`, delete only manuals the check itself created. Deleting other manuals is
    checked on a temporary data folder with a fake model.

### RL.1 — A way back to the library
- **Status:** todo
- **Depends on:** —
- **Files:** `src/reader/**`, `DESIGN.md`, `scripts/**`
- **Do:** add a "Library" link to the reader, leading to `/`: above the manual's title at the top
  of the table of contents, and in the compact header bar below 1024px. Design it within the
  reader's existing rules and tokens, and add it to `DESIGN.md`.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; the reader shots differ
  only by the new link, and the changes are reviewed; live at 1440 and 375, the link goes back to
  the library from the start page and from a section.

### RL.2 — The fake writer saves no placeholders
- **Status:** todo
- **Depends on:** —
- **Files:** `server/writer/**` except `server/writer/bedrock.ts` and its prompt files,
  `README.md`, `ARCHITECTURE.md`
- **Do:** a section that has no sample text still streams the fake writer's placeholder, so the
  reader can be exercised, but nothing is stored: after a reload the section is unwritten again,
  and the library's count doesn't change. Sections with sample text are stored as before.
- **Done when:** `npm run build` and `npm test` pass, with tests for both cases; the README and
  ARCHITECTURE.md describe it.

### RL.3 — The delete confirmation's hidden title
- **Status:** todo
- **Depends on:** —
- **Files:** `src/home/DeleteConfirmation.tsx` and its test
- **Do:** before a manual is chosen, the closed confirmation carries the hidden text
  `Delete "undefined"?`. Render no title until there is a manual.
- **Done when:** `npm test` and `npm run shot` pass, a test covers it, and the home shots are
  unchanged.

### RL.4 — Harness prototypes
- **Status:** todo
- **Depends on:** —
- **Files:** `prototypes/harness/**` (new), `package.json` and `package-lock.json` (the Strands
  dependency only)
- **Do:** build two small prototypes of an agent loop, each with one tool (list the manuals in
  a temporary data folder) and each calling the model through the gateway with a fake model
  client, so nothing costs money:
  - **our own loop** on the gateway;
  - **Strands Agents** (TypeScript SDK) with a custom model provider that calls the gateway.
  Write `prototypes/harness/COMPARISON.md`: code size, readability, how cleanly the gateway fits
  (reservation per call, the worst-case bound with tools, aborts, the ledger), what Strands pulls
  into `node_modules` (including any AWS SDK and its credential chain), streaming status to the
  page, testing with a fake model, and how each would move to the AgentCore harness later. End
  with a recommendation.
- **Done when:** both prototypes run their one tool through the gateway in a test or a script,
  `npm run build` and `npm test` still pass, and the comparison is written. Then mark this task
  `needs-human`: the user chooses. It becomes `done` on the user's choice.

### RL.5 — The agent loop
- **Status:** todo
- **Depends on:** RL.4 and the user's choice
- **Files:** `server/agent/**` (new), `server/gateway/**`, `server/config.ts`, `package.json`,
  `package-lock.json`, `ARCHITECTURE.md`, `prototypes/**` (to delete it)
- **Do:**
  - Build the chosen harness on the gateway: tool definitions and tool results go through it,
    and the worst-case input bound counts the tool definitions and the whole conversation.
  - Tools are defined with a schema and their input is checked before they run.
  - The loop reports status as it goes (for example "Looking through the library…"), for the
    page to show.
  - A fake model client scripts tool calls for tests.
  - Delete `prototypes/` and anything only the losing prototype needed. Document the loop in
    ARCHITECTURE.md.
- **Done when:** `npm run build` and `npm test` pass; tests cover a multi-turn run with tool
  calls, a tool given bad input, a refusal from the gateway's caps in the middle of a run, and
  an abort.

### RL.6 — The librarian with real tools
- **Status:** todo
- **Depends on:** RL.5
- **Files:** `server/agent/**`, `server/api/**`, `server/app.ts`, `server/config.ts`,
  `src/agent/**`, `src/home/**`, `DESIGN.md`, `scripts/**`, `ARCHITECTURE.md`
- **Do:**
  - Replace the canned replies with the librarian agent. Its tools: list the manuals, find
    manuals by topic, open a manual (the page navigates to it), delete a manual, and create a
    manual (built in RL.7; until then it says it can't yet).
  - **Delete waits for the user:** the tool only proposes the delete; the page opens the
    existing confirmation dialog, and only the user's confirmation deletes.
  - The conversation stays in the browser and is sent to the server with each message. Replies
    stream into the conversation as today, with the loop's status shown while it works, within
    the existing design.
  - Keep `?conversation=demo` and the screenshot states working with a scripted fake model, so
    shots stay deterministic and free.
  - Remove the canned-reply code and anything only it used.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; the home shots differ only
  where the design changed, and the changes are reviewed; live with Haiku 4.5, the librarian
  lists, finds, opens and proposes a delete that the dialog then confirms or cancels; this task's
  real spend is under $0.10.

### RL.7 — Creating a manual through the librarian
- **Status:** todo
- **Depends on:** RL.6
- **Files:** `server/agent/**`, `server/api/**`, `server/storage/**`, `server/app.ts`,
  `server/config.ts`, `src/agent/**`, `src/home/**`, `src/library/**`, `DESIGN.md`, `scripts/**`,
  `ARCHITECTURE.md`
- **Do:**
  - The librarian's create tool hands the user's request to a planner: Claude writes the
    manual's title, subtitle, voice and table of contents (chapters, appendices, a summary for
    each section) and saves them through a tool, in the seed manuals' format.
  - Check the plan (unique slug ids, labels, counts, every section summarised) and allow one
    retry; a plan that still fails is not saved and the librarian says so.
  - The conversation shows progress while the manual is planned. When it's saved, the library
    shows it, and the librarian offers to open it.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; tests cover a good plan, a
  bad plan with a successful retry, and a plan that fails twice; live with Haiku 4.5, asking
  for a new manual creates it, it appears in the library, and a
  section of it can be written; this task's real spend is under $0.10.

### RL.8 — Research: Claude Platform on AWS and the AgentCore harness
- **Status:** todo
- **Depends on:** —
- **Files:** `research/aws-hosting.md` (new)
- **Do:** research from official documentation, with dates, and make no AWS changes or calls:
  - **Claude Platform on AWS:** whether it offers web search and web fetch, access to the newer
    Claude models (and whether it avoids this account's Bedrock block), pricing against Bedrock,
    setup (Marketplace, API keys, IAM), how our gateway and `bedrock-client.ts` would change, and
    any limits.
  - **The AgentCore harness:** whether it can hand tool calls back to our own code or needs
    tools hosted in AWS, how cost limits work, pricing, IAM, local development, and how it would
    fit the move to Lambda.
  - A recommendation for each, and exactly what the user would need to enable or change.
- **Done when:** the write-up exists, cites its sources, and ends with the recommendations and
  the user's steps.

### RL.9 — Final check
- **Status:** todo
- **Depends on:** RL.1, RL.2, RL.3, RL.7, RL.8
- **Files:** anything, for small fixes and docs: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`,
  `DESIGN.md` and the folder READMEs
- **Do:**
  - Run `npm run build`, `npm test` and `npm run shot`, and look at the screenshots.
  - Live at 1440 and 375 with Haiku 4.5: talk to the librarian (list, find, open, and a delete
    you cancel in the dialog), create a manual, read a section of it, delete that manual through
    the librarian and the dialog, and go back to the library from the reader.
  - Update the docs so they match the code; read the repo as a newcomer would.
- **Done when:** all commands pass, every live check behaves as described, the docs match the
  code, and the report gives this phase's Bedrock spend from the ledger.
