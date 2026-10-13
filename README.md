# RTFM

A web app for reading hypothetical manuals. An LLM writes a manual's table of contents first, then
writes each section only when a reader opens it. The app has two pages:

- **The landing page** (`/`): your library of manuals, beside a librarian agent you talk to. The
  library lists the manuals a local API server stores, with how many sections of each are
  written, and deletes them through it. The librarian lists and finds manuals, opens one in the
  reader, starts a new one (the model plans its title, voice and table of contents, and it appears
  in the library), and proposes deleting one, which happens only if you confirm it in the
  library's own dialog. It answers with a scripted fake model by default or with Claude Haiku 4.5
  on Amazon Bedrock.
- **The reader** (`/read/<manual>`): any manual in the library. Opening a section that isn't
  written yet has the server write it and stream it in, with a fake writer by default or with
  Claude Haiku 4.5 on Amazon Bedrock.

## The docs

- `ARCHITECTURE.md`: a map of the code: what each folder holds, which folders may import which,
  and the rules that cut across them.
- `DESIGN.md` and each page's `src/<page>/DESIGN.md`: the design both pages share, then each
  page's own.
- `server/README.md`, `server/*/README.md` and `src/*/README.md`: each folder's own README, with
  how it works and its API.
- `PROCESS.md`: how work happens: the roles, where state lives, who approves rule changes, and
  the orchestrator's protocol.
- `WORKLIST.md`: the phases and tasks, with each task's status.
- `research/`: dated research write-ups, each opening with what was adopted.
- `CLAUDE.md`: the session roles, the shell and credentials rules, and the code standards.

## Running it

Needs Node 22.18 or later (the server and scripts run as TypeScript directly).

```sh
npm install
npx playwright install chromium   # once, for the screenshot script
npm run dev                       # then open http://localhost:5173/
```

`npm run dev` starts Vite on port 5173 and the API server on port 8787 (restarted by
`node --watch` when its code changes). Vite passes every request under `/api` to the server.
Both ports are fixed (`vite.config.ts` and `API_PORT` in `server/ports.ts`):

- If 5173 is taken, Vite exits, and `npm run dev` stops the API server too.
- If 8787 is taken, or another server is using the data folder (below), the API server doesn't
  start and `node --watch` waits for a file change, while Vite keeps running. Stop the other
  server, then save a server file or restart `npm run dev`.

The API server listens on `127.0.0.1` only; `server/api/README.md` › Only this machine's own pages
has the checks it makes.

