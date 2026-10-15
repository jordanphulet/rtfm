# server

The API server: it stores the manuals, writes their unwritten sections, runs the librarian, and
sends every model call through the gateway. Each code folder in it has its own README, and
`ARCHITECTURE.md` maps them.

The server lives in the top-level `server/` folder, next to `src/` and `scripts/`. It runs as
TypeScript directly on Node 22.18+, as `scripts/` does, with its own `tsconfig.server.json`
(`module: nodenext`, `allowImportingTsExtensions`, `noEmit`, the same strict flags), referenced from
`tsconfig.json`.

## How it runs

- `npm run dev` runs `node server/dev.ts`. It spawns `vite` and `node --watch server/main.ts`,
  with their output passed through.
  - It forwards SIGINT and SIGTERM to both children and waits for both to exit before it exits
    itself.
  - If one child exits or fails to start, it sends the other SIGTERM, so nothing is left holding
    port 5173.
  - It is a separate process, not a Vite plugin, so the server runs the same way in development
    as it does alone (`npm run server`).
- The server listens on `127.0.0.1` only and answers only this machine's own pages
  (`server/api/README.md` › Only the app's own pages).
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
  `RTFM_PORT` (Configuration, below) run it on another data folder or port.
- `main.ts` logs to standard output and to the data folder's log file (`server/logging/README.md`),
  and runs the server as the whole process with `runServerProcess` (`app.ts`), as
  `web-function.ts` does (The Web Function, below). Its first line, `server.started`, says
  `API server on http://127.0.0.1:<port>` and the model source.
  - On SIGINT and SIGTERM it closes the server and then exits. `close()` stops taking connections
    and closes every open one, which aborts the sections being written and the librarian's replies
    (`close(graceMs)` first lets the open requests end, for up to `graceMs`, as the Web Function
    does before it is replaced: The Web Function, below); waits until the gateway is
    idle (`server/gateway/README.md` › Stopping); then releases the data folder's lock
    (`server/storage/README.md` › The data folder's lock) and logs `server.stopped`. Under
    `npm run dev` the signal comes from Ctrl-C, `dev.ts` forwarding one, or `node --watch`
    restarting the server after an edit.
  - If the folder is in use, the refusal is logged (`server.refused`) and `main.ts` exits with
    code 1; under `npm run dev`, `node --watch` then waits for a file change and Vite keeps
    running without an API server. Any other failure to start is logged as
    `server.start-failed`, and an uncaught exception or unhandled rejection as `server.crashed`;
    both exit with code 1.
  - It exits only once standard output has taken every line, since a pipe may still hold some.
- `.claude/launch.json` runs `npm run dev`.
- `npm run shot` starts the server in process with `startServer({ ...config, port: 0,
  dataDir: <temp dir>, models: "fake", passcode: undefined })` and points its Vite proxy at it
  (`http://127.0.0.1:<port>`, also with `changeOrigin: false`), then does the same with a passcode
  set, on a second temp dir, for the passcode screen. Every run starts from the seed and never
  touches `.data/` or Bedrock, and a `RTFM_PASSCODE` in the environment changes nothing.

## The Web Function

The deployed app is this same server on a Lambda Web Function, `rtfm-app` (`infra/README.md` ›
The stacks), started by `web-function.ts`. It differs from `main.ts` only in its configuration:

- **It listens on `AWS_LAMBDA_HTTP_ENDPOINT`**, the `host:port` Lambda sets
  (`httpEndpointFromEnv` in `config.ts`). Without it, or with no port in it, it doesn't start.
- **Claude on Bedrock**, since `RtfmApp` sets `RTFM_MODELS=bedrock` in the revision's
  environment (Choosing the models, below). Every call is reserved first in the table
  `RTFM_USAGE_TABLE` names, `rtfm-usage`, which `RtfmApp` also sets: the same caps ($2 a day, $20
  a month, $0.50 a day for each recipient library) and kill switch as every laptop's
  (`server/gateway/README.md` › The table `rtfm-usage`). Its role may call Claude's models and
  profiles and read and write the items of `rtfm-usage`, as `rtfm-local` may (`infra/README.md` ›
  The stacks). Unset, `RTFM_MODELS` runs the fake models, as its tests do, with their spending in
  the throwaway data folder (below).
- **The manuals in the table `rtfm-app`** (`server/storage/README.md` › The table `rtfm-app`),
  which every environment shares and each seeds when it starts, once across all of them. The
  table's name is `RTFM_APP_TABLE`, which `RtfmApp` sets in the revision's environment.
- **One writer per section across environments**: a run takes the section's lease in the table
  before it writes, and a reader whose request reaches another environment waits for the stored
  body (`server/writer/README.md` › One writer per section).
- **Both tables and Bedrock as the execution role.** AWS documents that a Web Function's code runs
  with its execution role, but not how the role's credentials reach the process: its
  environment-variable page reserves `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
  `AWS_SESSION_TOKEN` and warns that a Web Function doesn't get every variable an Event Function
  does, and an environment has no set lifetime and is never frozen, so the credentials must be
  refreshed while it runs. `webFunctionAwsFromEnv` (`config.ts`) chooses the source by the names
  Lambda sets, reading no key itself: Lambda's container credentials endpoint when
  `AWS_CONTAINER_CREDENTIALS_FULL_URI` is set (with `AWS_CONTAINER_AUTHORIZATION_TOKEN`), as
  Lambda's other long-lived environments use, or else the three key variables
  (`server/storage/README.md` › The table `rtfm-app`). The manual store, the spending ledger and
  the Bedrock client all sign with what that source gives (`ModelAccess` in `config.ts`). The
  endpoint hands out new credentials whenever asked: the DynamoDB clients ask as the old ones near
  expiry, and the Bedrock client before each call (`server/gateway/README.md` › The Bedrock
  client). The key variables are read the same way, but a running process's environment never
  changes, so they are never renewed, and the Web Function has Lambda replace its environment
  before they run out (below). With neither source, without `RTFM_APP_TABLE`, `RTFM_USAGE_TABLE`
  or `AWS_REGION`, or with an `AWS_CREDENTIAL_EXPIRATION` that isn't an ISO 8601 time with its
  offset, the Web Function refuses to start and names what it needs.
  `server.started` logs which source it chose (`credentials`: `container-endpoint` or
  `environment`) and, for the key variables, when they expire (`credentialsExpireAt`: the time
  `AWS_CREDENTIAL_EXPIRATION` gives, or `unset`), never a key, so the deployed app's log shows what
  Lambda really gives.
- **A new environment before its keys run out** (`replacement.ts`), since nothing else bounds an
  environment's life while requests keep coming. When DynamoDB or Bedrock refuses the keys
  (`ExpiredTokenException`, which is how each answers an expired session token, or
  `UnrecognizedClientException`), it logs `server.keys-refused` with the `service` (`DynamoDB` or
  `Bedrock`): the manual store, the spending ledger and the Bedrock client each report a refusal
  to their `onKeysRefused`, which only `web-function.ts` sets. When
  `AWS_CREDENTIAL_EXPIRATION` is set, it logs `server.keys-expiring` 6 minutes before that time,
  with `plannedExitAt` and `msUntilExpiry`, so keys that arrive with less than that left read as
  such, and it exits at once; an expiry further away than a timer can wait (about 24.8 days) sets
  none. The first of these starts the exit: it closes the server with 300 seconds' grace, the
  revision's `timeoutSeconds`. It stops listening at once, so a request Lambda routes to the
  environment on a new connection during the drain is refused; it answers a request that still
  comes on an open connection with `Connection: close`, lets the open requests end and cuts any
  still open after the grace; then it waits for the gateway, logs `server.stopped`, and exits
  with code 1. AWS's error types name a process that
  exits (`Runtime.Exit`, between requests, and `Runtime.ExitError`) and a request that finds it
  gone (`Runtime.Unreachable`), but the docs don't say when Lambda replaces such an environment:
  the deployed app's log shows it.
- **Only here.** This is the one place the server takes AWS credentials from the environment, and
  only `web-function.ts` asks for the execution role. On this machine `main.ts` keeps the manuals
  in files and the server reads AWS keys from `.env.local` alone (Configuration, below); no client
  falls back to the environment, a profile or `~/.aws`. The tables' endpoint is DynamoDB's in that
  region, or `RTFM_DYNAMODB_ENDPOINT`, and Bedrock's is Bedrock's, or `RTFM_BEDROCK_ENDPOINT`:
  only the tests set them, to DynamoDB Local and a stand-in for Bedrock.
- **A throwaway data folder** for the rest: the ledger, the kill switch and the lock,
  `rtfm-data-<random>` in the system's temporary folder (`/tmp` on Lambda), made when each
  environment starts. `RTFM_DATA_DIR` is ignored, and nothing written there outlives the
  environment.
- **Logs to standard output only**, which Lambda sends to CloudWatch (`/rtfm/app`), and no log
  file.
- **It serves the built app** from `dist/` beside the API (`server/api/README.md` › The built
  app), or from the folder `RTFM_APP_DIR` names, as its test does.
- **It answers only the app's origin**, `https://rtfm.moonfetus.com`, and an endpoint's domain as
  the `Host` (`server/api/README.md` › Only the app's own pages).
- **The passcode's digest from the table**, never from `RTFM_PASSCODE`, which it ignores: the
  passcode's item in `rtfm-app`, read again at most once a minute, and every API request refused
  while there is none (`server/api/README.md` › The passcode). The revision's environment, which
  `rtfm-read` can read, holds no passcode. Through the edge, an agent sends the cookie
  `npm run ops -- passcode cookie` prints:

  ```sh
  curl -b "$(npm run -s ops -- passcode cookie)" https://rtfm.moonfetus.com/api/manuals
  ```
- **Library links from the table**: it finds each link in `rtfm-app`'s `LINK` partition, which it
  only reads, and writes each library's activity in `ACTIVITY` (`server/api/README.md` › The
  gate). A link opens its library whether or not a passcode is stored.
- On SIGTERM, which Lambda sends when it removes an environment, with 1 second to exit, it closes
  the server as `main.ts` does, cutting any request still open, during the exit above too.

`scripts/build-web-function.ts` builds its package (`infra/README.md` › The Web Function's
package). To run it on this machine as Lambda would, on any free port, with the fake models:

```sh
AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:0 RTFM_APP_TABLE=<table> RTFM_USAGE_TABLE=<table> \
  RTFM_DYNAMODB_ENDPOINT=<DynamoDB Local> AWS_REGION=us-west-2 AWS_ACCESS_KEY_ID=<dummy> \
  AWS_SECRET_ACCESS_KEY=<dummy> AWS_SESSION_TOKEN=<dummy> node server/web-function.ts
```

It needs DynamoDB Local running with a table shaped as `rtfm-app`, as its test sets up
(`server/storage/README.md` › DynamoDB Local, for the tests), and refuses every API request until
the table holds a passcode's digest (`writePasscodeDigest`). It answers only a request whose
`Host` is an endpoint's domain, so `curl` must send one:
`curl -H 'Host: x.lambda-web.us-west-2.on.aws' http://127.0.0.1:<port>/`. `npm run build` first
puts the app in `dist/`.

With `RTFM_MODELS=bedrock` it also needs `RTFM_BEDROCK_ENDPOINT`, a stand-in for Bedrock, and a
table shaped as `rtfm-usage` in DynamoDB Local, as its test sets up: the dummy keys can't reach
Bedrock itself.

## Choosing the models

`config.models`, which defaults to `"fake"` (used by tests and screenshots), chooses both the
section writer and the librarian's model, which also plans new manuals (`createModels` in `app.ts`);
`RTFM_MODELS=bedrock` selects Claude for both.

- Either way, `startServer` builds one gateway on a spending ledger, then the admin's library
  (`server/api/README.md` › The library of a request): the manual store `config.manualStorage`
  names (files in the data folder, unless the Web Function names its table), bound to that library,
  the gateway bound to it (`forLibrary`, `server/gateway/README.md`), and a writer on that binding,
  all before it seeds or listens. Each other library gets its own store, binding and writer the
  first time a request is in it. The librarian and its planner call the library's binding too, so
  one set of caps, the kill switch and the ledger cover every job in every library, and every call
  is reserved in its library's name, a recipient library's within its own daily cap.
- **`RTFM_MODELS` also chooses the spending ledger** (`server/gateway/README.md` › The spending
  ledger): with `"fake"`, the data folder's ledger, totals and `STOP` file; with `"bedrock"`,
  always the table `rtfm-usage` (`config.usageTable`), on this machine too. There is no way to
  run Bedrock on the data folder's ledger. With Bedrock the data folder's lock no longer guards
  money, since the caps are kept in the table; it still keeps one server per data folder.
- **`config.modelAccess` says how the Bedrock models reach AWS**, Bedrock and `rtfm-usage` alike:
  `{ kind: "env-local" }`, `rtfm-local`'s keys from `.env.local`, read when the models are built;
  or, on the Web Function, `{ kind: "execution-role" }`, with the role's credentials and region,
  Bedrock's endpoint (a stand-in's in its test) and the `onKeysRefused` that hears which service
  refused the keys (The Web Function, above).
- With `"fake"`, every job's model is `FAKE_MODEL` (`server/gateway/README.md` › The fake model),
  with the job's own `maxTokens` and idle timeout, and the gateway calls the fake model
  (`agent/fake-model.ts`); each library's fake writer (`writer/fake.ts`) sends the section's
  sample text through the library's binding. With `"bedrock"`, the jobs keep their Bedrock
  models, the gateway calls the Bedrock client, and each library's writer is a Bedrock writer that
  reads its example sections through that library's store (`createModels`'
  `forLibrary(libraryId, store)`, which gives the library's binding and writer).
- `createGateway` checks every job's model against the price table (`ModelNotPriced`), and only
  then calls the factories it is given, which, with Bedrock, read the credentials
  (`CredentialsMissing`, on this machine) and build the Bedrock client and the client for
  `rtfm-usage`. Either problem stops the server from starting, and an unpriced model is reported
  without reading any secret. The table isn't reached until the first call, so a server whose key
  can't reach it starts, and each call then fails.
- `createModels` also returns `idle`, the gateway's `idle()`.
- Tests replace either model with `startServer(config, { writer, librarian })`, each then
  serving every library. A test that passes its own gateway passes its `idle` too, and `close()`
  waits for it and for the configured gateway, if one was built. A test opens a recipient's
  library as a page does, by its link (`createTestLink` in `testing.ts`, then `POST /api/link`).

## Configuration

| Setting | Where | Secret |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (the IAM user `rtfm-local`'s, `infra/README.md`), `AWS_REGION` | `.env.local`, read only by `gateway/credentials.ts` | yes |
| Models, data dir, caps, concurrency, jobs, section length, the librarian's turn limit, the allowed `Host`s and `Origin`s, the event streams' heartbeat, Bedrock's spending table (`usageTable`: `rtfm-usage`, in the region `.env.local` names), how the Bedrock models reach AWS (`modelAccess`), a recipient library's starters (`starterManualIds`) | `server/config.ts` | no |
| API port | `server/ports.ts` | no |
| Another data folder or port for one run: `RTFM_DATA_DIR`, `RTFM_PORT` | the environment, read by `server/config.ts` | no |
| The passcode on this machine: `RTFM_PASSCODE` | the environment, read by `server/config.ts`, which keeps only its digest | yes |
| The passcode on the Web Function: its digest | the passcode's item in `rtfm-app`, set with `npm run ops -- passcode set` | yes: it opens the app |
| The Web Function's address and built app: `AWS_LAMBDA_HTTP_ENDPOINT`, `RTFM_APP_DIR` | the environment, read by `server/config.ts` for `server/web-function.ts` (The Web Function, above) | no |
| The Web Function's models and AWS: `RTFM_MODELS`, `RTFM_APP_TABLE`, `RTFM_USAGE_TABLE`, `AWS_REGION`, where the execution role's credentials come from (`AWS_CONTAINER_CREDENTIALS_FULL_URI` and `AWS_CONTAINER_AUTHORIZATION_TOKEN`, or `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`), and, in tests, `RTFM_DYNAMODB_ENDPOINT` and `RTFM_BEDROCK_ENDPOINT` | the environment Lambda and `RtfmApp` set, read by `server/config.ts`, and the credentials by the DynamoDB clients and the Bedrock client, for `server/web-function.ts` alone (The Web Function, above) | the credentials |
| The Web Function's own `Host`s and `Origin` | `server/web-function.ts` | no |
| Prices | `server/gateway/prices.ts` | no |

- **Types.** `config` is a `ServerConfig`, which extends `GatewayConfig` (`caps`,
  `maxConcurrentCalls`, `idleTimeoutMs`, `jobs`, in `gateway/types.ts`) and the Node adapter's
  `AdapterConfig` (`allowedHosts`, `allowedOrigins`, `appDir`, `eventStreamHeartbeatMs`, in
  `api/node-adapter.ts`) with the address it listens on (`host`, `127.0.0.1`), the port, data
  dir, manual storage, models, `passcode`, `maxConcurrentRuns`, `sectionWordsRequested`,
  `sectionExpectedCharacters` and `starterManualIds`. `startServer`, the gateway and the Node
  adapter take it as it is, so tests, the shot script and `web-function.ts` spread `config` and
  override what they need.
- **`allowedHosts` and `allowedOrigins`** are this machine's own names and pages
  (`LOOPBACK_HOSTS`, `LOOPBACK_ORIGINS`); `appDir` is unset, since Vite serves the app; and
  `eventStreamHeartbeatMs` is 15s (`server/api/README.md` › Handlers).
- **`RTFM_DATA_DIR` and `RTFM_PORT`** run the server on another data folder (resolved against
  the working directory) or port, with nothing edited; `main.test.ts` runs `main.ts` on a temp
  folder and port 0 this way. An empty `RTFM_DATA_DIR` means `<repo>/.data`, whatever the
  working directory; a `RTFM_PORT` that isn't a whole number from 0 to 65535 stops the server from
  starting, and 0 takes any free port. Vite's proxy always points at `API_PORT`, so `RTFM_PORT`
  is for `npm run server` alone.
- **`config.passcode`** is where the passcode's digest comes from (`PasscodeSource`): on this
  machine `RTFM_PASSCODE`, hashed as `config.ts` loads (`fixedPasscode`), so the server keeps only
  the digest, and every API request must carry it in a cookie; unset or empty, `undefined`, and
  there is no gate. The Web Function sets `{ kind: "stored" }`, the digest in `rtfm-app`
  (`server/api/README.md` › The passcode). Neither the passcode nor the digest is ever logged, and
  `server.started` says only whether there is a gate (`passcodeGate`). Change `RTFM_PASSCODE` and
  restart the server to rotate it.
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
- **`LIBRARIAN_MAX_TURNS: 8`**, the librarian's turn limit (`server/agent/README.md` › The turn
  limit).
- **`plan-manual: maxTokens 4096`.** The measured plan used about 95 output tokens a section plus
  the voice; the prompt aims for 12–24 sections, and the hard limit of 32 comes to about 3,300
  tokens for the whole plan. 4096 leaves 65% headroom over the measured plan and room for the
  largest allowed one. Its output costs at most about $0.02, and the input bound adds a 9 KB
  system prompt with the example, the 2 KB tool and the tool-use system prompt. A retry reserves
  the same again.
- **`plan-manual: idleTimeoutMs 60_000`**, a job's own idle timeout in place of the shared 30s,
  because its largest tool parameter can take that long to arrive (`server/gateway/README.md` › The
  Bedrock client). A stalled plan is charged its full `max_tokens` either way, so the longer wait
  costs nothing more; the SDK's own `timeout`, for the response headers, stays at the shared 30s.
- **`sectionWordsRequested: 650`** is the length the prompt asks for, about the sample's own
  sections (460–660 words). **`sectionExpectedCharacters: 4800`** is the length the Bedrock
  writer's progress counts to, set from what Haiku actually writes (the measurements below).

**Prices** (`gateway/prices.ts`) are USD per million tokens, dated by `checkedOn`, for the
`global.` and `us.` Haiku 4.5 profiles: input, output, cache write, cache read, and
`toolUseSystemPromptTokens`. The fake model is in the table too, with every price at 0.

- **`toolUseSystemPromptTokens`** is the size of the system prompt the API adds whenever a request
  has tools. It is per model, so it sits with the model's prices. Haiku 4.5's is 496 tokens with
  `tool_choice` `auto` or `none` and 588 with `any` or `tool` (Anthropic's tool-use pricing table,
  checked 2026-10-11). The table holds the larger, so the bound holds whatever `tool_choice` is
  sent.
- **Sources:**
  - **AWS's bill** (Checked against AWS's bill, below) confirms the input and output prices of
    both profiles.
  - Anthropic's Haiku 4.5 list price, $1 / $5 (the `claude-api` skill, cached 2026-10-06).
  - Anthropic's Bedrock guide, checked 2026-10-11: regional endpoints cost 10% more for Sonnet 4.5
    and later models.
  - Cache prices use the standard 1.25× and 0.1× multipliers. No call caches, so the bill doesn't
    show them.
  - **Not from AWS's pricing page**, whose Claude tables don't render.

