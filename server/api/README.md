# server/api

The HTTP API the browser calls: its routes, the checks that keep it to the app's own pages, the
plain handlers behind them, and, on the Web Function, the built app beside them. `types.ts` is the
contract it shares with the browser (`ARCHITECTURE.md` › Boundaries).

## Types

- **A `Manual`** is its id, title, subtitle, chapters and appendices, each chapter a list of
  sections with a label, title, summary and status (`unwritten`, `writing` or `written`). It has
  no voice and no bodies. **A `ManualSummary`** is what the library lists: the id, title,
  subtitle, and the chapter, section and written counts.
- **A section stream** sends `append` (`at`, `text`, `progress`), then `written`, `frozen` or
  `failed` (`reason`: `"budget"` or `"error"`).
- **The librarian** takes `LibrarianMessage`s (`user` or `agent`, their text, and on an `agent`
  message an optional `deleteOutcome`) and streams `LibrarianEvent`s: `status`, `text`,
  `withdraw`, `action` (a `PageAction`: `open`, `propose-delete` or `created`), `done`, `frozen`
  (previews only) and `failed` (`server/agent/README.md` › The librarian).

## Routes

| Route | Response |
| --- | --- |
| `GET /api/manuals` | `200 ManualSummary[]`, every manual in storage, sorted by title |
| `GET /api/manuals/:manualId` | `200 Manual` (`writing` while a run is active, in any environment), or `404` |
| `DELETE /api/manuals/:manualId` | `204` (no body), `404`, or `409 { error }` while a section of it is being written |
| `GET /api/manuals/:manualId/sections/:sectionId` | `200 { status, body? }`, with the body only when written, or `404` |
| `GET /api/manuals/:manualId/sections/:sectionId/stream` | `text/event-stream` (below), or `404` |
| `POST /api/librarian` with `{ messages: LibrarianMessage[] }` | `text/event-stream` of `LibrarianEvent`s (`server/agent/README.md` › The librarian), or `400` |
| `POST /api/client-errors` with a `ClientErrorReport` | `204`, `400`, or `429` past the hourly limit (`server/logging/README.md` › Browser errors) |
| `POST /api/passcode` with `{ passcode }`, only when a passcode is set | `204` with the passcode cookie, `401 { error: "Wrong passcode" }`, or `400` (The passcode, below) |

Any other path or method gets `404 { error: "Not found" }`, and a handler that throws gets
`500 { error: "Internal error" }` (or, once a stream has started, the stream just ends). With a
passcode set, a request without it gets `401` before any of these (The passcode, below).

## Only the app's own pages

The API deletes manuals and spends the model caps, so it answers nobody but the app's own pages.
Which `Host`s and `Origin`s those are is configuration (`allowedHosts` and `allowedOrigins`, in
`server/README.md` › Configuration):

| | `Host` | `Origin` |
| --- | --- | --- |
| On this machine (`config.ts`), listening on `127.0.0.1` | `localhost`, `127.0.0.1` or `[::1]`, any port (`LOOPBACK_HOSTS`) | `http://localhost`, `http://127.0.0.1` or `http://[::1]`, any port (`LOOPBACK_ORIGINS`) |
| On the Web Function (`web-function.ts`) | a Web Function endpoint's domain, `….lambda-web.<region>.on.aws` | `https://rtfm.moonfetus.com` |

Before matching any route, and before serving any file of the built app, the Node adapter refuses:

| Request | Response |
| --- | --- |
| `Host` isn't one of the allowed | `403 { error: "Host not allowed" }` |
| `Origin` is sent and isn't one of the allowed | `403 { error: "Origin not allowed" }` |
| A body without `content-type: application/json` (a `charset` is fine), to the API | `415 { error: "Body must be application/json" }` |

A request with no `Host` at all is refused by Node itself, with `400`.

On the Web Function, Lambda sends the endpoint's own domain as the `Host`, since it routes on it,
and refuses any other, so the `Host` check there only backs Lambda up. CloudFront passes the
viewer's `Origin` on, so the page at `https://rtfm.moonfetus.com` passes, and a page anywhere else,
`http://localhost` included, is refused.

