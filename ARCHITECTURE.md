# RTFM — architecture

A local Node server stores the manuals and their sections. It writes unwritten sections, with a fake
writer or with Claude Haiku 4.5 on Amazon Bedrock, and streams them to the reader. The librarian on
the landing page is an agent: an agent loop runs a model with the library's tools over several
turns, with a scripted fake model or with Claude Haiku 4.5. Asked for a new manual, it hands the
request to a planner, which has the model plan the manual and saves it. Every Bedrock call,
including each turn of the loop and each plan, goes through one gateway that caps spending.

`README.md` covers running the app, the data folder and its kill switch, resetting the manuals, and
what the models cost; this doc covers how the server works.

```
browser (Vite, :5173)                        server (node:http, :8787)
  src/library store ┐
  src/manual store ─┤
  src/agent store  ─┴ /api (Vite proxy) ──▶  api/ routes ──▶ writer/runs ──▶ fake writer
                                                  │                    └──▶ Bedrock writer ──▶ gateway ──▶ Bedrock
                                                  ├──▶ librarian ──▶ agent loop ──▶ fake librarian model
                                                  │       └──▶ planner          └──▶ gateway ──▶ Bedrock
                                                  └──▶ storage/ (manuals, sections, ledger: files in .data/)
```

## 1. The server

The server lives in the top-level `server/` folder, next to `src/` and `scripts/`. It runs as
TypeScript directly on Node 22.18+, as `scripts/` does, with its own `tsconfig.server.json`
(`module: nodenext`, `allowImportingTsExtensions`, `noEmit`, the same strict flags), referenced from
`tsconfig.json`.

```
server/
  main.ts                 starts the server from config.ts (npm run server)
  dev.ts                  npm run dev: Vite plus `node --watch server/main.ts`
  config.ts               committed settings (section 8)
  ports.ts                API_PORT, alone, so Vite's config can import it
  app.ts                  startServer(config, replaced?): locks the data folder; storage, models, gateway, routes;
                          close() waits for model calls to settle
  testing.ts              helpers shared by the tests: temp folders, fast fake writers, the test model's prices and
                          gateway config (testGatewayConfig), collect, and readEvents for server-sent events
  usage.ts                npm run usage
  logs.ts                 npm run logs (section 9)
  escape-tags.ts          escapes `<` in text inserted in a prompt (the section writer's and the planner's)
  api/
    types.ts              the API contract shared with the browser (section 2)
    route.ts              Route, ApiRequest, EventSink: what handlers see
    node-adapter.ts       node:http ⇄ ApiRequest, the local-only checks, JSON responses, the event stream
    lookup.ts             finds a manual that has a given section
    library.ts            GET /api/manuals
    manual.ts             GET /api/manuals/:manualId
    delete-manual.ts      DELETE /api/manuals/:manualId
    section.ts            GET /api/manuals/:manualId/sections/:sectionId
    section-stream.ts     GET /api/manuals/:manualId/sections/:sectionId/stream
    librarian.ts          POST /api/librarian: the librarian's reply to a conversation (section 7)
    preview.ts            ?freeze, ?fail and ?library=empty: canned, never stored, never billed
    client-errors.ts      POST /api/client-errors: logs what the browser reports (section 9)
  storage/
    types.ts              ManualStore, UsageLedger
    file-manual-store.ts  manuals and sections as files
    file-ledger.ts        the usage ledger as JSON lines
    files.ts              reads a file or folder that may not exist; creates a file only if it doesn't exist
    lock.ts               the data folder's lock: one server per folder
    manual.ts             a manual's chapters and sections in reading order; the id pattern
    seed.ts               seeds each manual in server/seed/ once
  seed/<manualId>/
    manual.json           a TOC, a voice, and which sections start written
    sections/*.md         bodies (only the sample, the-haunt-that-listens, has them: all 18)
  writer/
    types.ts              SectionWriter, WriteFailed
    runs.ts               one run per section; later requests join it
    fake.ts               plays the seed body at a steady pace
    bedrock.ts            writes through the gateway, choosing an example section
    prompt.ts             builds the prompt
    section-text.ts       holds back the opening, typesets quotes and yields whole words
    typographic-quotes.ts curly quotes and apostrophes, outside code and link targets
    code-fences.ts        where a fenced code block opens and closes
    validate.ts           cheap output checks
  agent/
    loop.ts               runAgent: model turns and tool calls through the gateway (section 6)
    tool.ts               defineTool: a tool's schema, status line and handler
    scripted-client.ts    a fake ModelClient that plays scripted turns, tool calls included
    librarian/            the librarian agent (section 7)
      reply.ts            sendReply: runs the loop on a conversation and sends the reply's events
      prompt.ts           the system prompt
      tools.ts            list, find, open and propose a delete
      create-manual.ts    the create tool, which hands the request to the planner
      find.ts             findManuals: manuals that match a topic
      fake-model.ts       the scripted fake model (the librarian's and the planner's)
    planner/              plans a new manual and saves it (section 7)
      plan.ts             planManual: one plan, one retry, then save
      prompt.ts           the system prompt, the request message and the save_manual tool
      check.ts            the plan's schema and checks
      fake-planner.ts     the fake model's plan
  gateway/
    types.ts              ModelClient, ModelPrompt, ModelEvent, GatewayConfig, refusal errors
    gateway.ts            caps, reservations, concurrency, idle timeout, kill switch, ledger
    ledger-calls.ts       pairs reserve and settle entries into calls (replay and usage)
    prices.ts             the dated price table, cost and worst-case cost
    credentials.ts        reads the AWS keys from .env.local
    bedrock-client.ts     the only file that imports @anthropic-ai/bedrock-sdk
    usage-report.ts       formats npm run usage
    sdk-boundary.test.ts  fails if anything else imports the SDK or the client
  logging/                the logger (section 9)
    logger.ts             createLogger, the line's shape, standard output and standard error
    log-file.ts           the daily log files in the data folder, and their retention
    log-reader.ts         reads, filters and formats entries for npm run logs
```

Tests sit next to the code (`*.test.ts`) and never call Bedrock. Any test that starts a server
binds port 0. Tests that race a timer against real time leave wide margins (a pause meant to stay
inside a timeout is at most a quarter of it, one meant to outlast it at least twice as long), so
they hold when several test runs share the machine.

**Running it**

- `npm run dev` runs `node server/dev.ts`. It spawns `vite` and `node --watch server/main.ts`,
  with their output passed through.
  - It forwards SIGINT and SIGTERM to both children and waits for both to exit before it exits
    itself.
  - If one child exits or fails to start, it sends the other SIGTERM, so nothing is left holding
    port 5173.
  - It is a separate process, not a Vite plugin, so the server runs the same way in development
    as it does alone (`npm run server`).
- The server listens on `127.0.0.1` only and answers only this machine's own pages (section 2).
- `vite.config.ts` adds `server.proxy` and `preview.proxy`, sending `/api` to
  `http://127.0.0.1:8787` (not `localhost`, which can resolve to `::1`, where nothing listens).
  - `changeOrigin: false` passes the browser's `Host` (`localhost:5173`) and `Origin` through
    unchanged, so the server checks the browser's own headers and can tell a DNS-rebound page
    from the app. Vite's own `allowedHosts` check also refuses other hosts before the proxy runs.
  - When the API server's response closes before it is complete (the server stopped or restarted
    mid-section), the proxy's `configure` hook destroys the browser's response too, so the
    reader's stream fails with "couldn't write this section" instead of hanging.
- `vite.config.ts` imports `API_PORT` from `server/ports.ts`, so the port is written down once.
  That module holds only constants, because Vite restarts and reloads the page whenever a file
  its config imports changes; importing `server/config.ts` would reload the page on every edit to
  it. For the same reason it sets `envDir: false` (the browser code reads no `import.meta.env`, so
  a `.env*` change, `.env.local` included, means nothing to it) and
  `server.watch.ignored: ["**/.data/**"]`, so the data folder's writes never reach Vite's watcher.
- `npm run server` runs the server alone, for `curl` and `npm run preview`. `RTFM_DATA_DIR` and
  `RTFM_PORT` (section 8) run it on another data folder or port.
- `main.ts` logs to standard output and to the data folder's log file (section 9). Its first
  line, `server.started`, says `API server on http://127.0.0.1:<port>` and the model source.
  - On SIGINT and SIGTERM it closes the server and then exits. `close()` closes every connection,
    which aborts the sections being written and the librarian's replies; waits until the gateway
    is idle (section 5); then releases the data folder's lock (section 3) and logs
    `server.stopped`. Under `npm run dev` the signal comes from Ctrl-C, `dev.ts` forwarding one, or
    `node --watch` restarting the server after an edit.
  - If the folder is in use, the refusal is logged (`server.refused`) and `main.ts` exits with
    code 1; under `npm run dev`, `node --watch` then waits for a file change and Vite keeps
    running without an API server. Any other failure to start is logged as
    `server.start-failed`, and an uncaught exception or unhandled rejection as `server.crashed`;
    both exit with code 1.
  - It exits only once standard output has taken every line, since a pipe may still hold some.
- `.claude/launch.json` runs `npm run dev`.
- `npm run shot` starts the server in process with `startServer({ ...config, port: 0,
  dataDir: <temp dir>, models: "fake" })` and points its Vite proxy at it
  (`http://127.0.0.1:<port>`, also with `changeOrigin: false`). Every run starts from
  the seed and never touches `.data/` or Bedrock.

**Plain handlers.** Handlers import only `api/route.ts`, never `node:http` or the Node adapter,
so they don't depend on how they are served. A `Route` has a `method`, a `pattern` and a
`handle(request)` that gets the route's `params`, the `query`, the parsed JSON `body` (undefined
when there is none) and a `signal` that aborts when the client disconnects. It answers with a JSON
response or an event stream, a function given an `EventSink` that ends the stream when it
resolves; the choice is made inside `handle`, so a stream route can still answer `404`.

