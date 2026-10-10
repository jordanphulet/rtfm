# RTFM

A web app for reading hypothetical manuals. An LLM writes a manual's table of contents first, then
writes each section only when a reader opens it. Today the app is the reader: it shows one sample
manual, and section writing is simulated by a fake streamer. There is no back-end or LLM yet.

## Running it

Needs Node 22.18 or later (the scripts run as TypeScript directly).

```sh
npm install
npx playwright install chromium   # once, for the screenshot script
npm run dev                       # then open http://localhost:5173/read
```

| Script          | What it does                                                         |
| --------------- | -------------------------------------------------------------------- |
| `npm test`      | Unit tests (Vitest).                                                 |
| `npm run build` | Type-checks everything and builds the app.                           |
| `npm run shot`  | Screenshots the reader in every state at desktop and phone size, plus reduced motion, into `shots/reader/`. |
| `npm run shot:library -- <a\|b\|c>`  | Screenshots one library variant in every scenario at desktop and phone size, into `shots/library/<x>/`. |
| `npm run check:library -- <a\|b\|c>` | Type-checks one library variant on its own, with the shared code it uses. |

## Where things live

- `src/App.tsx`: the routes. Anything unknown redirects to `/read`.
- `src/reader/`: the reader (routes `/read` and `/read/:sectionId`).
- `src/manual/`: the manual's data, store, fake streamer and markdown renderer, plus the sample
  manual in `src/manual/sample/`. Its README documents the API.
- `src/ui/`: the shared design system (tokens, fonts, base styles, components), used by the
  reader and the library.
- `src/library/`: the library's seed manuals and in-memory store.
- `src/agent/`: the scripted librarian agent.
- `src/library-prototypes/`: three library variants being compared, at `/library/a`, `/library/b`
  and `/library/c`, with a dev switcher.
- `scripts/`: the `shot`, `shot:library` and `check:library` scripts.
- `DESIGN.md`: the reader's design: its rules, tokens, layout and behavior.
- `WORKLIST.md`: the task list.
- `CLAUDE.md`: code standards.
