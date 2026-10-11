# RTFM — architecture (backend foundation)

The plan for the "Backend foundation" phase in `WORKLIST.md`. A local Node server stores the
manual and its sections. It writes unwritten sections, with a fake writer or with Claude Haiku 4.5
on Amazon Bedrock, and streams them to the reader. Every model call goes through one gateway that
caps spending. Nothing here is built yet.

```
browser (Vite, :5173)                        server (node:http, :8787)
  src/manual store ── /api (Vite proxy) ──▶  api/ routes ──▶ writer/runs ──▶ fake writer
                                                  │                    └──▶ Bedrock writer ──▶ gateway ──▶ Bedrock
                                                  └──▶ storage/ (manuals, sections, ledger: files in .data/)
```

## Open questions

1. **Model: `global.` or `us.`?** Both work. **Recommendation: `global.`.** It is 10% cheaper,
   and nothing here needs routing that stays in the US.
2. **The last reader leaves mid-section.** The phase requires the call to stop, so reloading the
   page mid-section starts the writing again from scratch. **Recommendation: stop at once, as
   required.** The alternative is a grace period of a few seconds before aborting, which would
   survive a reload.
3. **Kill switch wording.** The kill switch is reported as `reason: "budget"`, so the reader shows
   "budget reached". **Recommendation: keep it.** Both mean that spending has stopped, and a third
   designed state isn't needed.
4. **Progress while Claude writes** is an estimate: characters against a target length, capped at
   99%. "Being written · 46%" is approximate and may jump at the end. **Recommendation: accept
   it.** An indeterminate meter would change the design.

## 1. The server

A new top-level `server/` folder, next to `src/` and `scripts/`. It runs as TypeScript directly on
Node 22.18+, as `scripts/` does, with its own `tsconfig.server.json` (`module: nodenext`,
`allowImportingTsExtensions`, `noEmit`, the same strict flags), referenced from `tsconfig.json`.

```
server/
  main.ts                 starts the server from config.ts (npm run server)
  dev.ts                  npm run dev: Vite plus `node --watch server/main.ts`
  config.ts               committed settings (section 6)
  app.ts                  startServer(config): builds storage, writer and gateway; routes
  usage.ts                npm run usage
  api/
    types.ts              the API contract shared with the browser (section 2)
    node-adapter.ts       node:http ⇄ ApiRequest, JSON responses, the event stream
    manual.ts             GET /api/manuals/:manualId
    section.ts            GET /api/manuals/:manualId/sections/:sectionId
    section-stream.ts     GET /api/manuals/:manualId/sections/:sectionId/stream
    preview.ts            ?freeze and ?fail: canned, never stored, never billed
  storage/
    types.ts              ManualStore, UsageLedger
    file-manual-store.ts  manuals and sections as files
    file-ledger.ts        the usage ledger as JSON lines
    seed.ts               seeds an empty store from server/seed/
  seed/the-haunt-that-listens/
    manual.json           the sample TOC, voice, and which sections start written
    sections/*.md         the 18 sample bodies
  writer/
    types.ts              SectionWriter, WriteFailed
    runs.ts               one run per section; later requests join it
    fake.ts               plays the seed body at today's pace
    bedrock.ts            writes through the gateway (BE.5)
    prompt.ts             builds the prompt (BE.5)
    validate.ts           cheap output checks (BE.5)
  gateway/
    types.ts              ModelClient, ModelEvent, refusal errors
    gateway.ts            caps, reservations, concurrency, idle timeout, kill switch, ledger
    prices.ts             the dated price table
    credentials.ts        reads the AWS keys from .env.local
    bedrock-client.ts     the only file that imports @anthropic-ai/bedrock-sdk
    sdk-boundary.test.ts  fails if anything else imports the SDK
```

Tests sit next to the code (`*.test.ts`). Any test that starts a server binds port 0.

**Running it**

- `npm run dev` runs `node server/dev.ts`. It spawns `vite` and `node --watch server/main.ts`,
  with their output passed through.
  - It forwards SIGINT and SIGTERM to both children and waits for both to exit before it exits
    itself.
  - If one child exits, it stops the other the same way, so nothing is left holding port 5173.
  - It is a separate process rather than a Vite plugin because that is how the server will run
    when deployed.
- `vite.config.ts` adds `server.proxy` and `preview.proxy`: `{ "/api": "http://localhost:8787" }`.
  It imports `API_PORT` from `server/config.ts`, so the port is written down once.