Before any route is matched, the Node adapter refuses a request from anywhere but this machine's
own pages (section 2), then reads the body, up to 262,144 characters: one that is too long or
isn't JSON gets `400 { error: "Bad request" }`. Then it:

- matches `method` exactly, and `pattern` by splitting the path on `/`;
- turns `res.on("close")` into the `AbortSignal`, and logs the request then (section 9);
- writes the SSE headers (`content-type: text/event-stream`, `cache-control: no-cache`);
- writes a response whose `body` is `undefined` with no body and no content type (`noContent`, 204).

## 2. The API

The wire types live in `server/api/types.ts`. The browser imports them with `import type`:
`src/manual/types.ts` re-exports the manual's types, `src/library/types.ts` re-exports
`ManualSummary`, and `src/agent/types.ts` the librarian's. The one value the browser imports is
`LIBRARIAN_LIMITS`, which the file defines with no imports, so nothing else from `server/` reaches
the bundle.

- **A `Manual`** is its id, title, subtitle, chapters and appendices, each chapter a list of
  sections with a label, title, summary and status (`unwritten`, `writing` or `written`). It has
  no voice and no bodies. **A `ManualSummary`** is what the library lists: the id, title,
  subtitle, and the chapter, section and written counts.
- **A section stream** sends `append` (`at`, `text`, `progress`), then `written`, `frozen` or
  `failed` (`reason`: `"budget"` or `"error"`).
- **The librarian** takes `LibrarianMessage`s (`user` or `agent`, their text, and on an `agent`
  message an optional `deleteOutcome`) and streams `LibrarianEvent`s: `status`, `text`,
  `withdraw`, `action` (a `PageAction`: `open`, `propose-delete` or `created`), `done`, `frozen`
  (previews only) and `failed` (section 7).

| Route | Response |
| --- | --- |
| `GET /api/manuals` | `200 ManualSummary[]`, every manual in storage, sorted by title |
| `GET /api/manuals/:manualId` | `200 Manual` (`writing` while a run is active), or `404` |
| `DELETE /api/manuals/:manualId` | `204` (no body), `404`, or `409 { error }` while a section of it is being written |
| `GET /api/manuals/:manualId/sections/:sectionId` | `200 { status, body? }`, with the body only when written, or `404` |
| `GET /api/manuals/:manualId/sections/:sectionId/stream` | `text/event-stream` (below), or `404` |
| `POST /api/librarian` with `{ messages: LibrarianMessage[] }` | `text/event-stream` of `LibrarianEvent`s (section 7), or `400` |
| `POST /api/client-errors` with a `ClientErrorReport` | `204`, `400`, or `429` past the hourly limit (section 9) |

Any other path or method gets `404 { error: "Not found" }`, and a handler that throws gets
`500 { error: "Internal error" }` (or, once a stream has started, the stream just ends).

**Only this machine's own pages.** The API deletes manuals and spends the model caps, so it
answers nobody but the app's pages on this machine. The server listens on `127.0.0.1` only, and
the Node adapter refuses, before matching any route:

| Request | Response |
| --- | --- |
| `Host` isn't `localhost`, `127.0.0.1` or `[::1]` (any port) | `403 { error: "Host not allowed" }` |
| `Origin` is sent and isn't `http://localhost`, `http://127.0.0.1` or `http://[::1]` (any port) | `403 { error: "Origin not allowed" }` |
| A body without `content-type: application/json` (a `charset` is fine) | `415 { error: "Body must be application/json" }` |

A request with no `Host` at all is refused by Node itself, with `400`.

- **The `Host` check** stops DNS rebinding: a site whose name is pointed at `127.0.0.1` still
  sends its own name as `Host`.
- **The `Origin` check** stops another site's page. Its POST, its DELETE, and its `fetch` or
  `EventSource` on a section stream all carry its `Origin`, so the stream is refused before a run
  starts, not after CORS has let it start a paid run. A missing `Origin` is
  allowed: the browser leaves it off same-origin GETs, the reader's `EventSource` included, and
  `curl` sends none.
- **The content type** backs up the `Origin` check. Another site's page can send a form or a
  `text/plain` POST without a CORS preflight, but not `application/json`, so no body from another
  site reaches a route even if its `Origin` were missing. (Its preflight `OPTIONS` carries its
  `Origin` and gets `403`.)
- **The app's own requests pass.** Through Vite's proxy they arrive with the page's `Host`
  (`localhost:5173`) and, on the librarian's POST, its `Origin` (`http://localhost:5173`); the
  library's DELETE has no body.

**The library** (`api/library.ts`). A summary's counts come from storage, never from the seed:

- `chapterCount` counts chapters and appendices;
- `sectionCount` counts every section in the table of contents;
- `writtenCount` counts the sections that have a stored body. A section being written counts once
  it is saved.

Titles are sorted with `localeCompare(…, "en")`, so "The Haunt That Listens" sorts under T.

**A manual** (`api/manual.ts`). Its sections' statuses come from one `writtenSectionIds` read, as
the library's counts do, and never from the bodies. A section is `writing` if it has a run in
progress (`runs.writingSectionIds`, taken before the read), otherwise `written` if it has a stored
body, otherwise `unwritten`.

**Deleting a manual** (`api/delete-manual.ts`) removes its table of contents and every written
section. Nothing else is touched: not the ledger, not the seeding record (section 3), so a deleted
seed manual stays deleted.

- **It refuses while writing.** If any section of the manual has a run in progress
  (`runs.isWriting`), the answer is `409 { error: "A section of this manual is being written" }`
  and nothing changes. The reader keeps streaming, and the caller can try again once the section
  is written. Stopping the runs instead would mean sending their readers a failure and paying for
  calls cut short, for a delete that can simply wait a few seconds.
- **A run that starts while the delete is under way** can't bring the manual back. The store
  removes the manual's folder in one `rename`, and `saveBody` refuses a manual that doesn't exist.
  Such a run either saved before the rename, and its body is deleted with the rest, or ends with
  `failed: "error"` and stores nothing. A run that starts in the narrow window between the check
  and the rename may still call the writer, possibly a paid Bedrock call, before it fails at
  `saveBody`. That is rare, and bounded by one section's `max_tokens`.
- A run's finished `written` entry may stay in the runs map after a delete. That is harmless:
  statuses are read from storage for any section not being written.

The reader suspends on the JSON section route. If the section is written, it renders the body and
never opens a stream. Otherwise it opens the stream with `EventSource`.

- **Unwritten:** the stream starts a run (section 4). `append` events follow as text arrives,
  then `written` or `failed`, and the server ends the stream.
- **Already being written (joining):** the first `append` carries everything so far (`at: 0`),
  and after that the joiner gets the same events as everyone else. `at` is the offset of `text`
  in the body, which is only needed for that backlog. Two tabs show the same text.
- **Written by the time the stream opens** (another tab finished it): one `append` with the whole
  body, then `written`.
- **`written` carries nothing.** The stored body is exactly the text that was streamed, so the
  client never replaces text it has already shown.
- **`progress`** (0–1) comes from the writer: exact for the fake, estimated for Claude.
- **`failed`** is sent when the run ends without a body. The section goes back to `unwritten` on
  the server, and the reader shows one of its two failure states:
  - `"budget"`: **budget reached**. A cap would be crossed, or the kill switch is on.
  - `"error"`: **couldn't write this section**. Bedrock failed, the stream stalled, the output
    failed validation, `stop_reason` was `max_tokens` or `refusal`, or too many sections were
    already being written.
- **The client never reconnects**, because reconnecting would pay for a second run, and it retries
  only when the reader asks. How the browser reads the stream is in `src/manual/README.md`.
- **Preview options**, for screenshots: `?freeze=<0–1>` and `?fail=budget|error` on a stream,
  `?library=empty` on `GET /api/manuals`, and `?freeze=<0–1>` on `POST /api/librarian` (section 7).
  - `api/preview.ts` handles them before any run, writer or storage write is touched, so they cost
    nothing and change nothing, whichever models are configured.
  - One parser (`previewFraction`) reads `?freeze` for both routes: anything but a number from 0
    to 1 gets `400 { error: "Bad request" }`, on a stream whether or not the section is written.
  - **Empty library** answers `200 []`, so the landing page's empty state can be shown without
    deleting anything.
  - The stream options only apply to sections that aren't written.
  - **Freeze** cuts the seed body at the last chunk end at or before the fraction (`cutAt` in
    `api/preview.ts`). It sends one `append` (none for 0) with `progress = cut / body.length`, then
    `frozen`, and ends the stream. The client closes the source and stays in the writing state.
    The stream must end, because `npm run shot` waits for `networkidle`.
  - **Fail** sends `failed` with that reason.

```
event: append
data: {"at":0,"text":"My dear builder, the room ","progress":0.01}

event: append
data: {"at":26,"text":"controller is the brainstem ","progress":0.02}

event: written
data: {}
```

## 3. Storage

Two narrow interfaces in `server/storage/types.ts`, so the gateway only ever sees the ledger:

- **`ManualStore`** lists, gets, creates and deletes manuals, gets and saves section bodies, lists
  a manual's written section ids, and keeps the seeding record. It stores `StoredManual`: the
  `Manual` fields plus `voice`, with no statuses and no bodies.
- **`UsageLedger`** appends an entry (into the file for its `reservedAt` month) and reads a
  month's entries (`"2026-10"`, UTC).

The local files live in `.data/` (gitignored). Tests and the shot script pass a temp `dataDir`.