**Measured** with Haiku 4.5 (`global.`): the sections and librarian turns on 2026-10-11, the plan
on 2026-10-12. Costs are computed from the reported tokens and the price table, as the ledger
records them, not read from AWS's bill.

| Call | Input tokens | Output tokens | Time | Cost | Reserved |
| --- | --- | --- | --- | --- | --- |
| A section (asked for 650 words; wrote 760–800 words, 4,200–5,000 characters) | 2,900–3,200 | 970–1,410 | 12–15s, about 400 `append` events | $0.007–0.010 | about $0.025 |
| A section aborted mid-stream | as above | charged the bytes received, at most 2,048 (at least 1,788 bytes after 6s) | — | $0.003–0.013 | about $0.025 |
| A librarian turn | 2,000–2,700 | up to a few hundred | — | $0.002–0.004 | $0.013–0.016 (about $0.014 for a first turn) |
| A plan of 23 sections | 3,957 | 2,481 | 21.3s, the longest silence 11.2s (the chapters, about 116 tokens a second) | $0.0164 | about $0.036 |

## Checked against AWS's bill

On 2026-10-14 and 2026-10-15 (UTC), as `rtfm-read`, Cost Explorer's daily cost and usage by usage
type for the service "Claude Haiku 4.5 (Amazon Bedrock Edition)" (`npm run aws -- ce
get-cost-and-usage`), set against the calls in `rtfm-usage` by the day they were reserved (UTC),
read with `npm run aws -- dynamodb query`. Every call reserved on the three days below is one the
data folder's ledger recorded and `npm run usage -- --import --apply` copied: `rtfm-usage` has no
other.
The ledger's columns are what it charged when each call settled.

