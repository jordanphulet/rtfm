# RTFM

A web app for reading hypothetical manuals. An LLM writes a manual's table of contents first, then
writes each section only when a reader opens it. Today the app has two pages:

- **The landing page** (`/`): your library of manuals, beside a librarian agent you talk to. The
  librarian gives canned replies and changes nothing.
- **The reader** (`/read`): one sample manual, whose sections are written by a fake streamer.

There is no back-end or LLM yet.

## Running it

Needs Node 22.18 or later (the scripts run as TypeScript directly).

```sh
npm install
npx playwright install chromium   # once, for the screenshot script
npm run dev                       # then open http://localhost:5173/
```

| Script            | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `npm run dev`     | Starts the dev server on port 5173.                                  |
| `npm test`        | Unit tests (Vitest).                                                 |
| `npm run build`   | Type-checks everything and builds the app.                           |
| `npm run preview` | Serves the built app.                                                |
| `npm run shot`    | Screenshots both pages in every state, with its own dev server on port 5174. See below. |

`npm run shot` clears `shots/`, then writes:

- `shots/reader/<state>-<desktop|mobile|desktop-reduced>.png`, for the states `start`, `toc`,
  `written`, `dense`, `waiting`, `streaming`, `streaming-full` and `appendix`
  (`desktop-reduced`, with reduced motion, only for `start` and `streaming`);
- `shots/home/<state>-<desktop|phone>.png`, for the landing page's states (listed in
  `DESIGN.md`, under "States").

## Where things live

- `src/App.tsx`: the routes. `/` is the landing page, `/read` and `/read/:sectionId` the reader;
  anything else redirects to `/`. Both pages are loaded lazily.
- `src/home/`: the landing page.
- `src/reader/`: the reader.
- `src/ui/`: the shared design system (tokens, fonts, base styles, the write head, components),
  used by both pages. Its README documents it.
- `src/manual/`: the manual's data, store, fake streamer and markdown renderer, plus the sample
  manual in `src/manual/sample/`. Its README documents the API.
- `src/library/`: the library's seed manuals and in-memory store. Its README documents the API.
- `src/agent/`: the scripted librarian. Its README documents the API and the canned replies.
- `scripts/`: the `shot` script (`shot.ts`, with the capture helpers in `screenshots.ts`).
- `research/`: research for the back-end (`bedrock-models.md`: which Bedrock models to use).
- `DESIGN.md`: the design of both pages: their rules, tokens, layout and behavior.
- `WORKLIST.md`: the task list.
- `CLAUDE.md`: code standards.
