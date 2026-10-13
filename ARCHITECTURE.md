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
`server/*/README.md` and each `src/*/README.md`. `README.md` covers running the app, its routes,
the data folder and its kill switch, resetting the manuals, and what the models cost. `DESIGN.md`
covers the design both pages share, and each page's own design is in its `src/<page>/DESIGN.md`:
`src/home/DESIGN.md` and `src/reader/DESIGN.md`.

```
browser (Vite, :5173)                           server (node:http, :8787)
  src/library store ───┐
  src/manual store ────┤
  src/librarian store ─┴ /api (Vite proxy) ──▶  api/ routes ──▶ writer/runs ──▶ fake or Bedrock writer ┐
                                                     │                                                 │
                                                     ├──▶ librarian ──▶ agent loop ────────────────────┼──▶ gateway ──▶ Bedrock,
                                                     │       └──▶ planner ─────────────────────────────┘              or the fake model
                                                     └──▶ storage/ (manuals, sections, ledger: files in .data/)
```

## Codemap

### The browser: `src/`

- `main.tsx` starts `reportErrors.ts` and renders `App.tsx`, the routes (`README.md` › Where
  things live). `testing.tsx` holds the component tests' `render`, `press` and `click`.
- `home/`: the landing page at `/` (`index.tsx`): the library's ledger (`Ledger.tsx`) beside the
  librarian's panel (`LibrarianPanel.tsx`, `Conversation.tsx`, `Composer.tsx`), and the delete
  confirmation (`DeleteConfirmation.tsx`, `useDeleteFlow.ts`).
- `reader/`: the reader at `/read/<manual>` (`index.tsx`): the contents (`Toc.tsx`), the start
  page (`StartPage.tsx`) and a section (`SectionPage.tsx`, `Prose.tsx`, `Pager.tsx`).
- `manual/`: the reader's store (`useManual`, `useSection`, `retrySection`), which reads a manual
  and streams its sections; the `Manual` types; and `<Markdown>`. See `src/manual/README.md`.
- `library/`: the landing page's store of `ManualSummary`s (`useLibrary`, `deleteManual`,
  `refreshLibrary`), which loads the library from the API and deletes through it. See
  `src/library/README.md`.
- `librarian/`: the librarian's conversation (`useLibrarian`, `useLibrarianActions`), sent to
  `POST /api/librarian` and streamed back. See `src/librarian/README.md`, which also has its URL
  options.
- `passcode/`: the passcode screen (`PasscodeScreen`), which `App.tsx` shows in either page's
  place once an API request answers `401` (`usePasscodeRequired`). See
  `src/passcode/README.md`.
- `ui/`: the shared design system: tokens, fonts, base styles, the write head, `StatusRing`,
  `Sheet`, `ReplyMarkdown`. See `src/ui/README.md`.
- `reportErrors.ts`: `startReportingErrors` and `apiFetch`, which report the page's errors and
  failed API requests to the server's log; `apiFetch` also shows the passcode screen on a `401`.

### The server: `server/`

- The top level: `main.ts` starts the server, `app.ts` wires it (`startServer`, `createModels`),
  `config.ts` holds the committed `ServerConfig`, `ports.ts` the `API_PORT`, `exit.ts` the
  `exitOnceWritten` that `main.ts` and `scripts/serve-temp.ts` share; `dev.ts`, `usage.ts` and
  `logs.ts` are the `npm run` commands; `escape-tags.ts` escapes text for the prompts, and
  `testing.ts` holds the tests' helpers. See `server/README.md`.
- `api/`: the routes (`Route`, `ApiRequest`, `EventSink` in `route.ts`), the Node adapter with the
  local-only checks and the passcode gate (`node-adapter.ts`, with `passcode.ts`), the previews (`preview.ts`) and the wire types
  (`types.ts`). See `server/api/README.md`.
- `storage/`: `ManualStore` and `UsageLedger` (`types.ts`) as files in the data folder
  (`file-manual-store.ts`, `file-ledger.ts`), the data folder's lock (`lock.ts`) and seeding
  (`seed.ts`). See `server/storage/README.md`.
- `seed/<manualId>/`: `manual.json`, a TOC, a voice, and which sections start written; and
  `sections/*.md`, bodies (only the sample, the-haunt-that-listens, has them: all 18).
- `writer/`: the `SectionWriter`s (`fake.ts`, `bedrock.ts`), the Bedrock writer's prompt
  (`prompt.ts`) and output handling (`section-text.ts`, `validate.ts`), and one run per section
  (`runs.ts`). See `server/writer/README.md`.
