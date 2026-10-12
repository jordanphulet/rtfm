# RTFM — architecture

A local Node server stores the manuals and their sections. It writes unwritten sections, with a fake
writer or with Claude Haiku 4.5 on Amazon Bedrock, and streams them to the reader. The librarian on
the landing page is an agent: an agent loop runs a model with the library's tools over several
turns, with a scripted fake model or with Claude Haiku 4.5. Asked for a new manual, it hands the
request to a planner, which has the model plan the manual and saves it. Every Bedrock call,
including each turn of the loop and each plan, goes through one gateway that caps spending.

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

The server lives in the top-level `server/` folder, next to `src/` and `scripts/`. It runs as TypeScript directly on
Node 22.18+, as `scripts/` does, with its own `tsconfig.server.json` (`module: nodenext`,
`allowImportingTsExtensions`, `noEmit`, the same strict flags), referenced from `tsconfig.json`.

```
server/
  main.ts                 starts the server from config.ts (npm run server)
  dev.ts                  npm run dev: Vite plus `node --watch server/main.ts`
  config.ts               committed settings (section 8)
  ports.ts                API_PORT, alone, so Vite's config can import it
  app.ts                  startServer(config, replaced?): builds storage, the models and the gateway; routes
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
    librarian.ts          POST /api/librarian: the librarian's reply to a conversation (section 7)
    preview.ts            ?freeze, ?fail and ?library=empty: canned, never stored, never billed
  storage/
    types.ts              ManualStore, UsageLedger
    file-manual-store.ts  manuals and sections as files
    file-ledger.ts        the usage ledger as JSON lines
    files.ts              reads a file or folder that may not exist
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
    section-text.ts       holds back the opening and yields whole words
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
```

Tests sit next to the code (`*.test.ts`). Any test that starts a server binds port 0.

**Running it**

- `npm run dev` runs `node server/dev.ts`. It spawns `vite` and `node --watch server/main.ts`,
  with their output passed through.
  - It forwards SIGINT and SIGTERM to both children and waits for both to exit before it exits
    itself.
  - If one child exits, it stops the other the same way, so nothing is left holding port 5173.
  - It is a separate process rather than a Vite plugin, so the server runs the same way in
    development as it does alone (`npm run server`).
- `vite.config.ts` adds `server.proxy` and `preview.proxy`: `{ "/api": "http://localhost:8787" }`.
  It imports `API_PORT` from `server/ports.ts`, so the port is written down once. That module
  holds only constants, because Vite restarts and reloads the page whenever a file its config
  imports changes; importing `server/config.ts` would reload the page on every edit to it. For the
  same reason it sets `envDir: false` (the browser code reads no `import.meta.env`, so a `.env*`
  change, `.env.local` included, means nothing to it) and `server.watch.ignored: ["**/.data/**"]`,
  so the data folder's writes never reach Vite's watcher. When the API
  server's response closes before it is complete (the server stopped or restarted mid-section),
  the proxy destroys the browser's response too, so the reader's stream fails with "couldn't
  write this section" instead of hanging.
- `npm run server` runs the server alone, for `curl` and `npm run preview`.
- `.claude/launch.json` runs `npm run dev`.
- `npm run shot` starts the server in process with `startServer({ ...config, port: 0,
  dataDir: <temp dir>, models: "fake" })` and points its Vite proxy at it. Every run starts from
  the seed and never touches `.data/` or Bedrock.

**Plain handlers.** Handlers import only `api/route.ts`, never `node:http` or the Node adapter,
so they don't depend on how they are served.

```ts
// server/api/route.ts
export interface ApiRequest {
  params: Record<string, string>;   // from the route pattern
  query: URLSearchParams;
  body: unknown;                    // the parsed JSON body, or undefined when there is none
  signal: AbortSignal;              // aborts when the client disconnects
}
export interface JsonResponse { status: number; body: unknown }
export interface EventSink {
  send(event: string, data: unknown): void;   // `event: …\ndata: <json>\n\n`
}
export type EventStream = (sink: EventSink) => Promise<void>;   // the stream ends when it resolves
export interface Route {
  method: "GET" | "POST" | "DELETE";
  pattern: string;
  handle(request: ApiRequest): Promise<JsonResponse | EventStream>;   // so a stream route can 404
}
```

The Node adapter:

- matches `method` exactly, and `pattern` by splitting the path on `/`;
- reads the body as JSON, up to 262,144 characters; a body that is too long or isn't JSON gets `400 { error:
  "Bad request" }` before any handler runs;
- turns `res.on("close")` into the `AbortSignal`;
- writes the SSE headers (`content-type: text/event-stream`, `cache-control: no-cache`);
- writes a response whose `body` is `undefined` with no body and no content type (`noContent`, 204).

## 2. The API

The wire types live in `server/api/types.ts`. The browser imports them with `import type`:
`src/manual/types.ts` re-exports the manual's types, `src/library/types.ts` re-exports
`ManualSummary`, and `src/agent/types.ts` the librarian's. The one value the browser imports is
`LIBRARIAN_LIMITS`, which the file defines with no imports, so nothing else from `server/` reaches
the bundle.

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

interface LibrarianMessage { role: "user" | "agent"; text: string }
const LIBRARIAN_LIMITS = { earlierExchanges: 10, messageCharacters: 4000 };
type PageAction =
  | { type: "open"; manualId: string }
  | { type: "propose-delete"; manualId: string }
  | { type: "created"; manualId: string };   // already saved: the page loads the library again
type LibrarianEvent =
  | { event: "status"; data: { text: string } }   // a tool is running: "Searching the shelves…"
  | { event: "text";   data: { text: string } }   // the next piece of the reply
  | { event: "action"; data: PageAction }
  | { event: "done";   data: {} }
  | { event: "frozen"; data: {} }                 // previews only
  | { event: "failed"; data: { reason: "budget" | "error" } };
```

| Route | Response |
| --- | --- |
| `GET /api/manuals` | `200 ManualSummary[]`, every manual in storage, sorted by title |
| `GET /api/manuals/:manualId` | `200 Manual` (`writing` while a run is active), or `404` |
| `DELETE /api/manuals/:manualId` | `204` (no body), `404`, or `409 { error }` while a section of it is being written |
| `GET /api/manuals/:manualId/sections/:sectionId` | `200 { status, body? }`, with the body only when written, or `404` |
| `GET /api/manuals/:manualId/sections/:sectionId/stream` | `text/event-stream` (below), or `404` |
| `POST /api/librarian` with `{ messages: LibrarianMessage[] }` | `text/event-stream` of `LibrarianEvent`s (section 7), or `400` |

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
- **Preview options**, for screenshots: `?freeze=<0–1>` and `?fail=budget|error` on a stream,
  `?library=empty` on `GET /api/manuals`, and `?freeze=<0–1>` on `POST /api/librarian` (section 7).
  - `api/preview.ts` handles them before any run, writer or storage write is touched, so they cost
    nothing and change nothing, whichever models are configured.
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

Two narrow interfaces in `server/storage/types.ts`, so the gateway only ever sees the ledger.
`StoredManual` is the manual as it is stored: the `Manual` fields plus `voice`, with no statuses
and no bodies.

```ts
interface ManualStore {
  listManuals(): Promise<StoredManual[]>;
  getManual(manualId: string): Promise<StoredManual | undefined>;
  createManual(manual: StoredManual): Promise<"created" | "exists">;   // never replaces a manual
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
- **`createManual`** makes the manual's folder with a plain `mkdir`, which fails if the folder
  exists, so a manual is never replaced: an id that is taken gets `"exists"` and nothing changes.
  It then writes `manual.json` through a temp file and a `rename`; if that write fails, it removes
  the folder again, so the id isn't left taken by an empty folder. The seed and the planner both
  create manuals through it, and seeding throws if a seed manual's id turns out to be taken.
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
  // The body is exactly all text joined.
  write(manual: StoredManual, sectionId: string, signal: AbortSignal):
    AsyncIterable<{ text: string; progress: number; placeholder?: boolean }>;
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
word boundaries, the same pace as the fake librarian's replies.

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
  - **Escaping.** Manual text (chapter and section titles included, since a planned manual's come
    from the model and the user's request) is inserted with `<` escaped, so it can't open or close a tag;
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

**Choosing the models:** `config.models`, which defaults to `"fake"` (used by tests and
screenshots), chooses both the section writer and the librarian's model, which also plans new
manuals (`createModels` in `app.ts`); `RTFM_MODELS=bedrock` selects Claude for both. With `"bedrock"`, `startServer` checks
every job's model against the price table (`ModelNotPriced`), then reads the credentials
(`CredentialsMissing`), then builds the Bedrock client, the file ledger, one gateway, and the
writer on it, all before it seeds or listens. The librarian and its planner use the same
gateway, so one set of caps covers every job. Either problem therefore stops the server from starting, and an unpriced
model is reported without reading any secret. Tests replace either model with
`startServer(config, { writer, librarian })`.

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
name, a prompt and a signal. They never see a model ID, a price or the SDK.

```ts
// server/gateway/types.ts
type Job = "write-section" | "librarian" | "plan-manual";

interface ModelPrompt {
  system: string;
  tools?: ToolDefinition[];              // { name, description, input_schema }
  messages: { role: "user" | "assistant"; content: string | ContentBlock[] }[];
}
interface Prompt extends ModelPrompt {   // plain text, as the section writer builds it
  messages: { role: "user" | "assistant"; content: string }[];
}
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

