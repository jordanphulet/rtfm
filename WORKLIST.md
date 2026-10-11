# RTFM — Work List

The orchestrator works through this file under `/loop`, starting subagents for tasks until
everything is done or a task needs a human. **This file is the source of truth for status.**

## Orchestrator protocol

The orchestrator **coordinates, reviews and commits**. It does not do the task work itself.

### Every loop pass

1. **Read this file.** If every task is `done`, or nothing can run because the remaining tasks
   are `needs-human` or `blocked`, report to the user and **stop the loop**.
2. **Review finished work.** Run the review loop below for every `doing` task whose agent has
   reported back.
3. **Start ready tasks.** Start every `todo` task whose dependencies are all `done` as a
   **background subagent**, with **at most 3 running at once**. Mark it `doing` and record the
   agent's name.
4. **Save this file**, then schedule a fallback wake-up in 20–30 minutes. Agents announce when
   they finish, so there's no need to poll.

### Review loop (required before any commit)

1. **Check the basics:** every item in the task's **Done when** list, and `git status` shows
   changes only inside the task's **Files**.
2. **Read the full diff** against `CLAUDE.md` › Code standards and, for UI work, the design doc.
   For anything beyond a trivial change, also start a **review subagent** for an independent code
   review, then weigh its findings.
3. **Changes needed:** send specific, actionable notes to **the same agent** (`SendMessage`, so it
   keeps its context), then wait for it to report back and repeat from step 1.
4. **Approved:** mark the task `done` and commit **only that task's files**, with the message
   `<task id>: <summary>`.
5. **Three rounds without approval:** mark it `needs-human`, write down what's unresolved, and
   tell the user.

### When the orchestrator does work itself

Avoid it. If it does happen (for example, a small fix while reconciling two tasks), start a
review subagent on that change and only commit once the review passes. Keeping this file's
statuses up to date, and git operations such as tags, don't count as work.

### Adding work

When the orchestrator discovers work that should be done, it **adds a task** to the right phase:
a new ID, **Depends on**, **Files**, **Do** and **Done when**. It also updates the dependencies
of any existing task that must now wait for it.

### Rules

- **Every agent runs on Opus 5.5** (`model: "opus"`), in the background.
- **Only the orchestrator commits.** Agents never run git commands that change anything.
- **Agents never edit this file.** They report back, and the orchestrator updates statuses.
- Every agent prompt includes the full task block and points to `CLAUDE.md`, the design doc and
  `src/manual/README.md`. It asks the agent to report back with the files it changed, how it
  checked its work, and anything left unresolved.
- Agents work in the same checkout at the same time, so they **must stay inside their task's
  Files**. Two tasks that touch the same file never run at the same time.

**Statuses:** `todo` · `doing` · `done` · `blocked` · `needs-human`

---


## Library on the server

The landing page's library comes from the server instead of seven hard-coded entries, and the
reader opens any manual, not only the sample. When this phase is done:

- the library lists the manuals in storage, with live "n of m written" counts;
- all seven manuals are real: the six that were only library entries get a table of contents and
  a voice on the server, with no sections written, so Claude writes them on demand;
- deleting a manual removes it on the server, and it stays deleted after a reload or a restart;
- the reader opens whichever manual you pick, at `/read/<manual>` and `/read/<manual>/<section>`;
- "last opened" times are gone. The library is sorted by title.

The canned librarian, the delete confirmation and the rest of the landing page's design stay as
they are. Out of scope: creating manuals, renaming them, and the librarian using real tools.

### Rules for this phase

- **AWS credentials come only from `.env.local`.** There are profiles in `~/.aws/config`, and
  they **must never be used**. Never read, print, copy or edit `.env.local`.
- **Real Bedrock calls happen only in LS.5**, only through the gateway, and under $0.10 in total.
  Every other task and every test uses the fake writer.
- **`.data/` holds the real usage ledger** and the user's manuals. Never delete or edit the
  ledger, and deleting a manual never touches it. Live checks that delete manuals use a
  temporary data folder, never `.data/`.

