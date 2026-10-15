# RTFM — architecture

A local Node server stores the manuals and their sections. It writes unwritten sections, with a fake
writer or with Claude Haiku 4.5 on Amazon Bedrock, and streams them to the reader. The librarian on
the landing page is an agent: an agent loop runs a model with the library's tools over several
turns, with a scripted fake model or with Claude Haiku 4.5. Asked for a new manual, it hands the
request to a planner, which has the model plan the manual and saves it. Every model call, Bedrock's
or the fake model's, including each turn of the loop and each plan, goes through one gateway that
caps spending. The one exception is a librarian preview, which plays the fake model directly so
that it costs and records nothing (`server/agent/README.md` › Previews).

This doc is a map: what each folder holds, which folders may import which, and the rules that cut
across them. The detail sits next to the code, in each folder's README: `server/README.md`, each
`server/*/README.md`, each `src/*/README.md` and `infra/README.md`. `README.md` covers running the
app, its routes, the data folder, Bedrock's spending table and both kill switches, resetting the
manuals, and what the models cost. `DESIGN.md` covers the design both pages share, and each page's
own design is in its `src/<page>/DESIGN.md`: `src/home/DESIGN.md` and `src/reader/DESIGN.md`.

```
browser (Vite, :5173)                           server (node:http, :8787)
  src/library store ───┐
  src/manual store ────┤
  src/librarian store ─┴ /api (Vite proxy) ──▶  api/ routes ──▶ writer/runs ──▶ fake or Bedrock writer ┐
                                                     │                                                 │
                                                     ├──▶ librarian ──▶ agent loop ────────────────────┼──▶ gateway ──▶ Bedrock,
                                                     │       └──▶ planner ─────────────────────────────┘     │        or the fake model
                                                     │                                                       └──▶ spending ledger (Bedrock: the table
                                                     │                                                            rtfm-usage; fake: files in .data/)
                                                     └──▶ storage/ (manuals and sections: files in .data/, or the table
                                                                    rtfm-app on the Web Function)
```

## Codemap

### The browser: `src/`

- `main.tsx` starts `reportErrors.ts` and renders `App.tsx`, the routes (`README.md` › Where
  things live). `testing.tsx` holds the component tests' `render`, `press` and `click`.
- `home/`: the landing page at `/` (`index.tsx`): the library's ledger (`Ledger.tsx`) beside the
  librarian's panel (`LibrarianPanel.tsx`, `Conversation.tsx`, `Composer.tsx`), and the delete
  confirmation (`DeleteConfirmation.tsx`, `useDeleteFlow.ts`).
- `reader/`: the reader at `/read/<manual>` (`index.tsx`): the contents (`Toc.tsx`), the start
  page (`StartPage.tsx`) and a section (`SectionPage.tsx`, `Prose.tsx`, `Pager.tsx`). `Prose`,
  with the renderer and KaTeX, is a chunk of its own (`proseChunk.ts`), which starts loading as
  soon as the reader renders, so the start page never waits for it.
- `manual/`: the reader's store (`useManual`, `useSection`, `retrySection`), which reads a manual
  and streams its sections; the `Manual` types; and `<Markdown>`, which typesets formulas with
  KaTeX. See `src/manual/README.md`.
- `library/`: the landing page's store of `ManualSummary`s (`useLibrary`, `deleteManual`,
  `refreshLibrary`), which loads the library from the API and deletes through it. See
  `src/library/README.md`.
- `librarian/`: the librarian's conversation (`useLibrarian`, `useLibrarianActions`), sent to
  `POST /api/librarian` and streamed back. See `src/librarian/README.md`, which also has its URL
  options.
- `passcode/`: the passcode screen (`PasscodeScreen`), which `App.tsx` shows in either page's
  place once an API request answers `401` (`usePasscodeReason`), saying so when a library's link
  is closed. See `src/passcode/README.md`.
- `link/`: the page routes `/l` (`LinkPage`), which opens a library by its link's secret, and
  `/admin` (`AdminPage`), which leaves it. See `src/link/README.md`.
- `ui/`: the shared design system: tokens, fonts, base styles, the write head, `StatusRing`,
  `Sheet`, `ReplyMarkdown`, `Icon`. See `src/ui/README.md`.
- `reportErrors.ts`: `startReportingErrors` and `apiFetch`, which report the page's errors and
  failed API requests to the server's log, with the page's path but never its query or fragment;
  `apiFetch` also shows the passcode screen on a `401`.

### The server: `server/`

