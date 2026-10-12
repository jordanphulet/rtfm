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
- **Status:** doing (agent: a9f6016a7a512a70a)
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
- **Status:** todo
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
- **Status:** todo
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
- **Status:** todo
- **Depends on:** PR.1, RL.7 (RL.6 and RL.7 also change `scripts/**`)
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
