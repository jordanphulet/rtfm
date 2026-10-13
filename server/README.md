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
  - On SIGINT and SIGTERM it closes the server and then exits. `close()` closes every connection,
    which aborts the sections being written and the librarian's replies; waits until the gateway is
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
- **The fake models only.** With `RTFM_MODELS=bedrock` it refuses to start: Bedrock's spend needs
  one ledger shared by every environment, which a data folder can't be. Its role has no Bedrock
  permission either.
- **The manuals in the table `rtfm-app`** (`server/storage/README.md` › The table `rtfm-app`),
  which every environment shares and each seeds when it starts, once across all of them. The
  table's name is `RTFM_APP_TABLE`, which `RtfmApp` sets in the revision's environment.
- **The table as the execution role.** AWS documents that a Web Function's code runs with its
  execution role, but not how the role's credentials reach the process: its environment-variable
  page reserves `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` and warns that
  a Web Function doesn't get every variable an Event Function does, and an environment has no
  set lifetime and is never frozen, so the credentials must be refreshed while it runs.
  `webFunctionTableFromEnv` (`config.ts`) chooses the source by the names Lambda sets, reading no
  key itself: Lambda's container credentials endpoint when `AWS_CONTAINER_CREDENTIALS_FULL_URI` is
  set (with `AWS_CONTAINER_AUTHORIZATION_TOKEN`), as Lambda's other long-lived environments use,
  or else the three key variables (`server/storage/README.md` › The table `rtfm-app`). The
  endpoint hands out new credentials whenever the store asks as the old ones near expiry. The key
  variables are read when the store asks too, but a running process's environment never changes,
  so they are never renewed: if Lambda gives only those and an environment outlives them, its
  DynamoDB calls fail. With neither, or without `RTFM_APP_TABLE` or `AWS_REGION`, the Web Function
  refuses to start and names what it needs. `server.started` logs which source it chose
  (`credentials`: `container-endpoint` or `environment`), never a value, so the deployed app's log
  shows which one Lambda really gives.
- **Only here.** This is the one place the server takes AWS credentials from the environment, and
  only `web-function.ts` asks for the execution role. On this machine `main.ts` keeps the manuals
  in files and the server reads AWS keys from `.env.local` alone (Configuration, below); no client
  falls back to the environment, a profile or `~/.aws`. The table's endpoint is DynamoDB's in that
  region, or `RTFM_DYNAMODB_ENDPOINT`, which only the tests set, to DynamoDB Local.
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
- **`RTFM_PASSCODE`** is set in the revision's environment, which `rtfm-read` can read, so it is a
  throwaway, `THROWAWAY_PASSCODE` in `infra/app-stack.ts`, never the user's own. Through the
  edge, an agent keeps the cookie with `curl -c` and sends it with `-b`:

  ```sh
  curl -c /tmp/rtfm-cookies -H 'content-type: application/json' \
    -d '{"passcode":"<THROWAWAY_PASSCODE>"}' https://rtfm.moonfetus.com/api/passcode
  curl -b /tmp/rtfm-cookies https://rtfm.moonfetus.com/api/manuals
  ```
- On SIGTERM, which Lambda sends when it removes an environment, with 1 second to exit, it closes
  the server as `main.ts` does.

`scripts/build-web-function.ts` builds its package (`infra/README.md` › The Web Function's
package). To run it on this machine as Lambda would, on any free port:

```sh
AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:0 RTFM_PASSCODE=try RTFM_APP_TABLE=<table> \
  RTFM_DYNAMODB_ENDPOINT=<DynamoDB Local> AWS_REGION=us-west-2 AWS_ACCESS_KEY_ID=<dummy> \
  AWS_SECRET_ACCESS_KEY=<dummy> AWS_SESSION_TOKEN=<dummy> node server/web-function.ts
```

It needs DynamoDB Local running with a table shaped as `rtfm-app`, as its test sets up
(`server/storage/README.md` › DynamoDB Local, for the tests). It answers only a request whose
`Host` is an endpoint's domain, so `curl` must send one:
`curl -H 'Host: x.lambda-web.us-west-2.on.aws' http://127.0.0.1:<port>/`. `npm run build` first
puts the app in `dist/`.

## Choosing the models

`config.models`, which defaults to `"fake"` (used by tests and screenshots), chooses both the
section writer and the librarian's model, which also plans new manuals (`createModels` in `app.ts`);
`RTFM_MODELS=bedrock` selects Claude for both.

- Either way, `startServer` builds the manual store `config.manualStorage` names (files in the
  data folder, unless the Web Function names its table), then one gateway on the file ledger, and
  the writer on it, all before it seeds or listens. The librarian and its planner use the same
  gateway, so one set of caps, the kill switch and the ledger cover every job.
- With `"fake"`, every job's model is `FAKE_MODEL` (`server/gateway/README.md` › The fake model),
  with the job's own `maxTokens` and idle timeout, and the gateway calls the fake model
  (`agent/fake-model.ts`); the fake writer (`writer/fake.ts`) sends the section's sample
  text through it. With `"bedrock"`, the jobs keep their Bedrock models, the gateway calls the
  Bedrock client, and the writer is the Bedrock writer.
