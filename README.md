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

`ARCHITECTURE.md` describes the server, its API and the model gateway in full.

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
- If 8787 is taken, the API server fails to start and `node --watch` waits for a file change,
  while Vite keeps running. Free the port, then save a server file or restart `npm run dev`.

| Script            | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `npm run dev`     | Starts Vite (5173) and the API server (8787) together.               |
| `npm run server`  | Starts the API server alone, for `curl` or `npm run preview`.        |
| `npm test`        | Unit tests (Vitest). They never call Bedrock.                        |
| `npm run build`   | Type-checks everything and builds the app.                           |
| `npm run preview` | Serves the built app, with `/api` passed to a running `npm run server`. |
| `npm run shot`    | Screenshots both pages in every state, with its own dev server on port 5174. See below. |
| `npm run usage`   | Today's and this month's model spend, by model and by job. See below. |

## The models

`RTFM_MODELS` chooses who writes unwritten sections and who answers as the librarian:

- **`fake`** (the default). Nothing costs anything, and tests and screenshots always use it.
  - **The fake writer** replays the sample manual's own text for the section after 1.2s, about
    20 characters every 85ms. A section that has no sample text (every section of the other six
    manuals) gets a one-line placeholder instead, which streams like any section but is never
    saved: after a reload the section is unwritten again, and the library's count doesn't change.
  - **The fake librarian** is a scripted stand-in for the model. It picks what to do from a
    keyword in your message (list, find, open, delete, new, help), calls the same tools Claude
    would, against the real library, and streams its answer at the fake writer's pace. Asked for
    a new manual, it saves the same small nine-section manual, titled after what you asked for
    (“…about building a treehouse” plans *Building a Treehouse*). Anything else gets a polite
    “I can’t do that”.
- **`bedrock`**: Claude Haiku 4.5, through the model gateway, for both.
  - It writes a section live: about 4,200–5,000 characters in 12–15 seconds, for $0.007–0.010 a
    section.
  - It answers as the librarian in two to three model calls a reply (one per tool round), about
    $0.002–0.003 each.
  - It plans a new manual in one more call (two if the first plan fails its checks), about 20
    seconds and $0.016 for a plan of about 20 sections.

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

- `server/config.ts`: the data folder, the models, the spending caps ($2 a day and $20 a month,
  UTC), how many sections may be written and how many model calls may run at once, the 30s stall
  timeout (60s for planning a manual), each job's model and `max_tokens`, the length in words the
  prompt asks Claude for (`sectionWordsRequested`), and the length in characters a section's
  progress counts to while Claude writes (`sectionExpectedCharacters`). The API port is in
  `server/ports.ts`.
- `server/gateway/prices.ts`: the dated price table. The server refuses to start with a model
  that isn't in it.

Before each model call, the gateway reserves the call's worst case (its whole prompt plus
`max_tokens` at the model's price, about $0.025 for a section). If that would cross the daily or
monthly cap, the call is refused, nothing is charged, and the reader shows "budget reached" (the
librarian's reply says its budget is used up).
After the call, the reservation is settled to what it really cost.

To try a different setting without changing the committed one (a tiny cap, say), call
`startServer({ ...config, caps: { dailyUsd: 0.001, monthlyUsd: 20 } })` from a scratch script,
as `scripts/shot.ts` does for its own settings.

## The data folder and spending

The server keeps everything in `.data/` (gitignored). When it starts, it seeds each manual in
`server/seed/` that it hasn't seeded before: the sample, *The Haunt That Listens*, with 7 of its 18
sections written, and six more with a table of contents and nothing written. A manual you delete
stays deleted, and a manual already in `.data/` is left as it is.

- `.data/manuals/<manualId>/`: a manual (`manual.json`) and one `sections/<id>.md` per written
  section. A section is written when its file exists. To have one written again, stop the
  server, delete its file, and start the server again.
- `.data/seeded.json`: the ids of the seed manuals already seeded. To reset every manual to the
  seed, stop the server, delete `.data/manuals/` and `.data/seeded.json`, and start it again.
- `.data/ledger/<yyyy-mm>.jsonl`: the usage ledger, one line per model call reserved and settled.
  The caps are computed from it, so **never delete or edit it**.
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

`npm run usage` prints today's and this month's spend against the caps, by model and by job,
with counts of aborted, failed and estimated calls, any unsettled reservations, and whether the
kill switch is on. `npm run usage -- <dataDir>` reads another data folder. A call cut short (the
reader closed the tab, the model stalled) is charged at its full `max_tokens` and marked
estimated, because the stream doesn't say what was billed after the cut.

Only one server should use a data folder at a time: the caps are checked in the server's memory.

## Screenshots

`npm run shot` starts its own API server with the fake models on a temporary data folder, so it
never touches `.data/` or Bedrock. It clears `shots/`, then writes:

- `shots/reader/<state>-<desktop|mobile|desktop-reduced>.png`, for the states `start`, `toc`,
  `written`, `dense`, `waiting`, `streaming`, `streaming-full`, `appendix`, `budget` and `error`
  (`desktop-reduced`, with reduced motion, only for `start` and `streaming`);
- `shots/home/<state>-<desktop|phone>.png`, for the landing page's states (listed in
  `DESIGN.md`, under "States").

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
- `src/agent/`: the librarian's conversation. It sends the conversation to the librarian on the
  server and streams back each reply. Its README documents the API and the URL options.
- `server/`: the API server, storage, the section writers, the librarian agent and the model
  gateway. The seven seed manuals are in `server/seed/`. `ARCHITECTURE.md` documents it.
- `scripts/`: the `shot` script (`shot.ts`, with the capture helpers in `screenshots.ts`).
- `research/`: dated research for the back-end, each opening with what was adopted:
  `bedrock-models.md` (which Bedrock models to use), `aws-hosting.md` (Claude Platform on AWS and
  the AgentCore harness) and `lambda-and-dynamodb.md` (running the server on Lambda and
  DynamoDB).
- `ARCHITECTURE.md`: the server, the API, storage, the writers, the gateway, the librarian and
  configuration.
- `DESIGN.md`: the design of both pages: their rules, tokens, layout and behavior.
- `WORKLIST.md`: the task list.
- `CLAUDE.md`: the overview, the shell and credentials rules, and the code standards.
