# server/logging

One logger (`server/logging/`) writes every log line. It is created with its sinks and passed to
whatever logs, as the gateway and the store are: `createRequestHandler`, `createRuns`,
`createGateway`, `runAgent`, `sendReply`, the file store and the file ledger, and the client-error
route all take a `Logger`. `main.ts` creates it with two sinks, standard output and the data
folder's log file; `web-function.ts` with standard output alone, which Lambda sends to CloudWatch
(`server/README.md` › The Web Function); `startServer` without a logger of its own (the shot
script) logs to the log file alone. Tests pass `silentLogger`, or `capturingLogger()`
(`testing.ts`) to read the entries, so nothing reaches the test runner's output.

## A line

`createLogger(sinks)` returns `info`, `warn` and `error`, each taking an event name, a
short message, flat fields (strings, numbers and booleans; undefined ones are left out) and an
optional error. It writes one JSON object per line, shaped for CloudWatch so a Lambda can send
the same lines unchanged:

```json
{"timestamp":"2026-10-12T18:30:00.123Z","level":"ERROR","event":"section.failed","message":"Writing admin/the-haunt-that-listens/the-room-controller failed","libraryId":"admin","manualId":"the-haunt-that-listens","sectionId":"the-room-controller","characters":812,"durationMs":3150,"reason":"error","error":{"name":"Error","message":"…","stack":"…"}}
```

- `timestamp` is ISO 8601 in UTC; `level` is `INFO`, `WARN` or `ERROR`, from the values Lambda's
  log-level filtering reads (`DEBUG` is the fourth, which nothing logs); then `event`, `message`
  and the fields. Only the `error` nests: `{ name, message, stack }`, or the thrown value's type
  and text when it isn't an `Error`.
- **Standard output** is written with `process.stdout.write`, not `console.log`, which Lambda's
  text format would prefix. `runServerProcess` (`app.ts`) ignores errors on standard output, so a
  closed pipe (`EPIPE`) can't stop the server.
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

## What is logged

Ids, sizes, counts and durations, never a manual's text, a prompt, a conversation or a reply, a
request's query or headers (other than a refused request's `Host` and `Origin`), credentials,
the passcode or its digest, whether entered, carried in a cookie or stored, or a library link's
secret or its digest. A browser error's
message and stack are logged as the browser reports them. The Bedrock client writes the AWS keys
out of a thrown error's message and stack, since a signature error from AWS quotes the access key
ID.

Every line about a request in a library has the library's `libraryId` (`admin` for the admin's
library; `server/api/README.md` › The library of a request): `request` once the gate has given the
request its library, `request.failed`, `librarian.reply`, `agent.tool-failed`, `client.error`,
`client.limited`, `link.accepted`, `library.seeded`, `library.activity-failed`, a revoked link's
`link.refused`, and every `section.*` line, which also has the section's `manualId` and
`sectionId`.