- `npm run server` runs the server alone, for `curl` and `npm run preview`.
- `.claude/launch.json` is unchanged.
- `npm run shot` (BE.4) starts the server in process with `startServer({ ...config, port: 0,
  dataDir: <temp dir>, writer: "fake" })` and points its Vite proxy at it. Every run starts from
  the seed and never touches `.data/` or Bedrock.

**Plain handlers, ready for Lambda.** Handlers know nothing about `node:http`.

```ts
// server/api/node-adapter.ts (sketch)
export interface ApiRequest {
  params: Record<string, string>;   // from the route pattern
  query: URLSearchParams;
  signal: AbortSignal;              // aborts when the client disconnects
}
export interface EventSink {
  send(event: string, data: unknown): void;   // `event: …\ndata: <json>\n\n`
  end(): void;
}
export type Route =
  | { pattern: string; json(request: ApiRequest): Promise<{ status: number; body: unknown }> }
  | { pattern: string; events(request: ApiRequest, sink: EventSink): Promise<void> };
```

The Node adapter:

- matches `pattern` by splitting the path on `/`;
- turns `res.on("close")` into the `AbortSignal`;
- writes the SSE headers (`content-type: text/event-stream`, `cache-control: no-cache`).

A later `server/lambda.ts` maps the same routes onto `awslambda.streamifyResponse`.

## 2. The API

The wire types live in `server/api/types.ts`. The browser imports them with `import type`, so
nothing from `server/` reaches the bundle. They replace today's types in `src/manual/types.ts`.

```ts
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
| `GET /api/manuals/:manualId` | `200 Manual` (`writing` while a run is active), or `404` |
| `GET /api/manuals/:manualId/sections/:sectionId` | `200 { status, body? }`, with the body only when written, or `404` |
| `GET /api/manuals/:manualId/sections/:sectionId/stream` | `text/event-stream` (below), or `404` |

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
  the server, and the reader shows one of its two new states:
  - `"budget"`: **budget reached**. A cap would be crossed, or the kill switch is on.
  - `"error"`: **couldn't write this section**. Bedrock failed, the stream stalled, the output
    failed validation, `stop_reason` was `max_tokens` or `refusal`, or too many sections were
    already being written.
- **No auto-reconnect.** After `written`, `frozen` or `failed`, and on any `error` event, the
  client closes the `EventSource`. An `error` counts as `failure: "error"`. Reconnecting would pay
  for a second run.
- **Retrying** needs a reload. A failure sticks for the page load, and the next load's visit starts
  a new run, because the server kept the section unwritten.
- **Preview options**, for screenshots: `?freeze=<0–1>` and `?fail=budget|error`.
  - `api/preview.ts` handles them before any run or writer is touched, so they cost nothing and
    change nothing, whichever writer is configured.
  - As today, they only apply to sections that aren't written.
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
  getManual(manualId: string): Promise<StoredManual | undefined>;
  getBody(manualId: string, sectionId: string): Promise<string | undefined>;
  saveBody(manualId: string, sectionId: string, body: string): Promise<"saved" | "already-written">;
  putManual(manual: StoredManual): Promise<void>;   // the seed now; TOC creation later
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
.data/ledger/2026-10.jsonl                   one JSON line per ledger entry, append-only
.data/STOP                                   the kill switch (section 5)
```

- **Written sections:** a section is written when its `.md` file exists, so there is no status
  to keep in sync.
- **`saveBody`** writes a temp file, then `link`s it into place. `link` fails if the file already
  exists, so a section can't be written twice.
- **Replay:** reading the ledger skips a cut-off last line, left by a crash mid-append.
- **Seeding:** on start, `seed.ts` puts the sample manual into an empty store. That is its TOC and
  the bodies of the sections the seed marks written: the same 7 of 18 as today.
- **Reset:** to reset the manual, delete `.data/manuals/`. Never delete `.data/ledger/`, because
  the caps are computed from it.

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
word boundaries, which is today's browser pacing.

- It has its own few-line chunking function. `src/manual/streamer.ts` uses `window` and belongs to
  the browser.
- `progress` is exact.
- A section with no seed body gets a short placeholder.

**`writer/bedrock.ts`** (BE.5) builds the prompt and streams it through the gateway. The prompt
carries the voice, the TOC, summaries of nearby sections, and the markdown that `DESIGN.md` ›
Markdown allows.

