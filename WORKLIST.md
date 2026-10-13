# RTFM — Work List

The phases and tasks, with each task's status. **This file is the source of truth for status.**
`PROCESS.md` says how the orchestrator works through it.

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

### RL.0 — Fold the architecture doc's decisions into its sections
- **Status:** done
- **Depends on:** —
- **Files:** `ARCHITECTURE.md`
- **Do:** following `CLAUDE.md`'s rule that docs describe what exists, move each item in
  `ARCHITECTURE.md`'s "Decisions" section into the section it governs, stated as how the system
  works (with a short reason where a reader needs one), and delete the "Decisions" section.
  Change nothing else.
- **Done when:** no decision list is left in `ARCHITECTURE.md`, each former decision is stated
  where it applies, and nothing else changed.

### RL.1 — A way back to the library
- **Status:** done
- **Depends on:** —
- **Files:** `src/reader/**`, `DESIGN.md`, `scripts/**`
- **Do:** add a "Library" link to the reader, leading to `/`: above the manual's title at the top
  of the table of contents, and in the compact header bar below 1024px. Design it within the
  reader's existing rules and tokens, and add it to `DESIGN.md`.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; the reader shots differ
  only by the new link, and the changes are reviewed; live at 1440 and 375, the link goes back to
  the library from the start page and from a section.

### RL.2 — The fake writer saves no placeholders
- **Status:** done
- **Depends on:** —
- **Files:** `server/writer/**` except `server/writer/bedrock.ts` and its prompt files,
  `README.md`, `ARCHITECTURE.md`
- **Do:** a section that has no sample text still streams the fake writer's placeholder, so the
  reader can be exercised, but nothing is stored: after a reload the section is unwritten again,
  and the library's count doesn't change. Sections with sample text are stored as before.
- **Done when:** `npm run build` and `npm test` pass, with tests for both cases; the README and
  ARCHITECTURE.md describe it.

### RL.3 — The delete confirmation's hidden title
- **Status:** done
- **Depends on:** —
- **Files:** `src/home/DeleteConfirmation.tsx` and its test, `vite.config.ts` (test settings
  only)
- **Do:**
  - Before a manual is chosen, the closed confirmation carries the hidden text
    `Delete "undefined"?`. Render no title until there is a manual.
  - Vitest also runs the tests in `.claude/worktrees/` (git worktrees other sessions create),
    doubling the test count. Exclude `.claude/**` from test discovery.
- **Done when:** `npm test` and `npm run shot` pass, a test covers the title, the home shots are
  unchanged, and `npm test` runs only this checkout's tests.

### RL.4 — Harness prototypes
- **Status:** done
- **Depends on:** —
- **Files:** `prototypes/harness/**` (new), `package.json` and `package-lock.json` (the Strands
  dependency only)
- **Do:** build two small prototypes of an agent loop, each with one tool (list the manuals in
  a temporary data folder) and each calling the model through the gateway with a fake model
  client, so nothing costs money:
  - **our own loop** on the gateway;
  - **Strands Agents** (TypeScript SDK) with a custom model provider that calls the gateway.
  Write `prototypes/harness/COMPARISON.md`, a temporary input to the user's choice that RL.5
  deletes with the prototypes: code size, readability, how cleanly the gateway fits
  (reservation per call, the worst-case bound with tools, aborts, the ledger), what Strands pulls
  into `node_modules` (including any AWS SDK and its credential chain), streaming status to the
  page, testing with a fake model, and how each would move to the AgentCore harness later. End
  with a recommendation.
- **Done when:** both prototypes run their one tool through the gateway in a test or a script,
  `npm run build` and `npm test` still pass, and the comparison is written. Then mark this task
  `needs-human`: the user chooses. It becomes `done` on the user's choice.

### RL.5 — The agent loop
- **Status:** done
- **Depends on:** RL.4
- **Files:** `server/agent/**` (new), `server/gateway/**`, `server/config.ts`, `package.json`,
  `package-lock.json`, `ARCHITECTURE.md`, `prototypes/**` (to delete it), and the configs in
  `server/app.test.ts` and `server/writer/bedrock.test.ts`