interface ModelClient {                  // bedrock-client.ts, and fakes for tests
  stream(request: { model: string; maxTokens: number; prompt: ModelPrompt; signal: AbortSignal }):
    AsyncIterable<ModelEvent>;
}
type ModelEvent =
  | { type: "text"; text: string }
  | { type: "tool-use"; id: string; name: string; input: unknown }   // one per whole tool_use block
  | { type: "tool-input"; json: string }   // each fragment of a tool_use block's input, as it arrives
  | { type: "usage"; inputTokens?: number; outputTokens?: number;
      cacheWriteTokens?: number; cacheReadTokens?: number }
  | { type: "stop"; reason: string };    // end_turn, tool_use, max_tokens, refusal, …

// server/gateway/gateway.ts
async function createGateway(deps: {
  client: ModelClient; ledger: UsageLedger; config: GatewayConfig;
  prices: PriceTable; dataDir: string; now?: () => Date;
}): Promise<{ stream(job: Job, prompt: ModelPrompt, signal: AbortSignal): AsyncIterable<ModelEvent> }>;
// the stream's first step throws SpendingRefused ("daily-cap" | "monthly-cap" | "kill-switch")
// or GatewayBusy; a stalled call throws ModelStalled, and a stream that ends without a stop
// reason throws ModelStreamIncomplete
```

Content blocks and tool definitions use Anthropic's field names, so `bedrock-client.ts` passes them
to the SDK as they are.

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
   - Images and system prompts made of blocks aren't in `ModelPrompt`; the bound must count them
     if they are added.
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
     `failed`, and the stream throws `ModelStalled`. The timer starts before the request is sent, so it also covers a
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
       Bedrock billed after the cut, so the gateway assumes the most it can be.
     - `estimated` is also set if a complete call never reported its input or output tokens.

**The ledger is the durable record.** On start, the gateway replays this month's file into its
totals. A `reserve` with no `settle` (the server died mid-call) counts at its worst case, and
`npm run usage` lists it as unsettled.

- **Totals in memory** are one map from period (`2026-10-11` or `2026-10`) to committed dollars.
  Reserving adds the worst case to the reservation's day and month; settling adds `usd − worst
  case` to the same two periods.
- **One server process per data folder.** The totals live in one process's memory, so two
  servers on the same `.data/` would each allow the full caps.
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
  // client.messages.stream({ model, max_tokens, system, messages, tools }, { signal }), mapped to
  // ModelEvent: message_start and message_delta → usage, text_delta → text, each input_json_delta
  // → tool-input, a tool_use block's content_block_start, input_json_delta and content_block_stop
  // → one tool-use, message_delta's stop_reason → stop
}
```

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
idle timer restarts whenever a parameter arrives, rather than only once the whole block is done.
The longest silence is then the time to write the largest parameter. For the planner (section 7)
that is the chapters: measured on 2026-10-12, a 23-section plan of 2,481 output tokens took 21.3s
in all, and its longest silence, while the chapters were written, was 11.2s (about 116 tokens a
second). At about 95 tokens a section, the largest chapters the size limits allow (32 sections)
are about 3,000 tokens, about 26s at that rate: too close to the shared 30s, and over it if
Bedrock is slower. So `plan-manual` has its own idle timeout of 60s. Without the `tool-input`
events the gateway saw nothing for the whole 21.3s. The SDK drops `ping` events, so they never
reach the gateway.

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

Haiku 4.5 has thinking off unless asked. No `cache_control` is sent: Haiku 4.5 caches only a
prefix of at least 4,096 tokens, and every call's whole input is shorter than that (about 3,000
tokens for a section, 2,000 for a librarian turn and 4,000 for a plan).

**`credentials.ts`** reads the file at the repo root:
`util.parseEnv(readFileSync(new URL("../../.env.local", import.meta.url), "utf8"))`.