- **The opening is held back.** Nothing is yielded until the first real block has started, so the
  cheap fixes happen before the reader sees anything: dropping an H1, and dropping a preamble.
  After that, the text is never changed.
- **Whole words only.** It yields only up to the last whitespace and holds back the rest until
  more arrives or the stream ends. Chunks therefore end on whole words, like the fake's.
- **Late failures.** Problems found at the end fail the run with `WriteFailed("error")`, and the
  streamed text is discarded:
  - a footnote reference without a definition;
  - a `section:` link to an id that doesn't exist;
  - `stop_reason` `max_tokens` or `refusal`.
- **Progress** is `min(0.99, characters so far / config.sectionTargetCharacters)`. The prompt asks
  for the same length.

**Choosing a writer:** `config.writer`, which defaults to `"fake"` (used by tests and screenshots).
BE.5 wires the Bedrock writer, the gateway, the credentials and the start-up price check into
`server/app.ts`. Until then, `app.ts` only knows the fake writer.

**One writer per section** (`writer/runs.ts`): an in-memory `Map` keyed by `manualId/sectionId`.

- **Opening a section** checks the map, then storage (`getBody`), then the map again. If there is
  still no entry, it creates the run in the same tick, so two requests can't both start one.
- **Finished runs stay in the map** as `written`, which closes the gap between a request reading
  storage and a run finishing. If `saveBody` returns `already-written`, the run sends `written`
  anyway: the stored body is the one that counts.
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
  it navigates elsewhere, as it does today.

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
function createGateway(deps: {
  client: ModelClient; ledger: UsageLedger; config: GatewayConfig;
  prices: PriceTable; dataDir: string; now?: () => Date;
}): { stream(job: Job, prompt: Prompt, signal: AbortSignal): AsyncIterable<ModelEvent> };
// throws SpendingRefused ("daily-cap" | "monthly-cap" | "kill-switch") or GatewayBusy
```

`createGateway` throws `ModelNotPriced` if any job's model is missing from the price table, so the
server refuses to start. Then, for each call:

1. **Kill switch.** If `.data/STOP` exists, refuse. Creating the file stops new calls at once, with
   no restart, and deleting it resumes them. A call already running finishes; it is bounded by
   `max_tokens`.
2. **Concurrency.** If `maxConcurrentCalls` (3) calls are running, throw `GatewayBusy`.
3. **Worst case.** `(inputBound × input price) + (max_tokens × output price)`.
   - `inputBound` is the prompt's UTF-8 byte length plus 100 tokens for message framing.
   - A token is at least one byte, so this is a true upper bound with no tokenizer.
4. **Caps.** For the day and the month (UTC, as AWS bills), `settled + reserved + worst case` must
   stay at or under the cap. The check and the reservation are one synchronous step on in-memory
   totals, so two calls can't both slip under.
5. **Reserve.** Append `{ kind: "reserve", callId, reservedAt, job, model, worstCaseUsd }` and await
   it.
6. **Call.** `client.stream(...)`, re-yielding events.
   - The writer's signal goes straight to the SDK request, so a disconnect aborts the HTTP call.
   - **Idle timeout:** 30s with no event aborts the call, with outcome `failed`. BE.3 checks
     whether the SDK's own `timeout` covers the stream body. It is set explicitly either way.
7. **Settle** (in `finally`, so it runs after completion, error or abort). Append `{ kind:
   "settle", callId, reservedAt, at, job, model, inputTokens, outputTokens, cacheWriteTokens,
   cacheReadTokens, usd, outcome: "complete" | "aborted" | "failed", estimated }`.
   - It goes into the reservation's month file, and the cost is charged to the reservation's day
     and month, so a call that crosses midnight stays in one period.
   - **Input tokens** come from `message_start`. If that never arrived, the input bound is used.
   - **Output tokens:**
     - On a complete call they come from the final `message_delta`.
     - **An aborted or stalled call is charged its full reserved output (`max_tokens`)** and
       marked `estimated: true`. The stream doesn't tell us what Bedrock billed after the cut.
       BE.6 compares this against Cost Explorer before anything less conservative is used.

**The ledger is the durable record.** On start, the gateway replays this month's file into its
totals. A `reserve` with no `settle` (the server died mid-call) counts at its worst case, and
`npm run usage` lists it as unsettled.

**`bedrock-client.ts`** is the only importer of `@anthropic-ai/bedrock-sdk`:

```ts
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";

