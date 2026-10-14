# server/gateway

`server/gateway/` is the only route to a model. The section writer and the agent loop pass a job
name (`write-section`, `librarian` or `plan-manual`), a prompt and a signal. They never see a model
ID, a price or the SDK.

- **A prompt** (`ModelPrompt`, `gateway/types.ts`) is a system prompt, optional tool definitions
  and messages whose content is a string or a list of `text`, `tool_use` and `tool_result` blocks.
  Blocks and tool definitions use Anthropic's field names, so `bedrock-client.ts` passes them to
  the SDK as they are. `Prompt` is the plain-text form the section writer builds.
- **A `ModelClient`** (`bedrock-client.ts`; the fake model, below; and scripted fakes for tests)
  is given the job, the job's model and `max_tokens`, the prompt and a signal (`ModelRequest`),
  and streams `ModelEvent`s: `text`;
  `tool-input`, each fragment of a tool's input as it arrives; `tool-use`, one per whole
  `tool_use` block; `usage`, with input, output and cache token counts; and `stop`, with the stop
  reason.
- **`createGateway`** takes a `createClient` factory, an `openSpendingLedger` factory (The spending
  ledger, below), the `GatewayConfig` and the price table. It returns a `RunningGateway`: the
  `Gateway` that the writer and the loop see (`stream(job, prompt, signal)`), plus `idle()`.
- **Errors:** the stream's first step throws `SpendingRefused` (`"daily-cap"`, `"monthly-cap"` or
  `"kill-switch"`) or `GatewayBusy`; a stalled call throws `ModelStalled`, and a stream that ends
  without a stop reason throws `ModelStreamIncomplete`.