- **The `Host` check** stops DNS rebinding: a site whose name is pointed at `127.0.0.1` still
  sends its own name as `Host`.
- **The `Origin` check** stops another site's page. Its POST, its DELETE, and its `fetch` or
  `EventSource` on a section stream all carry its `Origin`, so the stream is refused before a run
  starts, not after CORS has let it start a paid run. A missing `Origin` is
  allowed: the browser leaves it off same-origin GETs, the reader's `EventSource` included, and
  `curl` sends none.
- **The content type** backs up the `Origin` check. Another site's page can send a form or a
  `text/plain` POST without a CORS preflight, but not `application/json`, so no body from another
  site reaches a route even if its `Origin` were missing. (Its preflight `OPTIONS` carries its
  `Origin` and gets `403`.)
- **The app's own requests pass.** Through Vite's proxy they arrive with the page's `Host`
  (`localhost:5173`) and, on the librarian's POST, its `Origin` (`http://localhost:5173`); the
  library's DELETE has no body.

## The built app

With `appDir` set (`server/README.md` › Configuration), as the Web Function sets it to `dist/`, the
Node adapter serves the built app for every path outside `/api` (`app-files.ts`), after the `Host`
and `Origin` checks and before the passcode gate, since the passcode screen is part of the app:

- `GET` or `HEAD` of a file in the folder answers it, with its content type. Every other method
  gets `404 { error: "Not found" }`, and so does a path that leaves the folder or holds a NUL.
- A file under `/assets/`, which Vite names by its content, is sent with
  `cache-control: public, max-age=31536000, immutable`; a missing one gets `404`.
- Any other path that isn't a file, `/` and every page route included, gets `index.html`, with
  `cache-control: no-cache`, and the browser's router shows the page.

Unset, as on this machine, where Vite serves the app, every path goes to the API.

## The passcode

With `RTFM_PASSCODE` set (`server/README.md` › Configuration), the server answers no one who
hasn't entered it. Unset, or empty, there is no gate and no `POST /api/passcode`.

- **The gate.** After the `Host` and `Origin` checks and before the body is read or any route is
  matched, the Node adapter refuses every API request but `POST /api/passcode` with
  `401 { error: "Passcode required" }` unless its `Cookie` header has `rtfm_passcode` equal to the
  passcode. Unknown paths get `401` too, so nothing about the API shows before the passcode.
- **Entering it.** `POST /api/passcode { passcode }` (`api/passcode.ts`) answers the right one
  with `204` and the cookie, and a wrong one with `401 { error: "Wrong passcode" }` and no cookie.
- **The cookie** is `rtfm_passcode=<the passcode, URI-encoded>; HttpOnly; SameSite=Strict;
  Path=/api`, plus `Secure` when the request's `Host` isn't `localhost`, `127.0.0.1` or `[::1]`,
  as on the Web Function, whose page is HTTPS. It has no `Max-Age`, so the browser keeps it for its
  session. The browser sends it on every API request, the reader's `EventSource` streams included,
  since they are same-origin. `curl -c` keeps a `Secure` cookie, and sends it back (`-b`) only over
  HTTPS.
- **Compared in constant time:** `isPasscode` compares the SHA-256 digests of the two, which are
  always the same length, with `timingSafeEqual`.
- **Rotating it:** change `RTFM_PASSCODE` and restart the server. Every browser's cookie then
  holds the old one, so every browser gets the passcode screen again.
- **What it doesn't do:** the passcode is kept and compared as it is, with no signed session, no
  expiry, no limit on attempts and no sign-out. Nothing slows guessing, which is why `README.md`
  recommends a passcode of a few random words.
- **Logged** without the passcode or the cookie: a refused request as `request.refused` (`401`,
  `Passcode required`), and each passcode entered as `passcode.wrong` or `passcode.accepted`
  (`server/logging/README.md`).

## Handlers