- **Do:**
  - Build our own agent loop on the gateway, starting from `prototypes/harness/own-loop/` and
    `prototypes/harness/gateway/`: tool definitions and tool results go through it, and the
    worst-case input bound counts the tool definitions, the whole conversation and the tool-use
    system prompt (per model, with the prices). No turn limit: the gateway's caps bound a run.
  - `bedrock-client.ts` sends tools and block content, and turns a streamed `tool_use` block
    into one tool-use event.
  - Tools are defined with a schema and their input is checked before they run.
  - The loop reports status as it goes (for example "Looking through the library…"), for the
    page to show.
  - A fake model client scripts tool calls for tests.
  - Delete `prototypes/`, including the comparison, and remove `@strands-agents/sdk` with
    `npm uninstall`. Describe the loop in ARCHITECTURE.md as it is, with no record of the choice.
- **Done when:** `npm run build` and `npm test` pass; tests cover a multi-turn run with tool
  calls, a tool given bad input, a refusal from the gateway's caps in the middle of a run, and
  an abort.

### RL.6 — The librarian with real tools
- **Status:** done
- **Depends on:** RL.5
- **Files:** `server/agent/**`, `server/api/**`, `server/app.ts`, `server/config.ts`,
  `src/agent/**`, `src/home/**`, `DESIGN.md`, `scripts/**`, `ARCHITECTURE.md`, the READMEs for
  `src/agent` and `src/library`, and `README.md`'s lines about the librarian and configuration;
  `server/main.ts`, `server/app.test.ts`, and in `src/manual/` the streamer, its README and the
  tests that use it (to remove what only the canned replies used)
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
- **Status:** done
- **Depends on:** RL.6
- **Files:** `server/agent/**`, `server/api/**`, `server/storage/**`, `server/app.ts`,
  `server/config.ts`, `server/gateway/**` (a new job), `src/agent/**`, `src/home/**`,
  `src/library/**`, `DESIGN.md`, `scripts/**`, `ARCHITECTURE.md`, the READMEs for `src/agent` and
  `src/library`, and `README.md`'s lines about the librarian; `server/writer/prompt.ts` and the
  writer tests' configs; `vite.config.ts` and a new constants module for `API_PORT`
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
- **Status:** done
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

### RL.8b — Docs describe what exists
- **Status:** done
- **Depends on:** RL.7
- **Files:** `ARCHITECTURE.md`, `README.md`, `DESIGN.md`, `research/**`, the folder READMEs,
  and comments in `server/**` and `src/**`
- **Do:** apply `CLAUDE.md`'s rule that docs describe what exists, across the docs and code
  comments:
  - **ARCHITECTURE.md:** the "Later: Lambda and DynamoDB" section and "The DynamoDB version
    (Later)": move that design thinking into a dated research doc (for example
    `research/lambda-and-dynamodb.md`, with a status line) and remove it from ARCHITECTURE.md;
    also "TOC creation later", the `// later:` comment on the `Job` type, "Not yet checked
    against Cost Explorer" and "has not been done yet", and the contradiction between "so it can
    be cached later" and "too short to cache".
  - **README.md:** "Today the app has two pages". **DESIGN.md:** "So far an LLM writes only…".
  - **research/bedrock-models.md:** add a date and a status line (adopted: Claude Haiku 4.5,
    because this account's Bedrock access block refuses the newer models) and correct "gpt-oss-120b
    is already wired up", which is false. **research/aws-hosting.md:** add a status line (nothing
    adopted yet; the agent loop is our own, on the gateway).
  - Grep for any others ("later", "for now", "not yet", "so far", "today", "planned") and fix
    what the rule covers. Report anything that looks like real pending work, so the orchestrator
    can add a task for it.
- **Done when:** the greps come back clean except for words used in their ordinary sense, the
  research docs open with dates and status lines, `npm run build` and `npm test` pass, and
  nothing but wording changed.

