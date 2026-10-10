# RTFM Reader — Work List

The orchestrator works through this file under `/loop`, starting subagents for tasks until
everything is done or a task needs a human. **This file is the source of truth for status.**
`DESIGN_RULES.md` is the source of truth for what a design must do.

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
2. **Read the full diff** against `CLAUDE.md` › Code standards and, for design work,
   `DESIGN_RULES.md`. For anything beyond a trivial change, also start a **review subagent** for
   an independent code review, then weigh its findings.
3. **Changes needed:** send specific, actionable notes to **the same agent** (`SendMessage`, so it
   keeps its context), then wait for it to report back and repeat from step 1.
4. **Approved:** mark the task `done` and commit **only that task's files**, with the message
   `<task id>: <summary>`.
5. **Three rounds without approval:** mark it `needs-human`, write down what's unresolved, and
   tell the user.

### When the orchestrator does work itself

Avoid it. If it does happen (for example, a small fix while reconciling two tasks), start a
review subagent on that change and only commit once the review passes. Keeping this file's
statuses up to date doesn't count as work.

### Adding work

When the orchestrator discovers work that should be done, it **adds a task** to the right phase:
a new ID, **Depends on**, **Files**, **Do** and **Done when**. It also updates the dependencies
of any existing task that must now wait for it.

### Rules

- **Every agent runs on Opus 5.5** (`model: "opus"`), in the background. Design agents (P1, P3)
  and design review agents (P2) run at **high** effort.
- **Only the orchestrator commits.** Agents never run git commands that change anything.
- **Agents never edit this file.** They report back, and the orchestrator updates statuses.
- Every agent prompt includes the full task block, and points to `CLAUDE.md` (code standards),
  `DESIGN_RULES.md`, and `src/shared/README.md` once it exists. It asks the agent to report back
  with the files it changed, how it checked its work, and anything left unresolved.
- Agents work in the same checkout at the same time, so they **must stay inside their task's
  Files**. Two tasks that touch the same file never run at the same time.
- While designs are being built at the same time (P1–P3), `npm run build` can fail because of
  another design's unfinished work. Gate each design task on `npm run check -- <x>` instead.

**Statuses:** `todo` · `doing` · `done` · `blocked` · `needs-human`

---

## P0 — Base

### P0.1 — Scaffold
- **Status:** done
- **Depends on:** —
- **Files:** repo root config, `package.json`, `src/App.tsx`, `src/main.tsx`,
  `src/designs/*/index.tsx` (stubs), `src/shared/types.ts`, `src/shared/fonts/**`,
  `.claude/launch.json`, `.gitignore`
- **Do:**
  - Vite + React + TypeScript (strict), React Router.
  - `src/shared/types.ts`: exactly the data model in `DESIGN_RULES.md`.
  - Install a curated Fontsource set, checking on npm that each package exists. Prefer variable
    versions. **No Inter.**
    - **Serif:** Newsreader, Literata, Source Serif 4, EB Garamond
    - **Display:** Fraunces, Instrument Serif
    - **Sans:** Instrument Sans, IBM Plex Sans, Public Sans
    - **Mono:** JetBrains Mono, IBM Plex Mono
  - `src/shared/fonts/<font>.ts`: one module per font, so importing a font registers only that font.
  - Install `three` and `@types/three` (for design C).
  - `src/App.tsx`: routes `/:design` and `/:design/:sectionId`. Each design is **lazy-loaded**
    (`React.lazy`), so a broken design can't break the others. Add a small A | B | C switcher in
    a corner that keeps the current section when you switch.
  - Stub `src/designs/{a,b,c}/index.tsx` that just render "Design X".
  - `.claude/launch.json` entry `reader` that runs the dev server, for the browser pane preview.
  - `.gitignore`: `node_modules`, `dist`, `shots/`, Playwright output, editor swap files (`*.swp`).
- **Done when:** `npm run dev` serves `/a`, `/b`, `/c`; `npm run build` passes; every listed
  font is installed and exported.