- The top level: `main.ts` starts the server on this machine and `web-function.ts` on a Lambda Web
  Function, `app.ts` wires it (`startServer`, `createModels`, and a `Library` per library id, built
  once and kept) and runs it as a process
  (`runServerProcess`), `config.ts` holds the committed `ServerConfig`, `ports.ts` the
  `API_PORT`, `exit.ts` the `exitOnceWritten` that `app.ts` and `scripts/serve-temp.ts` share;
  `dev.ts`, `usage.ts` and `logs.ts` are the `npm run` commands; `escape-tags.ts` escapes text
  for the prompts, and `testing.ts` holds the tests' helpers. See `server/README.md`.
- `replacement.ts`: the Web Function's exit, with code 1, once a service refuses its keys or
  shortly before they expire, so Lambda replaces its environment (`server/README.md` › The Web
  Function).
- `api/`: the routes (`Route`, `ApiRequest`, `EventSink` in `route.ts`, and the `Library` each
  request is in, which holds the only store, runs, gateway and activity a route reaches), the Node
  adapter with the `Host` and `Origin` checks and the built app's files (`node-adapter.ts`, with
  `app-files.ts`), the gate, which gives each request its library from its cookies (`gate.ts`,
  with the passcode in `passcode.ts`, a library's link in `link.ts` and the cookies in
  `cookies.ts`), each library's activity (`activity.ts`), the previews (`preview.ts`) and the wire
  types (`types.ts`). See `server/api/README.md`.
