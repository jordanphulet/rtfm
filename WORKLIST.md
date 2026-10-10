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

## Adopt library variant A

Library variant A ("The prompt corner": the agent docked beside the library) won the
comparison. This phase makes it the landing page and removes the prototype scaffolding.
**Cleanup only:** no new features and no design changes. The one exception is removing the
duplicated code the review flagged for after a winner was chosen (AL.3). The library rules and
the comparison live at the `library-comparison` tag.

### AL.1 — Tag the comparison
- **Status:** done
- **Owner:** orchestrator (a git operation)
- **Depends on:** —
- **Do:** tag commit `55bda41` (all three library variants plus their comparison) as
  `library-comparison`.
- **Done when:** `git tag` lists `library-comparison` pointing at `55bda41`.

### AL.2 — Promote A to the landing page
- **Status:** doing (agent: a31d1f9ed43d22cbb)
- **Depends on:** AL.1
- **Files:** `src/**` (except `src/ui/`, `src/manual/`, `src/library/` and `src/agent/`, whose
  READMEs AL.5 updates), `DESIGN.md`
- **Do:**
  - Move `src/library-prototypes/a/` to `src/home/` (the landing page), and delete
    `src/library-prototypes/`.
  - Delete A's `NOTES.md` and `REVIEW.md`. Append A's `SPEC.md` unchanged to the end of
    `DESIGN.md` under a "Library page (draft)" heading (AL.5 rewrites it).
  - Rename everything that still says "variant A" or "prototype" (`library-a` class names and
    keyframe prefixes, component names) so the code reads as *the* landing page.
  - Simplify `src/App.tsx`: remove the `/library/*` routes, the switcher and the per-variant
    error boundary. Routes become `/` (the landing page, lazy-loaded), `/read` and
    `/read/:sectionId`, and anything unknown redirects to `/`.
  - Keep the `data-shot` hooks the screenshot script uses.
- **Done when:**
  - `npm run build` and `npm test` pass;
  - `/` renders the landing page and opening a manual still goes to `/read`;
  - nothing in `src/` refers to variants, prototypes or `/library/`;
  - the landing page looks exactly as variant A did (compare against `shots/library/a/`).

### AL.3 — Share what the reader and the landing page duplicate
- **Status:** todo
- **Depends on:** AL.2
- **Files:** `src/ui/**`, `src/reader/**`, `src/home/**`
- **Do:** move the pieces both the reader and the landing page now carry their own copies of into
  `src/ui/`, with each using the shared one:
  - the write head (bar, lamp, geometry, motion and its reduced-motion behaviour);
  - stick-to-bottom scrolling;
  - `useMediaQuery`;
  - anything else the code review finds duplicated.

  Update `src/ui/README.md` to match.
- **Done when:**
  - `npm run build` and `npm test` pass;
  - the reader's screenshots and the landing page's screenshots are unchanged;
  - no copy remains.

### AL.3b — Keep a named manual's link stable after a delete
- **Status:** todo
- **Depends on:** AL.3 (same files)
- **Files:** `src/home/**`
- **Do:**
  - Today a message's "In your library" link is worked out again from the current library on
    every render. After the named manual is deleted, the link can switch to a different
    manual.
  - Decide which manual a message names once, when it's sent (or when a demo conversation
    loads), and keep that.
  - If that manual is later deleted, show the title as plain text with "no longer in your
    library" instead of a link. The row mark already disappears with the row.
  - Add a test.
- **Done when:**
  - Live: delete *The Haunt That Listens* after "Open the one about haunted houses", and the
    earlier turn shows "The Haunt That Listens — no longer in your library", never another
    manual.
  - `npm test`, the type check and the screenshots pass.

### AL.4 — Remove the prototype tooling
- **Status:** todo
- **Depends on:** AL.2
- **Files:** `package.json`, `scripts/**`, `docs/**`, `.gitignore`
- **Do:**
  - Delete `scripts/shot-library.ts`, `scripts/check-library.ts`, `scripts/library-variant.ts`
    and their npm scripts.
  - Extend `npm run shot` so one run captures the reader into `shots/reader/` and the landing
    page's scenarios into `shots/home/`, keeping every state the library script had.
  - Delete `docs/LIBRARY_COMPARISON.md` and `docs/library-comparison/`. Delete `docs/` if it's
    then empty.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass, and no unused dependency or
  script remains.

### AL.5 — One design doc, updated docs
- **Status:** todo
- **Depends on:** AL.3b, AL.4
- **Files:** `DESIGN.md`, `README.md`, `CLAUDE.md`, `src/ui/README.md`, `src/manual/README.md`,
  `src/library/README.md`, `src/agent/README.md`
- **Do:**
  - Turn `DESIGN.md` into the design doc for the whole product: the reader and the landing page.
  - Fold in the library rules that still apply. Take them from WORKLIST.md at the
    `library-comparison` tag, phrased for the one landing page (drop the variant, prototype and
    screenshot-process rules).
  - Rewrite the "Library page (draft)" section from A's spec, checked against the code, and
    update the build structure.
  - Update the README files and CLAUDE.md for the landing page at `/`. Remove references to
    variants, prototypes, the switcher, `/library/<x>`, `shot:library` and `check:library`.
- **Done when:** the docs match the code and each other; nothing refers to variants, prototypes,
  the comparison or deleted files.

### AL.6 — Final check
- **Status:** todo
- **Depends on:** AL.5
- **Files:** anything, for small fixes only
- **Do:**
  - Run `npm run build`, `npm test` and `npm run shot`, and look at the screenshots.
  - Compare the landing page and reader shots against the `library-comparison` tag.
  - Live, at 1440 and 375:
    - stream a reply;
    - scroll up during a reply;
    - delete a manual;
    - open a manual from `/` and come back.
  - Grep the repo for leftovers: `library-prototypes`, `library-a`, `variant`, `prototype`,
    `/library/`, `shot:library`, `check:library`, `LIBRARY_COMPARISON`, `switcher`.
  - Read the repo as a newcomer would.
- **Done when:** all commands pass, the greps come back clean, and the landing page and reader
  look and behave as they did at `library-comparison`.
