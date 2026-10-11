# RTFM — architecture

A local Node server stores the manuals and their sections. It writes unwritten sections, with a fake
writer or with Claude Haiku 4.5 on Amazon Bedrock, and streams them to the reader. Every model call
goes through one gateway that caps spending.

```
browser (Vite, :5173)                        server (node:http, :8787)
  src/manual store ── /api (Vite proxy) ──▶  api/ routes ──▶ writer/runs ──▶ fake writer
                                                  │                    └──▶ Bedrock writer ──▶ gateway ──▶ Bedrock
                                                  └──▶ storage/ (manuals, sections, ledger: files in .data/)
```

## Decisions

1. **Model: `global.`.** It is 10% cheaper than `us.`, and nothing here needs routing that stays
   in the US.
2. **The last reader leaving mid-section stops the call at once.** Reloading mid-section starts
   the writing again from scratch; there is no grace period.
3. **The kill switch is reported as `reason: "budget"`**, so the reader shows "budget reached".
4. **Progress while Claude writes is approximate**: characters against the expected length
   (`sectionExpectedCharacters`), capped at 99%, so "Being written · 46%" may jump at the end.

## 1. The server

The server lives in the top-level `server/` folder, next to `src/` and `scripts/`. It runs as TypeScript directly on
Node 22.18+, as `scripts/` does, with its own `tsconfig.server.json` (`module: nodenext`,
`allowImportingTsExtensions`, `noEmit`, the same strict flags), referenced from `tsconfig.json`.

```
server/
  main.ts                 starts the server from config.ts (npm run server)
  dev.ts                  npm run dev: Vite plus `node --watch server/main.ts`
  config.ts               committed settings (section 6)
  app.ts                  startServer(config, writer?): builds storage, writer and gateway; routes
  testing.ts              helpers shared by the tests
  usage.ts                npm run usage
  api/
    types.ts              the API contract shared with the browser (section 2)
    route.ts              Route, ApiRequest, EventSink: what handlers see
    node-adapter.ts       node:http ⇄ ApiRequest, JSON responses, the event stream
    lookup.ts             finds a manual that has a given section
    library.ts            GET /api/manuals
    manual.ts             GET /api/manuals/:manualId
    delete-manual.ts      DELETE /api/manuals/:manualId
    section.ts            GET /api/manuals/:manualId/sections/:sectionId
    section-stream.ts     GET /api/manuals/:manualId/sections/:sectionId/stream
    preview.ts            ?freeze, ?fail and ?library=empty: canned, never stored, never billed
  storage/
    types.ts              ManualStore, UsageLedger
    file-manual-store.ts  manuals and sections as files
    file-ledger.ts        the usage ledger as JSON lines
    files.ts              reads a file or folder that may not exist
    manual.ts             a manual's chapters and sections in reading order
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
    section-text.ts       holds back the opening and yields whole words
    validate.ts           cheap output checks
  gateway/
    types.ts              ModelClient, ModelEvent, GatewayConfig, refusal errors
    gateway.ts            caps, reservations, concurrency, idle timeout, kill switch, ledger
    ledger-calls.ts       pairs reserve and settle entries into calls (replay and usage)
    prices.ts             the dated price table, cost and worst-case cost
    credentials.ts        reads the AWS keys from .env.local
    bedrock-client.ts     the only file that imports @anthropic-ai/bedrock-sdk
    usage-report.ts       formats npm run usage
    sdk-boundary.test.ts  fails if anything else imports the SDK or the client
```

Tests sit next to the code (`*.test.ts`). Any test that starts a server binds port 0.

**Running it**

- `npm run dev` runs `node server/dev.ts`. It spawns `vite` and `node --watch server/main.ts`,
  with their output passed through.
  - It forwards SIGINT and SIGTERM to both children and waits for both to exit before it exits
    itself.
  - If one child exits, it stops the other the same way, so nothing is left holding port 5173.
  - It is a separate process rather than a Vite plugin, so the server runs the same way in
    development as it would deployed.
- `vite.config.ts` adds `server.proxy` and `preview.proxy`: `{ "/api": "http://localhost:8787" }`.
  It imports `API_PORT` from `server/config.ts`, so the port is written down once. When the API
  server's response closes before it is complete (the server stopped or restarted mid-section),
  the proxy destroys the browser's response too, so the reader's stream fails with "couldn't
  write this section" instead of hanging.
- `npm run server` runs the server alone, for `curl` and `npm run preview`.
- `.claude/launch.json` runs `npm run dev`.
- `npm run shot` starts the server in process with `startServer({ ...config, port: 0,
  dataDir: <temp dir>, writer: "fake" })` and points its Vite proxy at it. Every run starts from
  the seed and never touches `.data/` or Bedrock.