| Day | Input, AWS / ledger | Output, AWS / ledger as reported / ledger as charged | Cost, AWS / ledger |
| --- | --- | --- | --- |
| 2026-10-11, 29 calls, 2 aborted | 74,473 / 74,459 | 19,751 / 19,745 / 23,841 | $0.1733 / $0.1937 |
| 2026-10-12, 46 calls | 116,843 / 116,829 | 10,095 / 10,091 / 10,091 | $0.1673 / $0.1673 |
| 2026-10-13, 75 calls, 2 aborted | 249,582 / 220,210 | 47,175 / 46,494 / 52,638 | $0.4855 / $0.4834 |

- **When a day is complete.** Cost Explorer marks every day of a month `Estimated` until the
  month's bill closes, 2026-10-11 and 2026-10-12 included, so the flag can't say. Usage arrives
  hours late instead: on 2026-10-15, 2026-10-14's matched the ledger to the token for every call
  reserved before 23:26 UTC (195,836 input and 61,184 output tokens) and had none of the ten after
  it, so 2026-10-13's had all arrived.
- **Prices.** Each usage type's cost over its quantity is $1.00 input and $5.00 output per million
  for `USW2-MP:USW2_InputTokenCount_Global-Units` and `…OutputTokenCount_Global-Units` (the
  `global.` profile), and $1.10 and $5.50 for `USW2-MP:USW2_InputTokenCount-Units` and
  `…OutputTokenCount-Units` (the `us.` profile), as `gateway/prices.ts` holds.