- `gateway/`: `createGateway` (`gateway.ts`), the `Gateway` every model call goes through; the
  `ModelClient` for Bedrock (`bedrock-client.ts`), the price table (`prices.ts`, with the fake
  model, `FAKE_MODEL` in `types.ts`, at $0) and the credentials (`credentials.ts`). See
  `server/gateway/README.md`.
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
  `localUrl`, for `shot.ts` and `serve-temp.ts`.
- `serve-temp.ts`: `npm run serve-temp`, a throwaway API server and Vite server on free ports and
  a temporary data folder, for checks (`README.md` › A throwaway server). It loads no Playwright.
- `audit/`: `npm run audit`, candidate rule breaks from this repo's Claude Code transcripts. See
  `scripts/audit/README.md`.
- `hooks/`: the Claude Code hooks `.claude/settings.json` runs, which tell a session when its
  rules are out of date (`README.md` › Rule-change notices).
- `commit-task.ts`: `npm run commit-task`, which commits a task's work with its `Reviewed-by:`
  trailer. `.githooks/commit-msg` refuses, without one, a task commit or a commit of Claude's
  that changes more than `WORKLIST.md` (`README.md` › Committing task work).
- `orchestrator-check.ts`: `npm run orchestrator-check`, which checks the orchestrator runs in the
  main checkout on `main`, clean and with its hooks, and lists the `doing` tasks and task
  worktrees an earlier run left (`README.md` › The orchestrator's preflight). It shares
  `commit-task.ts`'s check of where it runs, and its parsing of `WORKLIST.md`.
- `task-prompt.ts`: `npm run task-prompt`, which prints the prompt that starts a task's agent or
  its reviewer, from the task's block in `WORKLIST.md`, using `commit-task.ts`'s parsing.

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
| `App.tsx` | `home/`, `reader/` (lazily), `passcode/` |
| `home/` | `library/`, `librarian/`, `ui/` |
| `reader/` | `manual/`, `ui/` |
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
| `gateway/` | `storage/` (the ledger, `files.ts`), the logger's types |
| `storage/` | `api/types.ts`, the logger's types |
| `logging/` | `storage/files.ts` |

These are the imports of non-test code. Tests may also import what they set up
(`src/testing.tsx`, `server/testing.ts`, `app.ts`, `config.ts`, the file store and ledger, the log
file) and reach into a folder's files directly.

Route handlers import only `api/route.ts`, never `node:http` or the Node adapter
(`server/api/README.md` › Handlers).

## Cross-cutting rules

- **The gateway is the only way to reach Bedrock.** Nothing but the SDK adapters that
  `gateway/sdk-boundary.test.ts` lists (`gateway/bedrock-client.ts` alone) imports an Anthropic or
  AWS SDK, and nothing outside `server/gateway/` and `server/app.ts` imports that client; the test
  enforces both. So every model call is reserved against the caps, checked against the kill
  switch and written to the ledger (`server/gateway/README.md`). The fake model is called through
  the same gateway, at $0, so all of this runs without Bedrock too, except in a librarian preview,
  which plays the fake model directly so that it costs and records nothing.
- **One server per data folder.** The caps are totalled in one process's memory, so the server
  locks its data folder before it starts (`server/storage/README.md` › The data folder's lock).
- **Configuration** is committed, apart from the AWS keys in `.env.local`, which only
  `gateway/credentials.ts` reads, from the main checkout's root even in a linked worktree
  (`server/README.md` › Configuration).
- **Only this machine's own pages.** The server listens on `127.0.0.1`, and the Node adapter
  refuses any other `Host` or `Origin`, and any body that isn't JSON, before a route runs
  (`server/api/README.md` › Only this machine's own pages).
- **The passcode gate.** With `RTFM_PASSCODE` set, the Node adapter answers every request but
  `POST /api/passcode` with `401` unless its `rtfm_passcode` cookie holds the passcode, so a
  public URL can't spend the model caps for anyone who finds it; the browser shows the passcode
  screen on any `401` (`server/api/README.md` › The passcode, `src/passcode/README.md`).
- **One logger**, passed to whatever logs, never logs a manual's text, a prompt, a conversation
  or the passcode (`server/logging/README.md`).
- **Tests never call Bedrock** (`server/README.md` › Tests).
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
    local one stays as strict as the AWS one.
  - An adapter that imports an AWS SDK is added to `gateway/sdk-boundary.test.ts`'s list of SDK
    adapters on purpose, or the test fails.
  - A feature that works only in AWS needs the user's approval.
  - Local can't show IAM permissions, Lambda response streaming and its disconnects, or cold
    starts. A smoke check against the deployed app covers those.
