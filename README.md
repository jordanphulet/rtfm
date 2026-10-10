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
| `npm run shot`  | Screenshots the reader in every state at desktop and phone size, plus reduced motion, into `shots/`. |

## Where things live

- `src/reader/`: the reader (routes `/read` and `/read/:sectionId`).
- `src/manual/`: the manual's data, store, fake streamer, markdown renderer and fonts, plus the
  sample manual in `src/manual/sample/`. Its README documents the API.
- `scripts/`: the `shot` script.
- `DESIGN.md`: the reader's design: its rules, tokens, layout and behavior.
- `WORKLIST.md`: the task list.
- `CLAUDE.md`: code standards.