- **Complete calls match to the token.** What AWS billed beyond the ledger on 2026-10-11 and
  2026-10-12 is one call a day of 14 input and 4–6 output tokens on the `global.` profile, and on
  2026-10-11 one more on the `us.` profile, which RTFM never uses: calls made outside the server,
  worth $0.0001 in all.
- **Calls outside the server on 2026-10-13.** AWS billed 29,372 input tokens (249,582 − 220,210)
  and 681 output tokens (47,175 − 46,494) beyond what the ledger's calls reported, all on the
  `global.` profile. No ledger holds those calls: the local server's last call that day was
  reserved at 19:52 UTC, the Web Function was deployed on 2026-10-14, and the other ledgers
  on this machine are throwaway servers' with only the fake model.
- **An aborted call is billed its full input and, by the evidence, about no output.**
  - On 2026-10-11 two sections were cut after about 4.7s each (`.data/ledger`), roughly 1,300
    characters each at a section's pace (Measured, above). They were billed their full input
    (5,954 tokens) and at most 6 output tokens between them. What they had received wasn't
    logged.
  - On 2026-10-13 a section aborted after 5.9s had sent 1,788 characters (400–500 tokens at a
    section's 3.5–4.4 characters a token), and a plan was aborted after 6.2s. The two of them and
    the calls outside the server were billed 681 output tokens together. That fits the aborted
    calls billed nothing, the outside calls' 29,372 input tokens bringing all 681, and it fits
    them billed what they sent, the outside calls writing at most about 280.
  - So 2026-10-11 favours no output, but what those calls received wasn't logged, and 2026-10-13's
    681 tokens leave room for billing what was sent. The gateway charges an aborted call the bytes
    it received (`server/gateway/README.md` › Each call), the larger reading: 1,788 or more for
    that section alone, above all 681. If aborted calls are billed nothing, the ledger overstates each by its whole
    byte count, about 1,800 tokens or $0.009 for that section.
  - The ledger charged each of these four aborted calls its full `max_tokens` of output, 2,048
    tokens for a section and 4,096 for the plan.

## Tests

Tests sit next to the code (`*.test.ts`) and never call Bedrock. They reach only loopback:
`loopback-only.ts`, at the repo root, blocks any connection to anything but `127.0.0.1`, `::1` or
`localhost`, through `fetch` (Node's or happy-dom's), `node:http`, `node:https`, `node:net` or
`node:tls`, and any DNS call but a `lookup` or `lookupService` of those or a `lookup` of an
address, which answers itself (as when Vite listens on `0.0.0.0`). The `resolve*` and `reverse`
functions ask a nameserver, so they are blocked for every name. A connection's own `lookup` (the
`lookup` option of `node:net` and `node:tls`, or undici's `connect.lookup`) skips those DNS calls,
so its answer must be `127.0.0.1` or `::1`: one that turns `localhost` into another address is
blocked before Node connects to it. A blocked connection fails with the code `ECONNREFUSED` and a
blocked DNS call with `ENOTFOUND`.

- **Every Node process the tests start loads it first**, unless the test replaces its environment.
  `vite.config.ts` adds `--import=<its file URL>` to `NODE_OPTIONS` for the test workers (not
  Vitest's own main process), and every process they start inherits it: `main.test.ts`'s server,
  `scripts/serve-temp.test.ts`'s server and its Vite, and the scripts the `scripts/` tests run. A
  process that loads it twice (a worker preloads it, then `vitest.setup.ts` imports it) installs it
  once.
- **In a test**, `vitest.setup.ts`, which Vitest runs before every test file, fails the test that
  was blocked, even when the code under test catches the error.
- **In a child process**, each blocked target is written to stderr at once (`Blocked a connection
  to 192.0.2.1: …`), and when the process exits normally or through a signal it handles, it exits
  with code 1 where it would have exited with 0 (`SIGKILL` or an unhandled signal skips this). So
  a test that checks only the child's exit code or its stderr still fails.

A `worker_threads` worker loads it too, and the thread itself exits with code 1, but what it blocks
fails neither the test nor the process's exit code. UDP (`node:dgram`) isn't covered.

**Chromium**, which `scripts/wide-formula.test.ts` starts through Playwright, isn't a Node process
either: it is launched with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE
127.0.0.1`, so every host but those two, an address such as `192.0.2.1` among them, fails to
resolve, and the page reaches only loopback.

**DynamoDB Local** is the one other process the tests reach: Vitest's global setup starts it on
`127.0.0.1` for the run, and the DynamoDB store's tests, the Web Function's and its package's use
it, each on a table of its own (`server/storage/README.md` › DynamoDB Local, for the tests). It is
a `java` process, which the guard doesn't load into, so it is started listening on loopback only
and with its telemetry off. Without it, those tests fail saying how to fetch it.

Any test that starts a server binds port 0 and sets its own `passcode` (`undefined` unless it
tests the gate), so a `RTFM_PASSCODE` in the environment changes nothing. Tests that race a timer
against real time leave wide margins (a pause meant to stay inside a timeout is at most a quarter
of it, one meant to outlast it at least twice as long), so they hold when several test runs share
the machine.

## Files

- `main.ts`: starts the server from `config.ts` (`npm run server`).
- `web-function.ts`: starts the server on a Lambda Web Function (The Web Function, above).
- `replacement.ts`: `environmentReplacement`, the Web Function's exit before its keys run out
  (The Web Function, above).
- `exit.ts`: `exitOnceWritten`, which `app.ts`'s `runServerProcess` and `scripts/serve-temp.ts`
  exit through.
- `dev.ts`: `npm run dev`: Vite plus `node --watch server/main.ts`.
- `config.ts`: committed settings (Configuration, above), and the Web Function's
  (`httpEndpointFromEnv`, `builtAppDirFromEnv`, `webFunctionAwsFromEnv`), and `tableWith`, a
  table by name reached with given credentials.
- `ports.ts`: `API_PORT`, alone, so Vite's config can import it.
- `app.ts`: `startServer(config, replaced?)`: locks the data folder; the passcode's digest, the
  links and activity, models, gateway, each library's `Library` (its storage, writer, runs and
  activity), the gate, routes; `close(graceMs?)` waits for model calls and activity writes to
  settle.
  `runServerProcess(config, logger)`: the server as the whole process, for `main.ts` and
  `web-function.ts`, giving back the started server.
- `testing.ts`: helpers shared by the tests: temp folders, the fake model's `FAST_PACE` and a
  fast fake writer that calls it directly, the price table with the test model (`TEST_PRICES`)
  and its gateway config (`testGatewayConfig`, with any caps given in place of the committed
  ones), the real gateway over any `ModelClient`, bound to the admin's library (`testGateway`,
  with a config and a ledger of the test's own if it gives them), a `Library` on a given store for
  a test that hands a route its request (`testLibrary`), a link to a recipient's library
  (`createTestLink`) and the cookies a response sets (`cookiesSet`), `inPieces`, `collect`, and
  `readEvents` for server-sent events.
- `usage.ts`: `npm run usage`, and its `--import` of the data folder's Bedrock calls into
  `rtfm-usage`.
- `logs.ts`: `npm run logs` (`server/logging/README.md`).
- `escape-tags.ts`: escapes `<` in text inserted in a prompt (the section writer's and the
  planner's).