- The result goes into a local object, never `process.env`.
- It takes exactly `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, and treats an
  empty or blank value, or a missing file, as missing.
- If any is missing, it throws `CredentialsMissing`, which names the missing variables and never
  prints a value, so the server refuses to start with the Bedrock models. `app.ts` calls it when
  `config.models` is `"bedrock"`.

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
  - A prompt with tools and block content is sent with `tools` and the blocks as they are, and
    no `eager_input_streaming`; a prompt without tools sends no `tools`. Streamed `tool_use`
    blocks, one with its input in fragments and one with none, become a `tool-input` event per
    fragment and one `tool-use` event each.
    A block whose input is cut off at `max_tokens` is left out, and the `max_tokens` stop still
    arrives.
  - Through the real gateway: a complete stream settles at the reported usage, and so does a
    librarian turn that ends in tool calls; a mid-stream
    exception frame, a body cut off mid-frame, and a body that ends between frames without a
    stop each settle as `failed` at the full reserved output.
  - Through the real gateway with a 200ms idle timeout: a `plan-manual` tool input sent in 12
    fragments 100ms apart (over 1.2s in all) completes and settles as `complete`, because each
    fragment restarts the timer (without the `tool-input` events it stalls, checked by hand); a
    stream silent for 400ms before its input still stops with `ModelStalled`.
  - `credentials.test.ts` covers reading the three keys from a temp file without touching
    `process.env`, and refusing a missing or empty key, or a missing file.
- **Gateway.** A fake `ModelClient` covers:
  - each cap, including a call refused on its worst case, running calls and unsettled
    reservations counting at their worst case, and last month's spend not counting;
  - the input bound of a prompt with tools and blocks;
  - settling, and a settle that crosses midnight;
  - an unpriced model at start-up;
  - the concurrency limit, the kill switch, and the idle timeout, including a call that never
    sends its first event, a caller that holds an event too long, and a job with its own longer
    timeout beside one that uses the shared one;
  - an aborted stream, recorded at its full reserved output, and a failed one;
  - a client that ends without a `stop`, and one that ends quietly after the signal aborts;
  - a failed reserve append, which releases the reservation.

**`npm run usage`** (`server/usage.ts`, with the formatting in `gateway/usage-report.ts`) prints
today's and this month's spend (UTC) against the caps, by model and by job. It also shows call
counts, aborted, failed and estimated calls, unsettled reservations, and whether the kill switch
is on. `npm run usage -- <dataDir>` reads another data folder; the tests use this.

## 6. The agent loop

`server/agent/` runs a model with tools: it calls the model, runs the tools it asks for, sends
the results back, and repeats until the model ends its turn. Every turn is one gateway call, so
each one is reserved, capped, settled and written to the ledger like any other, under the job the
caller names.

```ts
// server/agent/tool.ts
function defineTool<Shape extends z.core.$ZodShape>(tool: {
  name: string;
  description: string;
  input: Shape;                          // the input's fields: { topic: z.string().min(1) }
  status: string;                        // shown while it runs: "Looking through the library…"
  run(input: z.infer<z.ZodObject<Shape, z.core.$strict>>, signal: AbortSignal): Promise<string>;
}): AgentTool;

interface AgentTool {
  definition: ToolDefinition;            // what the model sees: name, description, input_schema
  status: string;
  run(input: unknown, signal: AbortSignal): Promise<{ content: string; isError?: boolean }>;
}

// server/agent/loop.ts
type AgentEvent = { type: "status"; text: string } | { type: "text"; text: string };

