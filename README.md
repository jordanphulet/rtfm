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
- `infra/README.md`: RTFM's AWS setup: the CDK app and its stacks, its IAM identities and
  permissions boundary, the only way commands reach AWS, deploying the app stack, the user's
  steps to set it up, and what the deploy path was checked against.
- `research/`: dated research write-ups, each opening with what was adopted.
- `CLAUDE.md`: the session roles, the shell and credentials rules, and the code standards.

## Running it

Needs Node 22.18 or later (the server and scripts run as TypeScript directly).

```sh
npm install
npx playwright install chromium   # once, for the screenshot script
npm run fetch-dynamodb-local      # once, for the tests: DynamoDB Local, which needs Java 17+
npm run dev                       # then open http://localhost:5173/
```

`npm run dev` starts Vite on port 5173 and the API server on port 8787 (restarted by
`node --watch` when its code changes). Vite passes every request under `/api` to the server.
Both ports are fixed (`vite.config.ts` and `API_PORT` in `server/ports.ts`):

- If 5173 is taken, Vite exits, and `npm run dev` stops the API server too.
- If 8787 is taken, or another server is using the data folder (below), the API server doesn't
  start and `node --watch` waits for a file change, while Vite keeps running. Stop the other
  server, then save a server file or restart `npm run dev`.

The API server listens on `127.0.0.1` only; `server/api/README.md` › Only the app's own pages has
the checks it makes.

The same server runs in AWS on a Lambda Web Function, `rtfm-app`, with Claude Haiku 4.5 on
Bedrock, behind the passcode whose digest the DynamoDB table `rtfm-app` holds (A passcode, below),
keeping the manuals in that table and serving the built app beside the API (`server/README.md` ›
The Web Function). Every Bedrock call it makes is reserved in the table `rtfm-usage` first, under
the same caps and kill switch as a laptop's (Bedrock's spending, below).
`npm run cdk -- deploy RtfmApp` builds and deploys it (`infra/README.md`).

| Script                       | What it does                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`                | Starts Vite (5173) and the API server (8787) together.                       |
| `npm run server`             | Starts the API server alone, for `curl` or `npm run preview`.                |
| `npm test`                   | Tests (Vitest; page and component tests in happy-dom). Loopback only.        |
| `npm run fetch-dynamodb-local` | DynamoDB Local for the tests, fetched once. See `server/storage/README.md`. |
| `npm run build`              | Type-checks everything and builds the app.                                   |
| `npm run preview`            | Serves the built app, passing `/api` to `npm run server` on 8787.            |
| `npm run shot`               | Screenshots both pages in every state; `--compare` diffs against a baseline. |
| `npm run serve-temp`         | A throwaway copy of the app, on free ports and a new data folder. See below. |
| `npm run usage`              | Today's and this month's model spend, by model, job and library. See below.  |
| `npm run logs`               | The server's recent log entries, filtered or followed. See below.            |
| `npm run audit`              | Candidate rule breaks from the transcripts. See `scripts/audit/README.md`.   |
| `npm run orchestrator-check` | Checks the orchestrator can start here, and lists leftovers. See below.      |
| `npm run commit-task`        | Commits a task's work with its body and review trailer. See below.           |
| `npm run commit-worklist`    | Commits `WORKLIST.md` alone, with a body from its diff. See below.           |
| `npm run task-prompt`        | A task's agent prompt (`--review`: its reviewer's). `-s` drops npm's banner. |
| `npm run ops`                | The deployed app's kill switch, passcode, libraries, spend, logs and status. |
| `npm run aws`                | The AWS CLI as RTFM's own role, the only way to it. See `infra/README.md`.   |
| `npm run cdk`                | The CDK CLI in `infra/`, as RTFM's own role. See `infra/README.md`.          |

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
npm run commit-task -- RC.1 --body-file <path> --reviewed-by <review agent id>
npm run commit-task -- RC.1 --body-file <path> --no-review "<reason>"   # reviewed by the orchestrator alone
npm run commit-task -- RC.1 --body-file <path> --worktree .claude/worktrees/<name> --reviewed-by <review agent id>
```

