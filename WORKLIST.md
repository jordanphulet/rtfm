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

## Adopt design A

Design A (the show-control desk) won the comparison. This phase turns the three-design comparison
into a single reader. **Cleanup only:** no new features and no design changes.

### CL.1 — Tag the comparison
- **Status:** done
- **Owner:** orchestrator (a git operation)
- **Depends on:** —
- **Do:** tag commit `438fd36` (all three designs plus the comparison) as `design-comparison`,
  so the other designs can be checked out later.
- **Done when:** `git tag` lists `design-comparison` pointing at `438fd36`.

### CL.2 — Promote A to the reader
- **Status:** done
- **Depends on:** CL.1
- **Files:** `src/**`, `DESIGN.md`
- **Do:**
  - Move design A from `src/designs/a/` to `src/reader/`, and delete `src/designs/`.
  - Delete A's `NOTES.md` and `REVIEW.md`. Move A's `SPEC.md` unchanged to `DESIGN.md` at the
    repo root (CL.4 rewrites it).
  - Rename `src/shared/` to `src/manual/` (the manual's data, store, streaming and markdown),
    and update every import. Leave the paths written inside its README for CL.4 to fix.
  - Rename everything that still says "design A" (`design-a` class names, `Design` component
    names, the `/a` paths) so the code reads as *the* reader.
  - Simplify `src/App.tsx`: remove the design switcher, the per-design lazy loading and the
    per-design error boundary. Routes become `/read` (the start page) and `/read/:sectionId`, and
    `/` redirects to `/read`. `/` is kept free for the library, which will become the landing
    page.
- **Done when:** `npm run build` and `npm test` pass; `/read` and a section page render; nothing
  in `src/` refers to designs A, B or C.

### CL.3 — Remove comparison tooling and unused packages
- **Status:** done
- **Depends on:** CL.2
- **Files:** `package.json`, `package-lock.json`, `scripts/**`, `tsconfig*.json`,
  `src/manual/fonts/**`, `docs/**`, `.claude/launch.json`, `.gitignore`
- **Do:**
  - Uninstall `three`, `@types/three`, and every font package the reader doesn't use. Delete
    their modules in `src/manual/fonts/`.
  - Delete `scripts/check.ts`, `scripts/design-arg.ts`, `scripts/inspo.ts` and the `check`
    script.
  - Delete `docs/inspo/`, `docs/comparison/` and `docs/COMPARISON.md`.
  - Simplify `npm run shot`: no design argument, one port, output to `shots/`. Keep every state.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; no unused dependency
  remains (check package.json against actual imports).

### CL.4 — One design doc, updated docs
- **Status:** done
- **Depends on:** CL.3
- **Files:** `DESIGN.md`, `DESIGN_RULES.md`, `README.md`, `CLAUDE.md`, `src/manual/README.md`
- **Do:**
  - Merge `DESIGN_RULES.md` into `DESIGN.md` to make one design doc for the reader:
    - what the reader is;
    - the data model;
    - the locked reader behavior;
    - desktop first, phone too;
    - the craft requirements and banned list;
    - then A's concept, tokens, layout, section states, streaming, markdown styling and build
      structure.
  - Drop everything about three competing designs, directions B and C, screenshot-pass process
    and per-design rules. Delete `DESIGN_RULES.md`.
  - Update `README.md`, `CLAUDE.md` and `src/manual/README.md` for one reader. Fix paths, scripts,
    fonts and wording, and remove references to designs, the switcher, `check` and the inspo
    screenshots.
- **Done when:** the docs match the code and each other; nothing refers to designs A, B or C, the
  comparison, or deleted files.

### CL.5 — Final check
- **Status:** done
- **Depends on:** CL.4
- **Files:** anything, for small fixes only
- **Do:**
  - Run `npm run build`, `npm test` and `npm run shot`, and look at the screenshots.
  - Stream an unwritten section live at 1440 and 375, and confirm the locked behavior still holds.
  - Grep the repo for leftovers: `design-a`, `designs/`, `three`, `inspo`, `COMPARISON`,
    `DESIGN_RULES`, `switcher`, `check --`.
  - Read the repo as a newcomer would, and fix anything that still describes the comparison.
- **Done when:** all commands pass, the greps come back clean, and the reader looks and behaves
  as it did at `design-comparison`.

---

## Library prototypes

A landing page where you choose a manual to read, manage your manuals, or start a new one. Its
primary interface is an agent you talk to ("let's create a new manual", "delete the manual about
birthday parties"). As with the reader, three variants are built and compared, then one is chosen.
**The visual style is fixed** (the reader's design system). The variants differ in **interaction
model**.

### Library rules

**Locked**
- **Visual system:** use only the shared design system from LB.1: dark only, the reader's tokens,
  type and components. The banned list and craft requirements in `DESIGN.md` apply. Desktop
  first, phone too (375px to 1440px+).
- **Agent first:**
  - The agent's input is the most prominent control, and it is always one click, tap or
    keystroke away. A keyboard shortcut focuses it.
  - Every action can also be done directly:
    - open a manual (click it);
    - delete a manual, with confirmation;
    - start a new manual, which opens the agent with a starter prompt (creating a manual is out of
      scope).
- **The agent is simulated:**
  - You type and send.
  - A visible "thinking" state appears before the first words.
  - The reply streams in as markdown.
  - Replies are canned and **do nothing**: no actions, no changes to the library.
  - The conversation stays while you're on the page.
  - If you've scrolled up in the conversation, a new reply never pulls you back down.
- **The library:**
  - Each manual shows its title, subtitle, progress (n of m sections written) and when it was last
    opened.
  - Deleting directly removes the manual from the list (in memory; reload restores it).
  - There is an empty state for when every manual is deleted.
  - Opening any manual goes to the reader. The reader always shows the sample manual for now.
- **Boundaries:**
  - Each variant lives in `src/library-prototypes/<a|b|c>/`.
  - Variants use only `src/ui`, `src/library` and `src/agent`. They add no packages.
  - Each variant is reached at `/library/<a|b|c>`.
- **Scenarios every variant must handle** (these are also the screenshot states):
  1. first visit: an empty conversation, the full library;
  2. typing a message;
  3. the agent thinking;
  4. a reply mid-stream;
  5. a conversation several turns long;
  6. a delete confirmation (direct);
  7. a request the agent can't handle (fallback reply);
  8. the empty library;
  9. phone.

**Open:** where the conversation lives, how replies are presented, how the library is laid out
(list, grid, shelf), how the agent and the direct controls relate, and motion.

**The three directions**
- **A — Agent beside the library:** the library fills the page, and the agent sits in a docked
  panel (like the reader's right column). Familiar, in the spirit of Claude Projects or Cursor.
- **B — Command line first:** one prompt bar at the top of the library, like a stage manager's
  cue line. Replies appear briefly under it, and the library stays in view. In the spirit of
  Raycast or Linear's command menu.
- **C — The conversation is the page:** a full-width conversation, with the library, confirmations
  and suggestions shown as interactive cards inside it. The most agent-first of the three.

### LB.1 — Extract the design system
- **Status:** done
- **Depends on:** CL.5
- **Files:** `src/ui/**`, `src/reader/**`, `DESIGN.md`
- **Do:**
  - Move the reader's tokens, base type and focus styles, and the components that aren't specific
    to the reader (state ring, buttons, links, sheet, scroll hints) into `src/ui/`.
  - The reader imports them from there.
  - Add a small `ReplyMarkdown` component to `src/ui/` for short markdown (paragraphs, bold and
    italic, lists, inline code, links), styled with the reader's prose tokens. The library
    variants render the agent's replies with it, so replies look the same in every variant.
  - Write `src/ui/README.md`: the tokens, and each component with its props.
  - Update the build structure in `DESIGN.md`.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; the reader screenshots look
  identical to before; nothing reader-specific is in `src/ui/`.

### LB.2 — Library data and a scripted agent
- **Status:** done
- **Depends on:** CL.3 (its folders are new, so it doesn't need to wait for the docs)
- **Files:** `src/library/**`, `src/agent/**`, `package.json` (scripts only)
- **Do:**
  - **`src/library/`:**
    - About 7 seed manuals with varied titles, subtitles, sizes, progress and last-opened times.
      Include *The Haunt That Listens* and a manual about birthday parties.
    - An in-memory store: `useLibrary()` lists the manuals; `deleteManual(id)` removes one.
  - **`src/agent/`:**
    - `useAgent()` returns `{ messages, status, send }`.
    - After a ~600ms thinking state, the reply streams in using the same pacing as the reader's
      fake streamer.
    - Canned replies by keyword: create or new, delete or remove, open or read, list (what do I
      have), and help. Anything else gets a polite fallback ("I can't do that yet…").
    - Replies are markdown and change nothing.
  - URL options for screenshots:
    - `?conversation=demo` preloads a several-turn conversation;
    - `?agentFreeze=thinking` holds the next reply in its thinking state;
    - `?agentFreeze=0.5` holds the next reply half-streamed;
    - `?library=empty` starts with no manuals.
  - Tests, and a README for each folder.
- **Done when:** tests pass; the READMEs cover every export and URL option.

### LB.3 — Prototype scaffold and screenshots
- **Status:** done
- **Depends on:** LB.1, LB.2
- **Files:** `src/App.tsx`, `src/library-prototypes/**` (stubs and README), `scripts/**`, `package.json`, `README.md` (scripts table)
- **Do:**
  - Add routes `/library/<a|b|c>`. Load each variant lazily, behind its own error boundary. Load
    the reader lazily too, so the build splits into chunks again (it currently warns about one
    501 kB chunk).
  - Add a small dev switcher, like the one in the comparison (see the `design-comparison` tag). It
    stays clear of each variant's controls, and goes inert while a modal is open.
  - Add `npm run shot:library -- <x>`, which captures every scenario at desktop and phone size
    using the URL options, on a separate port per variant. Add `npm run check:library -- <x>`,
    which type-checks one variant in isolation.
- **Done when:** both commands work against a stub variant.

### LB.2b — Typography in the library and agent data
- **Status:** todo (start when an agent slot is free)
- **Depends on:** LB.2
- **Files:** `src/library/**`, `src/agent/**`
- **Do:**
  - Use curly apostrophes and quotes, real dashes and ellipses in every seed manual, canned reply
    and demo message. DESIGN.md's typographic detail requires them.
  - Make keyword matching accept both ’ and ' in what the user types.
  - Keep `npm run shot:library`'s fallback wait working: it reads the reply text from
    `replyTo()`.
- **Done when:** `grep` finds no straight apostrophes or quotes in user-facing strings in
  `src/library` and `src/agent`; tests pass, including one with a typed curly apostrophe.

### LB.4 — Specs (A, B and C at the same time)
- **Status:** A: done · B: done · C: done (approved with notes, folded in during the build)
- **Depends on:** LB.3
- **Files:** `src/library-prototypes/<x>/SPEC.md`
- **Do:**
  - Design the variant within the library rules and its direction.
  - Cover:
    - its layout at 1440 and 375;
    - where the conversation lives;
    - how replies, the thinking state and streaming look;
    - how the library is presented;
    - the direct controls, including the delete confirmation;
    - the empty state;
    - the fallback reply;
    - keyboard use, including the focus shortcut;
    - motion, and the reduced-motion fallback.
  - Name what you take from the shared design system, and anything new you need from it.
  - **No code.**
- **Done when:** the spec covers every locked rule and scenario, and passes a joint review of all
  three: each is distinct in interaction model, none is generic, and each is consistent with the
  reader's design system.

### LB.5 — Build (the same agent as the spec)
- **Status:** A: doing (agent: a1468a1e11d5d0641) · B: doing (agent: ab6678b62487b6c90) · C: doing (agent: aa7b0b3a8a8e1b691)
- **Depends on:** the matching LB.4
- **Files:** `src/library-prototypes/<x>/**`
- **Do:**
  - Build the variant to its approved spec.
  - Do at least 3 passes of screenshot → critique → fix, logged in `NOTES.md`.
  - Check the conversation live: thinking, then streaming, then scrolling up during a reply.
- **Done when:** `npm run check:library -- <x>` passes; every scenario screenshot renders; it
  passes a code review.

### LB.6 — Design review (a new agent)
- **Status:** A: todo · B: todo · C: todo
- **Depends on:** the matching LB.5
- **Files:** `src/library-prototypes/<x>/REVIEW.md`
- **Do:**
  - Check every locked rule (pass or fail, with evidence).
  - Score 1–5 on:
    - hierarchy;
    - agent prominence;
    - how easy direct controls are to find;
    - conversation feel;
    - library scanability;
    - phone layout;
    - consistency with the reader;
    - "would a professional ship this".
  - Write a prioritized fix list.
- **Done when:** `REVIEW.md` covers every rule and has the scores and the fix list.

### LB.7 — Fix (one round, by the builder)
- **Status:** A: todo · B: todo · C: todo
- **Depends on:** the matching LB.6
- **Files:** `src/library-prototypes/<x>/**` (except `REVIEW.md`)
- **Do:** fix every rule failure and as many quality items as possible. Log a "Response to
  review" section in `NOTES.md`.
- **Done when:** `npm run check:library -- <x>` passes, and the fixes pass a code review.

### LB.8 — Comparison
- **Status:** todo
- **Depends on:** LB.7 (all three)
- **Files:** `docs/LIBRARY_COMPARISON.md`, `docs/library-comparison/**`
- **Do:** write a side-by-side comparison of every scenario, a paragraph per variant, a
  recommendation, and ideas to combine.
- **After approval:** the orchestrator commits, opens `/library/a` in the browser pane, sets this
  task to `needs-human`, and stops the loop. The user picks a winner.