| Event | Level | When, and its fields |
| --- | --- | --- |
| `server.started`, `server.stopped` | INFO | `startServer` listening (`host`, `port`, `models`, `dataDir`, `manualStorage`: `files` or `dynamodb`, with DynamoDB `credentials`: where its keys come from, by name only, and `passcodeGate`: whether there is a passcode gate), and `close()` done |
| `server.refused` | WARN | The data folder's lock is held by another server (`pid`, `dataDir`) |
| `server.start-failed`, `server.crashed` | ERROR | The server couldn't start (an unpriced model, missing credentials, a port in use; on the Web Function, Bedrock models or no `AWS_LAMBDA_HTTP_ENDPOINT`); an uncaught exception or unhandled rejection in `runServerProcess` |
| `request` | INFO, WARN for 5xx | Each request, the built app's files included, once its response closes: `requestId` (a UUID), `method`, `path` (without the query), `libraryId` once the gate has given one (never on a refused request or a file of the built app), `status`, `durationMs`, and `clientClosed` when the client left before the response ended |
| `request.refused` | WARN | The `Host` and `Origin` checks refused it, it carried neither an open link's cookie nor the passcode (`401`, `Passcode required`), its link is revoked (`401`, `Link closed`), or its body was too long or not JSON (`status`, `host`, `origin`) |
| `passcode.wrong`, `passcode.accepted`, `passcode.unset` | WARN, INFO, WARN | `POST /api/passcode` with a wrong passcode, the right one, or any while no passcode is set (no fields: never the passcode or its digest) |
| `link.accepted`, `link.refused` | INFO, WARN | `POST /api/link` opened a library (`libraryId`), or refused a link (`reason`: `unknown`, or `revoked` with its `libraryId`); never the secret, its digest or the cookie |
| `library.seeded` | INFO | A link's first use seeded its library's starters (`libraryId`, `manualIds`, comma-separated) |
| `library.activity-failed` | WARN | A library's activity couldn't be written, and the request went on (`libraryId`, `activity`: the counter, `opens` or `lastUsedAt`), with the error |
| `request.failed` | ERROR | A handler threw, or the gate couldn't read a link or the passcode's digest (the 500 in `server/api/README.md` › Routes): the `request` line's ids, with `libraryId` once the gate has given one |
| `model.call` | INFO, WARN when failed | Each gateway call once it settles: `callId` (the ledger's), `job`, `model`, `outcome`, the four token counts, `usd`, `estimated`, `durationMs`; a failed call's error |
| `model.refused` | WARN | The gateway refused a call: `job`, `model`, `reason` (`kill-switch`, `daily-cap`, `monthly-cap` or `busy`) |
| `ledger.line-skipped` | WARN | A ledger line that isn't JSON (`file`, `line`) |
| `section.started`, `section.joined` | INFO | A run starts; a reader joins one (`listeners`, `backlogCharacters`) |
| `section.finished`, `section.aborted` | INFO | A run ends with `written` (`placeholder`; `elsewhere` when another environment wrote the body), or its last reader left; `characters` and `durationMs` |
| `section.waiting`, `section.taken-over` | INFO | Another environment holds the section's lease, so the run waits for its body; the lease came free with no body, and the run took it (`durationMs` waited) |
| `section.release-failed` | WARN | A run couldn't release its section's lease, which then expires, with the error |
| `section.failed` | WARN for budget, ERROR | A run fails (`reason`), with the error unless the budget refused it |
| `section.refused` | WARN | A run beyond `maxConcurrentRuns` (`activeRuns`) |
| `librarian.reply` | INFO, WARN for budget, ERROR | A reply ends: `libraryId`, `outcome` (`done`, `aborted`, `budget` or `error`), `messages`, `turns`, `tools` (the tools the model called, comma-separated), `durationMs`; a failed reply's error |
| `agent.tool-failed` | WARN | A tool threw, and the model got an error result (`libraryId`, `tool`) |
| `manual.cleanup-failed` | ERROR | A deleted manual's folder couldn't be removed (`libraryId`, `manualId`, `folder`) |
| `client.error` | ERROR, WARN for a request | What the browser reported (below), with the reporting page's `libraryId` |
| `client.limited` | WARN | Once an hour, when browser reports pass the hourly limit (`libraryId`: the library of the report that passed it; the limit is one for every library) |
| `log.file-full` | WARN | Written by the log file itself, as the day's last line in it |

## Browser errors

`src/reportErrors.ts` reports what goes wrong in the page to `POST /api/client-errors`, which is
subject to the `Host` and `Origin` checks and the passcode like any route (so a browser that hasn't
entered the passcode reports nothing):

- `startReportingErrors()`, called in `src/main.tsx`, listens for `error` (an uncaught error) and
  `unhandledrejection` on `window`. `apiFetch`, which the library, manual and librarian stores
  use in place of `fetch`, reports a request that gets no answer or a 5xx. A 4xx is the server's
  own answer and already in its `request` line; a 401 shows the passcode screen instead
  (`src/passcode/README.md`). Section streams aren't reported: the browser fires
  an `error` on an `EventSource` whenever the page is left mid-stream, and a stream the server
  ends early is in its own log (`section.aborted`, `clientClosed`). After a stream's error the page
  asks the section's URL once through `apiFetch` (to find a `401`), so that request is reported
  if it gets no answer or a 5xx.
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
  `status`, each with the `libraryId` of the library the report's request is in.

## `npm run logs`

`npm run logs` (`server/logs.ts`, with `logging/log-reader.ts`) reads the daily files and
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

`npm run ops -- logs` (`README.md` › The ops tools) reads the deployed app's entries from CloudWatch
with the same options (`LOG_OPTIONS` and `logOptionsFrom`), filter and format.

## Tests

Tests next to each module check: the line's shape and levels; the daily files, retention, the
daily budget, and a failed write and the recovery after it; reading, filtering, formatting with
control characters escaped, and reading whole lines from an offset (the follow loop itself is
not tested); the request, refusal, model-call, run and reply entries; the client-error route
(its fields, the `Host` and `Origin` checks, truncation and the hourly limit); the `libraryId` on
each line about a request in a library (`api/libraries.test.ts`, with libraries opened by their
links); the `link.*`, `library.seeded` and `library.activity-failed` lines (`api/link.test.ts`);
`main.ts` writing the same lines to standard output and the file, and `web-function.ts` writing
them to standard output; and that no cookie, query, conversation or section text reaches the log
file (`api/logging.test.ts`), nor the passcode or its digest, entered, in a cookie or stored
(`api/passcode.test.ts`), nor a library link's secret or its digest, a failed lookup's included
(`api/link.test.ts`, `server/web-function.test.ts`), nor an AWS key from a Bedrock error
(`gateway/bedrock-client.test.ts`, since only `server/gateway/` may use the Bedrock client).

## Files

- `logger.ts`: `createLogger`, the line's shape, standard output and standard error.
- `log-file.ts`: the daily log files in the data folder, and their retention.
- `log-reader.ts`: reads, filters and formats entries for `npm run logs`, with the options it
  shares with `npm run ops -- logs`.