```
.data/manuals/<manualId>/manual.json         StoredManual
.data/manuals/<manualId>/sections/<id>.md    one file per written section
.data/seeded.json                            the ids of the seed manuals already seeded
.data/ledger/2026-10.jsonl                   one JSON line per ledger entry, append-only
.data/STOP                                   the kill switch (section 5)
.data/server.lock                            the PID of the server using the folder
.data/logs/2026-10-12.jsonl                  the server's log for one UTC day (section 9)
```

- **One server per data folder, enforced.** `startServer` first calls `lockDataFolder`
  (`storage/lock.ts`), which creates `server.lock` holding the process's PID with
  `createExclusively` (`storage/files.ts`). That writes the PID to a temp file and `link`s it into
  place; `link` fails if the lock exists, so of two starts only one wins, and the lock is never
  seen empty.
  - **Held by a running process** (checked with `process.kill(pid, 0)`, where `EPERM` also means
    running): `startServer` throws `DataFolderInUse`, whose message names the folder and the PID.
    This includes a second start in the same process, as in the tests.
  - **Left by a process that has ended, or holding no PID:** it is removed and the create is
    tried again, so the lock is taken over. Two starts that find the same stale lock at the same
    moment can both take it over: one removes the lock the other has just created.
  - **A PID reused** by an unrelated process makes a stale lock look held; the message names the
    PID, and the lock file can be deleted once no server is using the folder.
  - **Released** when `close()` has closed the server and the gateway is idle, and when
    `startServer` fails after taking it (a model not in the price table, a port in use). A process
    killed without a chance to close (SIGKILL, a crash) leaves its lock, which the next start
    takes over.
- **Written sections:** a section is written when its `.md` file exists, so there is no status
  to keep in sync.
- **`createManual`** makes the manual's folder with a plain `mkdir`, which fails if the folder
  exists, so a manual is never replaced: an id that is taken gets `"exists"` and nothing changes.
  It then writes `manual.json` through a temp file and a `rename`; if that write fails, it removes
  the folder again, so the id isn't left taken by an empty folder. The seed and the planner both
  create manuals through it, and seeding throws if a seed manual's id turns out to be taken.
- **`saveBody`** creates the section's file with `createExclusively`, as the lock is created: a temp
  file, then a `link` into place. `link` fails if the file already exists, so a section can't be
  written twice (it answers `"already-written"`). It throws if the manual doesn't exist, rather
  than creating its folder, so a late write can't leave a deleted manual's sections behind.
- **`listManuals`** reads every folder in `manuals/` whose name is a slug and has a
  `manual.json`.
- **`deleteManual`** renames the manual's folder to `<manualId>.<uuid>.deleting`, which isn't a
  slug and so is never listed, then removes it; a missing manual is nothing to do. The manual
  disappears in that one step. If the removal fails part-way, the failure is logged and the delete
  still succeeds: the manual is already gone, and the leftover folder is ignored.
- **`markSeeded`** rewrites `seeded.json` through a temp file and a `rename`.
- **A line cut off by a crash.** A crash mid-append can leave a last line with no newline.
  - Reading skips any line that doesn't parse, wherever it is, and logs a `ledger.line-skipped`
    warning naming the file and line (on standard error for `npm run usage`), so neither the
    gateway's replay nor `npm run usage` throws on it.
  - Skipping is safe for the caps. A `reserve` is awaited before the model is called, so a cut-off
    `reserve` means no call was made. A cut-off `settle` leaves its `reserve` unsettled, counted at
    its worst case.
  - `append` writes a newline first when the file doesn't end in one, so the next entry starts its
    own line.