function runAgent(run: {
  gateway: Gateway; job: Job; system: string; tools: AgentTool[];
  messages: PromptMessage[];             // the conversation so far, ending with the user's message
  signal: AbortSignal;
}): AsyncGenerator<AgentEvent, PromptMessage[]>;   // returns the whole conversation
```

**A run, turn by turn:**

1. Stream a turn through the gateway with the system prompt, every tool's definition and the
   whole conversation. Each text delta is yielded as a `text` event as it arrives.
2. Throw `AgentStopped` if the turn can't go into the conversation: an `end_turn` with no
   content, or a `tool_use` stop with no `tool_use` block. Either would make the next request
   invalid (an empty assistant message, or an empty user message of results).
3. Append the assistant's message: its text and `tool_use` blocks, in order.
4. If the stop reason is `end_turn`, return the conversation. If it is anything but `tool_use`
   (`max_tokens`, `refusal`, …), throw `AgentStopped`.
5. For each `tool_use` block, in order: stop if the signal has aborted, yield the tool's
   `status`, then run it. Then append all the results as one user message of `tool_result`
   blocks, and go back to step 1.

**Tools.**

- **The schema.** `defineTool` builds a `z.strictObject` from the input's fields and turns it
  into the tool's JSON Schema with `z.toJSONSchema`, without its `$schema` key. The JSON Schema
  has `additionalProperties: false`, and the check rejects extra keys to match.
- **Input is checked before a tool runs.** Input that fails the schema never reaches `run`: the
  model gets an error result (`is_error: true`) that starts "Invalid input:" and names each
  problem, so it can try again.
- **Other failures** also become error results rather than ending the run: a tool that throws
  (the result is the error's text) and a call to a tool that doesn't exist. `runTool` makes
  those results, with two exceptions that end the run instead: a tool that throws
  `SpendingRefused` (its own model call was refused by the caps, so the reply can report the
  budget) and a tool that throws once the run's signal has aborted.
- **Tools run one after another**, even when the model asks for several at once, and all their
  results go back in one message.

**Stopping.**

- **No turn limit.** The gateway's caps bound a run: every turn reserves its own worst case for
  the whole conversation, so a long run is refused once the next turn would cross a cap.
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

**Tests** (`loop.test.ts`) drive `runAgent` through the real gateway, with a temp data folder,
the seed manuals and a file ledger. `scripted-client.ts` is the fake model: `scriptedClient(turns)`
plays one list of `ModelEvent`s per call and records each prompt, and `textTurn(...)` and
`toolUseTurn(toolUses, text?)` build the turns. They cover:

- a run of three turns with two tool calls: the events in order, the tools and schemas sent, the
  conversation sent and returned, one complete `librarian` call in the ledger per turn, and a
  reservation that grows with the conversation;
- input that fails a tool's schema (wrong type, missing field), and an unknown tool: error
  results, the tool never run, and the run carrying on;
- a tool that throws; a tool that throws `SpendingRefused`, and one that throws on an abort,
  each ending the run with no further model call;
- a cap set to the first turn's reservation, which refuses the second turn: `SpendingRefused`,
  after the first turn settled;
- an abort mid-stream, settled as `aborted`;
- an abort by the first of two tools in a turn: the second never runs, and there is no further
  model call;
- a turn that stops at `max_tokens`, one that ends with nothing in it, and one that stops for a
  tool without calling one: `AgentStopped`.

## 7. The librarian

The librarian on the landing page is the agent loop (section 6) with the library's tools, behind
one route. The browser keeps the conversation and sends it whole with each message; the reply
streams back.

```ts
// server/agent/librarian/reply.ts
async function sendReply(reply: {
  gateway: Gateway; store: ManualStore; conversation: LibrarianMessage[];
  signal: AbortSignal; send: (event: LibrarianEvent) => void;
}): Promise<void>;
```

**The route** (`api/librarian.ts`), `POST /api/librarian` with `{ messages }`:

- **Checked first.** At most `LIBRARIAN_LIMITS.earlierExchanges` (10) earlier exchanges and the
  new message, so 1–21 messages, each `user` or `agent` with 1–4,000 characters
  (`messageCharacters`) of text after trimming, alternating from a `user` message and ending with
  one. Anything else, or a `?freeze` that isn't a number from 0 to 1, is `400 { error: "Bad
  request" }`. The browser sends only the latest 10 exchanges whose reply finished, leaving out
  any with a message over the limit, so a failed reply never reaches the model and a long
  conversation keeps working. The limits also bound what one reply can cost.
- **Plain text only.** Each message becomes a prompt message with string content (`agent` becomes
  `assistant`). The model never sees earlier replies' tool calls, only what was said, and the
  system prompt tells it to check the library with a tool rather than trust earlier messages,
  because the user can open and delete manuals directly.
- **The reply.** `sendReply` runs `runAgent` with the job `librarian` and sends:
  - `status` with each tool's status line, as the loop reports it, and the create tool's progress
    lines while the planner works;
  - `text` with each text delta. When the first text of a later model turn follows text from an
    earlier one (a tool ran in between, known or not), it starts with a blank line, so the turns
    read as paragraphs. `sendReply` counts the turns by wrapping the gateway;
  - `action` when a tool hands the page an action (below), as the tool runs;
  - then `done` when the loop returns, or `failed`: `"budget"` for `SpendingRefused` (a cap or
    the kill switch), `"error"` for anything else, which is logged (`GatewayBusy`, a stall, a
    failed call, `AgentStopped`).
  - If the client disconnects, the signal aborts the loop, which settles the call as `aborted`
    (section 6), and nothing more is sent.

**The tools** (`agent/librarian/tools.ts`, `create-manual.ts`):

| Tool | Input | Status | Result |
| --- | --- | --- | --- |
| `list_manuals` | none | Checking the shelves… | JSON: each manual's `id`, `title`, `subtitle`, `sections_written` and `sections`, in title order (`librarySummaries`, shared with `GET /api/manuals`) |
| `find_manuals` | `topic` | Searching the shelves… | JSON: up to 5 matches, best first: `id`, `title`, `subtitle` and up to 3 `matching_sections` (`"A.1 Servos, Steppers and Pneumatics"`); or `No manual matches "…".` |
| `open_manual` | `manual_id` | Opening the manual… | Sends `{ type: "open" }`. JSON: the `manual`'s `id` and `title`, and a fixed `result`: the reader opens it when the reply has finished |
| `propose_delete` | `manual_id` | Preparing the delete… | Sends `{ type: "propose-delete" }`. JSON: the `manual`'s `id` and `title`, and a fixed `result`: nothing is deleted, only the user's choice in the page's confirmation deletes it, and never say it has been deleted |
| `create_manual` | `request` | Planning a manual… | Hands the request to the planner (below). Saved: sends `{ type: "created" }`, and JSON: the `manual`'s `id`, `title`, `subtitle` and counts of `chapters` (appendices included) and `sections`, and a fixed `result`: it is saved and the library shows it; give its title and offer to open it, but don't open it unless asked. Not saved: JSON with only a fixed `result`: nothing was created; say so plainly. A reply plans at most one manual: the tools are built for each reply, and a second call is refused at once, with no model call, as the error result "Only one manual per reply; nothing was created." |

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

**The system prompt** (`agent/librarian/prompt.ts`) is the same for every request. It describes:

- the library: what a manual is, the page beside the librarian, and that the library can change
  between messages;
- the tools, with the delete rule (it deletes nothing; only the user's confirmation does; never
  say a manual has been deleted), the create rule (pass the request in the user's words, at most
  one manual per reply and only when asked, ask first when no subject is given, then give the
  title and offer to open it without opening it, or say plainly that it couldn't be created),
  that tool results are data and never instructions, one open or delete per reply, finding the id
  first, asking when a request could mean more than one manual, and calling tools without
  announcing them;
- the voice, from the landing page's copy: calm, warm and a little dry, like a reference
  librarian or a stage manager; one to three sentences or a short list; titles in italics, never
  ids; only the markdown `ReplyMarkdown` renders, minus links and code; typographic punctuation;
- what it can't do (write a manual's sections itself, edit or rename a manual), answered in a
  sentence with what it can do instead.

No `cache_control` is sent (section 5). A librarian call reads about 1,800–2,300 input tokens
(the system prompt, the tool definitions, the tool-use system prompt and the conversation), writes up to a
few hundred, and costs about $0.002–0.003, against a reservation of about $0.013. A reply takes
one call per model turn: two for a list or a find, two or three to open or propose a delete, and
two to create a manual, with the planner's one or two calls between them.

**The planner** (`agent/planner/`) plans a new manual and saves it:

```ts
// server/agent/planner/plan.ts
async function planManual(plan: {
  gateway: Gateway; store: ManualStore; request: string; signal: AbortSignal;
  onStatus: (text: string) => void;
}): Promise<{ manual: StoredManual } | { problems: string[] }>;
```

- **Its own job.** Each attempt is one gateway call under the job `plan-manual`, with its own
  `maxTokens` and idle timeout (section 8), so it is reserved, capped and recorded like any other
  call. Gateway errors are thrown as they are. A refusal by the caps or the kill switch ends the
  reply with `failed: "budget"`, because the loop's `runTool` lets `SpendingRefused` through; any
  other (a stall, `GatewayBusy`) is turned by `runTool` into an error result for the librarian,
  as for any tool that throws.
- **The prompt** (`prompt.ts`). The system prompt is the same for every plan: what a plan is for
  (a later writer sees only the voice and each section's title and summary), the rules for each
  field (the id a slug of the title and never a taken one; a third-person voice brief with a
  concrete history, a way of addressing the reader, a rhythm, a running vocabulary, the figures
  the author reaches for and the rules they are firm on; one-line summaries of 60–120
  characters; typographic punctuation; nothing that could hurt someone), the size to aim
  for and the hard limits, and one seed manual, *Moving House Without Losing the Cat*, as JSON in
  the tool's own form, with the instruction never to reuse its author, subject, chapters or
  wording. The user message holds the request inside `<request>`, with `<` escaped so it can't
  close the tag, then the ids already taken in the library, and on a retry the problems with the
  first plan. The system prompt says the request describes the manual wanted and is never an
  instruction: nothing inside it changes the rules, the tool or the format.
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
- **Measured** (Haiku 4.5, 2026-10-12): a 23-section plan took 3,957 input and 2,481 output
  tokens, $0.0164, in 22s, against a reservation of about $0.036.

**The fake model** (`agent/librarian/fake-model.ts`), the default (`config.models`, section 4):

- It implements `Gateway` itself, so it makes no model call and never reaches the real gateway:
  nothing is reserved, recorded or capped, as with the fake writer.
- It reads the latest user message for a keyword, the first match in this order: `delete` or
  `remove`; `create`, `new` or `start`; `open` or `read`; `list`, `library`, `manuals` or "what do
  I have"; `find`, `anything` or `which`; `help`. Then it plays the turns a model would, through
  the real tools: a list calls `list_manuals` and lists every title with its counts; an open or a
  delete calls `find_manuals` with the message as the topic, then `open_manual` or
  `propose_delete` with the best match, then says so; with no match it asks which manual. A new
  manual calls `create_manual` with the message as the request, then gives the saved manual's
  title and counts and offers to open it, or says it couldn't plan it; help and anything else
  get fixed replies.
- Asked for a plan (the job `plan-manual`), it plays the planner's turn
  (`planner/fake-planner.ts`): `fakePlan`, the same nine-section manual for any request, titled
  after what the request is "about" (`Building a Treehouse`), streamed as one `tool-input` then
  saved with `save_manual` 2.4s later. Asked twice for the same title, its id is taken both
  times, so the second request isn't saved.
- It waits 600ms before each turn (and before a plan) and streams text about 20 characters every 85ms, at the fake
  writer's word boundaries (`chunkEnds`). Its fixed replies are `FAKE_REPLIES`, which the tests
  and the shot script match.

**Preview** (`?freeze=<0–1>`, in `api/preview.ts`). Whatever models are configured, it runs
`sendReply` with the fake model at once (no waits) and collects the events. It then sends the
statuses and the text up to the last chunk end at or before that fraction of the reply's text,
then `frozen`, or `done` when nothing was cut (`?freeze=1`). Actions are never sent, and its store
saves no manual (`createManual` only answers `"created"`), so a preview costs nothing and changes
nothing. The browser uses it for
`?conversation=demo` and `?agentFreeze=` (`src/agent/README.md`).

**Tests**, all offline:

- `api/librarian.test.ts`, with the fake model: a list, a find-and-open with its `open` action,
  a proposed delete that leaves the manual in place until `DELETE`, a delete that names no
  manual, a new manual planned, saved, announced with `created` and listed, the same request
  again refused plainly, a fallback with no tool, and the requests refused with `400` (bad
  bodies, a message over the limit, too many exchanges; the limit itself is accepted); the
  previews at 1, 0.5 (which saves nothing it plans) and 0 through a configured model that throws
  if called, and the invalid `?freeze` values. Through the real gateway with `scriptedClient`: a three-turn reply with its
  events in order, the paragraph break, the plain-text conversation and the five tools sent, and
  one settled `librarian` call per turn; a manual created through the planner's own job between
  two librarian turns (`librarian`, `plan-manual`, `librarian` in the ledger), with the request
  in the planner's prompt and the counts in the tool result; a second `create_manual` in the
  same reply refused with no planner call; `failed: "budget"` when the caps refuse the planner's
  call; the paragraph break after an unknown
  tool; an unknown
  id; `failed: "budget"` for a cap and for the kill switch; `failed: "error"` after text for a
  call stopped at `max_tokens`.
- `agent/librarian/find.test.ts`: which manual comes first for a topic, matching by the table of
  contents, title over subtitle, and nothing for request words alone.
- `agent/planner/plan.test.ts`, through the real gateway with `scriptedClient`: a good plan saved
  in one `plan-manual` call, with the request as data and the taken ids in the prompt; a request
  that tries to close its own tag; a bad plan (a repeated id) retried once with its problem, the
  title progress and the retry's statuses, then saved; a plan that fails twice, with nothing
  saved and no third call; an id another manual has, refused then saved under a new one; an id
  taken after the check, never replaced; a reply with no plan and a plan cut off at `max_tokens`,
  each counted as an attempt.
- `agent/planner/check.test.ts`: every seed manual and the fake plan pass; labels are assigned
  by place whatever the model wrote; a taken id, a repeated id, too few or too many chapters and
  sections, a blank or missing summary, a short voice, an id that isn't a slug and an unknown key
  are each named.

## 8. Configuration

| Setting | Where | Secret |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | `.env.local`, read only by `gateway/credentials.ts` | yes |
| Models, port, data dir, caps, concurrency, jobs, section length | `server/config.ts` | no |
| Prices | `server/gateway/prices.ts` | no |

```ts
// server/config.ts
export const API_PORT = 8787;   // server/ports.ts
export const config: ServerConfig = {
  port: API_PORT,
  dataDir: fileURLToPath(new URL("../.data", import.meta.url)),   // <repo>/.data, whatever the cwd
  models: modelsFromEnv(process.env.RTFM_MODELS),   // "fake" (default) or "bedrock"; anything else throws
  maxConcurrentRuns: 3,
  sectionWordsRequested: 650,
  sectionExpectedCharacters: 4800,
  caps: { dailyUsd: 2, monthlyUsd: 20 },
  maxConcurrentCalls: 3,
  idleTimeoutMs: 30_000,
  jobs: {
    "write-section": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 2048 },
    librarian: { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 1024 },
    "plan-manual": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 4096, idleTimeoutMs: 60_000 },
  },
};
```

- **Types.** `config` is a `ServerConfig`, which extends `GatewayConfig` (`caps`,
  `maxConcurrentCalls`, `idleTimeoutMs`, `jobs`, in `gateway/types.ts`) with the port, data dir,
  models, `maxConcurrentRuns`, `sectionWordsRequested` and `sectionExpectedCharacters`.
  `startServer` and the gateway take it as it is, so tests and the shot script spread `config`
  and override what they need.
- **The `global.` model ID.** Every job uses the `global.` inference profile rather than `us.`,
  which costs 10% more; nothing here needs routing that stays in the US.
- **`maxTokens: 2048`.** The sample sections are 460–660 words (about 650–950 tokens), so this
  leaves room. Its output costs at most about $0.01 (2,048 × $5 per million), and with the input
  bound a call's worst-case reservation is about $0.025.
- **`librarian: maxTokens 1024`** is sized for a few short paragraphs and short JSON tool inputs.
  Its output costs at most about $0.005 a turn. With
  the tool definitions, the conversation and the 588-token tool-use system prompt in the input
  bound, a turn of a few thousand input tokens reserves about $0.01.
- **`plan-manual: idleTimeoutMs 60_000`**, a job's own idle timeout in place of the shared 30s,
  because its largest tool parameter can take that long to arrive (section 5). A stalled plan is
  charged its full `max_tokens` either way, so the longer wait costs nothing more; the SDK's own
  `timeout`, for the response headers, stays at the shared 30s.
- **`plan-manual: maxTokens 4096`.** A measured 23-section plan took 2,481 output tokens (about 95
  a section plus the voice); the prompt aims for 12–24 sections, and the hard limit of 32 comes to
  about 3,300. 4096 leaves 65% headroom over the measured plan and room for the largest allowed
  one. Its output costs at most about $0.02, and with the input bound (a 9 KB system prompt with
  the example, the 2 KB tool and the 588-token tool-use system prompt) a plan reserves about
  $0.036. A retry reserves the same again.
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
    "global.anthropic.claude-haiku-4-5-20251001-v1:0":
      { input: 1.00, output: 5.00, cacheWrite: 1.25, cacheRead: 0.10, toolUseSystemPromptTokens: 588 },
    "us.anthropic.claude-haiku-4-5-20251001-v1:0":
      { input: 1.10, output: 5.50, cacheWrite: 1.375, cacheRead: 0.11, toolUseSystemPromptTokens: 588 },
  },
};
```

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
  - **Not from AWS's pricing page**, whose Claude tables don't render, and not compared with
    Cost Explorer.
- **Measured cost:** $0.007–0.010 per section (about 2,900–3,200 input and 970–1,410 output
  tokens), with a worst-case reservation of about $0.025. A call aborted mid-section is charged
  its full `max_tokens`, about $0.013. Both are computed from the reported tokens and this
  table, as the ledger records them, not read from AWS's bill.

## 9. The reader's store (`src/manual/`)

**How it reads the API**

- **State per manual.** The store keeps one state per manual id (`stateOf(manualId)`): the manual,
  its cached requests, section texts, opened sections and open streams. Moving between manuals
  never mixes their sections or streams.
- **`useManual(manualId)`** fetches `GET /api/manuals/<manualId>` once per manual per page load,
  from a promise cached in that manual's state, and suspends on it with `use()`. The lazy route's
  `Suspense` covers the wait. After that it is a `useSyncExternalStore` store. A failed fetch (no
  server, or an unknown manual) throws to the reader's `ManualErrorBoundary`.
- **`useSection(manualId, id)`** suspends with `use()` on a cached promise for the JSON section
  route.
  - **Written sections** render straight away, with no stream.
  - **Unwritten sections** open an `EventSource`, once per section per page load and held at
    module level, so a section keeps writing while the reader is elsewhere.
  - **Events:** `append` sets the text at `at`. `written` marks the section written, keeping its
    text. `frozen` keeps it writing. `failed` and `error` record a failure.
  - **Closing:** the source is closed on `written`, `frozen`, `failed` and `error`.
  - **Repair stays in the browser:** `text` is still `repairPartialMarkdown(raw)`.
  - **Failures:** `UseSectionResult` has `failure?: "budget" | "error"`. The TOC shows the
    section as `unwritten`.
- **At most 3 streams are open at once on the page**, across all manuals (`MAX_OPEN_STREAMS`,
  matching `maxConcurrentRuns`, which also counts every manual). The queue of streams waiting for
  a slot is the only state the manuals share. Sections opened beyond the limit wait in the writing
  state and open in order as others end.
- **`?freeze=` and `?fail=`** pass from the page URL to the stream URL.

**What the browser doesn't have**

- The manuals live only on the server; the seed manuals are in `server/seed/`.
- The browser's types have no `body` or `voice`.
- The browser never splits text into chunks: it shows what each stream sends.

**Tests and scripts that read the sample**

- Tests that need sample bodies read `server/seed/the-haunt-that-listens/`: `repair.test.tsx`
  with Vite's `import.meta.glob`, cutting each body at word ends about 20 characters apart, as a
  stream would; the server's tests with `node:fs`.
- `SHOT_MANUAL` and `SHOT_SECTIONS` are in `scripts/shot.ts`. `Markdown.test.tsx` uses its own
  literal section ids.