export function createBedrockClient(credentials: AwsCredentials, baseURL = regionalURL(credentials.region)): ModelClient {
  const client = new AnthropicBedrock({
    awsAccessKey: credentials.accessKeyId,       // from .env.local, never process.env
    awsSecretKey: credentials.secretAccessKey,   // not awsSecretAccessKey, which the SDK ignores
    awsRegion: credentials.region,
    baseURL,                                     // ignores ANTHROPIC_BEDROCK_BASE_URL; tests pass a local server
    // Typed string | undefined; null is deliberate: it stops the SDK reading
    // AWS_BEARER_TOKEN_BEDROCK, which would win over SigV4.
    apiKey: null as unknown as undefined,
    providerChainResolver: async () => { throw new Error("The AWS default credential chain is never used"); },
    maxRetries: 0,                               // one reservation, one HTTP call
  });
  // client.messages.stream({ model, max_tokens, system, messages }, { signal }), mapped to ModelEvent
}
```

Haiku 4.5 has thinking off unless asked, and no `cache_control` is sent this phase, because the
shared prefix is too short to cache.

**`credentials.ts`** reads the file at the repo root:
`util.parseEnv(readFileSync(new URL("../../.env.local", import.meta.url), "utf8"))`.

- The result goes into a local object, never `process.env`.
- It takes exactly `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, and treats an
  empty value as missing.
- If any is missing, it throws an error that names the missing variables and never prints a
  value, so the server refuses to start with the Bedrock writer.

**Tests (BE.3), all offline**

- **SDK boundary.** `sdk-boundary.test.ts` scans the text of every `.ts`/`.tsx` file under `src/`,
  `server/` and `scripts/`, and of the root `*.ts` files. It fails if any file other than
  `bedrock-client.ts` imports or requires `@anthropic-ai/…` or `@aws-sdk/…`.
- **Credentials.** `bedrock-client.ts` is pointed at a local `node:http` server, with fake keys,
  and with `AWS_PROFILE` and `AWS_BEARER_TOKEN_BEDROCK` set. The test asserts that the request is
  SigV4-signed with the fake key id, carries no bearer token, and that the chain resolver never
  ran. This proves the `apiKey: null` cast works at runtime.
- **Gateway.** A fake `ModelClient` covers:
  - each cap, including a call refused on its worst case;
  - settling, and a settle that crosses midnight;
  - an unpriced model at start-up;
  - the concurrency limit, the kill switch and the idle timeout;
  - an aborted stream, recorded at its full reserved output.

**`npm run usage`** (`server/usage.ts`) prints today's and this month's spend (UTC) against the
caps, by model and by job. It also shows call counts, aborted and estimated calls, unsettled
reservations, and whether the kill switch is on.

## 6. Configuration

| Setting | Where | Secret |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | `.env.local`, read only by `gateway/credentials.ts` | yes |
| Writer, port, data dir, caps, concurrency, jobs, section length | `server/config.ts` | no |
| Prices | `server/gateway/prices.ts` | no |

```ts
// server/config.ts
export const API_PORT = 8787;
export const config = {
  port: API_PORT,
  dataDir: ".data",
  writer: writerFromEnv(process.env.RTFM_WRITER),   // "fake" (default) | "bedrock"; anything else throws
  caps: { dailyUsd: 2, monthlyUsd: 20 },
  maxConcurrentRuns: 3,
  maxConcurrentCalls: 3,
  idleTimeoutMs: 30_000,
  jobs: {
    "write-section": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 2048 },
  },
  sectionTargetCharacters: 3800,
};
```

- **`maxTokens: 2048`.** The sample sections are 460–660 words (about 650–950 tokens), so this
  leaves room, and its worst case is about $0.01.
- **The tiny-cap check (BE.6)** edits `caps` here and then reverts the edit.
- **`BEDROCK_MODEL_ID` in `.env.local`** is ignored: `credentials.ts` takes only the three names
  above, and `.env.local` never reaches `process.env`. The user should delete the line, so that
  `config.ts` is the only place that names the model.

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
  - **Unconfirmed on AWS's pricing page.** Check the first real calls against Cost Explorer (BE.5).
- **Expected cost:** about $0.008 per section, with a worst-case reservation of about $0.02.