### LS.1 — Six more seed manuals
- **Status:** done
- **Depends on:** —
- **Files:** `server/seed/**` (new manual folders only; the Haunt's folder stays as it is)
- **Do:**
  - Write a `manual.json` for each of the other six library manuals, in the Haunt's format, with
    the same ids, titles and subtitles as `src/library/seed.ts`: *The Birthday Party Field
    Manual*, *Negotiating With Geese*, *Keeping a Sourdough Starter Alive*, *Running Your Own
    Mail Server Without Losing Your Mind*, *Moving House Without Losing the Cat* and *Building a
    Backyard Observatory*.
  - Keep each one's chapter and section counts from `src/library/seed.ts`, appendices
    included.
  - Each gets a distinct voice brief and a table of contents with a one-line summary for every
    section, the kind a reader would want to open.
  - No section bodies: none of the six starts with anything written.
- **Done when:** every `manual.json` parses with the server's seed types, ids are unique slugs,
  `section:` ids are unique within a manual, the counts match, and `npm test` passes.

### LS.2 — The library API
- **Status:** done
- **Depends on:** —
- **Files:** `server/**` except `server/seed/**`, `ARCHITECTURE.md`
- **Do:**
  - `GET /api/manuals`: summaries of every manual in storage (id, title, subtitle, chapter
    count, section count, written count), sorted by title, with the counts computed from storage.
  - `DELETE /api/manuals/:manualId`: removes the manual and its sections from storage. It
    refuses while a section of that manual is being written, or stops those runs first; choose
    and document which. The ledger is never touched.
  - Seeding: every manual in `server/seed/` is seeded once. A deleted seed manual stays deleted
    after a restart (for example, with a record of what has been seeded), and a seed manual
    added later is seeded on the next start, so the user's existing `.data/` gains the six new
    manuals and keeps the Haunt's written sections.
  - Add a `?library=empty` preview (or an equivalent) so the screenshots can show the empty
    library without deleting anything.
  - Tests for the routes, deleting during a write, and seeding after a delete and a restart.
    Update ARCHITECTURE.md.
- **Done when:** `npm run build` and `npm test` pass; with `npm run dev`, `curl` lists the
  manuals, deletes one, and it is still gone after a server restart.

### LS.3 — The reader takes a manual id
- **Status:** doing (agent: a063064ecef217f10)
- **Depends on:** LS.2
- **Files:** `src/manual/**`, `src/reader/**`, `src/App.tsx`, `scripts/**`, `DESIGN.md`,
  `src/ui/README.md`, and `src/home/LedgerRow.tsx` (its link only)
- **Do:**
  - Routes become `/read/:manualId` (the start page) and `/read/:manualId/:sectionId`. Bare
    `/read` and unknown paths go to `/`.
  - The store keeps its state per manual, so moving between manuals never mixes their sections
    or streams.
  - An unknown manual shows the existing "Couldn’t open this manual" notice.
  - The screenshot script opens the sample manual by its id.
  - A library row links to `/read/<its id>`, so opening a manual keeps working.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; the reader shots are
  pixel-identical to before; live, two different manuals open, and moving between them keeps each
  one's sections and streams separate.

### LS.4 — The landing page reads from the server
- **Status:** todo
- **Depends on:** LS.1, LS.3
- **Files:** `src/library/**`, `src/home/**`, `src/agent/**`, `DESIGN.md`, `scripts/**`
- **Do:**
  - `src/library` loads the library from the API and deletes through it. Delete the hard-coded
    seed list and everything about "last opened" (`lastOpenedAt`, `formatLastOpened`, the
    fixed "now" and the "Opened …" text). Sort by title.
  - Rows open `/read/<id>`. The librarian's canned replies and named-manual links keep working
    against the loaded library.
  - Loading and failure: follow the reader's patterns (suspend on the first load; if the server
    can't be reached, a notice in the landing page's style instead of a blank page). A failed
    delete leaves the row and says so.
  - Update DESIGN.md: the ledger row without "Opened …", the sort order, and the new loading
    and failure behaviour.
  - Screenshots: `?library=empty` still works; the changed counts and the removed "Opened …"
    are reviewed, and every other pixel stays the same.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; live, the library lists
  seven manuals with real counts, a delete survives a reload and a server restart, every manual
  opens in the reader, and the conversation's named-manual links still work.

### LS.5 — Final check
- **Status:** todo
- **Depends on:** LS.4
- **Files:** anything, for small fixes and docs: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`,
  `DESIGN.md` and the folder READMEs
- **Do:**
  - Run `npm run build`, `npm test` and `npm run shot`, and look at the screenshots.
  - Live at 1440 and 375:
    - open each of the seven manuals;
    - Claude writes one section of a manual other than the Haunt, and the library's count for
      that manual goes up;
    - delete a manual, reload, restart the server, and confirm it stays gone;
    - the empty library;
    - the server unreachable, on the landing page and in the reader.
  - Update the docs so they match the code. Read the repo as a newcomer would.
- **Done when:** all commands pass, every live check behaves as described, the docs match the
  code, and the report gives this phase's Bedrock spend from the ledger.