**Plain handlers, ready for Lambda.** Handlers import only `api/route.ts`, never `node:http` or
the Node adapter.

```ts
// server/api/route.ts
export interface ApiRequest {
  params: Record<string, string>;   // from the route pattern
  query: URLSearchParams;
  signal: AbortSignal;              // aborts when the client disconnects
}
export interface JsonResponse { status: number; body: unknown }
export interface EventSink {
  send(event: string, data: unknown): void;   // `event: …\ndata: <json>\n\n`
}
export type EventStream = (sink: EventSink) => Promise<void>;   // the stream ends when it resolves
export interface Route {
  method: "GET" | "DELETE";
  pattern: string;
  handle(request: ApiRequest): Promise<JsonResponse | EventStream>;   // so a stream route can 404
}
```

The Node adapter:

- matches `method` exactly, and `pattern` by splitting the path on `/`;
- turns `res.on("close")` into the `AbortSignal`;
- writes the SSE headers (`content-type: text/event-stream`, `cache-control: no-cache`);
- writes a response whose `body` is `undefined` with no body and no content type (`noContent`, 204).

## 2. The API

The wire types live in `server/api/types.ts`. The browser imports them with `import type`, so
nothing from `server/` reaches the bundle: `src/manual/types.ts` re-exports them.

```ts
interface ManualSummary { id; title; subtitle; chapterCount; sectionCount; writtenCount }
interface Manual  { id; title; subtitle; chapters: Chapter[]; appendices: Chapter[] }   // no voice
interface Chapter { id; label; title; sections: Section[] }
interface Section { id; label; title; summary; status: "unwritten" | "writing" | "written" }  // no body

type SectionEvent =
  | { event: "append";  data: { at: number; text: string; progress: number } }
  | { event: "written"; data: {} }
  | { event: "frozen";  data: {} }
  | { event: "failed";  data: { reason: "budget" | "error" } };
```

| Route | Response |
| --- | --- |
| `GET /api/manuals` | `200 ManualSummary[]`, every manual in storage, sorted by title |
| `GET /api/manuals/:manualId` | `200 Manual` (`writing` while a run is active), or `404` |
| `DELETE /api/manuals/:manualId` | `204` (no body), `404`, or `409 { error }` while a section of it is being written |
| `GET /api/manuals/:manualId/sections/:sectionId` | `200 { status, body? }`, with the body only when written, or `404` |
| `GET /api/manuals/:manualId/sections/:sectionId/stream` | `text/event-stream` (below), or `404` |

Any other path or method gets `404 { error: "Not found" }`, and a handler that throws gets
`500 { error: "Internal error" }` (or, once a stream has started, the stream just ends).

**The library** (`api/library.ts`). A summary's counts come from storage, never from the seed:

- `chapterCount` counts chapters and appendices;
- `sectionCount` counts every section in the table of contents;
- `writtenCount` counts the sections that have a stored body. A section being written counts once
  it is saved.

Titles are sorted with `localeCompare(…, "en")`, so "The Haunt That Listens" sorts under T.

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
- **No auto-reconnect.** After `written`, `frozen` or `failed`, and on any `error` event, the
  client closes the `EventSource`. An `error` counts as `failure: "error"`. Reconnecting would pay
  for a second run.
- **Retrying** is the reader's **Try again**, in place with no reload: the store opens the stream
  again, which starts a new run because the server kept the section unwritten. Until then a
  failure sticks for the page load. A reload would also abort this tab's other running sections.
- **Preview options**, for screenshots: `?freeze=<0–1>` and `?fail=budget|error` on a stream, and
  `?library=empty` on `GET /api/manuals`.
  - `api/preview.ts` handles them before any run, writer or storage write is touched, so they cost
    nothing and change nothing, whichever writer is configured.
  - **Empty library** answers `200 []`, so the landing page's empty state can be shown without
    deleting anything.
  - The stream options only apply to sections that aren't written.
  - **Freeze** cuts the seed body at the last chunk end at or before the fraction (the rule in
    `frozenLength`). It sends one `append` (none for 0) with `progress = cut / body.length`, then
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

Two narrow interfaces in `server/storage/types.ts`, so the gateway only ever sees the ledger.
`StoredManual` is the manual as it is stored: the `Manual` fields plus `voice`, with no statuses
and no bodies.