- It reads the task's block in `WORKLIST.md` and commits only the changed, new and deleted files
  its **Files** match, one by one, as `<ID>: <the task's title>`, then the body read from
  `--body-file`, then a `Reviewed-by:` trailer (the agent's id, or `none (<reason>)`) and Claude's
  co-author line. It lists the changed files it left alone.
- `--body-file` is required. It refuses a missing file, and a body that is empty or only
  whitespace. Blank lines around the body are dropped; lines starting with `#` are kept.
- **Files** are read from their code spans: `**` matches any number of folders and `*` anything
  within one name, notes in parentheses are skipped, "`x.ts` and its test" adds `x.test.*`, and
  "except …" or a note starting with "except" or "not" leaves its paths out.
- It refuses, naming them, while a task its optional **Merges after** line names is still in
  `WORKLIST.md`. That line's task IDs (`IN.15`) are read outside notes in parentheses.
- It runs only in the main checkout with `main` checked out. Anywhere else it refuses with the
  preflight's message (above).
- With `--worktree <path>`, it reads the task from the main checkout's `WORKLIST.md` and stages and
  commits in that worktree, on its branch. It refuses a folder that isn't the top of one of this
  repository's worktrees, and refuses when a changed file there isn't in the task's **Files**.
- It refuses when nothing it matches differs from the last commit, during a merge, cherry-pick or
  revert, or with unmerged files. It refuses `--no-review` for a binary change or more than 40
  changed lines, not counting pure renames. A refusal leaves what is staged as it was.

The orchestrator commits its `WORKLIST.md` changes with `npm run commit-worklist`:

```sh
npm run commit-worklist
npm run commit-worklist -- --reason "<text>"
```

- It commits `WORKLIST.md` alone, as it is in the working tree, as "Update work list statuses"
  with Claude's co-author line. The body compares it with the last commit's, one line per task:
  `Added <ID> (<status>)`, `Removed <ID>`, or `<ID>: <old status> → <new status>`, then the
  `--reason` text if given.
- It runs only in the main checkout with `main` checked out, like `npm run commit-task`.
- It refuses when any other file is changed, staged or new, listing them; when `WORKLIST.md` has
  no change; and when no task was added, removed or changed status and no `--reason` says what
  changed.

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
npm run serve-temp                      # deletes its data folder once stopped
npm run serve-temp -- --keep            # keeps it
npm run serve-temp -- --library acme    # and prints a link to the library acme
```

- It prints the page's URL, the API's URL, the data folder and its own PID, then runs until it is
  stopped.
- With `--library <libraryId>`, it makes a link to that recipient's library in its data folder
  and prints it once, as `Link: <page>/l#<secret>`. The link opens only that throwaway library, on
  this machine, with the fake models (A library's link, below).
- On `SIGINT` (Ctrl-C), `SIGTERM` (`kill <pid>`) or `SIGHUP` (its terminal closing) it stops
  both servers and deletes the data folder, unless `--keep` is given. A crash deletes it too.
- Run it in the background, and stop it with the handle you got or the PID it printed.
- `npm run logs -- <data folder>` reads its log, and `npm run usage -- <data folder>` its ledger.
  A `STOP` file in the data folder is its kill switch (The data folder and spending, below).
  `RTFM_PASSCODE` puts it behind a passcode, as it does `npm run dev`.

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

- **`fake`** (the default). Nothing costs anything, and tests and screenshots always use it. Its
  calls go through the model gateway as Bedrock's do, under the model `fake-model`, priced at $0:
  the caps (to which each call adds $0), the kill switch, the idle timeout and the ledger all
  apply to them, and `npm run usage` lists them apart from real spend.
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
2. Put the keys of the IAM user `rtfm-local` (`infra/README.md` › Your steps) in `.env.local` at
   the main checkout's root (gitignored). A server started in a linked worktree reads the main
   checkout's file too, so there is only ever one copy:

   ```sh
   AWS_ACCESS_KEY_ID=…
   AWS_SECRET_ACCESS_KEY=…
   AWS_REGION=us-west-2
   ```

   The server reads these three from that file and from nowhere else: never from the
   environment, a profile or `~/.aws`. If any is missing, the server refuses to start and names
   the missing ones.
3. The table `rtfm-usage` must exist (`RtfmApp`, `infra/README.md`) and `rtfm-local` must be able
   to use it (`RtfmAccess`): every Bedrock call is reserved there first (The data folder and
   spending › Bedrock's spending, below), and fails without it.
4. Start it with Bedrock:

   ```sh
   RTFM_MODELS=bedrock npm run dev
   ```

5. Open an unwritten section or ask the librarian something, then run
   `RTFM_MODELS=bedrock npm run usage` to see what it cost.

Any value of `RTFM_MODELS` other than `fake` or `bedrock` stops the server from starting.

## A passcode

A passcode puts the whole app behind a passcode screen, so that once it is on a public URL nobody
who finds it can spend the Bedrock budget. The server keeps only the passcode's SHA-256 digest,
and a browser that enters the passcode gets a cookie holding that digest.

- With one set, every API request but entering the passcode, and opening or leaving a library
  (`POST` and `DELETE /api/link`), answers `401` until the browser has entered it, and the page
  shows a passcode screen in its place. A library's link opens its own library without it (A
  library's link, below). Once it is entered, the page reloads where it was, and the browser keeps
  the cookie for the rest of its session.
- Nothing slows guessing (no attempt limit, no lockout), so the passcode's length is what keeps
  it safe: a few random words, never one word or a short code.
- Neither the passcode nor its digest is ever logged: refused requests and wrong passcodes are,
  without them.

**On this machine**, `RTFM_PASSCODE` sets it. The server hashes it when it starts and keeps only
the digest. Unset or empty, there is no passcode. To change it, set a new one and restart the
server: every browser then has the old digest and is asked again.

```sh
RTFM_PASSCODE='<four or more random words>' npm run dev
```

**The deployed app** reads the digest from the passcode's item in the table `rtfm-app`, never from
its environment. You set it, in a terminal outside the Claude app, never in its Terminal panel,
whose screen a session can read:

```sh
npm run ops -- passcode set
```

- It makes a passcode of four random words and stores only its digest, as `rtfm-ops`. It shows
  the words once, in the terminal alone, and waits for Enter; then it clears the screen and its
  scrollback. Keep the words: nothing can show them again.
- It runs only when its standard input and output are a terminal, so the words never go to a
  pipe, a file or a program's output. Agents never run it (`CLAUDE.md` › Shell).
- Running it again sets a new passcode. The Web Function reads the digest again at most a minute
  after it last did, so within a minute every browser has the old cookie and is asked again, with
  no deploy.
- While no passcode is set, the deployed app refuses every API request, and every passcode.

**The digest opens the app.** The cookie holds the digest itself, so whatever can read the
passcode's item can open the app without the passcode: `rtfm-ops` (`npm run ops -- passcode
cookie` prints the cookie, which is how an agent's smoke check gets in, `infra/README.md` ›
Deploying the app stack), the Web Function's role `rtfm-app-web-function`, which reads every item
of `rtfm-app`, and any role an app stack creates with access to that table. Only `rtfm-ops`
(`npm run ops -- passcode set`) writes the item: the Web Function's role is refused every write
to its partition, `PASSCODE` (`infra/README.md` › The Web Function's role, the passcode and the
links). The passcode itself is in no file, log or table: only you see it, once.

How the server checks it is in `server/api/README.md` › The passcode, and the screen's design in
`DESIGN.md` › The passcode screen.

## A library's link

Each recipient gets a library of their own, opened by a secret link, with no passcode:
`https://rtfm.moonfetus.com/l#<secret>`. A new library starts with two manuals, *The Haunt That
Listens* and *Negotiating With Geese*, as tables of contents with no section written, and holds
only its own manuals: it can't see, change or spend from any other library.

- Opening the link posts its secret to `POST /api/link`, which sets a cookie holding the secret
  for a year, renewed on every use, and clears the passcode cookie. A link works whether or not a
  passcode is set. The page takes the secret out of the address before it posts it, then opens
  the library at `/`; a closed link, and any request once a library's link is closed, shows the
  passcode screen with "This link is closed." (`DESIGN.md` › The link page).
- The server keeps only the secret's SHA-256 digest, and never logs the secret or its digest.
- A revoked link is refused within a minute, by its cookie and its secret alike; the library's
  manuals and activity stay.
- The server counts each library's activity: links opened, the first and last use, sections read
  and written, librarian messages and manuals made.
- `DELETE /api/link` clears the library cookie, so the browser is back in the admin's library on
  this machine with no passcode, or at the passcode screen. The page `/admin` calls it, then opens
  `/`: that is how you leave a library you opened in your own browser.

**The link is a bearer token.** Whoever has the link, or the cookie it sets, opens that library
until it is revoked: the person it was sent to, anyone they forward it to, and any mail scanner
that opens links in a browser that runs the page's script. Such a scanner's visit counts as the
link's first use, before the recipient has clicked. Send each link only to the person it is for,
and revoke it once the application is over.

**Making and revoking a link are yours**, as setting the passcode is, and are done outside the
server, which only reads links: a new link opens a library, and revoking one changes who can open
the live app, so you do both in your own terminal outside the Claude app, and agents never do
either.

How the server opens a library is in `server/api/README.md` › The gate, and a throwaway link for a
check is `npm run serve-temp -- --library <libraryId>` (A throwaway server, above).

## Configuration

Everything but the credentials and the passcode is committed:

- `server/config.ts`: the data folder (`RTFM_DATA_DIR` overrides it), the port (`RTFM_PORT`
  overrides it), the models (`RTFM_MODELS`), the passcode (`RTFM_PASSCODE`, above), the spending
  caps ($2 a day and $20 a month, and $0.50 a day for each recipient library, UTC), how many
  sections may be written and how many model calls may run at once, the 30s stall timeout (60s
  for planning a manual), each job's model and `max_tokens`, the most model turns one librarian
  reply may take (8), the length in words the prompt asks Claude for (`sectionWordsRequested`),
  the length in characters a section's progress counts to while Claude writes
  (`sectionExpectedCharacters`), the table Bedrock's spending is kept in (`rtfm-usage`), and the
  manuals a recipient's library starts with (`starterManualIds`). The default API port is
  `API_PORT` in `server/ports.ts`.
- `server/gateway/prices.ts`: the dated price table, with the fake model at $0. The server refuses
  to start with a model that isn't in it.

The gateway refuses a model call that could cross the daily or monthly cap, which every library
shares, the admin's too, or, for a recipient's library, that library's own daily cap: nothing is
charged, and the reader shows "budget reached" (the librarian's reply says its budget is used up).
The admin's library has no cap of its own, and no library has a monthly one. How it reserves each
call's worst case and settles it afterwards is in `server/gateway/README.md` › Each call.

**The monthly exposure.** $0.50 a day reads both starter manuals end to end, with a new manual or
two besides. One library at its cap every day is about $15 a month. Two at their caps for most of a
month reach the central $20, and from then on the monthly cap refuses every library, the admin's
too, for the rest of the month; four at their caps on one day reach the central $2 and refuse
everyone for the rest of that day. `npm run usage` gives each library's spend that day and that
month (below).

To try a different setting without changing the committed one (a tiny cap, say), call
`startServer({ ...config, caps: { ...config.caps, dailyUsd: 0.001 } })` from a scratch script,
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
- `.data/libraries/<libraryId>/`, `.data/links/` and `.data/activity/`: each recipient's library,
  laid out as the admin's is, its link under its secret's digest, and its activity (A library's
  link, above).
- `.data/ledger/<yyyy-mm>.jsonl`: the fake models' usage ledger, one line per model call reserved
  and settled, under `fake-model` at $0. Bedrock calls made before the table `rtfm-usage` existed
  are in it too. The fake models' caps are computed from it, so **never delete or edit it**.
- `.data/logs/<yyyy-mm-dd>.jsonl`: the server's log, one file per UTC day (see Logs, below).
- `.data/server.lock`: the PID of the server using the folder (below).
- `.data/STOP`: **the fake models' kill switch.** While this file exists, the gateway refuses
  every new fake model call at once, with no restart, and the reader and the librarian say their
  budget is reached. Delete it to resume. A call already running finishes. **It doesn't stop
  Bedrock**, whose kill switch is in `rtfm-usage` (below).

```sh
touch .data/STOP   # stop the fake models' calls
rm .data/STOP      # allow them again
```

**One server per data folder.** The fake models' caps are checked in the server's memory, so a
second server on the same folder refuses to start. With Bedrock the data folder's lock no longer
guards money, since the caps are kept in `rtfm-usage` (below), but it still keeps one server per
data folder. A refused server logs a `server.refused` line and exits with code 1:

```text
Another server (PID <pid>) is using the data folder <folder>. Stop it first, or use another data folder.
```

A second `npm run dev` in the same checkout stops altogether, because its Vite also finds 5173
taken. To run a second server, give it another folder with `RTFM_DATA_DIR`. If a server is
refused while no server is using the folder, delete `.data/server.lock`. How the lock works is in
`server/storage/README.md` › The data folder's lock.

### Bedrock's spending: the table `rtfm-usage`

**`RTFM_MODELS` chooses the ledger.** With `fake`, it is the data folder's, above. With `bedrock`,
it is always the DynamoDB table `rtfm-usage`, on this machine as in AWS: every call's reservation
and settlement, the day's and the month's spend and each recipient library's day's that the caps
are checked against, and the kill switch. Every server running Bedrock, on any laptop or
deployed, reserves each call in that table in one conditional transaction, so together they never
pass the caps, and one kill switch stops them all. The fake model's calls never reach it. On this
machine the server reaches it with `rtfm-local`'s keys from `.env.local` (The models, above), and
the deployed app as its Web Function's role; `RtfmApp` holds it (`infra/README.md`). How it works
is in `server/gateway/README.md` › The spending ledger.

**The kill switch** is the item `KILL_SWITCH` in `rtfm-usage`: while it exists, every server
refuses every new Bedrock call, from its very next one, with no restart. A call already running
finishes. `npm run ops` turns it on and off, as the role `rtfm-ops` (The ops tools, below):

```sh
npm run ops -- kill-switch on       # stop all Bedrock calls
npm run ops -- kill-switch off      # allow them again
npm run ops -- kill-switch status
```

`rtfm-local` may turn it on, but not off, and `rtfm-read` may read it. Without RTFM's AWS files,
you turn it on and off from CloudShell, with your own sign-in:

```sh
aws dynamodb put-item --region us-west-2 --table-name rtfm-usage \
  --item '{"pk":{"S":"KILL_SWITCH"},"sk":{"S":"KILL_SWITCH"}}'     # stop all Bedrock calls
aws dynamodb delete-item --region us-west-2 --table-name rtfm-usage \
  --key '{"pk":{"S":"KILL_SWITCH"},"sk":{"S":"KILL_SWITCH"}}'      # allow them again
```

**Bedrock spend from before the table.** Bedrock calls made before the table existed are in the
data folder's ledger, which the table's caps can't see. Importing this month's once (`--import`,
below) puts them in the table, so its monthly cap counts them; earlier months' don't count toward
any cap.

### `npm run usage`

`npm run usage` prints today's and this month's spend against the caps, by model, by job and by
library (`admin` for the admin's library: a reserve entry without `libraryId` is the admin's), with
counts of aborted, failed and estimated calls, any unsettled reservations, and whether the kill
switch is on. A call cut short (the reader closed the tab, the model stalled) is marked
estimated; what it is charged is in `server/gateway/README.md` › Each call.

- It reads the ledger `RTFM_MODELS` chooses: `npm run usage` reads the data folder's, and
  `RTFM_MODELS=bedrock npm run usage` reads `rtfm-usage`, with `rtfm-local`'s keys.
  `npm run ops -- usage` prints the same report of `rtfm-usage` as `rtfm-read`, with no
  `.env.local` (The ops tools, below).
- The fake model's calls are counted on a line of their own, in none of the totals.
- An unsettled reservation is a call whose server stopped before it settled (a crash, a kill). It
  stays counted at its worst case, in the table as in the data folder, and is listed under
  "Unsettled reservations", with when it was reserved, its call id, its job and its worst case.
- `npm run usage -- <dataDir>` reads another data folder; with `RTFM_MODELS=bedrock` it refuses
  one.

To import this month's Bedrock calls from the data folder's ledger into `rtfm-usage`, run the dry
run, read what it lists, then run it again with `--apply`:

```sh
RTFM_MODELS=bedrock npm run usage -- --import            # lists them, with what each cost; writes nothing
RTFM_MODELS=bedrock npm run usage -- --import --apply    # copies each one rtfm-usage doesn't have yet
```

It reads `.data` (or the data folder given with `--import`), leaves out the fake model's calls,
and copies each call with what it was charged, an unsettled one at its worst case, adding it to
its day's and month's totals whatever the caps. A call already in the table is left as it is, so
running it again changes nothing. The data folder's ledger is left as it is.

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
npm run logs -- --library acme            # the library acme's entries
```

- `--level` (`-l`) shows that level and the ones above it: `DEBUG`, `INFO`, `WARN`, `ERROR`.
- `--event` (`-e`) shows that event and the events under it (`section` matches `section.failed`).
- `--library` shows the entries whose `libraryId` is that library's: `admin` for the admin's, or a
  recipient's id (`server/logging/README.md` says which lines carry it).
- `--lines` (`-n`) is how many entries to show first (50 unless given); `--follow` (`-f`) then
  keeps printing new ones until it is stopped with Ctrl-C.

The files are JSON lines, so `grep` and `jq` read them as they are. The deployed app's log is in
CloudWatch, which `npm run ops -- logs` reads (below).

## The ops tools

`npm run ops -- <command>` reads and runs the deployed app in AWS. Each command acts as one of
RTFM's roles, through the same environment as `npm run aws` (`infra/README.md` › Reaching AWS):
RTFM's own files under `~/.aws/rtfm/`, none of the caller's AWS settings, and the identity check.
It chooses the role itself, and takes no `--profile`. They are built for agents:

- **Non-interactive**: nothing asks a question or waits for input, but `passcode set`, which is
  yours alone.
- **Plain text**, or the same as JSON with `--json`, on standard output.
- **Exit code 1 on failure**, with the reason on standard error: a command line it doesn't take
  (with the usage), a refused identity, or a read or write that failed. `status` exits 1 when any
  of its reads failed, and still prints the rest.

`kill-switch on` and `off` change the live app, so agents run them only when the user asks in chat
(`CLAUDE.md` › Shell). `passcode set` is yours, and agents never run it: it runs only in a
terminal, which should be one outside the Claude app (A passcode, above). `library create` and
`library revoke` are yours too, run in your own terminal outside the Claude app, and agents never
run them (Libraries, below). The other commands only read.

| Command | Role | What it does |
| --- | --- | --- |
| `kill-switch on`, `off`, `status` | `rtfm-ops` | Puts or deletes the kill switch's item in `rtfm-usage` (Bedrock's spending, above), then reads it back: `Kill switch: off.`, or `ON`; `--json` gives `{ "killSwitchOn": false }` |
| `passcode set` | `rtfm-ops` | Makes a passcode of four random words, from the more than a thousand in `scripts/ops/passcode-words.ts`, and puts its digest in the passcode's item in `rtfm-app`; then shows the words on the terminal, waits for Enter, and clears the screen and its scrollback (`\x1b[2J\x1b[3J\x1b[H`). Its output says only that the passcode is set. With no terminal on standard input and output it exits 1 before reaching AWS |
| `passcode cookie` | `rtfm-ops` | The passcode cookie, `rtfm_passcode=<digest>`, read from the passcode's item in `rtfm-app`, for `curl -b`; `--json` gives `{ "cookie": "…" }`. It exits 1 when no passcode is set. The cookie opens the app, so pass it straight to `curl` rather than printing it |
| `library create <libraryId> [--label <text>]` | `rtfm-ops` | Makes a recipient's library: puts its link's item in `rtfm-app`, holding the new secret's digest, `libraryId`, the label and `createdAt`, and prints the link, `https://rtfm.moonfetus.com/l#<secret>`, once, on standard output; `--json` gives `{ "libraryId": "…", "link": "…" }`. It refuses an id that isn't a slug of at most 63 characters, is `admin`, or that any link names, revoked or not |
| `library list` | `rtfm-read` | Every library, oldest first: its id, label, when it was made and revoked, its first and last use, the links opened, manuals created, sections written and read, librarian messages, and its spend today, this month and in all; `--json` gives the same as a list |
| `library show <libraryId>` | `rtfm-read` | The same for one library, with its spend by day, and its manuals, each with its title and its written sections; `--json` gives the same |
| `library revoke <libraryId>` | `rtfm-ops` | Sets `revokedAt` on the library's link, then reads it back: `acme is revoked; the app refuses its link within a minute.`; `--json` gives `{ "libraryId": "…", "revokedAt": "…" }`. It exits 1 for a library already revoked, or one no link names |
| `usage` | `rtfm-read` | `npm run usage`'s report of `rtfm-usage`: today's and this month's Bedrock spend against the caps, by model and by job, the unsettled reservations and the kill switch; `--json` gives the same figures |
| `logs` | `rtfm-read` | The Web Function's log entries in CloudWatch (`/rtfm/app`), one line each as `npm run logs` prints them; `--json` gives the entries |
| `status` | `rtfm-read` | Each stack's status and termination protection (`RtfmToolkit`, `RtfmAccess`, `RtfmApp`, `RtfmEdgeCertificate` in `us-east-1`, `RtfmEdge`), the Web Function's state and its endpoint's auth type and state, each table's status, deletion protection and point-in-time recovery, today's and this month's Bedrock spend, and the kill switch; anything not deployed shows as `missing` |

```sh
npm run ops -- kill-switch on
npm run ops -- usage --json
curl -b "$(npm run -s ops -- passcode cookie)" https://rtfm.moonfetus.com/api/manuals
npm run ops -- logs --level warn --since 6h       # warnings and errors of the last 6 hours
npm run ops -- logs -e section -n 200             # the last 200 section events of the last day
npm run ops -- logs --library acme --since 7d     # the library acme's entries of the last week
npm run ops -- library list
npm run ops -- library show acme --json
npm run ops -- status
```

`logs` takes `npm run logs`'s filters, `--level` (`-l`), `--event` (`-e`), `--library` and
`--lines` (`-n`, 50 unless given), and `--since`, how far back to read: minutes, hours or days,
such as `90m`, `6h` or `2d` (`1d` unless given; CloudWatch keeps 30 days). It has no `--follow`.
Lines in the log group that aren't the server's entries, such as Lambda's own, are left out.

`kill-switch`, `usage` and `status` reach `rtfm-usage`, `passcode` reaches `rtfm-app`, and
`library` reaches both, with the AWS SDK, as the role: the AWS CLI gives the role's temporary keys
(`aws configure export-credentials`), so the SDK never reads `~/.aws` itself. The rest goes through the AWS CLI. The code is in `scripts/ops/`, and its tests
run offline: the items in DynamoDB Local, and a stand-in for the AWS CLI.

### Libraries

The `library` commands make, list, show and revoke the recipients' libraries (A library's link,
above). `create` and `revoke` read and write only the links' items in `rtfm-app`, as `rtfm-ops`;
`list` and `show` read the links, the activity and the recipients' manual lists in `rtfm-app`, and
the libraries' spend in `rtfm-usage`, as `rtfm-read` (`infra/README.md` › The identities). You make
and revoke libraries yourself, in a terminal outside the Claude app, whose Terminal panel a session
can read: agents never run `library create` or `library revoke` (`CLAUDE.md` › Shell).

```sh
npm run ops -- library create acme --label "Acme, staff engineer"
npm run ops -- library revoke acme
```

- **`create` prints the link once**, on standard output, and nothing keeps it: no other output,
  file or log holds it. Copy it straight away. A lost link can't be shown again: revoke its
  library and make another under a new id.
- **One link per library, one library per id.** `create` refuses an id any link names, revoked or
  not, so a revoked library's id is never given to another library. The id is a slug of at most
  63 characters (lowercase letters, digits and hyphens), never `admin`, the admin's library. The
  label is your own note on whom the link is for; only the ops tools show it.
- **The spend** is each day's committed spend of the library in `rtfm-usage`, the total its daily
  cap is checked against (Configuration, above): settled calls at what they cost, and an
  unsettled one at its worst case. Today and this month are UTC.
- **`show`** lists each manual in the library, the starters and any the recipient asked for, with
  its title and its written sections, from the manual list alone: never a section's body. The
  titles and the label are printed quoted, with every control character escaped, since a
  recipient's titles are text they chose.

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
- `link/<state>-<desktop|phone>.png`, for the link page's `opening`, `failed` and `closed` (the
  passcode screen with its closed line), opened with a secret no link has;
- `passcode/<state>-<desktop|phone>.png`, for the passcode screen's `start` and `wrong`, taken
  through a second API server and Vite server, with a passcode set. The pages' and the link's
  shots are taken with none, whatever `RTFM_PASSCODE` is.

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
`/read/:manualId` (a manual's contents) and `/read/:manualId/:sectionId` are the reader, `/l`
opens a library by its link (`/l#<secret>`) and `/admin` leaves it again (`src/link/`), and
anything else, bare `/read` included, redirects to `/`. The settings are in `server/config.ts`
(Configuration, above), and everything the server keeps is in its data folder (above).

What each folder of the code holds is in `ARCHITECTURE.md` › Codemap.