| Script                       | What it does                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`                | Starts Vite (5173) and the API server (8787) together.                       |
| `npm run server`             | Starts the API server alone, for `curl` or `npm run preview`.                |
| `npm test`                   | Tests (Vitest; page and component tests in happy-dom). Never call Bedrock.   |
| `npm run build`              | Type-checks everything and builds the app.                                   |
| `npm run preview`            | Serves the built app, passing `/api` to `npm run server` on 8787.            |
| `npm run shot`               | Screenshots both pages in every state; `--compare` diffs against a baseline. |
| `npm run serve-temp`         | A throwaway copy of the app, on free ports and a new data folder. See below. |
| `npm run usage`              | Today's and this month's model spend, by model and by job. See below.        |
| `npm run logs`               | The server's recent log entries, filtered or followed. See below.            |
| `npm run audit`              | Candidate rule breaks from the transcripts. See `scripts/audit/README.md`.   |
| `npm run orchestrator-check` | Checks the orchestrator can start here, and lists leftovers. See below.      |
| `npm run commit-task`        | Commits a task's work with its review trailer. See below.                    |
| `npm run task-prompt`        | A task's agent prompt (`--review`: its reviewer's). `-s` drops npm's banner. |

The `rule-audit` skill (`.claude/skills/rule-audit/SKILL.md`) builds on `npm run audit`: told to
"run the rule audit", a session ranks the written rules agents break by how often and what each
break cost, and proposes tasks that turn the top ones into code. It changes no files.

The `orchestrate` skill (`.claude/skills/orchestrate/SKILL.md`) starts the orchestrator: run as
`/orchestrate` in the main checkout, it runs `npm run orchestrator-check`, asks about each
`doing` task an earlier run left, and starts the loop (`PROCESS.md` › Orchestrator protocol).

### The orchestrator's preflight

`npm run orchestrator-check` checks that the orchestrator can start where it runs. It fails, with
exit code 1, saying what to fix, when:

- it runs outside the main checkout, such as in a task's worktree: it names the main checkout;
- the main checkout isn't on `main`;
- the main checkout has uncommitted changes: it lists them;
- `core.hooksPath`, resolved against the main checkout, isn't its `.githooks` (below).

When those pass, it lists what an earlier run may have left, and still passes:

- each `doing` task in `WORKLIST.md`, with the agent its status records as `agent <id>`;
- each task worktree, on a `worktree-agent-<id>` branch, with its commits ahead of `main` and its
  uncommitted files. Other worktrees, such as `claude/*` ones, are left out.

Claude Code puts an agent's worktree at `.claude/worktrees/agent-<id>`, on the branch
`worktree-agent-<id>`, so each `doing` task is paired with the worktree whose branch carries its
agent's ID, and says "no worktree" when there is none. Each task worktree is paired with the task
whose status records its agent, whatever that status is (a `needs-human` task keeps its
worktree), and shows the task's ID and status; a worktree no task records says "no task records
its agent".

### Committing task work

The orchestrator commits a task's work with `npm run commit-task` (`PROCESS.md` › Review loop):

```sh
npm run commit-task -- RC.1 --reviewed-by <review agent id>
npm run commit-task -- RC.1 --no-review "<reason>"   # reviewed by the orchestrator alone
npm run commit-task -- RC.1 --worktree .claude/worktrees/<name> --reviewed-by <review agent id>
```

- It reads the task's block in `WORKLIST.md` and commits only the changed, new and deleted files
  its **Files** match, one by one, as `<ID>: <the task's title>`, with a `Reviewed-by:` trailer
  (the agent's id, or `none (<reason>)`) and Claude's co-author line. It lists the changed files
  it left alone.
- **Files** are read from their code spans: `**` matches any number of folders and `*` anything
  within one name, notes in parentheses are skipped, "`x.ts` and its test" adds `x.test.*`, and
  "except …" or a note starting with "except" or "not" leaves its paths out.
- It runs only in the main checkout with `main` checked out. Anywhere else it refuses with the
  preflight's message (above).
- With `--worktree <path>`, it reads the task from the main checkout's `WORKLIST.md` and stages and
  commits in that worktree, on its branch. It refuses a folder that isn't the top of one of this
  repository's worktrees, and refuses when a changed file there isn't in the task's **Files**.
- It refuses when nothing it matches differs from the last commit, during a merge, cherry-pick or
  revert, or with unmerged files. It refuses `--no-review` for a binary change or more than 40
  changed lines, not counting pure renames. A refusal leaves what is staged as it was.

`.githooks/commit-msg` refuses a commit without a `Reviewed-by:` trailer when its subject starts
with a task ID (`RC.1: …`), or when it has Claude's co-author line and changes any file but
`WORKLIST.md`. Other commits pass, such as "Update work list statuses" and your own. The hook
can't tell an amend from a new commit, so amend a commit only to add its trailer.

Git runs the hook only when `core.hooksPath` points at `.githooks`, which is set once per clone.
Its worktrees share the setting, but the path is relative, so a worktree whose branch is older
than `.githooks/commit-msg` runs no hook:

```sh
git config core.hooksPath .githooks
```

### Rule-change notices

`.claude/settings.json` runs three Claude Code hooks from `scripts/hooks/`, so that a session
learns when the rules it was given are out of date (`PROCESS.md` › How rules spread). A session
in a worktree, such as one the desktop app starts, runs its hooks from the main checkout:
`CLAUDE_PROJECT_DIR` is the main checkout, and the hook input's `cwd` is the worktree.

- **`behind-main.ts`**, when a session starts: in a worktree (the hook input's `cwd`) whose
  `HEAD` is behind the local `main`, it tells the session how many commits behind it is, which of
  `CLAUDE.md`, `PROCESS.md`, `WORKLIST.md` and `README.md` `main` has changed since the
  worktree's branch left it, and that `git show main:<file>` reads them. In the main checkout, or
  when up to date, it says nothing.
- **`rule-copies.ts save`**, at every session start (a new session, a resume, `/clear` and
  compaction): it copies the main checkout's `CLAUDE.md` and `PROCESS.md` to
  `rtfm-rules-<uid>/<session id>/copy/` in the system's temporary folder (private to the user),
  as the copy in the session's context. A subagent is given its session's copy.
- **`rule-copies.ts check`**, after every tool call: when either file in the main checkout
  differs from what the session, or the subagent making the call, last knew of it, it tells that
  one, once per change, which file changed, the `git diff --no-index` from the file as it was
  when the session started to the file now (cut short past 4,000 characters), and that the file
  in the main checkout wins. Which subagent made the call comes from the hook input's `agent_id`;
  what each has been told is kept in `seen/` beside the copy. Parallel tool calls check at the
  same time, so a lock lets one of them tell and the others say nothing.

A hook that fails (no git, not a repository, no saved copy) prints nothing and exits 0, so it
never blocks a session. The check costs about 65ms a tool call through the hook's shell command,
almost all of it Node starting up and reading TypeScript. The hooks read their JSON input on
stdin and the project folder from `CLAUDE_PROJECT_DIR`, so they run by hand too:

```sh
echo '{"session_id":"try","cwd":"<a worktree>"}' | CLAUDE_PROJECT_DIR="$PWD" node scripts/hooks/behind-main.ts
```

### A throwaway server

`npm run serve-temp` starts the API server and Vite, each on a free port, on a new temporary data
folder, always with the fake models: a new data folder's ledger would start the spending caps from
zero. It never touches `.data/` and runs beside `npm run dev`, so it is how an agent runs the app
for a check:

```sh
npm run serve-temp              # deletes its data folder once stopped
npm run serve-temp -- --keep    # keeps it
```

- It prints the page's URL, the API's URL, the data folder and its own PID, then runs until it is
  stopped.
- On `SIGINT` (Ctrl-C), `SIGTERM` (`kill <pid>`) or `SIGHUP` (its terminal closing) it stops
  both servers and deletes the data folder, unless `--keep` is given. A crash deletes it too.
- Run it in the background, and stop it with the handle you got or the PID it printed.
- `npm run logs -- <data folder>` reads its log. `RTFM_PASSCODE` puts it behind a passcode, as it
  does `npm run dev`.

### Another data folder or port

`RTFM_DATA_DIR` and `RTFM_PORT` run the server on another data folder or port, with nothing
edited:

```sh
RTFM_DATA_DIR=/tmp/rtfm-try npm run dev                  # a fresh folder, seeded on start
RTFM_DATA_DIR=/tmp/rtfm-try RTFM_PORT=0 npm run server   # alone, on any free port
```

- A relative `RTFM_DATA_DIR` is resolved against the working directory, which under `npm run` is
  the repo root.
- `RTFM_PORT=0` takes any free port, and the server's first log line says which one it got
  (`API server on http://127.0.0.1:<port> (fake models)`). A port that isn't a whole number from
  0 to 65535 stops the server from starting.
- Vite's proxy always points at 8787, so `RTFM_PORT` is for `npm run server` alone.

`server/README.md` › Configuration has the rules.

## The models

`RTFM_MODELS` chooses who writes unwritten sections and who answers as the librarian:

- **`fake`** (the default). Nothing costs anything, and tests and screenshots always use it.
  - **The fake writer** replays the sample manual's own text for the section after 1.2s, about
    20 characters every 85ms. A section that has no sample text (every section of the other six
    manuals, and of any manual the librarian creates) gets a one-line placeholder instead, which
    streams like any section but is never saved: after a reload the section is unwritten again,
    and the library's count doesn't change.
  - **The fake librarian** is a scripted stand-in for the model. It picks what to do from a
    keyword in your message (such as list, find, open, delete, new or help), calls the same tools
    Claude would, against the real library, and streams its answer in the fake writer's chunks
    (about 20 characters every 85ms) after 0.6s. Asked for a new manual, it plans the same small
    nine-section manual, titled after what you asked for (“…about building a treehouse” plans
    *Building a Treehouse*): the title shows 0.6s into the plan, and the manual is saved 2.4s
    later. Anything else gets a polite “I can’t do that”.
- **`bedrock`**: Claude Haiku 4.5, through the model gateway, for both. As measured
  (`server/README.md` › Configuration has the table):
  - It writes a section live: about 4,200–5,000 characters in 12–15 seconds, for $0.007–0.010 a
    section.
  - It answers as the librarian in one model call per turn, usually two or three a reply,
    $0.002–0.004 each.
  - It plans a new manual in one more call (two if the first plan fails its checks): 21.3s and
    $0.0164 for a plan of 23 sections.

To switch to Claude:

1. The AWS account needs Amazon Bedrock access to Claude Haiku 4.5 through its `global.`
   inference profile (`global.anthropic.claude-haiku-4-5-20251001-v1:0`).
2. Put its keys in `.env.local` at the main checkout's root (gitignored). A server started in a
   linked worktree reads the main checkout's file too, so there is only ever one copy:

   ```sh
   AWS_ACCESS_KEY_ID=…
   AWS_SECRET_ACCESS_KEY=…
   AWS_REGION=us-west-2
   ```

   The server reads these three from that file and from nowhere else: never from the
   environment, a profile or `~/.aws`. If any is missing, the server refuses to start and names
   the missing ones.
3. Start it with Bedrock:

   ```sh
   RTFM_MODELS=bedrock npm run dev
   ```

4. Open an unwritten section or ask the librarian something, then run `npm run usage` to see what
   it cost.

Any value of `RTFM_MODELS` other than `fake` or `bedrock` stops the server from starting.

## A passcode

`RTFM_PASSCODE` puts the whole app behind a passcode, so that once it is on a public URL nobody
who finds it can spend the Bedrock budget:

```sh
RTFM_PASSCODE='<four or more random words>' npm run dev
```

- **Pick a few random words**, four or more, rather than one word or a short code. Nothing slows
  guessing (no attempt limit, no lockout), so the passcode's length is what keeps it safe.
- With it set, every API request but entering the passcode answers `401` until the browser has
  entered it, and the page shows a passcode screen in its place. Once it is entered, the page
  reloads where it was, and the browser keeps a cookie for the rest of its session.
- **To change it**, set a new one and restart the server. Every browser then has the old one and
  is asked again.
- Unset or empty, there is no passcode.
- It is never logged: refused requests and wrong passcodes are, without it.

How the server checks it is in `server/api/README.md` › The passcode, and the screen's design in
`DESIGN.md` › The passcode screen.

## Configuration

Everything but the credentials and the passcode is committed:

- `server/config.ts`: the data folder (`RTFM_DATA_DIR` overrides it), the port (`RTFM_PORT`
  overrides it), the models (`RTFM_MODELS`), the passcode (`RTFM_PASSCODE`, above), the spending
  caps ($2 a day and $20 a month, UTC), how many sections may be written and how many model calls
  may run at once, the 30s stall timeout (60s for planning a manual), each job's model and
  `max_tokens`, the most model turns one librarian reply may take (8), the length in words the
  prompt asks Claude for (`sectionWordsRequested`), and the length in characters a section's
  progress counts to while Claude writes (`sectionExpectedCharacters`). The default API port is
  `API_PORT` in `server/ports.ts`.
- `server/gateway/prices.ts`: the dated price table. With `RTFM_MODELS=bedrock`, the server
  refuses to start with a model that isn't in it.

The gateway refuses a model call that could cross the daily or monthly cap: nothing is charged,
and the reader shows "budget reached" (the librarian's reply says its budget is used up). How it
reserves each call's worst case and settles it afterwards is in `server/gateway/README.md` › Each
call.

To try a different setting without changing the committed one (a tiny cap, say), call
`startServer({ ...config, caps: { dailyUsd: 0.001, monthlyUsd: 20 } })` from a scratch script,
as `scripts/shot.ts` does for its own settings. Stop `npm run dev` first, or give the script its
own `dataDir` and `port: 0` as the shot script does: otherwise the data folder's lock refuses it,
and port 8787 is taken.

## The data folder and spending

The server keeps everything in `.data/` (gitignored), or in the folder `RTFM_DATA_DIR` names.
When it starts, it seeds each manual in `server/seed/` that it hasn't seeded before: the sample,
*The Haunt That Listens*, with 7 of its 18 sections written, and six more with a table of contents
and nothing written. A manual you delete stays deleted, and a manual already in `.data/` is left
as it is.

- `.data/manuals/<manualId>/`: a manual (`manual.json`) and one `sections/<id>.md` per written
  section. A section is written when its file exists. To have one written again, stop the
  server, delete its file, and start the server again.
- `.data/seeded.json`: the ids of the seed manuals already seeded. To reset every manual to the
  seed, stop the server, delete `.data/manuals/` and `.data/seeded.json`, and start it again.
- `.data/ledger/<yyyy-mm>.jsonl`: the usage ledger, one line per model call reserved and settled.
  The caps are computed from it, so **never delete or edit it**.
- `.data/logs/<yyyy-mm-dd>.jsonl`: the server's log, one file per UTC day (see Logs, below).
- `.data/server.lock`: the PID of the server using the folder (below).
- `.data/STOP`: **the kill switch.** While this file exists, the gateway refuses every new model
  call at once, with no restart, and the reader and the librarian say their budget is reached.
  Delete it to resume.
  A call already running finishes.

The caps and the kill switch apply only to the Bedrock models. The fake writer and the fake
librarian make no model calls, so they never reach the gateway.

```sh
touch .data/STOP   # stop all model calls
rm .data/STOP      # allow them again
```

**One server per data folder.** The caps are checked in the server's memory, so a second server
on the same folder refuses to start. It logs this as a `server.refused` line and exits with code
1:

```text
Another server (PID <pid>) is using the data folder <folder>. Stop it first, or use another data folder.
```

A second `npm run dev` in the same checkout stops altogether, because its Vite also finds 5173
taken. To run a second server, give it another folder with `RTFM_DATA_DIR`. If a server is
refused while no server is using the folder, delete `.data/server.lock`. How the lock works is in
`server/storage/README.md` › The data folder's lock.

`npm run usage` prints today's and this month's spend against the caps, by model and by job,
with counts of aborted, failed and estimated calls, any unsettled reservations, and whether the
kill switch is on. `npm run usage -- <dataDir>` reads another data folder. A call cut short (the
reader closed the tab, the model stalled) is marked estimated; what it is charged is in
`server/gateway/README.md` › Each call.

## Logs

The server logs one JSON line per event, both to its standard output (the terminal running
`npm run dev` or `npm run server`) and to `logs/<yyyy-mm-dd>.jsonl` in its data folder, one file
per UTC day. The browser's uncaught errors and failed API requests reach the same log. The line's
shape, how long files are kept, and what is and isn't logged are in `server/logging/README.md`.

`npm run logs` prints recent entries, one line each, with any error's stack under it:

```sh
npm run logs                              # the last 50 entries in .data/logs
npm run logs -- --level warn              # warnings and errors only
npm run logs -- --event section           # section.started, section.failed, …
npm run logs -- --lines 200 --follow      # the last 200, then each new one as it is written
npm run logs -- /tmp/rtfm-try -e request  # another data folder's requests
```

- `--level` (`-l`) shows that level and the ones above it: `DEBUG`, `INFO`, `WARN`, `ERROR`.
- `--event` (`-e`) shows that event and the events under it (`section` matches `section.failed`).
- `--lines` (`-n`) is how many entries to show first (50 unless given); `--follow` (`-f`) then
  keeps printing new ones until it is stopped with Ctrl-C.

The files are JSON lines, so `grep` and `jq` read them as they are.

## Screenshots

`npm run shot` starts its own API server, with the fake models on a temporary data folder, and
its own Vite dev server, each on a free port, so it never touches `.data/` or Bedrock and runs
beside `npm run dev`. It writes to `shots/`, or to the folder given as `npm run shot -- <folder>`,
clearing that folder first and nothing else:

- `reader/<state>-<desktop|phone|desktop-reduced>.png`, for the states `start`, `toc`,
  `written`, `dense`, `waiting`, `streaming`, `streaming-full`, `budget`, `error` and `appendix`
  (`desktop-reduced`, with reduced motion, only for `start` and `streaming`);
- `home/<state>-<desktop|phone>.png`, for the landing page's states (listed in
  `src/home/DESIGN.md`, under "States");
- `passcode/<state>-<desktop|phone>.png`, for the passcode screen's `start` and `wrong`, taken
  through a second API server and Vite server, with a passcode set. The pages' shots are taken
  with none, whatever `RTFM_PASSCODE` is.

`--compare <baseline>` checks a run against an earlier one, such as a copy of `shots/` taken
before a change:

```sh
npm run shot -- --compare /tmp/shots-before           # writes to shots/, then compares
npm run shot -- /tmp/shots-after --compare /tmp/shots-before
```

- It lists only the shots that differ from the baseline's or are missing from either folder,
  and exits with 1 if there are any.
- For each shot that differs, it saves a diff image, with the changed pixels in red, under
  `diffs/` in the output folder, at the shot's own path (`diffs/reader/start-desktop.png`).
- A shot differs when more than 10 pixels change by more than about two color steps
  (pixelmatch, threshold 0.01). Shots of one commit come out pixel for pixel the same on every
  run, because Chromium redraws whole tiles (`--disable-partial-raster`); without that, the
  anti-aliased edges of the status rings drift by a step or two.
- The baseline must be a separate folder, not the output folder or one inside it, since the run
  clears its output first.

## Where things live

The routes are in `src/App.tsx`, which loads both pages lazily: `/` is the landing page,
`/read/:manualId` (a manual's contents) and `/read/:manualId/:sectionId` are the reader, and
anything else, bare `/read` included, redirects to `/`. The settings are in `server/config.ts`
(Configuration, above), and everything the server keeps is in its data folder (above).

What each folder of the code holds is in `ARCHITECTURE.md` › Codemap.