```ts
interface ManualStore {
  listManuals(): Promise<StoredManual[]>;
  getManual(manualId: string): Promise<StoredManual | undefined>;
  putManual(manual: StoredManual): Promise<void>;   // the seed now; TOC creation later
  deleteManual(manualId: string): Promise<void>;    // the manual and its sections; nothing if missing
  getBody(manualId: string, sectionId: string): Promise<string | undefined>;
  saveBody(manualId: string, sectionId: string, body: string): Promise<"saved" | "already-written">;
  writtenSectionIds(manualId: string): Promise<string[]>;
  seededManualIds(): Promise<string[]>;             // the seeding record
  markSeeded(manualId: string): Promise<void>;
}

interface UsageLedger {
  append(entry: LedgerEntry): Promise<void>;   // into the file for the entry's reservedAt month
  entriesForMonth(month: string): Promise<LedgerEntry[]>;   // "2026-10", UTC
}
```

The local files live in `.data/` (gitignored). Tests and the shot script pass a temp `dataDir`.

```
.data/manuals/<manualId>/manual.json         StoredManual
.data/manuals/<manualId>/sections/<id>.md    one file per written section
.data/seeded.json                            the ids of the seed manuals already seeded
.data/ledger/2026-10.jsonl                   one JSON line per ledger entry, append-only
.data/STOP                                   the kill switch (section 5)
```

- **Written sections:** a section is written when its `.md` file exists, so there is no status
  to keep in sync.
- **`saveBody`** writes a temp file, then `link`s it into place. `link` fails if the file already
  exists, so a section can't be written twice. It throws if the manual doesn't exist, rather than
  creating its folder, so a late write can't leave a deleted manual's sections behind.
- **`listManuals`** reads every folder in `manuals/` whose name is a slug and has a
  `manual.json`.
- **`deleteManual`** renames the manual's folder to `<manualId>.<uuid>.deleting`, which isn't a
  slug and so is never listed, then removes it. The manual disappears in that one step. If the
  removal fails part-way, the failure is logged and the delete still succeeds: the manual is
  already gone, and the leftover folder is ignored.