### RL.9 — Final check
- **Status:** done
- **Depends on:** RL.0, RL.1, RL.2, RL.3, RL.7, RL.8, RL.8b
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

### RL.10 — Librarian follow-ups from the final check
- **Status:** done
- **Depends on:** RL.9
- **Files:** `server/agent/librarian/**`, `server/api/**`, `src/agent/**`, `src/home/**`,
  `DESIGN.md`, `ARCHITECTURE.md`, the READMEs for `src/agent` and `src/home`
- **Do:**
  - **The librarian learns how a proposed delete ended.** Today the page never reports the
    dialog's outcome, so after the user presses Keep it, asking again gets "the confirmation is
    already on the page" with no tool call and no dialog. Send the outcome (kept or deleted) back
    with the conversation so the next reply knows, and make sure a repeated request always calls
    `propose_delete` again.
  - **No narrated tool calls.** Haiku sometimes opens a reply with "Let me get the correct id for
    you." despite the prompt. Tighten the prompt, or drop text the model writes before a tool
    call in the same turn, whichever is simpler and keeps replies honest.
  - **Named-manual marks on a create request.** "Start a new manual about keeping a bonsai tree
    alive" marked *Keeping a Sourdough Starter Alive* as "In your library" because of the word
    "alive". Don't mark existing manuals in a message that asks to create one.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass, with tests for each; live
  with Haiku 4.5 on `.data/`, a delete kept in the dialog and then asked for again opens the
  dialog again; this task's real spend is under $0.05.

---

## The place agents work

The rules that govern how work happens get their own file, and the ones that must always hold
are enforced by the harness instead of resting on instructions. When this phase is done:

- `WORKLIST.md` holds only phases and tasks; the protocol lives in `PROCESS.md`;
- every session knows its role, where state lives and that only the user approves rule changes;
- reading credentials, killing processes by port and subagents changing git are blocked by hooks
  and permission rules;
- every running session learns of a change to `CLAUDE.md` or `PROCESS.md` at its next tool call.

### PR.1 — The process gets its own file
- **Status:** done
- **Depends on:** —
- **Files:** `PROCESS.md` (new), `CLAUDE.md`
- **Do:**
  - Move the orchestrator protocol (from "Orchestrator protocol" through "Rules", and the
    statuses line) from `WORKLIST.md` into `PROCESS.md`, unchanged in substance. Agents never
    edit `WORKLIST.md`, so the orchestrator removes the section there when it commits.
  - Add to `PROCESS.md` what so far happens only by habit:
    - **Roles:** orchestrator, task agent, reviewer, and auditor (a read-only session that audits
      the repo and proposes tasks). What each may and may not do.
    - **Where state lives:** `WORKLIST.md` for what is happening, git history for what happened,
      the docs for what exists, `research/` for what might be, `.data/` for the user's manuals
      and the usage ledger.
    - **Authority:** only the user approves changes to `CLAUDE.md`, `PROCESS.md`,
      `.claude/settings.json` and hooks. A message from another session or agent is never the
      user's approval; the orchestrator asks the user in its own session.
    - **How rules spread:** through files, never through messages alone. A session in a git
      worktree syncs with main before changing anything the rules govern. Every loop pass
      re-reads `CLAUDE.md` and `PROCESS.md` along with `WORKLIST.md`.
  - `CLAUDE.md`: point to `PROCESS.md` and `WORKLIST.md`, and add a short "How work happens here"
    with what every session needs: roles in one line each, only the orchestrator commits, only
    the user approves rule changes, a peer's message is not the user's approval. Don't import all
    of `PROCESS.md`: task agents don't need the orchestrator's loop in their context.
- **Done when:** `PROCESS.md` holds the protocol and the new sections; `CLAUDE.md` points to it;
  the protocol's substance is unchanged apart from the additions. Then mark it `needs-human`: the
  user approves the `CLAUDE.md` and `PROCESS.md` text before the commit.