- `createGateway` checks every job's model against the price table (`ModelNotPriced`), and only
  then calls the client factory it is given, which, with Bedrock, reads the credentials
  (`CredentialsMissing`) and builds the Bedrock client. Either problem stops the server from
  starting, and an unpriced model is reported without reading any secret.
- `createModels` also returns `idle`, the gateway's `idle()`.
- Tests replace either model with `startServer(config, { writer, librarian })`. A test that passes
  its own gateway passes its `idle` too, and `close()` waits for it and for the configured
  gateway, if one was built.

## Configuration

| Setting | Where | Secret |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (the IAM user `rtfm-local`'s, `infra/README.md`), `AWS_REGION` | `.env.local`, read only by `gateway/credentials.ts` | yes |
| Models, data dir, caps, concurrency, jobs, section length, the librarian's turn limit, the allowed `Host`s and `Origin`s, the event streams' heartbeat | `server/config.ts` | no |
| API port | `server/ports.ts` | no |
| Another data folder or port for one run: `RTFM_DATA_DIR`, `RTFM_PORT` | the environment, read by `server/config.ts` | no |
| The passcode: `RTFM_PASSCODE` | the environment, read by `server/config.ts` | yes |
| The Web Function's address and built app: `AWS_LAMBDA_HTTP_ENDPOINT`, `RTFM_APP_DIR` | the environment, read by `server/config.ts` for `server/web-function.ts` (The Web Function, above) | no |
| The Web Function's table: `RTFM_APP_TABLE`, `AWS_REGION`, where the execution role's credentials come from (`AWS_CONTAINER_CREDENTIALS_FULL_URI` and `AWS_CONTAINER_AUTHORIZATION_TOKEN`, or `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`), and, in tests, `RTFM_DYNAMODB_ENDPOINT` | the environment Lambda and `RtfmApp` set, read by `server/config.ts` and the DynamoDB store for `server/web-function.ts` alone (The Web Function, above) | the credentials |
| The Web Function's own `Host`s and `Origin` | `server/web-function.ts` | no |
| Prices | `server/gateway/prices.ts` | no |

- **Types.** `config` is a `ServerConfig`, which extends `GatewayConfig` (`caps`,
  `maxConcurrentCalls`, `idleTimeoutMs`, `jobs`, in `gateway/types.ts`) and the Node adapter's
  `AdapterConfig` (`allowedHosts`, `allowedOrigins`, `passcode`, `appDir`,
  `eventStreamHeartbeatMs`, in `api/node-adapter.ts`) with the address it listens on (`host`,
  `127.0.0.1`), the port, data dir, models, `maxConcurrentRuns`, `sectionWordsRequested` and
  `sectionExpectedCharacters`. `startServer`, the gateway and the Node adapter take it as it is, so
  tests, the shot script and `web-function.ts` spread `config` and override what they need.
- **`allowedHosts` and `allowedOrigins`** are this machine's own names and pages
  (`LOOPBACK_HOSTS`, `LOOPBACK_ORIGINS`); `appDir` is unset, since Vite serves the app; and
  `eventStreamHeartbeatMs` is 15s (`server/api/README.md` › Handlers).
- **`RTFM_DATA_DIR` and `RTFM_PORT`** run the server on another data folder (resolved against
  the working directory) or port, with nothing edited; `main.test.ts` runs `main.ts` on a temp
  folder and port 0 this way. An empty `RTFM_DATA_DIR` means `<repo>/.data`, whatever the
  working directory; a `RTFM_PORT` that isn't a whole number from 0 to 65535 stops the server from
  starting, and 0 takes any free port. Vite's proxy always points at `API_PORT`, so `RTFM_PORT`
  is for `npm run server` alone.
- **`RTFM_PASSCODE`** is `config.passcode`: set, every API request must carry it in a cookie;
  unset or empty, there is no gate (`server/api/README.md` › The passcode). It is a secret, so it
  is never logged, and `server.started` says only whether it is set (`passcodeGate`). Change it
  and restart the server to rotate it.
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
- `exit.ts`: `exitOnceWritten`, which `app.ts`'s `runServerProcess` and `scripts/serve-temp.ts`
  exit through.
- `dev.ts`: `npm run dev`: Vite plus `node --watch server/main.ts`.
- `config.ts`: committed settings (Configuration, above), and the Web Function's
  (`httpEndpointFromEnv`, `builtAppDirFromEnv`, `webFunctionTableFromEnv`).
- `ports.ts`: `API_PORT`, alone, so Vite's config can import it.
- `app.ts`: `startServer(config, replaced?)`: locks the data folder; storage, models, gateway,
  routes; `close()` waits for model calls to settle. `runServerProcess(config, logger)`: the
  server as the whole process, for `main.ts` and `web-function.ts`.
- `testing.ts`: helpers shared by the tests: temp folders, the fake model's `FAST_PACE` and a
  fast fake writer that calls it directly, the price table with the test model (`TEST_PRICES`)
  and its gateway config (`testGatewayConfig`), the real gateway over any `ModelClient`
  (`testGateway`, with a config and a ledger of the test's own if it gives them), `inPieces`,
  `collect`, and `readEvents` for server-sent events.
- `usage.ts`: `npm run usage`.
- `logs.ts`: `npm run logs` (`server/logging/README.md`).
- `escape-tags.ts`: escapes `<` in text inserted in a prompt (the section writer's and the
  planner's).