Handlers import only `api/route.ts`, never `node:http` or the Node adapter, so they don't depend on
how they are served. A `Route` has a `method`, a `pattern` and a `handle(request)` that gets the
route's `params`, the `query`, the parsed JSON `body` (undefined when there is none) and a `signal`
that aborts when the client disconnects. It answers with a JSON response or an event stream, a
function given an `EventSink` that ends the stream when it resolves; the choice is made inside
`handle`, so a stream route can still answer `404`.

Before any route is matched, the Node adapter refuses a request from anywhere but the app's own
pages (above), serves the built app when it has one (The built app, above), then refuses one
without the passcode when one is set (The passcode, above), then reads the body, up to 262,144
characters: one that is too long or isn't JSON gets `400 { error: "Bad request" }`. Then it:

- matches `method` exactly, and `pattern` by splitting the path on `/`;
- turns `res.on("close")` into the `AbortSignal`, and logs the request then
  (`server/logging/README.md`);
- writes the SSE headers (`content-type: text/event-stream`, `cache-control: no-cache`), and
  while the stream is open, a comment (`: heartbeat`) every `eventStreamHeartbeatMs` (15s), so
  that no silence, such as a section's wait for its first paragraph or the planner's, reaches
  CloudFront's 60s read timeout. Clients skip a comment block: `EventSource` does, and so do the
  librarian's `streamReply` (`src/librarian/api.ts`) and the tests' `readEvents`, which skip any
  block without an `event:` line;
- writes a response whose `body` is `undefined` with no body and no content type (`noContent`, 204);
- sets a response's `cookie` with the attributes in The passcode, above (`setCookieHeader`).

**The library** (`api/library.ts`). A summary's counts come from storage, never from the seed:

- `chapterCount` counts chapters and appendices;
- `sectionCount` counts every section in the table of contents;
- `writtenCount` counts the sections that have a stored body. A section being written counts once
  it is saved.

Titles are sorted with `localeCompare(…, "en")`, so "The Haunt That Listens" sorts under T.

**A manual** (`api/manual.ts`). Its sections' statuses come from one `writtenSectionIds` read, as
the library's counts do, and never from the bodies. A section is `writing` if it is being written
(`runs.writingSectionIds`, taken before the read), otherwise `written` if it has a stored body,
otherwise `unwritten`. Being written means a run in progress in the environment that answers, or,
on the Web Function, another environment's live lease on the section, which one query of the
manual's partition finds (`SectionLeases.heldElsewhere`, `server/storage/README.md` › Section
leases). A section saved between the two reads shows as `writing`, never as `unwritten`: its body
replaces its lease in one transaction.

**Deleting a manual** (`api/delete-manual.ts`) removes its table of contents and every written
section. Nothing else is touched: not the ledger, not the seeding record (`server/storage/README.md`
› Seeding), so a deleted seed manual stays deleted.

