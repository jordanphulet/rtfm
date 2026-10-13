# server/gateway

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

## Each call

For each call, in order:

1. **Kill switch.** If `.data/STOP` exists (`existsSync`, so steps 1–5 up to the ledger write are
   one synchronous step), refuse. Creating the file stops new calls at once, with no restart, and
   deleting it resumes them. A call already running finishes; it is bounded by `max_tokens`.
2. **Concurrency.** If `maxConcurrentCalls` calls are running, throw `GatewayBusy`. That is the 3
   section runs plus 2 (`server/README.md` › Configuration), so five calls can run at once, and
   three sections being written leave room for the librarian and the planner.
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
   - **Idle timeout:** 30s with no event (`config.idleTimeoutMs`, or the job's own `idleTimeoutMs`
     where it has one: 60s for `plan-manual`) aborts the call, with outcome `failed`, and the stream
     throws `ModelStalled`. The timer starts before the request is sent, so it also covers a request
     that never answers.
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

## Stopping

`idle()` resolves once no call is running, at once if none is. A call ends after its settle append,
whether the append succeeds or fails. The server's `close()` awaits it (`server/README.md` › How it
runs), so the process never exits between a call's abort and its settle, which would leave the call
unsettled and counted at its worst case.

## The ledger

**The ledger is the durable record.** On start, the gateway replays this month's file into its
totals. A `reserve` with no `settle` (the server died mid-call) counts at its worst case, and
`npm run usage` lists it as unsettled.

- **Totals in memory** are one map from period (`2026-10-11` or `2026-10`) to committed dollars.
  Reserving adds the worst case to the reservation's day and month; settling adds `usd − worst
  case` to the same two periods.
- **One server process per data folder, enforced** by the data folder's lock
  (`server/storage/README.md` › The data folder's lock). The totals live in one process's memory, so
  two servers on the same `.data/` would each allow the full caps.
- **`gateway/ledger-calls.ts`** pairs `reserve` and `settle` entries into calls. The replay and
  `npm run usage` both use it, so they count spend the same way. `monthOf` comes from
  `storage/file-ledger.ts`, which files entries by it.

## The Bedrock client

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
`input_json_delta` to `tool-input`, a `tool_use` block (its start, input fragments and stop) to one
`tool-use`, and `message_delta`'s `stop_reason` to `stop`.

**Tool calls.** `tools` is sent only when the prompt has some. A `tool_use` block's input arrives
as `input_json_delta` fragments; the client joins them and parses the JSON once, at
`content_block_stop`, with `JSON.parse` (no fragments means `{}`). The tools carry no
`eager_input_streaming`, which Haiku 4.5 on Bedrock rejects, so the API buffers and validates each
input before sending it. Input that still doesn't parse can only come from output cut off at
`max_tokens`. That block is left out, with no event, so the stop reason (`max_tokens`) decides
what happens: the agent loop then stops with `AgentStopped`.

**Long tool inputs and the idle timeout.** The API buffers a tool's input one top-level parameter at
a time: nothing of a parameter is sent until the model has written all of it, then its fragments
arrive at once. Each fragment is passed on as a `tool-input` event, so the gateway's idle timer
restarts whenever a parameter arrives, not only once the whole block is done. The longest silence is
then the time to write the largest parameter. For the planner (`server/agent/README.md` › The
planner) that is the chapters. At the measured rate (`server/README.md` › Configuration), the
largest chapters the size limits allow (32 sections, about 3,000 tokens) take about 26s: too close
to the shared 30s, and over it if Bedrock is slower. So `plan-manual` has its own idle timeout of
60s. The SDK drops `ping` events, so they never reach the gateway.

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

Haiku 4.5 has thinking off unless asked. No `cache_control` is sent: Haiku 4.5 caches only a prefix
of at least 4,096 tokens, and every call's whole input is shorter than that (`server/README.md` ›
Configuration).

**`credentials.ts`** reads the file at the repo root: `util.parseEnv(readFileSync(new
URL("../../.env.local", import.meta.url), "utf8"))`.

- The result goes into a local object, never `process.env`.
- It takes exactly `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, and treats an
  empty or blank value, or a missing file, as missing.
- If any is missing, it throws `CredentialsMissing`, which names the missing variables and the
  models that need them (the section writer, the librarian and the planner) and never prints a
  value, so the server refuses to start with the Bedrock models. `app.ts` calls it when
  `config.models` is `"bedrock"`.

## Tests

The tests are all offline. They guard two boundaries. `sdk-boundary.test.ts` scans every source file
(`.ts`, `.tsx`, `.js`, `.jsx` and their `m`/`c` forms) under `src/`, `server/` and `scripts/`, and
the root source files, and fails if any file but `bedrock-client.ts` names a module starting with
`@anthropic-ai/` or `@aws-sdk/`, or anything outside `server/gateway/` and `server/app.ts` imports
`bedrock-client`, so nothing can call the client without going through the caps.
`bedrock-client.test.ts` runs the client against a local server that answers with real Bedrock
event-stream frames, with fake keys and `AWS_PROFILE`, `AWS_BEARER_TOKEN_BEDROCK`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BEDROCK_BASE_URL` set to decoys: the request is signed with
the fake key and carries no decoy, and with an empty key nothing is sent. Removing either guard
fails it. The other tests next to the gateway, the ledger, `app.ts`, `config.ts` and `main.ts` cover
each rule in this README, the shutdown order in `server/README.md` › How it runs and the committed
config's room for the librarian.

## `npm run usage`

`npm run usage` (`server/usage.ts`, with the formatting in `gateway/usage-report.ts`) prints
today's and this month's spend (UTC) against the caps, as `README.md` describes. It reads another
data folder when given one; the tests use this.

## Files

- `types.ts`: `ModelClient`, `ModelPrompt`, `ModelEvent`, `GatewayConfig`, refusal errors.
- `gateway.ts`: caps, reservations, concurrency, idle timeout, kill switch, ledger.
- `ledger-calls.ts`: pairs reserve and settle entries into calls (replay and usage).
- `prices.ts`: the dated price table, cost and worst-case cost.
- `credentials.ts`: reads the AWS keys from `.env.local`.
- `bedrock-client.ts`: the only file that imports `@anthropic-ai/bedrock-sdk`.
- `usage-report.ts`: formats `npm run usage`.
- `sdk-boundary.test.ts`: fails if anything else imports the SDK or the client.