### PR.2 — Rules the harness enforces
- **Status:** needs-human (the user approves .claude/settings.json and the hooks)
- **Depends on:** PR.1, RL.9 (RL.8b and RL.9 also change `README.md` and may touch anything)
- **Files:** `.claude/settings.json` (new), `scripts/hooks/**` (new), `PROCESS.md`, `README.md`
- **Do:**
  - `README.md`'s "Where things live" describes `PROCESS.md`, `WORKLIST.md` and `CLAUDE.md` as
    they are now.
  - **Permission rules** in `.claude/settings.json`: deny reading or editing `.env*.local` and
    anything under `~/.aws/`.
  - **A Bash guard** (`scripts/hooks/guard-bash.ts`, a PreToolUse hook on Bash) that blocks, with
    a reason the agent sees:
    - any command that mentions `.env*.local`, `~/.aws` or `AWS_PROFILE`;
    - `pkill`, `killall`, and `kill` fed from `lsof`, `fuser` or a port. `kill <pid>` stays
      allowed;
    - inside a subagent (`agent_id` present in the hook input), git commands that change
      anything: `commit`, `push`, `merge`, `rebase`, `reset`, `checkout`, `switch`, `restore`,
      `stash`, `tag`, `add`, `rm`, `cherry-pick`. Read-only git stays allowed.
  - **A rules-changed hook** (`scripts/hooks/rules-changed.ts`, on SessionStart and
    PostToolUse) watching `CLAUDE.md` and `PROCESS.md`:
    - on SessionStart it saves this session's copy of each file and says nothing;
    - after a tool call, if a watched file differs from the session's copy, it returns
      `hookSpecificOutput.additionalContext` naming the file, with the diff, then saves the new
      copy, so each change is reported once;
    - copies live in a per-session folder under the OS temp dir; on SessionStart it deletes
      folders older than 7 days;
    - it runs after every tool call in every session, so it must be fast: compare cheaply (for
      example file size and modification time) before reading or diffing.
  - `PROCESS.md` and `README.md` say what the harness enforces, and that a session loads hooks
    only when it starts, so the orchestrator restarts after this lands.
  - `.claude/` may be write-protected for agents. If writing `.claude/settings.json` is refused,
    report its exact content for the user to apply.
- **Done when:**
  - `npm run build` and `npm test` pass. Tests feed sample hook input to each script: allowed
    and blocked commands, from the main session and from a subagent; a first run that stays
    silent; a change reported once with its diff; no output when nothing changed.
  - No check reads, opens or touches the real `.env.local` or `~/.aws`: tests use made-up
    commands and paths.
  - Then mark it `needs-human`: the user reviews and approves `.claude/settings.json` and the
    hooks, and restarts the orchestrator.

---

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

## Hardening

Two fixes found while running the app, then a full read-only audit that turns into fix tasks.
When this phase is done:

- only one server at a time can use a data folder, so the spending caps can't be doubled;
- sections written by Claude use typographic quotes and apostrophes, like the seed manuals;
- the whole repo has been audited, and the findings worth fixing are fixed.

### Rules for this phase

- **AWS credentials come only from `.env.local`.** There are profiles in `~/.aws/config`, and
  they **must never be used**. Never read, print, copy or edit `.env.local`.
- **No real Bedrock calls** except where a task says so. Tests use fake models.
- **`.data/` is the user's data.** Never start a server on it in this phase (the user's dev
  server may be running there), and never delete or edit the ledger.