- **`markSeeded`** rewrites `seeded.json` through a temp file and a `rename`.
- **Replay:** reading the ledger skips a cut-off last line, left by a crash mid-append.
- **Seeding:** on start, `seedStore` seeds each manual in `server/seed/` once. The store keeps a
  record of the seed manuals it has seeded (`seededManualIds`), and for each seed manual not in
  it:
  - if the store has no manual with that id, it puts the TOC, then saves the bodies of the
    sections the seed marks written (the sample's 7 of 18; none for the others);
  - if the store already has it (a data folder from before the record existed), it leaves it
    exactly as it is, written sections included;
  - either way, it then records the id.

  So a seed manual added to `server/seed/` later is seeded on the next start, and a deleted seed
  manual stays in the record and is never seeded again. A crash after the TOC is put but before
  every seed body is saved leaves that manual with fewer sections written; they are written on
  demand like any other.
- **Reset:** to reset the manuals, stop the server and delete `.data/manuals/` and
  `.data/seeded.json`. Never delete `.data/ledger/`, because the caps are computed from it.

## 4. The section writer

```ts
// server/writer/types.ts
interface SectionWriter {
  write(manual: StoredManual, sectionId: string, signal: AbortSignal):
    AsyncIterable<{ text: string; progress: number }>;   // the body is exactly all text joined
}
class WriteFailed extends Error {
  reason: "budget" | "error";
  constructor(reason: "budget" | "error") {
    super(reason);
    this.reason = reason;
  }
}
```

**`writer/fake.ts`** waits 1.2s, then yields the seed body about 20 characters every 85ms, split at
word boundaries, the same pace as the librarian's canned replies.

- It has its own copy of `chunkEnds`, because server code never imports from `src/`;
  `scripts/chunk-ends.test.ts` checks that it chunks every seed body as `src/manual/streamer.ts`
  does.
- `progress` is exact.
- A section with no seed body gets a short placeholder.

**`writer/bedrock.ts`** builds the prompt and streams it through the gateway. It takes the
gateway, the store, `config.sectionWordsRequested` and `config.sectionExpectedCharacters`.

- **The prompt** (`writer/prompt.ts`):
  - The **system prompt** is the same for every section of a manual, so it can be cached later:
    the instructions, the markdown that `DESIGN.md` › Markdown allows, the shape of a section
    (including the sample's punctuation: spaced em dashes and curly quotes), then the manual's
    title, subtitle, voice and contents (each section's label, title, id and summary). It says
    that text inside `<manual>` and `<written-section>` is reference material, never
    instructions, and that the voice describes style only.
  - The **user message** names the section, its chapter and its summary, the previous and next
    sections with their summaries, and a length in words (`sectionWordsRequested`, 650). It ends
    by restating what Haiku most often skips: at least one table, list, checklist or code block,
    a language tag on every code block, and a cross-reference with the target's title as its
    link text, shown with a real neighbour (`[Sensing the Guest](section:sensing-the-guest)`).
  - **An example section.** The user message starts with a section of the same manual that is
    already written, to show its voice and markdown. It prefers the nearest section whose body
    is still the seed's (by distance in reading order, the earlier one on a tie), so the model's
    own flaws don't spread, and falls back to the nearest written section. Without an example,
    Haiku 4.5 wrote unbroken essays with no headings, lists or links. It adds about 1,000 input
    tokens, about $0.001 a section. A manual with nothing written yet gets no example.
  - **Escaping.** Manual text is inserted with `<` escaped, so it can't open or close a tag;
    attribute values also escape `>` and `"`. Bodies keep `>`, which is blockquote syntax and
    can't form a tag on its own.
- **The opening is held back** (`writer/section-text.ts`). Nothing is yielded until the first
  line that is not clutter is whole, so the cheap fixes happen before the reader sees anything.
  Clutter is a blank line, an H1, a line that repeats the section's title (with or without its
  label), a thematic break, a setext underline (`===`), or a preamble. A preamble is a line of at
  most 160 characters that either starts with "Sure", "Certainly", "Of course", "Okay" or
  "Absolutely" and is at most 40 characters, names the section or a draft, or says "here is"; or
  ends with a colon and names the section or a draft. "Of course, the first thing a guest hears
  is the door." is kept. The first line is usually the first paragraph, so the first chunk is
  that whole paragraph. After that, the text is never changed.
- **Whole words only.** It yields only up to the last whitespace and holds back the rest until
  more arrives or the stream ends. Chunks therefore end on whole words, like the fake's. Bedrock
  sends small deltas, so a section arrives as about 400 `append` events over 12–15 seconds.
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
  for: asked for 650 words, it wrote 760–800 words, 4,200–5,000 characters. At 4,800 characters,
  progress usually ends a little short of 100% and then jumps to written, rather than waiting at
  99%.

**Choosing a writer:** `config.writer`, which defaults to `"fake"` (used by tests and screenshots);
`RTFM_WRITER=bedrock` selects Claude. With `"bedrock"`, `startServer` checks every job's model
against the price table (`ModelNotPriced`), then reads the credentials (`CredentialsMissing`),
then builds the Bedrock client, the file ledger, the gateway and the writer, all before it seeds
or listens. Either problem therefore stops the server from starting, and an unpriced model is
reported without reading any secret.

**One writer per section** (`writer/runs.ts`): an in-memory `Map` keyed by `manualId/sectionId`.

- **Opening a section** checks the map, then storage (`getBody`), then the map again. If there is
  still no entry, it creates the run in the same tick, so two requests can't both start one.
- **Finished runs stay in the map** as `written`, which closes the gap between a request reading
  storage and a run finishing. If `saveBody` returns `already-written`, the run sends `written`
  anyway: the stored body is the one that counts.
- **`isWriting(manualId)`** says whether any section of a manual has a run in progress, for the
  delete route.
- **Statuses come from storage** for any section not being written. If a written section's file
  has been deleted by hand, opening it drops the stale `written` entry and writes it again.
- **Listeners:** the first request starts the writer with its own `AbortController`. Later
  requests subscribe and get the backlog first.
- **Ending:**
  - When the writer finishes, `saveBody`, then `written`.
  - When the writer throws, `failed`, and the entry is removed. Nothing is stored.
  - **When the last listener disconnects, the run is aborted**, which aborts the Bedrock call
    (section 5), and the partial text is discarded.
- **At most 3 runs at once** (`config.maxConcurrentRuns`). A fourth request gets `failed:
  "error"`. Each writing section holds one browser connection, and HTTP/1.1 allows 6 per origin,
  so this keeps the page's other requests flowing. The reader keeps a section's stream open while
  it navigates elsewhere.

## 5. The model gateway

`server/gateway/` is the only route to a model. The writer passes a job name, a prompt and a
signal. It never sees a model ID, a price or the SDK.

```ts
// server/gateway/types.ts
type Job = "write-section";              // later: "write-toc", "librarian"
interface Prompt { system: string; messages: { role: "user" | "assistant"; content: string }[] }

interface ModelClient {                  // bedrock-client.ts, and a fake for tests
  stream(request: { model: string; maxTokens: number; prompt: Prompt; signal: AbortSignal }):
    AsyncIterable<ModelEvent>;
}
type ModelEvent =
  | { type: "text"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number;
      cacheWriteTokens?: number; cacheReadTokens?: number }
  | { type: "stop"; reason: string };    // end_turn, max_tokens, refusal, …

// server/gateway/gateway.ts
async function createGateway(deps: {
  client: ModelClient; ledger: UsageLedger; config: GatewayConfig;
  prices: PriceTable; dataDir: string; now?: () => Date;
}): Promise<{ stream(job: Job, prompt: Prompt, signal: AbortSignal): AsyncIterable<ModelEvent> }>;
// the stream's first step throws SpendingRefused ("daily-cap" | "monthly-cap" | "kill-switch")
// or GatewayBusy; a stalled call throws ModelStalled, and a stream that ends without a stop
// reason throws ModelStreamIncomplete
```

`createGateway` rejects with `ModelNotPriced` if any job's model is missing from the price table,
so the server refuses to start. It is async because it replays the ledger before it returns. The
stream is an async generator, so a refusal surfaces on the first `next()`, before any event. A
signal that is already aborted is refused without a reservation.

**Callers must read the stream with `for await`**, which calls `return()` when they stop early,
so the call is aborted and settled. An iterator that is abandoned without `return()` never
settles. The caps stay safe, because its reservation keeps counting at the worst case, but the
call stays "running" until the server restarts.

Then, for each call:

1. **Kill switch.** If `.data/STOP` exists (`existsSync`, so steps 1–5 up to the ledger write are
   one synchronous step), refuse. Creating the file stops new calls at once, with no restart, and
   deleting it resumes them. A call already running finishes; it is bounded by `max_tokens`.
2. **Concurrency.** If `maxConcurrentCalls` (3) calls are running, throw `GatewayBusy`.
3. **Worst case.** `(inputBound × highest input price) + (max_tokens × output price)`.
   - `inputBound` is the prompt's UTF-8 byte length, plus 100 tokens for the request's framing and
     10 for each message's.
   - A token is at least one byte, so this is a true upper bound with no tokenizer.
   - The input is priced at the highest of the input, cache-write and cache-read prices, so cache
     writes can never cost more than the reservation.
   - `inputTokenBound` counts only plain-text system prompts and messages. It must change if
     prompts gain tools, images or system prompts made of blocks.
4. **Caps.** For the day and the month (UTC, as AWS bills), `settled + reserved + worst case` must
   stay at or under the cap. The check and the reservation are one synchronous step on in-memory
   totals, so two calls can't both slip under.
5. **Reserve.** Append `{ kind: "reserve", callId, reservedAt, job, model, worstCaseUsd }` and await
   it. If the append fails, the in-memory reservation is released and the error is rethrown.
6. **Call.** `client.stream(...)`, re-yielding events.
   - The writer's signal goes straight to the SDK request, combined (`AbortSignal.any`) with the
     gateway's own cut-off signal, so a disconnect aborts the HTTP call. If the writer stops
     reading early, the gateway aborts the call itself.
   - **Idle timeout:** 30s with no event aborts the call, with outcome `failed`, and the stream
     throws `ModelStalled`. The timer starts before the request is sent, so it also covers a
     request that never answers.
   - The timer also runs while the caller holds an event. This is deliberate: a caller that
     stops pulling for 30s is as stuck as a model that stops sending, and the HTTP call should
     not stay open for it. The section writer only hands each chunk on, so it never comes close.
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
   - **Input tokens** come from `message_start`. If that never arrived, the input bound is used,
     at the plain input price.
   - **Output tokens:**
     - On a complete call they come from the final `message_delta`. `message_start` also carries
       an `output_tokens`, but it is a placeholder (1), so the client doesn't map it.
     - **Any call that doesn't complete (aborted, stalled or failed) is charged its full reserved
       output (`max_tokens`)** and marked `estimated: true`. The stream doesn't tell us what
       Bedrock billed after the cut. Compare this against Cost Explorer before anything less
       conservative is used; that has not been done yet.
     - `estimated` is also set if a complete call never reported its input or output tokens.

**The ledger is the durable record.** On start, the gateway replays this month's file into its
totals. A `reserve` with no `settle` (the server died mid-call) counts at its worst case, and
`npm run usage` lists it as unsettled.

- **Totals in memory** are one map from period (`2026-10-11` or `2026-10`) to committed dollars.
  Reserving adds the worst case to the reservation's day and month; settling adds `usd − worst
  case` to the same two periods.
- **One server process per data folder.** The totals live in one process's memory, so two
  servers on the same `.data/` would each allow the full caps. The DynamoDB version (Later)
  moves the check into the database.
- **`gateway/ledger-calls.ts`** pairs `reserve` and `settle` entries into calls. The replay and
  `npm run usage` both use it, so they count spend the same way. `monthOf` comes from
  `storage/file-ledger.ts`, which files entries by it.

**`bedrock-client.ts`** is the only importer of `@anthropic-ai/bedrock-sdk`:

```ts
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";

export function createBedrockClient(
  credentials: AwsCredentials,
  { timeoutMs, baseURL = regionalURL(credentials.region) }: { timeoutMs: number; baseURL?: string },
): ModelClient {
  const client = new AnthropicBedrock({
    awsAccessKey: credentials.accessKeyId,       // from .env.local, never process.env
    awsSecretKey: credentials.secretAccessKey,   // not awsSecretAccessKey, which the SDK ignores
    awsRegion: credentials.region,               // explicit, so AWS_REGION is never read
    baseURL,                                     // explicit, so ANTHROPIC_BEDROCK_BASE_URL is never read
    apiKey: null as unknown as undefined,        // see below
    providerChainResolver: async () => { throw new Error(CREDENTIAL_CHAIN_REFUSED); },
    maxRetries: 0,                               // one reservation, one HTTP call
    timeout: timeoutMs,                          // config.idleTimeoutMs
  });
  // client.messages.stream({ model, max_tokens, system, messages }, { signal }), mapped to ModelEvent:
  // message_start and message_delta → usage, text_delta → text, message_delta's stop_reason → stop
}
```

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
  reservation. It is set to 0.
- **`timeout`** defaults to 10 minutes and covers only the wait for response headers (step 6).
- **Streaming abort:** the signal passed in the request options stays attached until the body is
  settled, so aborting it mid-stream closes the HTTP connection. But `MessageStream`'s iterator
  does not always throw afterwards: an abort or error that lands between two `next()` calls
  ends the iteration quietly. The gateway's checks after the loop (step 7) catch this.
- **Response framing:** Bedrock answers with `application/vnd.amazon.eventstream`, which the SDK
  transcodes to server-sent events in `core/streaming.js`. Exception frames become SSE `error`
  events, which the stream throws.
- **The model ID** goes into the path unencoded: `/model/global.anthropic.claude-haiku-4-5-20251001-v1:0/invoke-with-response-stream`.

Haiku 4.5 has thinking off unless asked, and no `cache_control` is sent, because the shared
prefix is too short to cache.

**`credentials.ts`** reads the file at the repo root:
`util.parseEnv(readFileSync(new URL("../../.env.local", import.meta.url), "utf8"))`.

- The result goes into a local object, never `process.env`.
- It takes exactly `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, and treats an
  empty or blank value, or a missing file, as missing.
- If any is missing, it throws `CredentialsMissing`, which names the missing variables and never
  prints a value, so the server refuses to start with the Bedrock writer. `app.ts` calls it when
  `config.writer` is `"bedrock"`.

**Tests, all offline**

- **SDK boundary.** `sdk-boundary.test.ts` scans the text of every source file (`.ts`, `.tsx`,
  `.js` and their `m`/`c` forms) under `src/`, `server/` and `scripts/`, and of the root source
  files. It fails if any file other than `bedrock-client.ts` has a quoted or backticked string
  starting with `@anthropic-ai/` or `@aws-sdk/`, which covers every form of import. It also fails
  if anything outside `server/gateway/` and `server/app.ts` imports `bedrock-client`, so nothing
  can call the client without going through the caps.
- **Credentials.** `bedrock-client.test.ts` points the client at a local `node:http` server on
  port 0 that answers with real `application/vnd.amazon.eventstream` frames (built with
  `@smithy/eventstream-codec`, a dev dependency), with fake keys. `AWS_PROFILE`,
  `AWS_BEARER_TOKEN_BEDROCK`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
  `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BEDROCK_BASE_URL` are all set to
  decoys.
  - The request is SigV4-signed with the fake key id for `us-west-2/bedrock`, and carries no
    bearer token, no `x-api-key` and no decoy value. This proves the `apiKey: null` cast works at
    runtime.
  - With an empty key, the call fails with the resolver's error and the server receives nothing.
    This proves the default chain never runs: it would otherwise sign with the decoy env keys.
  - Removing either guard makes these tests fail (checked by hand).
  - The events are mapped, the stream's HTTP request closes when the signal aborts, and a 503
    gets exactly one attempt.
  - Through the real gateway: a complete stream settles at the reported usage; a mid-stream
    exception frame, a body cut off mid-frame, and a body that ends between frames without a
    stop each settle as `failed` at the full reserved output.
  - `credentials.test.ts` covers reading the three keys from a temp file without touching
    `process.env`, and refusing a missing or empty key, or a missing file.
- **Gateway.** A fake `ModelClient` covers:
  - each cap, including a call refused on its worst case, running calls and unsettled
    reservations counting at their worst case, and last month's spend not counting;
  - settling, and a settle that crosses midnight;
  - an unpriced model at start-up;
  - the concurrency limit, the kill switch, and the idle timeout, including a call that never
    sends its first event and a caller that holds an event too long;
  - an aborted stream, recorded at its full reserved output, and a failed one;
  - a client that ends without a `stop`, and one that ends quietly after the signal aborts;
  - a failed reserve append, which releases the reservation.

**`npm run usage`** (`server/usage.ts`, with the formatting in `gateway/usage-report.ts`) prints
today's and this month's spend (UTC) against the caps, by model and by job. It also shows call
counts, aborted, failed and estimated calls, unsettled reservations, and whether the kill switch
is on. `npm run usage -- <dataDir>` reads another data folder; the tests use this.

## 6. Configuration

| Setting | Where | Secret |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | `.env.local`, read only by `gateway/credentials.ts` | yes |
| Writer, port, data dir, caps, concurrency, jobs, section length | `server/config.ts` | no |
| Prices | `server/gateway/prices.ts` | no |

```ts
// server/config.ts
export const API_PORT = 8787;
export const config: ServerConfig = {
  port: API_PORT,
  dataDir: fileURLToPath(new URL("../.data", import.meta.url)),   // <repo>/.data, whatever the cwd
  writer: writerFromEnv(process.env.RTFM_WRITER),   // "fake" (default) or "bedrock"; anything else throws
  maxConcurrentRuns: 3,
  sectionWordsRequested: 650,
  sectionExpectedCharacters: 4800,
  caps: { dailyUsd: 2, monthlyUsd: 20 },
  maxConcurrentCalls: 3,
  idleTimeoutMs: 30_000,
  jobs: {
    "write-section": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 2048 },
  },
};
```

- **Types.** `config` is a `ServerConfig`, which extends `GatewayConfig` (`caps`,
  `maxConcurrentCalls`, `idleTimeoutMs`, `jobs`, in `gateway/types.ts`) with the port, data dir,
  writer, `maxConcurrentRuns`, `sectionWordsRequested` and `sectionExpectedCharacters`.
  `startServer` and the gateway take it as it is, so tests and the shot script spread `config`
  and override what they need.
- **`maxTokens: 2048`.** The sample sections are 460–660 words (about 650–950 tokens), so this
  leaves room. Its output costs at most about $0.01 (2,048 × $5 per million), and with the input
  bound a call's worst-case reservation is about $0.025.
- **`sectionWordsRequested: 650`** is the length the prompt asks for, about the sample's own
  sections (460–660 words). **`sectionExpectedCharacters: 4800`** is the length the Bedrock
  writer's progress counts to, set from what Haiku actually writes (see section 4).
- **Trying another setting** (a tiny cap, say) needs no edit here: a scratch script calls
  `startServer({ ...config, caps: { dailyUsd: 0.001, monthlyUsd: 20 } })`.
- **`BEDROCK_MODEL_ID` in `.env.local`** is ignored: `credentials.ts` takes only the three names
  above, and `.env.local` never reaches `process.env`.

```ts
// server/gateway/prices.ts — USD per million tokens
export const prices = {
  checkedOn: "2026-10-11",
  models: {
    "global.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 1.00, output: 5.00, cacheWrite: 1.25, cacheRead: 0.10 },
    "us.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 1.10, output: 5.50, cacheWrite: 1.375, cacheRead: 0.11 },
  },
};
```

- **Sources:**
  - Anthropic's Haiku 4.5 list price, $1 / $5 (the `claude-api` skill, cached 2026-10-06).
  - Anthropic's Bedrock guide, checked 2026-10-11: regional endpoints cost 10% more for Sonnet 4.5
    and later models.
  - Cache prices use the standard 1.25× and 0.1× multipliers.
  - **Unconfirmed on AWS's pricing page.** Check real calls against Cost Explorer.
- **Measured cost:** $0.007–0.010 per section (about 2,900–3,200 input and 970–1,410 output
  tokens), with a worst-case reservation of about $0.025. A call aborted mid-section is charged
  its full `max_tokens`, about $0.013. Not yet checked against Cost Explorer.

## 7. The reader's store (`src/manual/`)

**How it reads the API**

- **`useManual()`** fetches `GET /api/manuals/the-haunt-that-listens` once, from a module-level
  promise, and suspends on it with `use()`. The lazy route's `Suspense` covers the wait. After
  that it is the same `useSyncExternalStore` store. The id is a constant until routes carry one.
- **`useSection(id)`** suspends with `use()` on a cached promise for the JSON section route.
  - **Written sections** render straight away, with no stream.
  - **Unwritten sections** open an `EventSource`, once per section per page load and held at
    module level, so a section keeps writing while the reader is elsewhere.
  - **Events:** `append` sets the text at `at`. `written` marks the section written, keeping its
    text. `frozen` keeps it writing. `failed` and `error` record a failure.
  - **Closing:** the source is closed on `written`, `frozen`, `failed` and `error`.
  - **Repair stays in the browser:** `text` is still `repairPartialMarkdown(raw)`.
  - **Failures:** `UseSectionResult` has `failure?: "budget" | "error"`. The TOC shows the
    section as `unwritten`.
- **At most 3 streams are open at once** (`MAX_OPEN_STREAMS`, matching `maxConcurrentRuns`).
  Sections opened beyond that wait in the writing state and open in order as others end.
- **`?freeze=` and `?fail=`** pass from the page URL to the stream URL.

**What the browser doesn't have**

- The sample manual lives only in `server/seed/`.
- The browser's types have no `body` or `voice`.
- `streamer.ts` holds only `chunkEnds`, `streamChunks` and `frozenLength`, for the canned
  librarian.

**Tests and scripts that read the sample**

- Tests that need sample bodies read `server/seed/the-haunt-that-listens/`: `repair.test.tsx`
  with Vite's `import.meta.glob`, `scripts/chunk-ends.test.ts` with `node:fs`.
- `SHOT_SECTIONS` is in `scripts/shot.ts`. `Markdown.test.tsx` uses its own literal section ids.
- The library's seed (`src/library/seed.ts`) and its test have a literal entry for the Haunt (18
  sections, 7 written), like the other six manuals.

## Later: Lambda and DynamoDB

- **Lambda:** `server/lambda.ts` wraps the same routes with `awslambda.streamifyResponse` behind a
  Function URL (`InvokeMode: RESPONSE_STREAM`). Lambda may not report a client disconnect, so a
  call may run to `max_tokens`. That cost is bounded and recorded.
- **Storage:** `server/storage/dynamo-*.ts` implements the same two interfaces.

  | Piece | DynamoDB version |
  | --- | --- |
  | Manual | Table `manuals`, key `manualId`: one item with the TOC and voice. `listManuals` is a `Scan` of the table. |
  | Section body | Table `sections`, key `manualId` + `sectionId`. `saveBody` is a `TransactWriteItems`: a `Put` with `attribute_not_exists(body)`, plus a `ConditionCheck` that the manual item exists, so a deleted manual gets no sections. `writtenSectionIds` is a `Query` on the manual's sections with `attribute_exists(body)`, because a lease item may have no body yet. |
  | Deleting a manual | Delete the manual item first, which plays the part of the rename, then `Query` its sections and remove them with `BatchWriteItem`. This isn't atomic, so the order matters: once the manual item is gone, the manual is deleted and no section can be saved into it. |
  | Seeding record | One config item holding a string set of seeded ids. `markSeeded` is an `UpdateItem` with `ADD`. |
  | Ledger entries | Table `ledger`, key `month` + `reservedAt#callId`, so `entriesForMonth` is one `Query`. |
  | Spending totals | Counter items `day#2026-10-11` and `month#2026-10`. Reserving is an `UpdateItem` that adds the worst case on the condition that the total stays under the cap: one atomic step across instances. |
  | Kill switch | An SSM parameter or a config item, read before each call. |
- **One writer per section across instances:** a lease on the section item (`writer`,
  `leaseExpiresAt`, taken with a conditional update). Joiners on other instances poll partial
  text that the writer saves about once a second. `runs.isWriting` then has to read the
  manual's section leases, because another instance may hold one.
- **Concurrency:** Lambda reserved concurrency caps calls across all instances.
- **Credentials:** an IAM role replaces `.env.local`. Only `bedrock-client.ts` changes.
- **The passphrase:** it must travel as a cookie or a query parameter, because `EventSource`
  can't send headers.
- **New jobs:** writing the table of contents and the librarian become new `Job` names through the
  same gateway. Creating a manual is `putManual`.
- **Bedrock Mantle:** moving to the Mantle endpoint (`AnthropicBedrockMantle`) changes only
  `bedrock-client.ts` and the price table.