- **It refuses while writing.** If any section of the manual is being written (`runs.isWriting`:
  a run in progress in the environment that answers, or another environment's live lease, as for
  a manual's statuses above), the answer is `409 { error: "A section of this manual is being
  written" }` and nothing changes. The reader keeps streaming, and the caller can try again once
  the section is written. Stopping the runs instead would mean sending their readers a failure and
  paying for calls cut short, for a delete that can simply wait a few seconds.
- **A lease taken just after the check** doesn't stop the delete. If the delete's query of the
  section items finds it, the transaction deletes the lease's item with the others, so the run's
  next renewal, within 5 seconds, finds the lease gone, and the run is aborted mid-write and ends
  with `failed: "error"`, storing nothing. If the lease comes after that query, the run's save
  fails, since its manual is gone, and its lease is released or expires.
- **A run that starts while the delete is under way** can't bring the manual back. The store
  removes the manual's folder in one `rename`, and `saveBody` refuses a manual that doesn't exist.
  Such a run either saved before the rename, and its body is deleted with the rest, or ends with
  `failed: "error"` and stores nothing. A run that starts in the narrow window between the check
  and the rename may still call the writer, possibly a paid Bedrock call, before it fails at
  `saveBody`. That is rare, and bounded by one section's `max_tokens`.
- A run's finished `written` entry may stay in the runs map after a delete. That is harmless:
  statuses are read from storage for any section not being written.

## Section streams

The reader suspends on the JSON section route. If the section is written, it renders the body and
never opens a stream. Otherwise it opens the stream with `EventSource`.

- **Unwritten:** the stream starts a run (`server/writer/README.md` › One writer per section).
  `append` events follow as text arrives, then `written` or `failed`, and the server ends the
  stream.
- **Already being written (joining):** the first `append` carries everything so far (`at: 0`),
  and after that the joiner gets the same events as everyone else. `at` is the offset of `text`
  in the body, which is only needed for that backlog. Two tabs show the same text.
- **Written by the time the stream opens** (another tab finished it): one `append` with the whole
  body, then `written`.
- **Being written by another environment** of the Web Function, which holds the section's lease:
  nothing but the heartbeat comment every 15 seconds until that environment stores the body, then
  one `append` with the whole body and `written`. If that environment's run ends without a body,
  this one writes the section itself and the stream goes on as an unwritten section's
  (`server/writer/README.md` › Another environment).
- **`written` carries nothing.** The stored body is exactly the text that was streamed, so the
  client never replaces text it has already shown.
- **`progress`** (0–1) comes from the writer: exact for the fake, estimated for Claude.
- **`failed`** is sent when the run ends without a body. The section goes back to `unwritten` on
  the server, and the reader shows one of its two failure states:
  - `"budget"`: **budget reached**. A cap would be crossed, or the kill switch is on.
  - `"error"`: **couldn't write this section**. Bedrock failed, the stream stalled, the output
    failed validation, `stop_reason` was `max_tokens` or `refusal`, or too many sections were
    already being written.
- **The client never reconnects**, because reconnecting would pay for a second run, and it retries
  only when the reader asks. How the browser reads the stream is in `src/manual/README.md`.
- **Preview options**, for screenshots: `?freeze=<0–1>` and `?fail=budget|error` on a stream,
  `?library=empty` on `GET /api/manuals`, and `?freeze=<0–1>` on `POST /api/librarian`
  (`server/agent/README.md` › Previews).
  - `api/preview.ts` handles them before any run, writer or storage write is touched, so they cost
    nothing and change nothing, whichever models are configured.
  - One parser (`previewFraction`) reads `?freeze` for both routes: anything but a number from 0
    to 1 gets `400 { error: "Bad request" }`, on a stream whether or not the section is written.
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

## Files

- `types.ts`: the API contract shared with the browser (Types, above).
- `route.ts`: `Route`, `ApiRequest`, `EventSink`: what handlers see.
- `node-adapter.ts`: `node:http` ⇄ `ApiRequest`, the `Host` and `Origin` checks (with
  `LOOPBACK_HOSTS` and `LOOPBACK_ORIGINS`), the passcode gate, JSON responses and their cookie,
  the event stream and its heartbeat, and the built app's files.
- `app-files.ts`: `readAppFile`, a file of the built app for a path (The built app, above).
- `lookup.ts`: finds a manual that has a given section.
- `library.ts`: `GET /api/manuals`.
- `manual.ts`: `GET /api/manuals/:manualId`.
- `delete-manual.ts`: `DELETE /api/manuals/:manualId`.
- `section.ts`: `GET /api/manuals/:manualId/sections/:sectionId`.
- `section-stream.ts`: `GET /api/manuals/:manualId/sections/:sectionId/stream`.
- `librarian.ts`: `POST /api/librarian`: the librarian's reply to a conversation
  (`server/agent/README.md` › The librarian).
- `preview.ts`: `?freeze`, `?fail` and `?library=empty`: canned, never stored, never billed.
- `client-errors.ts`: `POST /api/client-errors`: logs what the browser reports
  (`server/logging/README.md` › Browser errors).
- `passcode.ts`: `POST /api/passcode`, the cookie's name and `isPasscode` (The passcode, above).