- `storage/`: `ManualStore` and `UsageLedger` (`types.ts`) as files in the data folder
  (`file-manual-store.ts`, `file-ledger.ts`), and `ManualStore` in the DynamoDB table `rtfm-app`
  (`dynamodb-manual-store.ts`), both held to one suite (`manual-store-suite.ts`); the section
  leases (`SectionLeases`) that keep one writer per section across the Web Function's environments,
  in the process (`in-process-leases.ts`) or in `rtfm-app`; each store and its leases bound to one
  library, whose keys and folder `library.ts` gives; the recipient libraries' links and activity
  (`LinkStore`, with the secret's form, making and digest, in `library-links.ts`) as files
  (`file-link-store.ts`) and in `rtfm-app` (`dynamodb-link-store.ts`), both held to one suite
  (`link-store-suite.ts`); the data folder's lock (`lock.ts`) and seeding (`seed.ts`). See
  `server/storage/README.md`.
- `seed/<manualId>/`: `manual.json`, a TOC, a voice, and which sections start written; and
  `sections/*.md`, bodies (only the sample, the-haunt-that-listens, has them: all 18).
- `writer/`: the `SectionWriter`s (`fake.ts`, `bedrock.ts`), the Bedrock writer's prompt
  (`prompt.ts`) and output handling (`section-text.ts`, `validate.ts`), and one run per section
  (`runs.ts`). See `server/writer/README.md`.
- `gateway/`: `createGateway` (`gateway.ts`), the `Gateway` every model call goes through; the
  `SpendingLedger` (`spending-ledger.ts`) that keeps every call, the caps' totals and the kill
  switch, in the data folder for the fake models (`file-spending-ledger.ts`) and in the table
  `rtfm-usage` for Bedrock (`dynamodb-spending-ledger.ts`), both held to one suite
  (`spending-ledger-suite.ts`); the `ModelClient` for Bedrock (`bedrock-client.ts`), the price
  table (`prices.ts`, with the fake model, `FAKE_MODEL` in `types.ts`, at $0) and the credentials
  (`credentials.ts`). See `server/gateway/README.md`.
- `agent/`: the agent loop (`runAgent` in `loop.ts`, `defineTool` in `tool.ts`); the librarian
  (`librarian/`, `sendReply`) and its planner (`planner/`, `planManual`); and the fake model
  (`fake-model.ts`), the `ModelClient` that stands in for Claude in every job. See
  `server/agent/README.md`.
- `logging/`: the `Logger` (`createLogger` in `logger.ts`), the daily log files (`log-file.ts`) and
  `npm run logs`'s reader (`log-reader.ts`). See `server/logging/README.md`.

### `scripts/`

- `shot.ts`: `npm run shot`, with the Playwright capture helpers in `screenshots.ts` and the
  comparison in `compare.ts`.
- `vite-server.ts`: `startViteServer`, Vite on a free port in front of a given API server, and
  `localUrl`, for `shot.ts`, `serve-temp.ts` and `wide-formula.test.ts`.
- `wide-formula.test.ts`: the reader in Playwright's Chromium at phone width, which checks that an
  inline formula wider than the line scrolls in its own region and the page stays as wide as the
  screen (`src/manual/README.md` › `<Markdown>`). It lives here, beside the other Playwright
  code, since `src/`'s tests type-check without Node's types.
- `serve-temp.ts`: `npm run serve-temp`, a throwaway API server and Vite server on free ports and
  a temporary data folder, for checks (`README.md` › A throwaway server). It loads no Playwright.
- `audit/`: `npm run audit`, candidate rule breaks from this repo's Claude Code transcripts. See
  `scripts/audit/README.md`.
- `hooks/`: the Claude Code hooks `.claude/settings.json` runs, which tell a session when its
  rules are out of date (`README.md` › Rule-change notices).
- `commit-task.ts`: `npm run commit-task`, which commits a task's work with its body and its
  `Reviewed-by:` trailer. `.githooks/commit-msg` refuses, without one, a task commit or a commit
  of Claude's that changes more than `WORKLIST.md` (`README.md` › Committing task work). It holds
  the parsing of `WORKLIST.md` the other scripts share.
- `commit-worklist.ts`: `npm run commit-worklist`, which commits `WORKLIST.md` alone with a body
  generated from its diff, using `commit-task.ts`'s check of where it runs and its parsing.
- `orchestrator-check.ts`: `npm run orchestrator-check`, which checks the orchestrator runs in the
  main checkout on `main`, clean and with its hooks, and lists the `doing` tasks and task
  worktrees an earlier run left (`README.md` › The orchestrator's preflight). It shares
  `commit-task.ts`'s check of where it runs, and its parsing of `WORKLIST.md`.
- `task-prompt.ts`: `npm run task-prompt`, which prints the prompt that starts a task's agent or
  its reviewer, from the task's block in `WORKLIST.md`, using `commit-task.ts`'s parsing.
- `ops/`: `npm run ops` (`ops.ts`), the ops tools for the deployed app: the kill switch
  (`kill-switch.ts`), the passcode (`passcode.ts`, with its words in `passcode-words.ts`), the
  spend (`usage.ts`), the logs (`logs.ts`) and the status (`status.ts`),
  each acting as an RTFM role through `infra/run-aws.ts`'s session (`context.ts`), and the
  deployed names they read (`deployed.ts`). `testing.ts` holds the tests' stand-in for the AWS CLI
  (`README.md` › The ops tools).
- `build-web-function.ts`: the Web Function's package: the built app, the server bundled into one
  file with Rolldown, and the seed. `RtfmApp` runs it when it synthesizes (`infra/README.md` ›
  The Web Function's package).
- `third-party-notices.ts`: the Vite and Rolldown plugin that writes `THIRD-PARTY-NOTICES.txt`
  beside each bundle, the licenses and notices of the packages it bundles. `vite.config.ts` and
  `build-web-function.ts` use it (`README.md` › License).
- `licenses.ts`: the licenses a package that isn't dev-only may have, and `licenses.test.ts`, which
  checks `package-lock.json` against them in `npm test` (`README.md` › License).
- `dynamodb-local.ts`, `DynamoDbLocalOnLoopback.java`, `fetch-dynamodb-local.ts` and
  `test-global-setup.ts`: DynamoDB Local for the tests: the pinned release, `npm run
  fetch-dynamodb-local`, which fetches it once, and Vitest's global setup, which runs it on
  `127.0.0.1` for a test run (`server/storage/README.md` › DynamoDB Local, for the tests).

### `infra/`

RTFM's AWS setup, a CDK app (`app.ts`) in account `438180219169`, which also holds things that
aren't RTFM's. See `infra/README.md`.

- `toolkit-stack.ts`: `RtfmToolkit`, RTFM's own CDK bootstrap (qualifier `rtfm`), with the
  permissions boundary (`boundary.ts`) and execution policy every RTFM stack deploys under.
- `access-stack.ts`: `RtfmAccess`, RTFM's IAM users and roles and its budget alarm. The user
  deploys it and the bootstrap.
- `app-stack.ts`: `RtfmApp`, the app: the Web Function `rtfm-app`, its role, endpoint and log
  groups, the tables `rtfm-app` (the library) and `rtfm-usage` (Bedrock's spending), and the
  bucket. The orchestrator deploys it.
- `run-aws.ts`: `npm run aws` and `npm run cdk`, which run the AWS and CDK CLIs as RTFM's own
  roles from `~/.aws/rtfm/`, and the session `npm run ops` reaches AWS through.
- `edge-certificate-stack.ts` and `edge-stack.ts`: `RtfmEdgeCertificate` and `RtfmEdge`, which
  put the app at `https://rtfm.moonfetus.com`: its certificate, the CloudFront distribution in
  front of the Web Function, the domain's records, and the resource policy that lets only that
  distribution invoke the Web Function. The user deploys them.

## Boundaries

**The contract between browser and server is `server/api/types.ts`.** The browser imports its
wire types with `import type`: `src/manual/types.ts` re-exports the manual's types,
`src/library/types.ts` re-exports `ManualSummary`, `src/librarian/types.ts` the librarian's, and
`src/reportErrors.ts` imports `ClientError` and `ClientErrorReport`. The one value the browser
imports is `LIBRARIAN_LIMITS`, which the file defines with no imports, so nothing else from
`server/` reaches the bundle, and the server imports nothing from `src/`.

**In the browser**, a page imports the shared folders through their `index.ts`, and never the
other page:

| Folder | Imports from `src/` |
| --- | --- |
| `App.tsx` | `home/`, `reader/` (lazily), `link/`, `passcode/` |
| `link/` | `passcode/`, `reportErrors.ts`, `ui/` |
| `home/` | `library/`, `librarian/`, `ui/` |
| `reader/` | `manual/`, `ui/`, and `manual/Markdown.tsx` straight from the file, in its lazily loaded `Prose` chunk, since it brings KaTeX |
| `manual/`, `library/` | `reportErrors.ts` |
| `librarian/` | `reportErrors.ts`, and `manual/repair.ts` straight from the file |
| `passcode/` | `ui/` |
| `reportErrors.ts` | `passcode/required.ts` straight from the file |
| `ui/` | nothing |

**In the server**, `app.ts` wires the folders together; below it, each folder imports only these:

| Folder | Imports from `server/` |
| --- | --- |
| `api/` | `storage/`, `writer/` (`runs.ts`, `fake.ts`), `agent/librarian/`, `agent/fake-model.ts`, the gateway's types, the logger |
| `agent/librarian/` | `agent/`, `agent/planner/`, `storage/`, the gateway's types, `api/` (`types.ts`, `librarySummaries`), `config.ts` (`LIBRARIAN_MAX_TURNS`), the logger's types |
| `agent/planner/` | `agent/tool.ts`, `storage/`, the gateway's types, `escape-tags.ts` |
| `agent/` | the gateway's types, the logger's types; `fake-model.ts` also `agent/planner/fake-planner.ts` and `writer/fake.ts` (`chunkEnds`) |
| `writer/` | `storage/`, the gateway's types, `api/types.ts`, `escape-tags.ts`, the logger's types |
| `gateway/` | `storage/` (the ledger and its entries' types, `files.ts`, the library ids in `library.ts`, and the DynamoDB client builder, the AWS credentials' types and the execution role's credential provider in `dynamodb-manual-store.ts`), the logger's types |
| `storage/` | `api/types.ts`, the logger's types |
| `logging/` | `storage/files.ts` |

These are the imports of non-test code. Tests may also import what they set up
(`src/testing.tsx`, `server/testing.ts`, `app.ts`, `config.ts`, the file store and ledger, the log
file) and reach into a folder's files directly.

Route handlers import only `api/route.ts`, never `node:http` or the Node adapter
(`server/api/README.md` › Handlers).

## Cross-cutting rules

- **The gateway is the only way to reach Bedrock.** Nothing but the SDK adapters that
  `gateway/sdk-boundary.test.ts` lists (`gateway/bedrock-client.ts`, and
  `gateway/dynamodb-spending-ledger.ts`, `storage/dynamodb-manual-store.ts` and
  `storage/dynamodb-link-store.ts` for DynamoDB)
  imports an Anthropic or AWS SDK, and nothing outside `server/gateway/` and `server/app.ts`
  imports that client; the test enforces both. So every model call is reserved against the caps,
  checked against the kill switch and written to the spending ledger (`server/gateway/README.md`).
  The fake model is called through the same gateway, at $0, so all of this runs without Bedrock
  too, except in a librarian preview, which plays the fake model directly so that it costs and
  records nothing.
- **`RTFM_MODELS` chooses the spending ledger.** With the fake models it is the data folder's;
  with Bedrock it is always the table `rtfm-usage`, from a laptop as deployed, where each call is
  reserved in one conditional transaction, so every server running Bedrock shares one set of caps
  and one kill switch (`server/gateway/README.md` › The spending ledger).
- **One server per data folder.** The fake models' caps are totalled in one process's memory, so
  the server locks its data folder before it starts (`server/storage/README.md` › The data
  folder's lock). With Bedrock the lock no longer guards money, whose caps are in `rtfm-usage`.
- **Configuration** is committed, apart from the AWS keys in `.env.local`, which only
  `gateway/credentials.ts` reads, from the main checkout's root even in a linked worktree
  (`server/README.md` › Configuration); they reach Bedrock and the table `rtfm-usage`. The one
  exception is the Web Function, whose entry asks for its execution role's temporary
  credentials, from Lambda's container credentials endpoint or the variables Lambda sets, for the
  tables `rtfm-app` and `rtfm-usage` and for Bedrock (`server/README.md` › The Web Function). No
  AWS client falls back to the environment, a profile or `~/.aws`.
- **Only the app's own pages.** On this machine the server listens on `127.0.0.1` and answers only
  this machine's `Host`s and `Origin`s; on the Web Function, only an endpoint's `Host` and the
  origin `https://rtfm.moonfetus.com`. The Node adapter refuses any other `Host` or `Origin`, and
  any body that isn't JSON, before a route runs (`server/api/README.md` › Only the app's own
  pages).
- **The gate.** Every API request's library comes from its cookies alone, never its path, query
  or body (`server/api/README.md` › The gate): an open link's library from its `rtfm_library`
  cookie, else, with a passcode set (`RTFM_PASSCODE` on this machine, the digest in `rtfm-app` on
  the Web Function), the admin's library from an `rtfm_passcode` cookie holding the passcode's
  SHA-256 digest, else `401`, so a public URL can't spend the model caps for anyone who finds it;
  the browser shows the passcode screen on any `401` (`src/passcode/README.md`). Without a
  passcode, on loopback, a request with no link's cookie is the admin's. The server keeps only the
  passcode's digest and each link's secret's digest, and the Web Function refuses every request
  without a link's cookie while no passcode is stored.
- **One logger**, passed to whatever logs, never logs a manual's text, a prompt, a conversation,
  the passcode or its digest, or a library link's secret or its digest
  (`server/logging/README.md`).
- **Tests never call Bedrock** (`server/README.md` › Tests).
- **AWS only as RTFM.** Commands reach AWS only through `npm run aws`, `npm run cdk` and
  `npm run ops`, as the roles `rtfm-read`, `rtfm-deploy` and `rtfm-ops`, which reach only
  resources named for RTFM, never by running `aws` or `cdk` directly; every role an RTFM stack
  creates carries the permissions boundary (`infra/README.md`). `npm run ops -- kill-switch on|off`
  changes the live app, so agents run it only when the user asks (`CLAUDE.md` › Shell). The CDK
  packages are imported only in `infra/` (`infra/cdk-imports.test.ts`), so they reach neither the
  browser bundle nor the server.
- **Everything runs on one machine.** An agent can run, test and check the whole app on one
  machine:
  - Every AWS service the app uses, whether Bedrock, DynamoDB, an IAM role, SSM, a Lambda handler
    or static hosting, sits behind an interface with a local implementation. The local one is the
    default, and config chooses the AWS one through an environment variable, as `RTFM_MODELS`
    chooses Bedrock over the fake models.
  - `npm test`, `npm run serve-temp` and `npm run shot` need no network beyond this machine and no
    AWS credentials. `vitest.setup.ts` fails any test that connects to anything but loopback
    (`server/README.md` › Tests).
  - Each such interface has one shared test suite that runs against every implementation, so the
    local one stays as strict as the AWS one: `ManualStore`'s runs against the files and against
    DynamoDB Local, which the tests start on loopback (`server/storage/README.md`); `LinkStore`'s
    the same way; `SpendingLedger`'s against the data folder and against DynamoDB Local
    (`server/gateway/README.md` › The spending ledger); and the runs' against leases in the
    process and in DynamoDB Local (`server/writer/README.md` › Tests).
  - An adapter that imports an AWS SDK is added to `gateway/sdk-boundary.test.ts`'s list of SDK
    adapters on purpose, or the test fails.
  - An AWS deployment runs this same server, on a Lambda Web Function behind CloudFront
    (`research/aws-design.md`), started by `server/web-function.ts`, which only configures it
    (`server/README.md` › The Web Function), so its AWS code is only adapters behind these
    interfaces. `server/web-function.test.ts` runs it on loopback, with a stand-in
    `AWS_LAMBDA_HTTP_ENDPOINT`.
  - A feature that works only in AWS needs the user's approval.
  - No task's **Done when** needs the deployed app. Local can't show IAM permissions, Lambda
    response streaming and its disconnects, or cold starts; a smoke check after each deploy covers
    those.
  - Agents try out stored-data changes on throwaway data. Deployed data changes only when a change
    merges, and that change carries its migration or reads the old form.