### P0.2 — Shared runtime
- **Status:** done
- **Depends on:** P0.1
- **Files:** `src/shared/**` (except `src/shared/manual/` and `types.ts`), `package.json`
- **Do:**
  - **Manual store** (in memory, resets on reload): `useManual()` returns the manual with live
    statuses. Helpers for previous/next section in reading order (chapters, then appendices) and
    for finding a section by ID.
  - **`useSection(id)`**: returns `{ section, status, text, progress }`. Opening an `unwritten`
    section starts it streaming automatically.
  - **Fake streamer:** wait ~1.2s before the first chunk (so the waiting state shows), then send
    ~20 characters every ~85ms, split at word boundaries. When it finishes, the section is
    `written`.
  - **URL options for screenshots:** `?freeze=0` holds the section in the waiting state;
    `?freeze=0.5` stops it at 50% and keeps it `writing`.
  - **`<Markdown source>`**: `react-markdown` + `remark-gfm`. Designs pass their own element
    components and class names. Links of the form `section:<id>` go to a `SectionLink` component
    that designs supply, and it receives the target section and its status.
  - **Partial-markdown repair:** while streaming, close or hold back anything incomplete (open
    `**`/`*`/`` ` ``, code fences, link syntax, half-written table rows, footnote markers), so raw
    syntax is never visible.
  - Unit tests (Vitest) for the repair function and for prev/next ordering.
  - `src/shared/README.md`: the API reference designers read. Include the hooks, the
    `<Markdown>` props, the URL options, and the fonts in `src/shared/fonts/`.
- **Done when:** tests pass; `npm run build` passes; the README covers every export.

### P0.3 — Sample manual
- **Status:** done
- **Depends on:** — (the data model is in `DESIGN_RULES.md`)
- **Files:** `src/shared/manual/**`
- **Do:**
  - Manual: *a guide to designing a haunted house that uses LLMs and robotics*: animatronics
    that improvise in character, rooms that react to guests, scares that adapt as people walk
    through. Write the `title`, `subtitle` and `voice` too. The voice should be distinctive
    (e.g., a theatrical, slightly unhinged veteran haunt builder who is also a careful engineer),
    and every section must be written in it.
  - **5 chapters and 2 appendices, about 18 sections in total.** Appendices should be truly
    back-of-the-book, e.g., a parts and sensor reference (servos, sensors, controllers) and a
    library of character prompts for the LLM-driven performers.
  - **Every section has a full body**, roughly 300–600 words of markdown. About **40% start as
    `written`**, spread across chapters; the rest start `unwritten`.
  - Across the whole manual, use **every markdown feature** listed in `DESIGN_RULES.md`. At
    least one section must use them **densely** (a table, footnotes, a code block, a checklist
    and a blockquote together). Include cross-references to both written and unwritten sections
    using `[…](section:<id>)`.
  - Store the structure in `index.ts` and each body as its own `.md` file (imported with `?raw`).
  - Export `SHOT_SECTIONS`: `{ written, dense, unwritten, appendix }`, the section IDs the
    screenshot script uses.
- **Done when:** it type-checks against `types.ts`; every markdown feature appears; every
  cross-reference target exists; the `SHOT_SECTIONS` IDs exist with the right starting statuses.
- **Note:** P0.1 creates `src/shared/types.ts` and runs at the same time. If it doesn't exist
  yet, write against the model in `DESIGN_RULES.md` and type-check once it appears.

### P0.4 — Screenshot and check scripts
- **Status:** done
- **Depends on:** P0.2, P0.3
- **Files:** `scripts/**`, `package.json`, `tsconfig.scripts.json` (if needed)
- **Do:**
  - **`npm run shot -- <a|b|c>`** (Playwright, Chromium):
    - starts its own dev server on a **separate port per design** (a = 5174, b = 5175,
      c = 5176), so agents can run it at the same time;
    - captures **1440×900 and 375×812** pages with dark color scheme;
    - saves `shots/<x>/<state>-<desktop|mobile>.png` for these states:
      - `start`: `/<x>`
      - `toc`: the written section, with `[data-shot=toc-toggle]` clicked if present
      - `written`: the written section, full page
      - `dense`: the dense section, full page
      - `waiting`: the unwritten section with `?freeze=0`
      - `streaming`: the unwritten section with `?freeze=0.5`
      - `appendix`: the appendix section
    - also saves `start` and `streaming` at desktop size with `reducedMotion: "reduce"`;
    - waits for fonts to load before each capture.
  - **`npm run check -- <x>`**: type-checks only `src/shared` plus `src/designs/<x>`, so one
    design's half-finished code can't fail another design's check.
  - Install the Playwright Chromium browser.
  - Hide the dev design switcher (`[data-shot=design-switcher]`) in every capture.
  - Make sure `scripts/` is covered by a tsconfig, so the scripts are type-checked too.
- **Done when:** both commands work against the stub design `a`, and the screenshots exist.

### P0.5 — Reference screenshots
- **Status:** done
- **Depends on:** P0.4
- **Files:** `docs/inspo/**`, `scripts/inspo.ts`
- **Do:**
  - Capture these public pages at 1440×900 (and also 375×812 where marked) into
    `docs/inspo/<x>/`:
    - **a:**
      - https://linear.app/docs/conceptual-model (both sizes)
      - https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html
      - https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
    - **b:**
      - https://practicaltypography.com/line-length.html
      - https://press.stripe.com (wait about 4s for the 3D books)
      - https://press.stripe.com/poor-charlies-almanack
      - https://gwern.net/design
      - https://edwardtufte.github.io/tufte-css/
    - **c:**
      - https://press.stripe.com
      - plus copies of the Claude.ai streaming screenshots from the research session:
        - `/Users/jordan/.claude/projects/-Users-jordan-projects-rtfm/a1ba449f-d2ce-487d-84ed-d97e04d01576/tool-results/mcp-Claude_Browser-blob-1791650977475-2ye8w3.jpg`
        - `/Users/jordan/.claude/projects/-Users-jordan-projects-rtfm/a1ba449f-d2ce-487d-84ed-d97e04d01576/tool-results/mcp-Claude_Browser-blob-1791650977475-6a94ac.jpg`
        - `/Users/jordan/.claude/projects/-Users-jordan-projects-rtfm/a1ba449f-d2ce-487d-84ed-d97e04d01576/tool-results/mcp-Claude_Browser-blob-1791650985842-b34029.jpg`
  - Decline cookie banners, or close them before capturing. Never sign in anywhere.
  - Write `docs/inspo/README.md`: one line per image saying what to look at.
- **Done when:** every listed image exists and is non-empty (spot-check that none show a cookie
  wall or an error page); the README is written.

### P0.6 — Base check
- **Status:** done
- **Depends on:** P0.1–P0.5
- **Files:** `src/shared/**`, `scripts/**`, root config, root `README.md`
- **Do:**
  - Run `npm run build`, `npm test` and `npm run shot -- a`, and fix anything that fails.
  - Make sure `types.ts`, the sample manual and `src/shared/README.md` all agree.
  - Read the whole base as a newcomer would, and simplify anything that doesn't meet
    `CLAUDE.md` › Code standards. This is the foundation all three designs build on.
- **Done when:** all three commands pass; the README matches the code; nothing is left that a
  newcomer would trip over.

---

## P1 — Build (A, B and C run at the same time)

Design agent brief: the full **direction** for your letter in `DESIGN_RULES.md`, the reference
images in `docs/inspo/<x>/`, and `src/shared/README.md`.

Screenshot caveats to include in every design agent's brief:
- Screenshots are taken with animations disabled, so they show end states. Check motion live in
  the browser.
- That only stops CSS animations. A WebGL scene that keeps animating will look different in every
  screenshot. Under reduced motion it must render a still frame, which also makes the
  `-reduced` screenshots stable.
- In full-page captures, fixed and `100vh` elements appear once, at the top. That's a capture
  limit, not a layout bug. A design that scrolls an inner container instead of the page will be
  cut off at the viewport, so let the page itself scroll.

### P1.A.spec · P1.B.spec · P1.C.spec — Design spec
- **Status:** A: done · B: done · C: done
- **Depends on:** P0.6
- **Files:** `src/designs/<x>/SPEC.md`
- **Do:** write the SPEC described in `DESIGN_RULES.md` › Craft requirements. Name the specific
  traits taken from each reference image. Describe the signature moment and its reduced-motion
  fallback. **No code.**
- **Done when:** the SPEC covers every item in the Craft requirements list, and passes review:
  nothing breaks a locked rule or the banned list, and nothing is generic (default-looking fonts,
  a palette with no point of view, or a signature moment that decorates rather than serves
  reading).

### P1.A.build · P1.B.build · P1.C.build — Build the design
- **Status:** A: done · B: done · C: done
- **Depends on:** the matching P1.x.spec
- **Files:** `src/designs/<x>/**`
- **Do:**
  - Build the reader to the approved SPEC.
  - Run **at least 3** passes of `npm run shot -- <x>` → look at every screenshot → critique
    against `DESIGN_RULES.md` → fix. Log each pass in `NOTES.md`: what you saw, what you changed.
  - Before reporting, step through streaming live once at normal speed and check the "nothing
    moves" and "never auto-scrolls" rules.
- **Done when:** `npm run check -- <x>` passes; all screenshot states render; `NOTES.md` logs
  3 or more passes; no files are changed outside `src/designs/<x>/`.

### P1.shot — Full-page streaming screenshot
- **Status:** done
- **Depends on:** — (start when an agent slot is free)
- **Files:** `scripts/shot.ts`
- **Do:** add a `streaming-full` state: the unwritten section with `?freeze=0.5`, captured full
  page at desktop and mobile. The `streaming` viewport capture can't show the live edge, because
  at 50% it is below the fold and designs must not scroll to it.
- **Done when:** `npm run shot -- a` saves the two new files with no errors, and the live edge
  is visible in them.

---

## P2 — Review (fresh agents, not the builders)

### P2.A.review · P2.B.review · P2.C.review
- **Status:** A: done · B: done · C: done
- **Depends on:** the matching P1.x.build, and P1.shot
- **Agent:** a new agent, never the one that built the design
- **Files:** `src/designs/<x>/REVIEW.md` (the only file it may write)
- **Do:**
  - Run `npm run shot -- <x>` and also try the reader live in the browser.
  - Check **every locked rule** (pass/fail, with evidence) and the **banned list**.
  - Score 1–5, with one line of evidence each, for: hierarchy, spacing consistency, reading
    comfort, state clarity, streaming feel, phone layout, signature moment, and
    "would a professional ship this". Judge the desktop layout first. Flag anything that looks
    simplified on desktop just to suit the phone layout.
  - Compare against `docs/inspo/<x>/`: what the references do better.
  - End with a **prioritized fix list**: every rule failure first, then at most 8 quality fixes.
    Each fix must be specific (what, where, and to what).
- **Done when:** `REVIEW.md` covers every locked rule and has the scores and the fix list.

---

## P3 — Fix (one round only)

### P3.A.fix · P3.B.fix · P3.C.fix
- **Status:** A: done · B: done · C: done
- **Depends on:** the matching P2.x.review
- **Agent:** the builder from P1.x.build if it's still available (`SendMessage`); otherwise a new
  agent given the same brief
- **Files:** `src/designs/<x>/**` (except `REVIEW.md`)
- **Do:**
  - Fix every rule failure, then as many quality fixes as possible.
  - Use the same screenshot → critique loop and log it in `NOTES.md`.
  - Append a "Response to review" section to `NOTES.md`: each fix marked done or skipped, with a
    reason.
- **Done when:** `npm run check -- <x>` passes; no rule failures remain; every fix list item is
  accounted for.

### P3.switcher — Move the dev design switcher
- **Status:** done
- **Depends on:** —
- **Files:** `src/App.tsx`
- **Do:** move the A | B | C switcher so it never covers a design's controls at any width, and
  make it unreachable by Tab while a design's modal drawer or sheet is open.
- **Done when:** checked live against all three designs at 1440, 1024 and 375.

---

## P4 — Hand-off

### P4.1 — Comparison
- **Status:** doing (agent: a3dc879b588bab46d)
- **Depends on:** P3.A.fix, P3.B.fix, P3.C.fix, P3.switcher
- **Files:** `docs/comparison/**`, `docs/COMPARISON.md`
- **Do:**
  - Run `npm run build` and `npm run shot` for all three designs, then copy the screenshots to
    `docs/comparison/<x>/`.
  - Write `docs/COMPARISON.md`: the same states side by side, one paragraph per design
    (strengths and weaknesses), what each signature technique was worth, and ideas worth
    combining in a round 2.
- **Done when:** the build passes and the comparison is complete.
- **After approval:** the orchestrator commits, opens the app in the browser pane, sets this task
  to `needs-human`, and stops the loop. The user picks the winner.