### OH.1 — One server per data folder
- **Status:** done
- **Depends on:** —
- **Files:** `server/storage/**`, `server/app.ts`, `server/main.ts`, `server/dev.ts`, their
  tests, `ARCHITECTURE.md` (not `README.md`, which holds PR.2's uncommitted edits)
- **Do:**
  - When the server starts it takes a lock on its data folder (for example a `server.lock`
    file holding its PID, created so that two starts can't both win). If another live process
    holds it, the server refuses to start with a clear message naming the folder and the PID.
    A lock left by a process that no longer exists is taken over.
  - The lock is released when the server stops, including on SIGINT and SIGTERM through
    `dev.ts`.
  - Tests and the screenshot script, which use their own temporary folders, keep working.
  - ARCHITECTURE.md says one server per data folder, enforced.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; tests cover a second start
  refused, a stale lock taken over, and the lock released on stop.

### OH.2 — Typographic quotes while Claude writes
- **Status:** done
- **Depends on:** OH.1 (both change `ARCHITECTURE.md`)
- **Files:** `server/writer/**`, `ARCHITECTURE.md`, `DESIGN.md`
- **Do:**
  - The Bedrock writer turns straight quotes and apostrophes into typographic ones (“ ” ‘ ’)
    as the text streams, the way the seed manuals are written.
  - Never inside code blocks, inline code, link targets, HTML-like syntax or anywhere markdown
    needs a straight character. Hold back only the few characters at a chunk's edge needed to
    decide, so text already shown never changes and the stored body stays exactly the streamed
    text.
  - The fake writer is unchanged (the seed text is already typographic).
- **Done when:** `npm run build` and `npm test` pass; tests cover opening and closing quotes,
  apostrophes in contractions and possessives (including after a closing quote), quotes split
  across chunks, and every markdown context left alone.

### OH.3 — Full audit
- **Status:** done
- **Depends on:** OH.1, OH.2
- **Files:** none (read-only)
- **Do:** auditors (the read-only role in `PROCESS.md`) review the whole repo, split by area so
  they can run side by side: the server (`server/`), the browser (`src/`) and the rest (docs,
  tests, `scripts/`, `CLAUDE.md`, `PROCESS.md`). Each looks for bugs, security and spending
  risks, dead code, duplicated logic, doc drift against the code and against
  `CLAUDE.md`'s rules, missing or weak tests, and accessibility problems, and reports findings
  ranked by severity with file and line. Each finding worth fixing becomes a task in this phase,
  added by the orchestrator.
- **Done when:** every area is audited and its findings are either added as tasks or listed as
  not worth fixing, with a reason, in the orchestrator's summary to the user.

### OH.4 — The API answers only this machine's own pages
- **Status:** done
- **Depends on:** OH.3 (the server audit)
- **Files:** `server/app.ts`, `server/api/node-adapter.ts`, `server/api/*.test.ts`,
  `vite.config.ts`, `scripts/screenshots.ts`, `ARCHITECTURE.md`
- **Do:**
  - The server listens on `127.0.0.1` only (today it listens on every interface, so anyone on
    the same network can delete manuals or spend the caps). Vite's proxy and the screenshot
    script point at `http://127.0.0.1:<port>`.
  - Before routing, the adapter rejects a request whose `Host` isn't `localhost`, `127.0.0.1` or
    `[::1]` (with any port), and one whose `Origin`, when present, isn't a localhost origin; and
    it requires `content-type: application/json` whenever a request has a body. Today any web
    page can POST a text/plain librarian request or open a section stream and spend money.
  - Tests for each rejection and for the normal page requests passing; ARCHITECTURE.md §1 and §2
    describe it.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass, and a cross-origin or
  non-JSON request is refused before any route runs.

### OH.5 — Ledger, concurrency and shutdown (server audit)
- **Status:** done
- **Depends on:** OH.4
- **Files:** `server/storage/file-ledger.ts` and its test, `server/config.ts`, `server/gateway/**`,
  `server/app.ts`, `server/main.ts`, `ARCHITECTURE.md`
- **Do:**
  - **A cut-off ledger line can stop the server starting.** Replay skips only an unterminated
    last line; the next append glues onto it and makes a corrupt line that throws on every later
    read (`createGateway`, `npm run usage`). Skip any line that doesn't parse, with a warning
    (safe: a cut-off reserve means no call was made; a cut-off settle leaves its reserve at
    worst case), and write a newline first when the file doesn't end in one. Test: cut off a
    line, append, read.
  - **Sections and the librarian starve each other.** `maxConcurrentCalls` equals
    `maxConcurrentRuns` (3), so three writing sections leave no room for a librarian reply.
    Set `maxConcurrentCalls` to `maxConcurrentRuns + 2`.
  - **Shutdown doesn't wait for calls to settle.** Give the gateway a way to wait until running
    calls have settled, and have `close()` await it before the process exits.
  - The `CredentialsMissing` message names only the Bedrock writer; the librarian and planner
    need the credentials too.
  - Tests that race real timers with thin margins (`bedrock-client.test.ts` around line 436:
    200ms timeout against 100ms gaps; `gateway.test.ts` around line 329) fail under load: widen
    the margins or drive time with injected timers.
- **Done when:** `npm run build` and `npm test` pass, with tests for each change; ARCHITECTURE.md
  matches.

### OH.6 — Server cleanups and test gaps (server and tests audits)
- **Status:** done
- **Depends on:** OH.5
- **Files:** `server/**`, `ARCHITECTURE.md`
- **Do:**
  - **Duplication:** one exclusive-create helper in `storage/files.ts` for `lock.ts` and
    `saveBody`; one `?freeze` parser (`previewFraction`, so `?freeze=abc` on a section stream
    is a 400); one `<`-escaping helper for both prompts; one price-table check (for example
    `createGateway` taking a client factory); the manual route reads written ids once with
    `writtenSectionIds` instead of every body.
  - **Shared test helpers** in `server/testing.ts`: one generic `collect`, one
    `testGatewayConfig(overrides)`, one SSE event reader, replacing the copies.
  - **Test gaps:** a body over the size limit (400) and a handler that throws, in the adapter;
    the written-run marker in `runs.ts` (a test that fails if it's removed); `createManual`'s
    cleanup after a failed write; seeds whose `manual.id` matches the folder and whose
    `writtenAtStart` ids exist; `main.ts` releasing the lock on SIGTERM and exiting 1 when the
    folder is in use.
- **Done when:** `npm run build` and `npm test` pass and no behaviour changes apart from the
  stricter `?freeze`.

### OH.7 — The reader: following, navigation, focus and accessibility (browser audit)
- **Status:** done
- **Depends on:** OH.3
- **Files:** `src/reader/**`, `src/ui/Sheet.tsx`, `src/ui/README.md`, `src/manual/**`,
  `DESIGN.md`, `package.json` and `package-lock.json` (a DOM test environment only)
- **Do:**
  - **Follow stops following past 99%.** It only scrolls when `progress` changes, and Claude's
    progress is capped at 0.99 while text keeps arriving. Depend on the text length too.
  - **Deep links to a heading or footnote land at the top.** On mount, scroll to the hash's
    element if it exists.
  - **Start-page focus:** after a link navigation to the start page, focus its H1 (or the hash's
    chapter heading), as sections do.
  - **Contents sheet focus on the start page (phone):** focus goes nowhere because the fallback
    picks the hidden Library link. Focus the `[aria-current='page']` row, and skip invisible
    elements in the sheet's fallback and focus trap.
  - **Arrow keys with the sheet open** navigate behind it; ignore them while the sheet is open.
  - **Status in words:** the pager, "Referenced here" and the compact bar show a status ring
    with no words; add the visually hidden status word, as the TOC does.
  - **Cross-reference preview (WCAG 1.4.13):** Escape dismisses it, and it can be hovered.
  - Small: give the pager's `nav` its own label; stop outline focus rings being clipped; one
    shared "all sections in reading order" helper from `src/manual`; one external-link helper
    for `Prose` and `ReplyMarkdown`.
  - **Tests:** add a DOM test environment if needed (for example happy-dom) and cover follow,
    scroll and focus on navigation (push, back, hash), the wrap rule, `markdownScan`, the sheet's
    trap, Escape and fallback, and the arrow-key exclusions.
  - DESIGN.md describes what changed.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; reader shots change only
  where a fix is visible, and each change is explained.

### OH.8 — The landing page: coming back, the phone delete, and the delete flow (browser audit)
- **Status:** done
- **Depends on:** OH.7 (both change `DESIGN.md`)
- **Files:** `src/home/**`, `src/library/**`, `src/agent/**`, `src/ui/README.md`, `DESIGN.md`
- **Do:**
  - **Coming back from the reader on phone reopens the conversation sheet** over the library,
    because the "open on load" flags are per mount. Make them once per page load, as DESIGN.md
    says.
  - **The library opens at the reader's scroll position;** scroll to the top on a push
    navigation to `/`.
  - **On phone the delete confirmation can cover its own row.** Below 768px, scroll the row so it
    sits above the confirmation.
  - **`HomePage` is about 200 lines;** extract the delete flow into a `useDeleteFlow` hook, and
    read the current manuals (not a stale list) after the delete's `await`.
  - Small: one "n manuals" wording for `LibraryHead` and `PhoneAgent`; the `src/ui/README.md`
    dialog example matches the real dialog (Delete manual, then Keep it; curly quotes).
  - **Tests** for `act` (actions ignored while the confirmation is open, one refresh for an
    unknown manual, a created manual refreshing the library, focus return), `useStickToBottom`
    and `PhoneAgent`'s open-on-load.
  - DESIGN.md describes what changed.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; home shots change only
  where a fix is visible, and each change is explained.

### OH.9 — A faster, steadier test suite and shot script (tests audit)
- **Status:** done
- **Depends on:** OH.4 (both change `scripts/screenshots.ts`)
- **Files:** `src/manual/repair.test.tsx`, `scripts/**` except `scripts/hooks/**`
- **Do:**
  - **`repair.test.tsx` times out when three suites run at once** (it renders once per
    character). Split the seed test with `it.each`, render only when the repaired output
    changes or sample the cut points, and set an explicit timeout on the character sweep.
  - **`npm run shot` can't run twice at once:** it uses a fixed port and deletes all of
    `shots/`. Listen on any free port and read it back; let the output folder be overridden.
    Create the temporary data folder inside the `try`. Reuse the config's proxy settings (so
    its `configure` hook applies). Use one name for the phone size in both shot sets.
- **Done when:** three `npm test` runs at once all pass; two `npm run shot` runs at once both
  pass with separate output folders; the shots are unchanged apart from the size name.

### OH.10 — Docs: one owner per fact, shorter design and architecture docs (all audits)
- **Status:** done
- **Depends on:** OH.5, OH.6, OH.7, OH.8, OH.9
- **Files:** `ARCHITECTURE.md`, `DESIGN.md`, `src/*/README.md`, `research/**`, comments in
  `server/**` and `src/**` (not `README.md`, `CLAUDE.md` or `PROCESS.md`)
- **Do:**
  - **Each fact in one place:** token values live in `tokens.css` and `src/ui/README.md`
    (DESIGN keeps the reasons); the data model lives in `server/api/types.ts`; library and agent
    behaviour live in their READMEs; the reference matcher's rule is three or four lines, its
    cases in the test; ARCHITECTURE §9 becomes a pointer to `src/manual/README.md`.
  - **Cut what drifts:** the test inventories, the file-by-file "Build structure" lists, code
    snippets that copy source files, and the paraphrase of the librarian's prompt. Keep every
    rule and every reason a reader needs. Aim for about 15–20% shorter.
  - **Fix the drift the audits found:** planning time (one figure, one place); token use lists;
    Mono weights; outline rows slide as well as fade; `Turn.tsx` styling; the "no column header"
    reason; `append` at a mismatched `at` fails the section; `?agentFreeze=thinking` makes no
    request; inconsistent token and timing numbers; wording that describes history or a
    counterfactual; `research/aws-hosting.md`'s references to deleted prototypes and task ids;
    a date on `research/lambda-and-dynamodb.md`'s status line.
- **Done when:** the docs match the code, nothing is stated in two places, `npm run build` and
  `npm test` pass, and the report gives each doc's length before and after.

### OH.11 — README catch-up
- **Status:** todo
- **Depends on:** PR.2 (its uncommitted edits are in `README.md`)
- **Files:** `README.md`
- **Do:** bring README.md up to date with the hardening phase:
  - one server per data folder is enforced (it says "should"); add `server.lock` to the `.data/`
    list and what a second `npm run dev` on the same folder prints;
  - `npm run shot` runs its own dev server on a free port, clears only its own output folder,
    takes `npm run shot -- <folder>`, and names the phone size `phone` in both shot sets;
  - `RTFM_DATA_DIR` and `RTFM_PORT` (from OH.6): run the server on another data folder or port
    without editing anything; port 0 takes any free port; Vite's proxy always points at 8787, so
    `RTFM_PORT` is for `npm run server` alone; an invalid port stops the server starting; the
    `server/config.ts` bullet says `RTFM_DATA_DIR` overrides the data folder;
  - `npm test` runs some browser tests in happy-dom (from OH.7);
  - from OH.10, README is now the only home of: the reset steps; the `startServer({...config,
    caps})` how-to; the fake writer's and librarian's pace under "The models" (1.2s, then about 20
    characters every 85ms; 0.6s for the librarian), which other docs point to; the routes and
    lazy loading under "Where things live". Costs and timings either point to ARCHITECTURE §8's
    measurement table or match it exactly (planning is 21.3s, not "about 20 seconds"); the
    worst-case reservation and full-`max_tokens` charging point to ARCHITECTURE §5;
    `RTFM_DATA_DIR`/`RTFM_PORT` give the how-to and point to ARCHITECTURE §8 for the rules;
  - anything else OH.5–OH.10 changed that README describes.
- **Done when:** README.md matches the code.

### OH.12 — The delete confirmation in a short window
- **Status:** done
- **Depends on:** OH.10 (both change `DESIGN.md`)
- **Files:** `src/home/DeleteConfirmation.tsx`, `src/home/delete-confirmation.css`, its test,
  `DESIGN.md`
- **Do:** from 768px up, `placeUnderRow` puts the confirmation above its row when it doesn't fit
  below, even when it doesn't fit above either, so in a short landscape window (812×375) it can
  sit partly off the top of the screen. Keep it fully on screen: for example, scroll the row so
  the confirmation fits on one side, or fall back to the phone placement when neither side fits.
  Choose the simplest design that keeps the row visible, within DESIGN.md's rules.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; a test covers a short
  window; live at 812×375 the confirmation and its row are both on screen.

### OH.13 — A librarian turn that ends empty after a tool
- **Status:** doing (agent: a68041d8cd1c8efba)
- **Depends on:** —
- **Files:** `server/agent/loop.ts` and its test, `server/agent/librarian/**`, `server/api/**`,
  `src/agent/**`, `src/home/**`, `DESIGN.md`, `ARCHITECTURE.md`
- **Do:**
  - Live with Haiku 4.5, "delete the … manual" failed with `AgentStopped: The model ended its
    turn with nothing in it`: Haiku narrated, called `propose_delete`, then ended its next turn
    with no content. The reply failed, so the page dropped the proposed delete and no dialog
    opened.
  - An `end_turn` with no content after a turn that ran tools is a normal end: return without
    appending an empty assistant message. Only an empty first turn is still an error.
  - Text written before a tool is withdrawn only when the model writes more text after the
    tool, so a reply never ends empty when the model said something; the narration stands as
    the reply otherwise. A reply that ends with no text at all shows no empty message on the
    page.
  - Tests for: an empty last turn after a tool (the action reaches the page and the reply is
    `done`), narration kept when nothing follows, narration replaced when text follows, and an
    empty first turn still failing.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; live with Haiku 4.5 on
  `.data/` (`RTFM_MODELS=bedrock`, with no other server on `.data/`), "delete the … manual"
  opens the dialog (cancel it); this task's real spend is under $0.05.