`createGateway` rejects with `ModelNotPriced` if any job's model is missing from the price table,
so the server refuses to start. It checks before it calls either factory, so with Bedrock an
unpriced model is reported without reading any secret. This is the only price-table check. It is
async because it opens the spending ledger before it returns (the data folder's replays this
month's file). The stream is an async generator, so a refusal surfaces on the first `next()`,
before any event. A signal that is already aborted is refused without a reservation.

**Callers must read the stream with `for await`**, which calls `return()` when they stop early,
so the call is aborted and settled. An iterator that is abandoned without `return()` never
settles. The caps stay safe, because its reservation keeps counting at the worst case, but the
call stays "running", and the gateway never becomes idle, so stopping the server would wait
for it forever.

## Each call

For each call, in order:

1. **Concurrency.** If `maxConcurrentCalls` calls are running, throw `GatewayBusy`. That is the 3
   section runs plus 2 (`server/README.md` › Configuration), so five calls can run at once, and
   three sections being written leave room for the librarian and the planner. The call takes its
   slot at once, before it awaits its reservation, so calls starting together can't all slip under
   the limit; a refused or failed reservation gives the slot back.
2. **Worst case.** `(inputBound × highest input price) + (max_tokens × output price)`.
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
3. **Reserve: the kill switch and the caps.** The spending ledger (below) refuses with
   `SpendingRefused`, checking in this order:
   - `"kill-switch"` while the kill switch is on. Turning it on stops new calls at once, with no
     restart, and turning it off resumes them. A call already running finishes; it is bounded by
     `max_tokens`.
   - `"daily-cap"` or `"monthly-cap"` when, for the day or the month (UTC, as AWS bills), the
     committed spend (settled calls at what they cost, unsettled ones at their worst case) plus
     this worst case would pass the cap.

   Otherwise it records `{ kind: "reserve", callId, reservedAt, job, model, worstCaseUsd }` and adds
   the worst case to the day's and the month's committed spend, in one step that no other
   reservation can come between, so two calls can't both slip under a cap. If the reservation fails
   for another reason (a full disk, DynamoDB out of reach), the error is rethrown and no call is
   made.
4. **Call.** `client.stream(...)`, re-yielding events.
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
5. **Settle** (in `finally`, so it runs after completion, error or abort). The spending ledger
   records `{ kind: "settle", callId, reservedAt, at, job, model, inputTokens, outputTokens,
   cacheWriteTokens, cacheReadTokens, usd, outcome: "complete" | "aborted" | "failed", estimated }`
   and adds `usd − worst case` to the committed spend.
   - It goes into the reservation's month, and the cost is charged to the reservation's day and
     month, so a call that crosses midnight stays in one period.
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
       Bedrock billed after the cut, so the gateway assumes the most it can be. AWS's bill shows
       an aborted call billed its input and almost none of its output (`server/README.md` ›
       Checked against AWS's bill), so the ledger overstates each by nearly its full
       `max_tokens` of output.
     - `estimated` is also set if a complete call never reported its input or output tokens.
   - **The call stays running until its settle is written.** Only then does it free its
     concurrency slot, and its unused worst case is freed with the settle, so until then the
     totals hold the worst case, and `idle()` counts it as running. A settle that fails leaves
     the reservation counted at its worst case.

## Stopping

`idle()` resolves once no call is running, at once if none is. A call ends after its settle is
written, whether the write succeeds or fails. The server's `close()` awaits it
(`server/README.md` › How it runs), so the process never exits between a call's abort and its
settle, which would leave the call unsettled and counted at its worst case.

## The spending ledger

**The spending ledger is the durable record** of every call, the committed spend the caps are
checked against, and the kill switch. `SpendingLedger` (`spending-ledger.ts`) reserves, settles,
reads a month's entries and says whether the kill switch is on. `RTFM_MODELS` chooses which one
`createModels` (`app.ts`) opens:

- **`fake`: the data folder's** (`file-spending-ledger.ts`): the ledger files, totals in the
  server's memory, and `.data/STOP`.
- **`bedrock`: the table `rtfm-usage`'s** (`dynamodb-spending-ledger.ts`), on this machine as
  deployed. `createModels` opens no other for Bedrock, so Bedrock never runs against the data
  folder's ledger, and the fake model's $0 calls never reach `rtfm-usage`. Every server running
  Bedrock, on any laptop or in AWS, shares its caps and its kill switch.

Both keep the same rules, which `spending-ledger-suite.ts` checks against each: reserving within
and up to each cap, refusing past it, the daily and monthly periods, settling, a reservation left
unsettled by a crash counting at its worst case after a restart, the kill switch, and reservations
racing for one cap (from two servers' ledgers on the table; from the one server's in a data
folder). `dynamodb-spending-ledger.test.ts` also
runs two gateways on one DynamoDB Local table, as two servers with Bedrock, and checks that only
the calls the cap allows reach the model.

A `reserve` with no `settle` (the server died mid-call) keeps counting at its worst case in either
one, and `npm run usage` lists it under "Unsettled reservations". Nothing settles it later.

`gateway/ledger-calls.ts` pairs `reserve` and `settle` entries into calls. The data folder's replay
and `npm run usage` both use it, so they count spend the same way. `monthOf` comes from
`storage/file-ledger.ts`, which files entries by it.

### The data folder's

- **The files** are the ledger in `storage/file-ledger.ts` (`server/storage/README.md` › The data
  folder): one JSON line per entry, by month. On open, it replays this month's file into its
  totals.
- **Totals in memory** are one map from period (`2026-10-11` or `2026-10`) to committed dollars.
  Reserving adds the worst case to the reservation's day and month; settling adds `usd − worst
  case` to the same two periods.
- **The check and the reservation are one synchronous step** on those totals, before the append is
  awaited; if the append fails, the worst case is taken off again.
- **The kill switch is `.data/STOP`**, checked with `existsSync` at each reservation.
- **One server process per data folder, enforced** by the data folder's lock
  (`server/storage/README.md` › The data folder's lock). The totals live in one process's memory,
  so two servers on the same `.data/` would each allow the full caps.

### The table `rtfm-usage`

`RtfmApp` holds the table (`infra/README.md` › The stacks): on demand, with point-in-time recovery
and deletion protection, and kept when it leaves the stack. On this machine the server reaches it
with `rtfm-local`'s keys from `.env.local`, read only by `credentials.ts`, in their region
(`usageTableWith` in `server/config.ts`), through the manual store's client builder
(`documentClient` in `storage/dynamodb-manual-store.ts`: every setting pinned, no credential
chain). One table holds three kinds of item, told apart by their keys, two strings:

| Item | `pk` | `sk` | Other attributes |
| --- | --- | --- | --- |
| A call | `LEDGER#<yyyy-mm>`, its reservation's month | `<reservedAt>#<callId>` | `reserve`: its reserve entry, as a map; `settle`: its settle entry, absent until it settles |
| A period's committed spend | `TOTAL` | the day (`2026-10-13`) or the month (`2026-10`) | `committedUsd`: a number |
| The kill switch | `KILL_SWITCH` | `KILL_SWITCH` | none: it is on while the item exists |

Every read is strongly consistent.

- **Reserving** is one `TransactWriteItems`:
  - a `ConditionCheck` that the kill-switch item doesn't exist;
  - an `Update` of the day's total, `ADD committedUsd :worstCase`, on the condition that it stays
    within the daily cap. A condition can't add, so the server works out the limit, `cap − worst
    case`, and the condition is `attribute_not_exists(committedUsd) OR committedUsd <= :limit` (a
    total not made yet is $0); when the worst case alone is over the cap, the limit is negative
    and the condition is just `committedUsd <= :limit`, which nothing meets;
  - the same `Update` of the month's total, against the monthly cap;
  - a `Put` of the call's item, on `attribute_not_exists(pk)`.

  All four happen or none does, and no other transaction comes between the checks and the adds.
  When it is cancelled, the first failed condition, in that order, names the refusal. The caps
  are the reserving server's own `config.caps`; every server runs the committed ones
  (`server/config.ts`), so they share one $2 a day and $20 a month.
- **Settling** is one `TransactWriteItems`: an `Update` that sets the call's `settle`, on the
  condition that the call is there and not yet settled, and `ADD committedUsd :usdLessWorstCase`
  on the day's and the month's totals.
- **The kill switch is read in each reservation's own transaction**, so nothing caches it: the
  first reservation after the item is put is refused. `npm run usage` reads it with a strongly
  consistent `GetItem`. It has its own partition, which `rtfm-ops` is limited to with
  `dynamodb:LeadingKeys` (`infra/README.md` › The identities). How to turn it on and off is in
  `README.md` › The data folder and spending.
- **A crash between reserve and settle** leaves the call's item without `settle`, and both totals
  hold its worst case, as the data folder's ledger does.
- **Retries.** The SDK retries a request that fails on its way (up to 3 attempts), and fills in
  `TransactWriteItems`'s `ClientRequestToken` once per request, so its retries carry the same one,
  and DynamoDB applies the transaction at most once. A transaction cancelled by
  `TransactionConflict` (another one on the same item at the same moment) is tried again by the
  retry loop it shares with the manual store (`transactWrite` in
  `server/storage/dynamodb-manual-store.ts`), up to 8 attempts in all, after a random pause of up
  to 20ms times the attempt's number; then the loop returns the cancellation and the ledger throws
  it. A reservation that throws for any reason other than a refusal makes no call; if DynamoDB
  applied it after all, it stays counted at its worst case, never less.
- **What `rtfm-local` and the Web Function's role may do** on the table is exactly what the server
  does: `GetItem`, `Query`, `PutItem`, `UpdateItem` and `ConditionCheckItem`, which also cover the
  transactions' parts (`USAGE_TABLE_ACTIONS` in `infra/rtfm.ts`). Neither may `DeleteItem`, so
  neither can turn the kill switch off.
- **`importCall`** copies a call from the data folder's ledger (`npm run usage`, below) in one
  transaction: a `Put` of the call's item on `attribute_not_exists(pk)` and `ADD` of what it was
  charged to its day and month, with no cap condition, since it was already spent. A call already
  there cancels the transaction and changes nothing, so an import can run any number of times.
- **`setKillSwitch`** puts or deletes the kill-switch item: `npm run ops -- kill-switch`, as
  `rtfm-ops` (`README.md` › The ops tools), and the tests, on DynamoDB Local. The server never
  calls it.
- **Numbers** go to DynamoDB as JavaScript prints them, and DynamoDB adds them as exact decimals.
  `usd − worst case` is worked out in floating point, so a total can drift from the sum of its
  entries by far less than a millionth of a cent a call. The suite uses amounts a binary fraction
  holds exactly, so both implementations add them up the same.
- **The tests** run the suite and the two gateways against DynamoDB Local, each on a table of its
  own (`testUsageTable()` in `dynamodb-testing.ts`). DynamoDB Local never answers
  `TransactionConflict`, so the retries, the transactions' exact shape and the request token are
  tested against a stand-in on loopback.

**Changing the stored form.** The table is deployed data: a change to these items carries its
migration, or reads the old form too (`ARCHITECTURE.md` › Everything runs on one machine).

## The fake model

With `RTFM_MODELS=fake`, `app.ts` runs every job on `FAKE_MODEL` (`"fake-model"`, in `types.ts`),
keeping each job's `maxTokens` and idle timeout, and the gateway calls the fake model
(`server/agent/README.md` › The fake model) in place of the Bedrock client. Its id can never be a
Bedrock model's, and it is in the price table with every price at 0, so:

- each call reserves $0 and settles $0, so it adds nothing toward the caps (Each call, step 3);
- the kill switch (`.data/STOP`), the concurrency limit and the idle timeout refuse or stop it as
  they do any call, and the reader and the librarian show the kill switch as "budget", as with
  Bedrock;
- each call is written to the data folder's ledger under `fake-model`, never to `rtfm-usage`. The
  fake model reports zero tokens and a stop reason, so a complete call is not marked estimated.

## The Bedrock client

**`bedrock-client.ts`** is the only importer of `@anthropic-ai/bedrock-sdk`. It builds the client
with every option that would otherwise fall back to the environment set explicitly:

- the keys from `.env.local` as `awsAccessKey` and `awsSecretKey` (never `process.env`), and
  `awsRegion`, so `AWS_REGION` is never read;
- `baseURL`, the region's endpoint, so `ANTHROPIC_BEDROCK_BASE_URL` is never read;
- `apiKey: null`, so `AWS_BEARER_TOKEN_BEDROCK` can't replace SigV4 signing;
- a `providerChainResolver` that throws, so the default AWS credential chain never runs;
- `maxRetries: 0`, one reservation for one HTTP call;
- `timeout`, the idle timeout (step 4).

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
- **`timeout`** defaults to 10 minutes and covers only the wait for response headers (step 4).
- **Streaming abort:** the signal passed in the request options stays attached until the body is
  settled, so aborting it mid-stream closes the HTTP connection. But `MessageStream`'s iterator
  does not always throw afterwards: an abort or error that lands between two `next()` calls
  ends the iteration quietly. The gateway's checks after the loop (step 5) catch this.
- **Response framing:** Bedrock answers with `application/vnd.amazon.eventstream`, which the SDK
  transcodes to server-sent events in `core/streaming.js`. Exception frames become SSE `error`
  events, which the stream throws.
- **The model ID** goes into the path unencoded:
  `/model/global.anthropic.claude-haiku-4-5-20251001-v1:0/invoke-with-response-stream`.

Haiku 4.5 has thinking off unless asked. No `cache_control` is sent: Haiku 4.5 caches only a prefix
of at least 4,096 tokens, and every call's whole input is shorter than that (`server/README.md` ›
Configuration).

**`credentials.ts`** reads `.env.local` with `util.parseEnv(readFileSync(ENV_LOCAL_FILE, "utf8"))`.

- `ENV_LOCAL_FILE` is in the main checkout's root, the parent of `git rev-parse
  --path-format=absolute --git-common-dir`, resolved once when the module loads. So a server
  started in a linked worktree reads the main checkout's file, and no worktree needs a copy.
  Where git can't be run, or `credentials.ts` isn't in a normal checkout or linked worktree, it
  is the repo root. Git runs with every `GIT_*` variable removed, so a `GIT_DIR` set for a hook
  can't point it at another repo.
- The result goes into a local object, never `process.env`.
- It takes exactly `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, and treats an
  empty or blank value, or a missing file, as missing.
- If any is missing, it throws `CredentialsMissing`, which names the missing variables and the
  models that need them (the section writer, the librarian and the planner) and never prints a
  value, so the server refuses to start with the Bedrock models. `app.ts` calls it when
  `config.models` is `"bedrock"`, for the Bedrock client and for the table `rtfm-usage`, which the
  same keys reach; `usage.ts` calls it to read that table.

## Tests

The tests are all offline. They guard two boundaries. `sdk-boundary.test.ts` scans every source file
(`.ts`, `.tsx`, `.js`, `.jsx` and their `m`/`c` forms) under `src/`, `server/` and `scripts/`, and
the root source files, and fails if any file but the SDK adapters it lists (`bedrock-client.ts`,
`dynamodb-spending-ledger.ts` for the table `rtfm-usage`, and
`server/storage/dynamodb-manual-store.ts` for the table `rtfm-app`) names a module starting
with `@anthropic-ai/` or `@aws-sdk/`, or a listed adapter names none, or anything outside
`server/gateway/` and `server/app.ts` imports `bedrock-client`, so nothing can call the client
without going through the caps.
`bedrock-client.test.ts` runs the client against a local server that answers with real Bedrock
event-stream frames, with fake keys and `AWS_PROFILE`, `AWS_BEARER_TOKEN_BEDROCK`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BEDROCK_BASE_URL` set to decoys: the request is signed with
the fake key and carries no decoy, and with an empty key nothing is sent. Removing either guard
fails it. The other tests next to the gateway, the spending ledgers, the ledger, `app.ts`,
`config.ts` and `main.ts` cover each rule in this README, the shutdown order in `server/README.md`
› How it runs and the committed config's room for the librarian. `app.test.ts` checks that a
server with Bedrock takes its kill switch and caps from `rtfm-usage` (on DynamoDB Local) and
writes no ledger in its data folder.

## `npm run usage`

`npm run usage` (`server/usage.ts`, with the formatting in `gateway/usage-report.ts`) prints
today's and this month's spend (UTC) against the caps, as `README.md` describes, from the ledger
`RTFM_MODELS` chooses: the data folder's with `fake` (the default), or `rtfm-usage` with `bedrock`,
read with `rtfm-local`'s keys as the server reads it. The report is the same either way. It reads
another data folder when given one, which the tests use; with `bedrock` it refuses one. Calls on
`FAKE_MODEL` are left out of each period's total, its counts, its groups by model and by job, and
the unsettled reservations, and are counted on a line of their own with what they cost, so they
can't hide or pad a real charge. Only that exact id is left out, and no Bedrock call can have it.
`usageSummary` gives the same figures as data, which `npm run ops -- usage --json` prints, and
`npm run ops -- usage` prints the same report of `rtfm-usage`, read as `rtfm-read`.

**Importing the data folder's Bedrock calls.** Bedrock calls made before `rtfm-usage` existed are
in the data folder's ledger, which the central caps can't see. `RTFM_MODELS=bedrock npm run usage
-- --import [<dataDir>]` (`gateway/usage-import.ts`) lists this month's Bedrock calls in the data
folder's ledger, leaving out the fake model's, with what each was charged (an unsettled one at its
worst case) and whether `rtfm-usage` already has it, and writes nothing. With `--apply` it copies
each call not yet there with `importCall` (The table `rtfm-usage`, above), so the central totals
count it. Each call is copied at most once, so running it again changes nothing. It leaves the
data folder's ledger as it is.

## Files

- `types.ts`: `ModelClient`, `ModelPrompt`, `ModelEvent`, `GatewayConfig`, refusal errors,
  `FAKE_MODEL`.
- `gateway.ts`: reservations, concurrency, idle timeout, settling.
- `spending-ledger.ts`: the `SpendingLedger` interface.
- `file-spending-ledger.ts`: the data folder's spending ledger, for the fake models, and its kill
  switch's path (`killSwitchPath`).
- `dynamodb-spending-ledger.ts`: the table `rtfm-usage`'s, for Bedrock, with `importCall`,
  `setKillSwitch` and `createUsageTable` (for DynamoDB Local). The one file here, beside
  `bedrock-client.ts`, that imports an AWS SDK.
- `spending-ledger-suite.ts`: the tests every `SpendingLedger` passes.
- `dynamodb-testing.ts`: the tests' `rtfm-usage` tables in DynamoDB Local.
- `ledger-calls.ts`: pairs reserve and settle entries into calls (replay and usage).
- `usage-import.ts`: `npm run usage -- --import`.
- `prices.ts`: the dated price table, cost and worst-case cost.
- `credentials.ts`: reads the AWS keys from `.env.local`.
- `bedrock-client.ts`: the only file that imports `@anthropic-ai/bedrock-sdk`.
- `usage-report.ts`: `npm run usage`'s figures (`usageSummary`) and report.
- `sdk-boundary.test.ts`: fails if anything else imports the SDK or the client.