- **Seeding:** on start, `seedStore` seeds each manual in `server/seed/` once. The store keeps a
  record of the seed manuals it has seeded (`seededManualIds`), and for each seed manual not in
  it:
  - if the store has no manual with that id, it puts the TOC, then saves the bodies of the
    sections the seed marks written (the sample's 7 of 18; none for the others);
  - if the store already has a manual with that id, it leaves it exactly as it is, written
    sections included;
  - either way, it then records the id.

  So a seed manual added to `server/seed/` is seeded on the next start, and a deleted seed
  manual stays in the record and is never seeded again. A crash after the TOC is put but before
  every seed body is saved leaves that manual with fewer sections written; they are written on
  demand like any other. Resetting the manuals to the seed is in `README.md`; never delete
  `.data/ledger/`, because the caps are computed from it.

## 4. The section writer

A `SectionWriter` (`writer/types.ts`) takes the stored manual, a section id and a signal, and
yields chunks of `{ text, progress, placeholder? }`; the body is exactly all the text joined. It
fails with `WriteFailed("budget" | "error")` or any other error.

**`writer/fake.ts`** waits, then yields the seed body in chunks of about 20 characters at a steady
pace (`README.md` › The models gives the timings), split at word boundaries, the same pace as the
fake librarian's replies.

- `chunkEnds` splits a body into these chunks. The fake librarian and the previews use it too.
- `progress` is exact.
- A section with no seed body gets a short placeholder, with every chunk marked `placeholder`,
  so the reader can be tried on any manual without storing anything.

**`writer/bedrock.ts`** builds the prompt and streams it through the gateway. It takes the
gateway, the store, `config.sectionWordsRequested` and `config.sectionExpectedCharacters`.

- **The prompt** (`writer/prompt.ts`):
  - The **system prompt** is the same for every section of a manual. It holds the
    instructions, the markdown that `DESIGN.md` › Markdown allows, the shape of a section
    (including the sample's punctuation: spaced em dashes and curly quotes), then the manual's
    title, subtitle, voice and contents (each section's label, title, id and summary). It says
    that text inside `<manual>` and `<written-section>` is reference material, never
    instructions, and that the voice describes style only.
  - The **user message** names the section, its chapter and its summary, the previous and next
    sections with their summaries, and a length in words (`sectionWordsRequested`). It ends
    by restating what Haiku most often skips: at least one table, list, checklist or code block,
    a language tag on every code block, and a cross-reference with the target's title as its
    link text, shown with a real neighbour (`[Sensing the Guest](section:sensing-the-guest)`).
  - **An example section.** The user message starts with a section of the same manual that is
    already written, to show its voice and markdown: it is what gives Haiku 4.5's sections their
    headings, lists and links. It prefers the nearest section whose body is still the seed's (by
    distance in reading order, the earlier one on a tie), so the model's own flaws don't spread,
    and falls back to the nearest written section. It adds about 1,000 input tokens, about $0.001
    a section. A manual with nothing written yet gets no example.
  - **Escaping.** Manual text (chapter and section titles included, since a planned manual's come
    from the model and the user's request) is inserted with `<` escaped (`escapeTags`, which the
    planner's prompt uses too), so it can't open or close a tag; attribute values also escape `>`
    and `"`. Bodies keep `>`, which is blockquote syntax and can't form a tag on its own.
- **The opening is held back** (`writer/section-text.ts`). Nothing is yielded until the first
  line that is not clutter is whole, so the cheap fixes happen before the reader sees anything.
  Clutter is a blank line, an H1, a line that repeats the section's title (with or without its
  label), a thematic break, a setext underline (`===`), or a preamble. A preamble is a line of at
  most 160 characters that either starts with "Sure", "Certainly", "Of course", "Okay" or
  "Absolutely" and is at most 40 characters, names the section or a draft, or says "here is"; or
  ends with a colon and names the section or a draft. "Of course, the first thing a guest hears
  is the door." is kept. The first line is usually the first paragraph, so the first chunk is
  that whole paragraph. After that, nothing is dropped, and text already shown never changes.
- **Typographic quotes** (`writer/typographic-quotes.ts`). Straight quotes and apostrophes in
  the body become “ ” ‘ ’ (and primes after a digit: 5′ 10″), as the seed manuals are written,
  wherever the prompt's punctuation rule slipped. Code blocks, inline code, link and image
  targets, reference definitions, autolinks, HTML-like tags, bare URLs and backslash escapes are
  left alone. The body (after the opening, before whole words are cut) is typeset as a whole each
  time text arrives. Each quote is decided by the text before it and the rest of its word, and
  whole-word yielding shows a word only once the whitespace after it has arrived, so a quote is
  final before it is shown: nothing extra is held back, and the stored body is exactly the
  streamed text. The rules are in the module and its tests, which also check that the seed
  bodies, with their quotes made straight, come back exactly.
- **Whole words only.** It yields only up to the last whitespace and holds back the rest until
  more arrives or the stream ends. Chunks therefore end on whole words, like the fake's. Bedrock
  sends small deltas, so a section arrives as a few hundred `append` events.
- **Late failures.** Problems found at the end (`writer/validate.ts`, which ignores code) throw
  `SectionRejected`, a plain `Error` that names them, so `runs.ts` logs it and sends `failed:
  "error"`. The streamed text is discarded, and the unshown tail is never sent:
  - a `stop_reason` other than `end_turn` (`max_tokens`, `refusal`, …);
  - an empty section (a section that is only a code block is not empty), or an H1 anywhere;
  - a footnote reference without a definition (labels match without regard to case, and
    definitions may be indented up to three spaces);
  - a `section:` link to an id that doesn't exist, or to the section being written, in any form:
    inline, titled, in angle brackets, or as a reference definition.

  A fence closes only on a line of the same character, at least as long, with nothing after it,
  so a four-backtick `text` block holding a three-backtick `json` block and a `# Role` line is
  still code.
- **Failure reasons.** Only the gateway's `SpendingRefused` (a cap or the kill switch) becomes
  `WriteFailed("budget")`. The gateway throws it before reserving or calling anything, so
  "budget" always means nothing was charged. Everything else reaches `runs.ts` as is and becomes
  `"error"`.
- **Progress** is `min(0.99, characters shown / config.sectionExpectedCharacters)`. It is a
  separate setting from the words requested because Haiku 4.5 writes past the length it is asked
  for (section 8's measurements). Set near what it writes, progress usually ends a little short
  of 100% and then jumps to written, rather than waiting at 99%.

**Choosing the models:** `config.models`, which defaults to `"fake"` (used by tests and
screenshots), chooses both the section writer and the librarian's model, which also plans new
manuals (`createModels` in `app.ts`); `RTFM_MODELS=bedrock` selects Claude for both.

- With `"bedrock"`, `startServer` builds one gateway on the file ledger, and the writer on it,
  all before it seeds or listens. The librarian and its planner use the same gateway, so one set
  of caps covers every job.
- `createGateway` checks every job's model against the price table (`ModelNotPriced`), and only
  then calls the client factory it is given, which reads the credentials (`CredentialsMissing`)
  and builds the Bedrock client. Either problem stops the server from starting, and an unpriced
  model is reported without reading any secret.
- `createModels` also returns `idle`: the gateway's `idle()` with Bedrock, and one that resolves
  at once with the fakes, which record nothing.
- Tests replace either model with `startServer(config, { writer, librarian })`, and a test that
  passes its own gateway passes its `idle` too, so `close()` waits for it.

**One writer per section** (`writer/runs.ts`): an in-memory `Map` keyed by `manualId/sectionId`.

- **Opening a section** checks the map, then storage (`getBody`), then the map again. If there is
  still no entry, it creates the run in the same tick, so two requests can't both start one.
- **Finished runs stay in the map** as `written`, which closes the gap between a request reading
  storage and a run finishing. If `saveBody` returns `already-written`, the run sends `written`
  anyway: the stored body is the one that counts.
- **`writingSectionIds(manualId)`** names the sections of a manual that have a run in progress,
  for the manual route; **`isWriting(manualId)`** says whether there are any, for the delete route.
- **Statuses come from storage** for any section not being written. If a written section's file
  has been deleted by hand, opening it drops the stale `written` entry and writes it again.
- **Listeners:** the first request starts the writer with its own `AbortController`. Later
  requests subscribe and get the backlog first.
- **Ending:**
  - When the writer finishes, `saveBody`, then `written`. If any chunk was marked
    `placeholder`, nothing is stored and the entry is removed instead: the readers still get
    `written`, but the section is unwritten again for the next request, and the library's count
    doesn't change.
  - When the writer throws, `failed`, and the entry is removed. Nothing is stored.
  - **When the last listener disconnects, the run is aborted** at once, with no grace period,
    which aborts the Bedrock call (section 5), and the partial text is discarded. Reloading
    mid-section therefore starts the writing again from scratch.
- **At most 3 runs at once** (`config.maxConcurrentRuns`). A fourth request gets `failed:
  "error"`. Each writing section holds one browser connection, and HTTP/1.1 allows 6 per origin,
  so this keeps the page's other requests flowing. The reader keeps a section's stream open while
  it navigates elsewhere.

## 5. The model gateway

`server/gateway/` is the only route to a model. The section writer and the agent loop pass a job
name (`write-section`, `librarian` or `plan-manual`), a prompt and a signal. They never see a model
ID, a price or the SDK.

- **A prompt** (`ModelPrompt`, `gateway/types.ts`) is a system prompt, optional tool definitions
  and messages whose content is a string or a list of `text`, `tool_use` and `tool_result` blocks.
  Blocks and tool definitions use Anthropic's field names, so `bedrock-client.ts` passes them to
  the SDK as they are. `Prompt` is the plain-text form the section writer builds.
- **A `ModelClient`** (`bedrock-client.ts`, and fakes for tests) streams `ModelEvent`s: `text`;
  `tool-input`, each fragment of a tool's input as it arrives; `tool-use`, one per whole
  `tool_use` block; `usage`, with input, output and cache token counts; and `stop`, with the stop
  reason.
- **`createGateway`** takes a `createClient` factory, the ledger, the `GatewayConfig`, the price
  table and the data folder. It returns a `RunningGateway`: the `Gateway` that the writer and the
  loop see (`stream(job, prompt, signal)`), plus `idle()`.
- **Errors:** the stream's first step throws `SpendingRefused` (`"daily-cap"`, `"monthly-cap"` or
  `"kill-switch"`) or `GatewayBusy`; a stalled call throws `ModelStalled`, and a stream that ends
  without a stop reason throws `ModelStreamIncomplete`.

`createGateway` rejects with `ModelNotPriced` if any job's model is missing from the price table,
so the server refuses to start. It checks before it calls `createClient`, so with Bedrock an
unpriced model is reported without reading any secret. This is the only price-table check. It is
async because it replays the ledger before it returns. The stream is an async generator, so a
refusal surfaces on the first `next()`, before any event. A signal that is already aborted is
refused without a reservation.

**Callers must read the stream with `for await`**, which calls `return()` when they stop early,
so the call is aborted and settled. An iterator that is abandoned without `return()` never
settles. The caps stay safe, because its reservation keeps counting at the worst case, but the
call stays "running", and the gateway never becomes idle, so stopping the server would wait
for it forever.

Then, for each call:

1. **Kill switch.** If `.data/STOP` exists (`existsSync`, so steps 1–5 up to the ledger write are
   one synchronous step), refuse. Creating the file stops new calls at once, with no restart, and
   deleting it resumes them. A call already running finishes; it is bounded by `max_tokens`.
2. **Concurrency.** If `maxConcurrentCalls` calls are running, throw `GatewayBusy`. That is the 3
   section runs plus 2 (section 8), so five calls can run at once, and three sections being
   written leave room for the librarian and the planner.
3. **Worst case.** `(inputBound × highest input price) + (max_tokens × output price)`.
   - `inputBound` adds up:
     - the UTF-8 bytes of the system prompt, of each message's text or, for block content, its
       blocks as JSON, and of the tools as JSON;
     - framing: 100 tokens for the request, 10 for each message, 10 for each content block and 10
       for each tool;
     - when the prompt has tools, the tool-use system prompt the API adds, whose size is per
       model and lives with the model's prices (`toolUseSystemPromptTokens`).
   - A token is at least one byte, so text counted by its bytes is a true upper bound with no
     tokenizer. Blocks and tools are counted as their JSON plus framing per block and per tool,
     which exceeds the rendered form the model sees.
   - Each call sends the whole conversation, so each turn of an agent run reserves for all of it,
     and the bound grows turn by turn.
   - The input is priced at the highest of the input, cache-write and cache-read prices, so cache
     writes can never cost more than the reservation.
   - The bound counts text and tool blocks only, because `ModelPrompt` has no images or system
     prompts made of blocks.
4. **Caps.** For the day and the month (UTC, as AWS bills), `settled + reserved + worst case` must
   stay at or under the cap. The check and the reservation are one synchronous step on in-memory
   totals, so two calls can't both slip under.
5. **Reserve.** Append `{ kind: "reserve", callId, reservedAt, job, model, worstCaseUsd }` and await
   it. If the append fails, the in-memory reservation is released and the error is rethrown.
6. **Call.** `client.stream(...)`, re-yielding events.
   - The writer's signal goes straight to the SDK request, combined (`AbortSignal.any`) with the
     gateway's own cut-off signal, so a disconnect aborts the HTTP call. If the writer stops
     reading early, the gateway aborts the call itself.
   - **Idle timeout:** 30s with no event (`config.idleTimeoutMs`, or the job's own
     `idleTimeoutMs` where it has one: 60s for `plan-manual`) aborts the call, with outcome
     `failed`, and the stream throws `ModelStalled`. The timer starts before the request is sent,
     so it also covers a request that never answers.
   - The timer also runs while the caller holds an event: a caller that stops pulling for 30s is
     as stuck as a model that stops sending, and the HTTP call should not stay open for it. The
     section writer only hands each chunk on, so it never comes close.
   - **The SDK's `timeout` does not cover the stream body** (checked in 0.34.4): its timer wraps
     only the `fetch` call and is cleared once the response headers arrive. The idle timeout is
     therefore the only protection against a stalled body. The SDK `timeout` is still set
     explicitly, to `idleTimeoutMs`, so a request that gets no headers fails after 30s rather than
     the SDK's 10-minute default.
7. **Settle** (in `finally`, so it runs after completion, error or abort). Append `{ kind:
   "settle", callId, reservedAt, at, job, model, inputTokens, outputTokens, cacheWriteTokens,
   cacheReadTokens, usd, outcome: "complete" | "aborted" | "failed", estimated }`.
   - It goes into the reservation's month file, and the cost is charged to the reservation's day
     and month, so a call that crosses midnight stays in one period.
   - **A call is `complete` only when a `stop` event arrived.** When the client's stream ends,
     the gateway checks, in order: if its cut-off fired (a stall), it throws `ModelStalled`; if
     the writer's signal aborted, it throws the abort; if no `stop` arrived, it throws
     `ModelStreamIncomplete`. All three go through the same catch as an error from the client.
     This matters because the SDK's stream can end quietly: its iterator marks itself done on an
     abort or error, and only rejects a `next()` that is already waiting. If the abort, a stall,
     an exception frame or a cut-off body lands while the gateway is paused at `yield`, the next
     `next()` just returns `done`.
   - **Outcome:** `complete` as above; `aborted` when the writer's signal aborts or the writer
     stops reading; `failed` on a stall, a client error or a stream with no `stop`.
   - **Input tokens** come from `message_start`, or from `message_delta` when it reports them
     (the latest report wins). If neither arrived, the input bound is used, at the plain input
     price.
   - **Output tokens:**
     - On a complete call they come from the final `message_delta`. `message_start` also carries
       an `output_tokens`, but it is a placeholder (1), so the client doesn't map it.
     - **Any call that doesn't complete (aborted, stalled or failed) is charged its full reserved
       output (`max_tokens`)** and marked `estimated: true`. The stream doesn't tell us what
       Bedrock billed after the cut, so the gateway assumes the most it can be.
     - `estimated` is also set if a complete call never reported its input or output tokens.
   - **The call stays running until its settle is written.** Only then does it free its
     concurrency slot and its unused worst case, so until then the totals hold the worst case,
     and `idle()` counts it as running.

**Stopping.** `idle()` resolves once no call is running, at once if none is. A call ends after its
settle append, whether the append succeeds or fails. The server's `close()` awaits it (section 1),
so the process never exits between a call's abort and its settle, which would leave the call
unsettled and counted at its worst case.

**The ledger is the durable record.** On start, the gateway replays this month's file into its
totals. A `reserve` with no `settle` (the server died mid-call) counts at its worst case, and
`npm run usage` lists it as unsettled.

- **Totals in memory** are one map from period (`2026-10-11` or `2026-10`) to committed dollars.
  Reserving adds the worst case to the reservation's day and month; settling adds `usd − worst
  case` to the same two periods.
- **One server process per data folder, enforced** by the data folder's lock (section 3). The
  totals live in one process's memory, so two servers on the same `.data/` would each allow the
  full caps.
- **`gateway/ledger-calls.ts`** pairs `reserve` and `settle` entries into calls. The replay and
  `npm run usage` both use it, so they count spend the same way. `monthOf` comes from
  `storage/file-ledger.ts`, which files entries by it.

**`bedrock-client.ts`** is the only importer of `@anthropic-ai/bedrock-sdk`. It builds the client
with every option that would otherwise fall back to the environment set explicitly:

- the keys from `.env.local` as `awsAccessKey` and `awsSecretKey` (never `process.env`), and
  `awsRegion`, so `AWS_REGION` is never read;
- `baseURL`, the region's endpoint, so `ANTHROPIC_BEDROCK_BASE_URL` is never read;
- `apiKey: null`, so `AWS_BEARER_TOKEN_BEDROCK` can't replace SigV4 signing;
- a `providerChainResolver` that throws, so the default AWS credential chain never runs;
- `maxRetries: 0`, one reservation for one HTTP call;
- `timeout`, the idle timeout (step 6).

It maps `message_start` and `message_delta` to `usage`, `text_delta` to `text`, each
`input_json_delta` to `tool-input`, a `tool_use` block (its start, input fragments and stop) to
one `tool-use`, and `message_delta`'s `stop_reason` to `stop`.

**Tool calls.** `tools` is sent only when the prompt has some. A `tool_use` block's input arrives
as `input_json_delta` fragments; the client joins them and parses the JSON once, at
`content_block_stop`, with `JSON.parse` (no fragments means `{}`). The tools carry no
`eager_input_streaming`, which Haiku 4.5 on Bedrock rejects, so the API buffers and validates each
input before sending it. Input that still doesn't parse can only come from output cut off at
`max_tokens`. That block is left out, with no event, so the stop reason (`max_tokens`) decides
what happens: the agent loop then stops with `AgentStopped`.

**Long tool inputs and the idle timeout.** The API buffers a tool's input one top-level parameter
at a time: nothing of a parameter is sent until the model has written all of it, then its
fragments arrive at once. Each fragment is passed on as a `tool-input` event, so the gateway's
idle timer restarts whenever a parameter arrives, not only once the whole block is done. The
longest silence is then the time to write the largest parameter. For the planner (section 7)
that is the chapters. At the measured rate (section 8), the largest chapters the size limits allow
(32 sections, about 3,000 tokens) take about 26s: too close to the shared 30s, and over it if
Bedrock is slower. So `plan-manual` has its own idle timeout of 60s. The SDK drops `ping` events,
so they never reach the gateway.

**Checked in the installed SDK** (`@anthropic-ai/bedrock-sdk` 0.34.4, on `@anthropic-ai/sdk`
0.133.0):

- **Option names:** `awsAccessKey`, `awsSecretKey`, `awsRegion`, `awsSessionToken`, `apiKey`,
  `providerChainResolver`, `baseURL`, `maxRetries`, `timeout`. There is no `awsSecretAccessKey`.
- **Static keys bypass the chain:** when both keys are non-empty, the signer builds the
  credentials from them. `providerChainResolver` is called only when either is missing or empty;
  without one, the SDK's default resolver runs `fromEnv` and then `fromNodeProviderChain`
  (profiles, `~/.aws/*`, SSO, IMDS). Ours throws instead, so the call fails with its message before
  any request is sent.
- **`apiKey`** is typed `string | undefined` and defaults to `AWS_BEARER_TOKEN_BEDROCK`. A
  destructuring default only applies to `undefined`, so `null` passes through as the base
  client's `authToken: null`, and the SDK signs with SigV4 whenever there is no `authToken`. The
  SDK itself passes `apiKey: null` to the base client and turns off its default-credential
  lookup, so `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are never read either.
- **`maxRetries`** defaults to 2, which would mean up to three billed attempts under one
  reservation.
- **`timeout`** defaults to 10 minutes and covers only the wait for response headers (step 6).
- **Streaming abort:** the signal passed in the request options stays attached until the body is
  settled, so aborting it mid-stream closes the HTTP connection. But `MessageStream`'s iterator
  does not always throw afterwards: an abort or error that lands between two `next()` calls
  ends the iteration quietly. The gateway's checks after the loop (step 7) catch this.
- **Response framing:** Bedrock answers with `application/vnd.amazon.eventstream`, which the SDK
  transcodes to server-sent events in `core/streaming.js`. Exception frames become SSE `error`
  events, which the stream throws.
- **The model ID** goes into the path unencoded:
  `/model/global.anthropic.claude-haiku-4-5-20251001-v1:0/invoke-with-response-stream`.

Haiku 4.5 has thinking off unless asked. No `cache_control` is sent: Haiku 4.5 caches only a
prefix of at least 4,096 tokens, and every call's whole input is shorter than that (section 8).

**`credentials.ts`** reads the file at the repo root:
`util.parseEnv(readFileSync(new URL("../../.env.local", import.meta.url), "utf8"))`.

- The result goes into a local object, never `process.env`.
- It takes exactly `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, and treats an
  empty or blank value, or a missing file, as missing.
- If any is missing, it throws `CredentialsMissing`, which names the missing variables and the
  models that need them (the section writer, the librarian and the planner) and never prints a
  value, so the server refuses to start with the Bedrock models. `app.ts` calls it when
  `config.models` is `"bedrock"`.

**Tests, all offline.** They guard two boundaries. `sdk-boundary.test.ts` scans every source
file (`.ts`, `.tsx`, `.js`, `.jsx` and their `m`/`c` forms) under `src/`, `server/` and `scripts/`,
and the root source files, and fails if any file but `bedrock-client.ts` names a module starting
with `@anthropic-ai/` or `@aws-sdk/`, or anything outside `server/gateway/` and `server/app.ts`
imports `bedrock-client`, so nothing can call the client without going through the caps.
`bedrock-client.test.ts` runs the client against a local server that answers with real Bedrock
event-stream frames, with fake keys and `AWS_PROFILE`, `AWS_BEARER_TOKEN_BEDROCK`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BEDROCK_BASE_URL` set to decoys: the request is signed with
the fake key and carries no decoy, and with an empty key nothing is sent. Removing either guard
fails it. The other tests next to the gateway, the ledger, `app.ts`, `config.ts` and `main.ts`
cover each rule in this section, the shutdown order in section 1 and the committed config's room
for the librarian.

**`npm run usage`** (`server/usage.ts`, with the formatting in `gateway/usage-report.ts`) prints
today's and this month's spend (UTC) against the caps, as `README.md` describes. It reads another
data folder when given one; the tests use this.

## 6. The agent loop

`server/agent/` runs a model with tools: it calls the model, runs the tools it asks for, sends
the results back, and repeats until the model ends its turn. Every turn is one gateway call, so
each one is reserved, capped, settled and written to the ledger like any other, under the job the
caller names.

- **`runAgent`** (`agent/loop.ts`) takes the gateway, the job, the system prompt, the tools, the
  conversation so far (ending with the user's message), `maxTurns` and a signal. It is an async
  generator of `status` and `text` events that returns the whole conversation.
- **`defineTool`** (`agent/tool.ts`) makes an `AgentTool` from a name, a description, the input's
  zod fields, a status line (shown while it runs: "Looking through the library…") and
  `run(input, signal)`, which returns the result's text.

**A run, turn by turn:**

1. Stream a turn through the gateway with the system prompt, every tool's definition and the
   whole conversation. Each text delta is yielded as a `text` event as it arrives.
2. An `end_turn` with no content ends the run normally, after a turn that ran tools: the
   conversation is returned as it is, ending with the tool results, since an empty assistant
   message would make a later request invalid. Models sometimes do this once a tool has done
   what was asked. On the first turn it throws `AgentStopped`, since the model did nothing.
   A `tool_use` stop with no `tool_use` block throws `AgentStopped` too: it would make the next
   request invalid (an empty user message of results).
3. Append the assistant's message: its text and `tool_use` blocks, in order.
4. If the stop reason is `end_turn`, return the conversation. If it is anything but `tool_use`
   (`max_tokens`, `refusal`, …), throw `AgentStopped`.
5. If this was turn `maxTurns`, throw `AgentStopped` (below), without running its tools.
6. For each `tool_use` block, in order: stop if the signal has aborted, yield the tool's
   `status` (when the tool exists), then run it. Then append all the results as one user message
   of `tool_result` blocks, and go back to step 1.

**Tools.**

- **The schema.** `defineTool` builds a `z.strictObject` from the input's fields and turns it
  into the tool's JSON Schema with `z.toJSONSchema`, without its `$schema` key. The JSON Schema
  has `additionalProperties: false`, and the check rejects extra keys to match.
- **Input is checked before a tool runs.** Input that fails the schema never reaches `run`: the
  model gets an error result (`is_error: true`) that starts "Invalid input:" and names each
  problem, so it can try again.
- **Other failures** also become error results, and the run carries on: a tool that throws
  (the result is `String(error)`, such as `Error: …`) and a call to a tool that doesn't exist.
  `runTool` makes those results, with two exceptions that end the run instead: a tool that throws
  `SpendingRefused` (its own model call was refused by the caps, so the reply can report the
  budget) and a tool that throws once the run's signal has aborted.
- **Tools run one after another**, even when the model asks for several at once, and all their
  results go back in one message.

**Stopping.**

- **A turn limit.** A run takes at most `maxTurns` model calls. A model that still calls tools on
  its last allowed turn ends the run with `AgentStopped` ("The model was still calling tools
  after 8 turns", for the librarian): that turn's tools don't run, since the model would never
  see their results (one could plan a manual, with model calls of its own), and the model isn't
  called again. Every call made before the stop has settled as usual. A run that ends its turn on
  the last allowed turn returns normally. The caps bound spending across runs; the limit keeps
  one run from spending a day's cap: every turn sends the whole conversation, so each costs more
  than the last.
- **Errors end the run as they are.** A refusal (`SpendingRefused`, `GatewayBusy`), a stall or a
  failed call is thrown from the generator unchanged, after the turns before it have settled.
  So is a `SpendingRefused` from a tool's own model call, such as the planner's.
  The caller tells "budget" from "error" with `instanceof SpendingRefused`, as the section
  writer does.
- **Aborting.** The signal goes to every gateway call and every tool. An abort mid-turn aborts
  the model call, which settles as `aborted`. An abort while a tool runs ends the run: none of
  the turn's remaining tools runs, since one could delete or create a manual, and the next
  turn's gateway call refuses an aborted signal before reserving anything.
- **The caller reads the run with `for await`** (or calls `return()` when it stops early), so the
  gateway call underneath is aborted and settled, as section 5 requires.

**Events.** `status` and `text` are the only events, so a route can forward each as a
server-sent event as it is (section 7). Text from different turns arrives in order, with the
statuses of the tools run between them.

**Tests.** `loop.test.ts` drives `runAgent` through the real gateway and a file ledger, with the
scripted fake model in `scripted-client.ts`, and covers each rule above.

## 7. The librarian

The librarian on the landing page is the agent loop (section 6) with the library's tools, behind
one route. The browser keeps the conversation and sends it whole with each message; the reply
streams back. `sendReply` (`agent/librarian/reply.ts`) runs it for one conversation and sends the
reply's events.

**The route** (`api/librarian.ts`), `POST /api/librarian` with `{ messages }`:

- **Checked first.** At most `LIBRARIAN_LIMITS.earlierExchanges` (10) earlier exchanges and the
  new message, so 1–21 messages, each `user` or `agent` with 1–4,000 characters
  (`messageCharacters`) of text after trimming, alternating from a `user` message and ending with
  one. An `agent` message may also carry `deleteOutcome`, `"kept"` or `"deleted"`: how the delete
  confirmation it proposed ended. Messages have no other keys. Anything else, or a `?freeze` that
  isn't a number from 0 to 1, is `400 { error: "Bad request" }`. The browser sends only the
  latest 10 exchanges whose reply finished, leaving out any with a message over the limit, so a
  failed reply never reaches the model and a long conversation keeps working. The limits also
  bound what one reply can cost.
- **Plain text only.** Each message becomes a prompt message with string content (`agent` becomes
  `assistant`). The model never sees earlier replies' tool calls, only what was said, and the
  system prompt tells it to check the library with a tool rather than trust earlier messages,
  because the user can open and delete manuals directly.
- **How a proposed delete ended.** The user message after an `agent` message with a
  `deleteOutcome` starts with the page's note (`DELETE_OUTCOME_NOTES` in `prompt.ts`), then a
  blank line and the user's words: `<page_note>In the delete confirmation your last reply opened,
  the user chose Keep it: the manual was not deleted.</page_note>`, or that they confirmed it and
  the manual has been deleted. The note goes in the user's turn, where it happened, not at the end
  of the reply: a note in the model's own turn is one it learns to write itself.
- **The reply.** `sendReply` runs `runAgent` with the job `librarian` and `LIBRARIAN_MAX_TURNS`
  (section 8) as `maxTurns`, and sends:
  - `status` with each tool's status line, as the loop reports it, and the create tool's progress
    lines while the planner works;
  - `text` with each text delta;
  - `withdraw` just before the first text that follows a tool call (a `tool-input` or
    `tool-use` event, known tool or not) made after some text was sent: the text so far was
    written before the call, and the page replaces it with the text that follows. Text before a
    tool stays on the page while the tool runs, and stands as the reply when nothing follows it,
    so a reply is the last text the model wrote, and never ends empty when the model wrote
    anything. `sendReply` sees the events by wrapping the gateway it gives the loop (the
    planner's calls go to the gateway itself);
  - `action` when a tool hands the page an action (below), as the tool runs;
  - then `done` when the loop returns, or `failed`: `"budget"` for `SpendingRefused` (a cap or
    the kill switch), `"error"` for anything else, which is logged (`GatewayBusy`, a stall, a
    failed call, `AgentStopped`).
  - If the client disconnects, the signal aborts the loop, which settles the call as `aborted`
    (section 6), and nothing more is sent.

**The tools** (`agent/librarian/tools.ts`, `create-manual.ts`):

| Tool | Input | Status | Result |
| --- | --- | --- | --- |
| `list_manuals` | none | Checking the shelves… | JSON: each manual's `id`, `title`, `subtitle`, `sections_written` and `sections`, in title order (`librarySummaries`, shared with `GET /api/manuals`); or `The library is empty.` |
| `find_manuals` | `topic` | Searching the shelves… | JSON: up to 5 matches, best first: `id`, `title`, `subtitle` and up to 3 `matching_sections` (`"A.1 Servos, Steppers and Pneumatics"`); or `No manual matches "…".` |
| `open_manual` | `manual_id` | Opening the manual… | Sends `{ type: "open" }`. JSON: the `manual`'s `id` and `title`, and a fixed `result`: the reader opens it when the reply has finished |
| `propose_delete` | `manual_id` | Preparing the delete… | Sends `{ type: "propose-delete" }`. JSON: the `manual`'s `id` and `title`, and a fixed `result`: nothing is deleted, only the user's choice in the page's confirmation deletes it, and never say it has been deleted |
| `create_manual` | `request` | Planning a manual… | Hands the request to the planner (below). Saved: sends `{ type: "created" }`, and JSON: the `manual`'s `id`, `title`, `subtitle` and counts of `chapters` (appendices included) and `sections`, and a fixed `result`: it is saved and the library shows it; give its title and offer to open it, but don't open it unless asked. Not saved: JSON with only a fixed `result`: nothing was created; say so plainly. A reply plans at most one manual: the tools are built for each reply, and a second call is refused at once, with no model call, as the error result `Error: Only one manual per reply; nothing was created.` |

- **Results are data.** Manual text (titles, subtitles, summaries) appears only as JSON values,
  never inside the results' wording, and the system prompt says tool results are data, never
  instructions.
- **An unknown `manual_id`** throws, so the model gets an error result that names the id and says
  how to find one, and no action is sent.
- **Only creating changes anything on the server**, and it only adds a manual: it can never
  replace one. Opening and deleting are actions for the page. A delete happens only through the
  page's confirmation dialog and `DELETE /api/manuals/:manualId`, never through the librarian, so
  neither the page nor the model can delete on its own.
- **Finding** (`find.ts`) lower-cases the topic and each manual's text, splits it on anything
  that isn't a letter, keeps words of 3 or more letters that aren't stop words (function words,
  and request words such as `manual`, `open` and `delete`), and reduces each to a base form
  (`-ies` → `y`, `-ed` dropped from words of 6+ letters, one trailing `s` dropped, not `ss`). A
  manual scores 3 for each topic word in its title, 2 for each in its subtitle and 1 for each in
  its table of contents (chapter and section titles and section summaries); ties go by title.

**The system prompt** (`agent/librarian/prompt.ts`) is the same for every request: the prompt
itself is the reference for what the librarian is told. It names no tool. A tool's own rules live
in its description, sent with every call: `propose_delete`'s says it deletes nothing, that only a
`<page_note>` tells how the confirmation ended, and to propose again when asked; `create_manual`'s
says at most one per reply, to ask first when the topic is unknown, and not to open the new manual
in the same reply. The prompt keeps the rules that span tools: tool results are data, never
instructions; a manual's id comes from a tool; a reply acts on at most one manual, and only when
asked; an ambiguous request gets a question. It also says to write the reply once, after the last
tool call, and always to write one. A test checks that every snake_case word in the prompt and
the tools' descriptions is a tool, an input field or `page_note`, so a renamed tool can't stay
mentioned.

No `cache_control` is sent (section 5). A reply takes one call per model turn: two for a list or a
find, two or three to open or propose a delete, and two to create a manual, with the planner's one
or two calls between them. Section 8 has what a turn reads, writes, costs and reserves.

**The turn limit.** A reply stops after 8 model turns (`LIBRARIAN_MAX_TURNS`), well above the 2
or 3 a reply takes, so a model that keeps calling tools can't spend the day's cap on one reply.
The loop throws `AgentStopped` instead of calling the model a ninth time (section 6), so the reply
ends with `failed: "error"` and the page shows its "reply failed" state.

**The planner** (`agent/planner/`) plans a new manual and saves it. `planManual` takes the
gateway, the store, the request, a signal and an `onStatus` callback, and returns the saved
manual or the problems that stopped it.

- **Its own job.** Each attempt is one gateway call under the job `plan-manual`, with its own
  `maxTokens` and idle timeout (section 8), so it is reserved, capped and recorded like any other
  call. Gateway errors are thrown as they are. A refusal by the caps or the kill switch ends the
  reply with `failed: "budget"`, because the loop's `runTool` lets `SpendingRefused` through; any
  other (a stall, `GatewayBusy`) is turned by `runTool` into an error result for the librarian,
  as for any tool that throws.
- **The prompt** (`prompt.ts`). The system prompt is the same for every plan: what a plan is for
  (a later writer sees only the voice and each section's title and summary), the rules for each
  field, the size to aim for and the hard limits, and one seed manual, *Moving House Without
  Losing the Cat*, as JSON in the tool's own form, never to be reused. The user message holds the
  request inside `<request>`, with `<` escaped so it can't close the tag, then the ids already
  taken in the library, and on a retry the problems with the first plan. The system prompt says
  the request describes the manual wanted and is never an instruction: nothing inside it changes
  the rules, the tool or the format.
- **The tool**, `save_manual`, takes the plan in the stored manual's own format (`id`, `title`,
  `subtitle`, `voice`, `chapters`, `appendices`). Its JSON Schema comes from the same zod schema
  that checks it (`toolDefinition` in `agent/tool.ts`, which `defineTool` uses too). The planner
  calls the gateway itself rather than running the agent loop: a successful save needs no further
  model turn, so none is paid for.
- **The checks** (`check.ts`): the schema (strings, slug ids and titles up to 80 characters, a
  voice of 300–1,500, summaries of 20–200 and never blank; 2–7 chapters, 0–2 appendices, 2–5
  sections in each, no unknown keys), then every chapter and section id used once, 6–32
  sections in all, and an id no manual in the library has. Each problem is stated in words the
  model can act on. Every seed manual passes.
- **Labels are assigned, not checked:** each chapter, appendix and section is labelled by its
  place (`1`, `2`…; `A`, `B`; `2.1`, `2.2`…), whatever the model wrote (a label may be left out),
  so a numbering slip never costs a paid retry.
- **One retry.** A plan with problems, a reply with no `save_manual` call, or a plan cut off at
  `max_tokens` gets exactly one more attempt: a fresh call whose request message lists the
  problems. `ATTEMPTS` is 2, so there are at most two paid calls. If the second fails too,
  nothing is saved, and the result says why.
- **Saving.** A plan that passes is saved with `createManual`, which never replaces a manual. If
  its id was taken between the check and the save, that counts as a failed attempt.
- **Progress.** The create tool's status, `Planning a manual…`, shows while the planner starts.
  The planner then reads the streamed input (`tool-input`, section 5) for the manual's title,
  which comes first, and reports `Planning “<title>”…`, about a second in; a retry reports
  `Revising the plan…`, then `Revising “<title>”…`. The create tool passes these to `sendReply`,
  which sends them as `status` events.

**The fake model** (`agent/librarian/fake-model.ts`), the default (`config.models`, section 4):

- It implements `Gateway` itself, so it makes no model call and never reaches the real gateway:
  nothing is reserved, recorded or capped, as with the fake writer.
- It reads the latest user message, without a page note at its start, for a keyword, the first
  match in this order: `delete` or `remove`; `create`, `new` or `start`; `open` or `read`;
  `list`, `library`, `manuals` or "what do I have"; `find`, `anything` or `which`; `help`. Then
  it plays the turns a model would, through the real tools: a list calls `list_manuals` and
  lists every title with its counts; an open or a delete calls `find_manuals` with the message
  as the topic, then `open_manual` or `propose_delete` with the best match, then says so; with
  no match it asks which manual. A find calls `find_manuals` with the message as the topic, then
  names the match or matches, or says it found none. A new manual calls `create_manual` with the
  message as the request, then gives the saved manual's title and counts and offers to open it,
  or says it couldn't plan it; help and anything else get fixed replies.
- Asked for a plan (the job `plan-manual`), it plays the planner's turn
  (`planner/fake-planner.ts`): `fakePlan`, the same nine-section manual for any request, titled
  after what the request is "about" (`Building a Treehouse`), streamed as one `tool-input` then
  saved with `save_manual` after a pause. Asked twice for the same title, its id is taken both
  times, so the second request isn't saved.
- It waits before each turn (and before a plan) and streams text in the fake writer's chunks
  (`chunkEnds`), at the pace `README.md` › The models gives. Its fixed replies are
  `FAKE_REPLIES`, which the tests and the shot script match.

**Preview** (`?freeze=<0–1>`, in `api/preview.ts`). Whatever models are configured, it runs
`sendReply` with the fake model at once (no waits) and collects the events. It then sends the
statuses and the text up to the last chunk end at or before that fraction of the reply's text,
then `frozen`, or `done` when nothing was cut (`?freeze=1`). Actions are never sent, and its store
saves no manual (`createManual` only answers `"created"`), so a preview costs nothing and changes
nothing. The browser uses it for `?conversation=demo` and `?agentFreeze=` (`src/agent/README.md`).

**Tests**, all offline, cover the route, the tools, the page notes, narration kept or withdrawn,
replies whose last turn is empty, with the fake model and with scripted turns through the real
gateway, the turn limit, the planner's one retry and its checks, and finding; previews call no
model and save nothing.

## 8. Configuration

| Setting | Where | Secret |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | `.env.local`, read only by `gateway/credentials.ts` | yes |
| Models, data dir, caps, concurrency, jobs, section length, the librarian's turn limit | `server/config.ts` | no |
| API port | `server/ports.ts` | no |
| Another data folder or port for one run: `RTFM_DATA_DIR`, `RTFM_PORT` | the environment, read by `server/config.ts` | no |
| Prices | `server/gateway/prices.ts` | no |

- **Types.** `config` is a `ServerConfig`, which extends `GatewayConfig` (`caps`,
  `maxConcurrentCalls`, `idleTimeoutMs`, `jobs`, in `gateway/types.ts`) with the port, data dir,
  models, `maxConcurrentRuns`, `sectionWordsRequested` and `sectionExpectedCharacters`.
  `startServer` and the gateway take it as it is, so tests and the shot script spread `config`
  and override what they need.
- **`RTFM_DATA_DIR` and `RTFM_PORT`** run the server on another data folder (resolved against
  the working directory) or port, with nothing edited; `main.test.ts` runs `main.ts` on a temp
  folder and port 0 this way. An empty `RTFM_DATA_DIR` means `<repo>/.data`, whatever the
  working directory; a `RTFM_PORT` that isn't a whole number from 0 to 65535 stops the server from
  starting, and 0 takes any free port. Vite's proxy always points at `API_PORT`, so `RTFM_PORT`
  is for `npm run server` alone.
- **`maxConcurrentCalls` is `maxConcurrentRuns + 2`**, both from one constant. The section runs
  can use at most 3 calls between them, so 2 are always left for the librarian's turns and the
  planner's plans, one each or two of either. Three sections being written can therefore never
  refuse a librarian reply with `GatewayBusy`.
- **The `global.` model ID.** Every job uses Claude Haiku 4.5 through the `global.` inference
  profile rather than `us.`, which costs 10% more; nothing here needs routing that stays in the US.
- **`write-section: maxTokens 2048`.** The sample sections are 460–660 words (about 650–950
  tokens), so this leaves room. Its output costs at most about $0.01 (2,048 × $5 per million).
- **`librarian: maxTokens 1024`** is sized for a few short paragraphs and short JSON tool inputs.
  Its output costs at most about $0.005 a turn. The input bound includes the tool definitions,
  the conversation and the tool-use system prompt, so each later turn of a reply reserves more
  than the first.
- **`LIBRARIAN_MAX_TURNS: 8`**, the librarian's turn limit (section 7).
- **`plan-manual: maxTokens 4096`.** The measured plan used about 95 output tokens a section plus
  the voice; the prompt aims for 12–24 sections, and the hard limit of 32 comes to about 3,300
  tokens for the whole plan. 4096 leaves 65% headroom over the measured plan and room for the
  largest allowed one. Its output costs at most about $0.02, and the input bound adds a 9 KB
  system prompt with the example, the 2 KB tool and the tool-use system prompt. A retry reserves
  the same again.
- **`plan-manual: idleTimeoutMs 60_000`**, a job's own idle timeout in place of the shared 30s,
  because its largest tool parameter can take that long to arrive (section 5). A stalled plan is
  charged its full `max_tokens` either way, so the longer wait costs nothing more; the SDK's own
  `timeout`, for the response headers, stays at the shared 30s.
- **`sectionWordsRequested: 650`** is the length the prompt asks for, about the sample's own
  sections (460–660 words). **`sectionExpectedCharacters: 4800`** is the length the Bedrock
  writer's progress counts to, set from what Haiku actually writes (the measurements below).

**Prices** (`gateway/prices.ts`) are USD per million tokens, dated by `checkedOn`, for the
`global.` and `us.` Haiku 4.5 profiles: input, output, cache write, cache read, and
`toolUseSystemPromptTokens`.

- **`toolUseSystemPromptTokens`** is the size of the system prompt the API adds whenever a request
  has tools. It is per model, so it sits with the model's prices. Haiku 4.5's is 496 tokens with
  `tool_choice` `auto` or `none` and 588 with `any` or `tool` (Anthropic's tool-use pricing table,
  checked 2026-10-11). The table holds the larger, so the bound holds whatever `tool_choice` is
  sent.
- **Sources:**
  - Anthropic's Haiku 4.5 list price, $1 / $5 (the `claude-api` skill, cached 2026-10-06).
  - Anthropic's Bedrock guide, checked 2026-10-11: regional endpoints cost 10% more for Sonnet 4.5
    and later models.
  - Cache prices use the standard 1.25× and 0.1× multipliers.
  - **Not from AWS's pricing page**, whose Claude tables don't render.

**Measured** with Haiku 4.5 (`global.`): the sections and librarian turns on 2026-10-11, the plan
on 2026-10-12. Costs are computed from the reported tokens and the price table, as the ledger
records them, not read from AWS's bill.

| Call | Input tokens | Output tokens | Time | Cost | Reserved |
| --- | --- | --- | --- | --- | --- |
| A section (asked for 650 words; wrote 760–800 words, 4,200–5,000 characters) | 2,900–3,200 | 970–1,410 | 12–15s, about 400 `append` events | $0.007–0.010 | about $0.025 |
| A section aborted mid-stream | as above | charged at 2,048 | — | about $0.013 | about $0.025 |
| A librarian turn | 2,000–2,700 | up to a few hundred | — | $0.002–0.004 | $0.013–0.016 (about $0.014 for a first turn) |
| A plan of 23 sections | 3,957 | 2,481 | 21.3s, the longest silence 11.2s (the chapters, about 116 tokens a second) | $0.0164 | about $0.036 |

## 9. Logs

One logger (`server/logging/`) writes every log line. It is created with its sinks and passed to
whatever logs, as the gateway and the store are: `createRequestHandler`, `createRuns`,
`createGateway`, `runAgent`, `sendReply`, the file store and the file ledger, and the client-error
route all take a `Logger`. `main.ts` creates it with two sinks, standard output and the data
folder's log file; `startServer` without a logger of its own (the shot script) logs to the log
file alone. Tests pass `silentLogger`, or `capturingLogger()` (`testing.ts`) to read the entries,
so nothing reaches the test runner's output.

**A line.** `createLogger(sinks)` returns `info`, `warn` and `error`, each taking an event name, a
short message, flat fields (strings, numbers and booleans; undefined ones are left out) and an
optional error. It writes one JSON object per line, shaped for CloudWatch so a Lambda can send
the same lines unchanged:

```json
{"timestamp":"2026-10-12T18:30:00.123Z","level":"ERROR","event":"section.failed","message":"Writing the-haunt-that-listens/the-room-controller failed","manualId":"the-haunt-that-listens","sectionId":"the-room-controller","characters":812,"durationMs":3150,"reason":"error","error":{"name":"Error","message":"…","stack":"…"}}
```

- `timestamp` is ISO 8601 in UTC; `level` is `INFO`, `WARN` or `ERROR`, from the values Lambda's
  log-level filtering reads (`DEBUG` is the fourth, which nothing logs); then `event`, `message`
  and the fields. Only the `error` nests: `{ name, message, stack }`, or the thrown value's type
  and text when it isn't an `Error`.
- **Standard output** is written with `process.stdout.write`, not `console.log`, which Lambda's
  text format would prefix. `main.ts` ignores errors on standard output, so a closed pipe
  (`EPIPE`) can't stop the server.
- **The log file** is the only local part: `toLogFile(dataDir)` appends each line to
  `<dataDir>/logs/<UTC date>.jsonl`.
  - The first line written each UTC day creates the folder if needed, then removes the log files
    older than 14 days (that day's and the 13 before it are kept; other files are left alone).
  - **A daily budget of 50 MB** (`LOG_BYTES_PER_DAY`), counting what the day's file already holds
    when the server starts. Any page can make the server log a `request` or `request.refused`
    line, so past the budget one last `log.file-full` WARN line goes into the file, and the rest
    of the day's lines go to standard output only.
  - Writes are synchronous, so lines keep their order and none is lost when the process exits.
  - A write that fails is never thrown, so the log file can't crash the server or fail a request.
    The first failure is reported on standard error, and the next line tries again from the
    start, creating the folder if it is gone.

**What is logged.** Ids, sizes, counts and durations, never a manual's text, a prompt, a
conversation or a reply, a request's query or headers (other than a refused request's `Host` and
`Origin`), or credentials. A browser error's message and stack are logged as the browser reports
them. The Bedrock client writes the AWS keys out of a thrown error's message and stack, since a
signature error from AWS quotes the access key ID.

| Event | Level | When, and its fields |
| --- | --- | --- |
| `server.started`, `server.stopped` | INFO | `startServer` listening (`port`, `models`, `dataDir`), and `close()` done |
| `server.refused` | WARN | The data folder's lock is held by another server (`pid`, `dataDir`) |
| `server.start-failed`, `server.crashed` | ERROR | The server couldn't start (an unpriced model, missing credentials, a port in use); an uncaught exception or unhandled rejection in `main.ts` |
| `request` | INFO, WARN for 5xx | Each request, once its response closes: `requestId` (a UUID), `method`, `path` (without the query), `status`, `durationMs`, and `clientClosed` when the client left before the response ended |
| `request.refused` | WARN | The local-only checks refused it, or its body was too long or not JSON (`status`, `host`, `origin`) |
| `request.failed` | ERROR | A handler threw (the 500 above) |
| `model.call` | INFO, WARN when failed | Each gateway call once it settles: `callId` (the ledger's), `job`, `model`, `outcome`, the four token counts, `usd`, `estimated`, `durationMs`; a failed call's error |
| `model.refused` | WARN | The gateway refused a call: `job`, `model`, `reason` (`kill-switch`, `daily-cap`, `monthly-cap` or `busy`) |
| `ledger.line-skipped` | WARN | A ledger line that isn't JSON (`file`, `line`) |
| `section.started`, `section.joined` | INFO | A run starts; a reader joins one (`listeners`, `backlogCharacters`) |
| `section.finished`, `section.aborted` | INFO | A run ends with `written` (`placeholder`), or its last reader left; `characters` and `durationMs` |
| `section.failed` | WARN for budget, ERROR | A run fails (`reason`), with the error unless the budget refused it |
| `section.refused` | WARN | A run beyond `maxConcurrentRuns` (`activeRuns`) |
| `librarian.reply` | INFO, WARN for budget, ERROR | A reply ends: `outcome` (`done`, `aborted`, `budget` or `error`), `messages`, `turns`, `tools` (the tools the model called, comma-separated), `durationMs`; a failed reply's error |
| `agent.tool-failed` | WARN | A tool threw, and the model got an error result (`tool`) |
| `manual.cleanup-failed` | ERROR | A deleted manual's folder couldn't be removed (`manualId`, `folder`) |
| `client.error` | ERROR, WARN for a request | What the browser reported (below) |
| `client.limited` | WARN | Once an hour, when browser reports pass the hourly limit |
| `log.file-full` | WARN | Written by the log file itself, as the day's last line in it |

**Browser errors.** `src/reportErrors.ts` reports what goes wrong in the page to `POST
/api/client-errors`, which is subject to the local-only checks like any route:

- `startReportingErrors()`, called in `main.tsx`, listens for `error` (an uncaught error) and
  `unhandledrejection` on `window`. `apiFetch`, which the library, manual and librarian stores
  use in place of `fetch`, reports a request that gets no answer or a 5xx. A 4xx is the server's
  own answer and already in its `request` line. Section streams aren't reported: the browser fires
  an `error` on an `EventSource` whenever the page is left mid-stream, and a stream the server
  ends early is in its own log (`section.aborted`, `clientClosed`).
- A report is `{ kind, page, … }`, the `ClientErrorReport` in `api/types.ts`: `error` or
  `rejection` with the error's `name`, `message` and `stack`; or `request` with its `method`,
  `path` and `status` (none when there was no answer). `page` is the page's path, without its
  query. It is sent with `fetch(…, { keepalive: true })`, and a report that fails is dropped, never
  reported. Nothing is sent before `startReportingErrors()`, so tests send nothing, and a page
  sends at most 20.
- The route takes untrusted input. The body is capped like any other, and the schema is strict:
  an unknown field is `400`, a request's `method` is `GET`, `POST` or `DELETE`, and its `path` is
  printable ASCII starting `/api/`. Long strings are cut rather than refused (the page and path
  to 300 characters, the message to 1,000, the stack to 4,000). At most 60 reports an hour (UTC)
  are logged; past that it answers `429` and logs `client.limited` once, so a page that fails in
  a loop can't fill the disk.
- The route logs an error or rejection as `client.error` at ERROR with the browser's error
  nested, and a failed request at WARN with its `method`, `path` (without its query) and
  `status`.

**`npm run logs`** (`server/logs.ts`, with `logging/log-reader.ts`) reads the daily files and
prints the recent entries, oldest first, as `timestamp LEVEL event message key=value …` with an
error's stack indented under it; `README.md` › Logs has its options.

- **Nothing in a line can pass for another line.** Control characters (U+0000–U+001F and
  U+007F–U+009F) are shown as `\uXXXX`, in the line and in each line of a stack, so a browser's
  message can't start a forged line or send the terminal escape sequences. A field's value is
  shown bare only when it is printable ASCII without spaces or quotes, and as JSON otherwise.
- **Following.** Before it reads the recent entries, it notes the size of today's file. It then
  reads that file from there every 500ms, taking whole lines only (`completeLinesFrom`), so a line
  still being written is read once it is whole and none written meanwhile is missed. When the
  UTC day changes it moves to the new day's file.
- Lines that aren't log entries are skipped.

**Tests**, next to each module: the line's shape and levels; the daily files, retention, the
daily budget, and a failed write and the recovery after it; reading, filtering, formatting with
control characters escaped, and reading whole lines from an offset (the follow loop itself is
not tested); the request, refusal, model-call, run and reply entries; the client-error route
(its fields, the local-only checks, truncation and the hourly limit); `main.ts` writing the same
lines to standard output and the file; and that no cookie, query, conversation or section text
reaches the log file (`api/logging.test.ts`), nor an AWS key from a Bedrock error
(`gateway/bedrock-client.test.ts`, since only `server/gateway/` may use the Bedrock client).

## 10. The reader's store

The browser's side of the API (`src/manual/`: reading a manual, streaming its sections, at most
three streams at once, and the preview options) is documented in `src/manual/README.md`.
