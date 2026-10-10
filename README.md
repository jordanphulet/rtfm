# RTFM

A web app for reading hypothetical manuals. An LLM writes a manual's table of contents first, then
writes each section only when a reader opens it. For now we are designing the reader UI: three
competing designs (A, B, C) read one sample manual, and section writing is simulated by a fake
streamer. There is no back-end or LLM yet.

## Running it

Needs Node 22.18 or later (the scripts run as TypeScript directly).

```sh
npm install
npx playwright install chromium   # once, for the screenshot scripts
npm run dev                       # http://localhost:5173/a (or /b, /c)
```

| Script                 | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `npm test`             | Unit tests (Vitest).                                                 |
| `npm run build`        | Type-checks everything and builds the app.                           |
| `npm run check -- <x>` | Type-checks only `src/shared` and design `<x>` (`a`, `b` or `c`).    |
| `npm run shot -- <x>`  | Screenshots design `<x>` in every reader state into `shots/<x>/`.    |

## Where things live

- `CLAUDE.md`: code standards.
- `DESIGN_RULES.md`: what every reader design must do.
- `WORKLIST.md`: the task list.
- `src/shared/README.md`: the shared runtime designs build on (hooks, `<Markdown>`, fonts).
- `src/designs/<x>/`: one folder per design.
- `scripts/`: the `check` and `shot` scripts, plus `inspo.ts`, which captured the reference
  screenshots.
- `docs/inspo/`: reference screenshots for each design direction, described in its README.
