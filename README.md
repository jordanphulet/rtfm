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

- `ARCHITECTURE.md`: the server, its API, storage, the section writers, the model gateway, the
  agent loop, the librarian, configuration, logs and the reader's store.
- `DESIGN.md`: the design of both pages: their rules, tokens, layout and behavior.
- `src/*/README.md`: the API of each shared folder in `src/` (`librarian`, `library`, `manual`, `ui`).
- `PROCESS.md`: how work happens: the roles, where state lives, who approves rule changes, and
  the orchestrator's protocol.
- `WORKLIST.md`: the phases and tasks, with each task's status.
- `research/`: dated research for the back-end, each opening with what was adopted:
  `bedrock-models.md` (which Bedrock models to use), `aws-hosting.md` (Claude Platform on AWS and
  the AgentCore harness) and `lambda-and-dynamodb.md` (running the server on Lambda and
  DynamoDB).
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

The API server listens on `127.0.0.1` only; `ARCHITECTURE.md` › The API has the checks it makes.

| Script            | What it does                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `npm run dev`     | Starts Vite (5173) and the API server (8787) together.                       |
| `npm run server`  | Starts the API server alone, for `curl` or `npm run preview`.                |
| `npm test`        | Tests (Vitest; page and component tests in happy-dom). Never call Bedrock.   |
| `npm run build`   | Type-checks everything and builds the app.                                   |
| `npm run preview` | Serves the built app, passing `/api` to `npm run server` on 8787.            |
| `npm run shot`    | Screenshots both pages in every state; `--compare` diffs against a baseline. |
| `npm run usage`   | Today's and this month's model spend, by model and by job. See below.        |
| `npm run logs`    | The server's recent log entries, filtered or followed. See below.            |

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

`ARCHITECTURE.md` › Configuration has the rules.

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
  (`ARCHITECTURE.md` › Configuration has the table):
  - It writes a section live: about 4,200–5,000 characters in 12–15 seconds, for $0.007–0.010 a
    section.
  - It answers as the librarian in one model call per turn, usually two or three a reply,
    $0.002–0.004 each.
  - It plans a new manual in one more call (two if the first plan fails its checks): 21.3s and
    $0.0164 for a plan of 23 sections.

To switch to Claude:

1. The AWS account needs Amazon Bedrock access to Claude Haiku 4.5 through its `global.`
   inference profile (`global.anthropic.claude-haiku-4-5-20251001-v1:0`).
2. Put its keys in `.env.local` at the repo root (gitignored):

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

## Configuration

Everything but the credentials is committed:

- `server/config.ts`: the data folder (`RTFM_DATA_DIR` overrides it), the port (`RTFM_PORT`
  overrides it), the models (`RTFM_MODELS`), the spending caps ($2 a day and $20 a month, UTC),
  how many sections may be written and how many model calls may run at once, the 30s stall
  timeout (60s for planning a manual), each job's model and `max_tokens`, the most model turns one
  librarian reply may take (8), the length in words the prompt asks Claude for
  (`sectionWordsRequested`), and the length in characters a section's progress counts to while
  Claude writes (`sectionExpectedCharacters`). The default API port is `API_PORT` in
  `server/ports.ts`.
- `server/gateway/prices.ts`: the dated price table. With `RTFM_MODELS=bedrock`, the server
  refuses to start with a model that isn't in it.

The gateway refuses a model call that could cross the daily or monthly cap: nothing is charged,
and the reader shows "budget reached" (the librarian's reply says its budget is used up). How it
reserves each call's worst case and settles it afterwards is in `ARCHITECTURE.md` › The model
gateway.

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
`ARCHITECTURE.md` › Storage.

`npm run usage` prints today's and this month's spend against the caps, by model and by job,
with counts of aborted, failed and estimated calls, any unsettled reservations, and whether the
kill switch is on. `npm run usage -- <dataDir>` reads another data folder. A call cut short (the
reader closed the tab, the model stalled) is marked estimated; what it is charged is in
`ARCHITECTURE.md` › The model gateway.

## Logs

The server logs one JSON line per event, both to its standard output (the terminal running
`npm run dev` or `npm run server`) and to `logs/<yyyy-mm-dd>.jsonl` in its data folder, one file
per UTC day. The browser's uncaught errors and failed API requests reach the same log. The line's
shape, how long files are kept, and what is and isn't logged are in `ARCHITECTURE.md` › Logs.

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
- `home/<state>-<desktop|phone>.png`, for the landing page's states (listed in `DESIGN.md`,
  under "States").

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

- `src/App.tsx`: the routes. `/` is the landing page, `/read/:manualId` (a manual's contents) and
  `/read/:manualId/:sectionId` the reader; anything else, bare `/read` included, redirects to `/`.
  Both pages are loaded lazily.
- `src/home/`: the landing page.
- `src/reader/`: the reader.
- `src/ui/`: the shared design system (tokens, fonts, base styles, the write head, components),
  used by both pages. Its README documents it.
- `src/manual/`: the reader's store, which reads a manual from the API and streams sections from
  it, and the markdown renderer. Its README documents the API.
- `src/library/`: the landing page's store, which loads the library from the API and deletes
  through it. Its README documents the API.
- `src/librarian/`: the librarian's conversation. It sends the conversation to the librarian on the
  server and streams back each reply. Its README documents the API and the URL options.
- `src/reportErrors.ts`: reports the browser's errors and failed API requests to the server's log.
- `server/`: the API server, storage and the data folder's lock, the section writers, the agent
  loop, the librarian and its planner, the model gateway, and the logger. The seven seed manuals
  are in `server/seed/`. `ARCHITECTURE.md` documents it.
- `scripts/`: the `shot` script (`shot.ts`, with the capture helpers in `screenshots.ts`).