## 7. The reader's store (`src/manual/`, BE.4)

**What changes**

- **`useManual()`** fetches `GET /api/manuals/the-haunt-that-listens` once, from a module-level
  promise, and suspends on it with `use()`. The lazy route's `Suspense` covers the wait. After
  that it is the same `useSyncExternalStore` store. The id is a constant until routes carry one.
- **`useSection(id)`** suspends with `use()` on a cached promise for the JSON section route.
  - **Written sections** render straight away, as today, so the `written` and `toc` shots stay
    the same.
  - **Unwritten sections** open an `EventSource`, once per section per page load and held at
    module level, so a section keeps writing while the reader is elsewhere.
  - **Events:** `append` sets the text at `at`. `written` marks the section written, keeping its
    text. `frozen` keeps it writing. `failed` and `error` record a failure.
  - **Closing:** the source is closed on `written`, `frozen`, `failed` and `error`.
  - **Repair stays in the browser:** `text` is still `repairPartialMarkdown(raw)`.
  - **Failures:** `UseSectionResult` gains `failure?: "budget" | "error"`. The TOC shows the
    section as `unwritten`.
- **`?freeze=` and `?fail=`** pass from the page URL to the stream URL.

**What moves out of the browser**

- The sample manual (`src/manual/sample/`) moves to `server/seed/`. BE.2 copies it, and BE.4
  deletes the browser copy.
- `streamBody` and `freezeFromUrl` are removed.
- The browser's types lose `body` and `voice`.
- `chunkEnds`, `streamChunks` and `frozenLength` stay in `streamer.ts`, because the canned
  librarian uses them.

**Tests and scripts that used the sample**

- Tests that need sample bodies, such as `repair.test.tsx`, read
  `server/seed/the-haunt-that-listens/` with `node:fs`.
- `SHOT_SECTIONS` moves to `scripts/shot-sections.ts`. `Markdown.test.tsx` uses its own literal
  section ids.
- The library's seed (`src/library/seed.ts`) and its test get a literal entry for the Haunt (18
  sections, 7 written), like the other six manuals.

## 8. What stays the same

- **The reader:** every rule in `DESIGN.md` › Reader behavior and › Streaming holds unchanged. The
  text still arrives in whole-word chunks in the final layout, and the fake writer keeps today's
  pacing, so the existing reader shots stay the same.
- **`DESIGN.md` updates in BE.4:** the two failure states, the data model, and the end of "no
  back-end yet".
- **The landing page** keeps its seed library and canned librarian.

## Later: Lambda and DynamoDB

- **Lambda:** `server/lambda.ts` wraps the same routes with `awslambda.streamifyResponse` behind a
  Function URL (`InvokeMode: RESPONSE_STREAM`). Lambda may not report a client disconnect, so a
  call may run to `max_tokens`. That cost is bounded and recorded.
- **Storage:** `server/storage/dynamo-*.ts` implements the same two interfaces.

  | Piece | DynamoDB version |
  | --- | --- |
  | Manual | Table `manuals`, key `manualId`: one item with the TOC and voice. |
  | Section body | Table `sections`, key `manualId` + `sectionId`. `saveBody` is a `PutItem` with `attribute_not_exists(body)`. |
  | Ledger entries | Table `ledger`, key `month` + `reservedAt#callId`, so `entriesForMonth` is one `Query`. |
  | Spending totals | Counter items `day#2026-10-11` and `month#2026-10`. Reserving is an `UpdateItem` that adds the worst case on the condition that the total stays under the cap: one atomic step across instances. |
  | Kill switch | An SSM parameter or a config item, read before each call. |
- **One writer per section across instances:** a lease on the section item (`writer`,
  `leaseExpiresAt`, taken with a conditional update). Joiners on other instances poll partial
  text that the writer saves about once a second.
- **Concurrency:** Lambda reserved concurrency caps calls across all instances.
- **Credentials:** an IAM role replaces `.env.local`. Only `bedrock-client.ts` changes.
- **The passphrase:** it must travel as a cookie or a query parameter, because `EventSource`
  can't send headers.
- **New jobs:** writing the table of contents and the librarian become new `Job` names through the
  same gateway. Creating a manual is `putManual`.
- **Bedrock Mantle:** moving to the Mantle endpoint (`AnthropicBedrockMantle`) changes only
  `bedrock-client.ts` and the price table.
