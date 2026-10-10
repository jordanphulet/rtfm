# Library B — design review (LB.6.B)

Reviewer: an independent agent that did not build B. Method:

- I read `WORKLIST.md` (Library prototypes), `DESIGN.md`, `SPEC.md`, `NOTES.md` and every file in `b/`.
- I looked at all 16 shots in `shots/library/b/`, produced fresh by `npm run shot:library -- b` (16 of 16, no errors).
- I compared them with `shots/reader/start-desktop.png`.
- I drove my own dev server (port 5198) with Playwright: 1440, 1280, 1024, 900, 768 and 375 wide; dark scheme; once with reduced motion.
- I computed contrast from the token values in `src/ui/tokens.css`.

## Verdict

At rest, B is the calmest and most "same product" of the library ideas. It reads like the reader's start page with a command line on top, and the write head carried over from the reader is a real signature. When the panel is open, though, the execution is unfinished:

- the panel's bottom edge slices through library rows;
- the delete confirmation half-covers the bar;
- at tablet widths the write head is clipped away.

All three can be fixed without touching the concept.

## Scores (1–5)

| Criterion | Score | Why |
| --- | --- | --- |
| Hierarchy | **4** | At rest it is exemplary: bar → `Library` → titles → quiet meta columns (`first-visit-desktop.png`). It drops while the panel is open: the panel ends mid-row and leaves orphaned subtitles, meters and the head rule poking out under it (`streaming-desktop.png`, `fallback-desktop.png`, `thinking-desktop.png`). |
| Agent prominence | **5** | The only raised, bordered box, with the largest interactive text (20px). It is autofocused with the cue ring on desktop, first in Tab order, sticky at every width, and `/` reaches it. It is the loudest thing on the page without shouting. |
| Direct controls easy to find | **4** | Delete is always visible on every row. The whole row is the link, with a clear hover (`--ground-hover` plus a cue title). `Start a new manual` sits where you'd look, top right of the list. But while the panel is open at 1440, it covers `Library`, the meta and `Start a new manual` (the panel ends at y 236–404; the button is at y 186). Light dismiss also turns "click away" into "open a manual" (see fix 5). |
| Conversation feel | **3** | The parts are well made: the thinking line with the breathing ring, the write head and lamp, the settle, and `Latest ↓`. As a conversation it is weak, for four reasons. Each send folds away the answer you are following up on. Your words and the reply differ only by 500 against 400 weight, at the same size and almost the same colour. `Thinking…` / `Replying…` shows twice, 56px apart. At 1440 the right 47% of the panel is empty raised ground (`conversation-desktop.png`). |
| Library scanability | **4** | Reader-consistent rows: 17/28 titles, 14/20 subtitles, tabular micro-mono columns that line up, and a flat 2px meter. All 7 manuals fit at 1440×900. Two small costs: `Opened` repeats on every row, and three columns of identical faint mono make the right half one grey texture. |
| Phone layout | **3** | Sticky top bar, inline meta rows and 44px targets are good (`first-visit-phone.png`). The open states are rough. The panel's bottom edge cuts titles in half (`thinking-phone.png`, `streaming-phone.png`, `fallback-phone.png`). The bar squares its bottom corners as if attached, but the panel starts 8px lower (measured: bar bottom 52, panel top 60; see fix 4). The first send pushes the library down 32px (`Library` at y 84 → 116). |
| Consistency with the reader | **4** | Same tokens, type, row language, glyph vocabulary (`›`, `↑ ↓`, CSS chevron) and hairline jobs. The write head is the reader's. No banned patterns (checked below). The new pieces (keycap, tint-filled button, bar) are built from tokens. The one off-system moment is the confirmation's text, which sits 23px off the page's text edge (x 177 vs 200). |
| Would a professional ship this? | **3** | The resting page, empty state and keyboard model: yes. The panel-open and confirmation states: not yet. They read as layering bugs rather than intent, and those are the screenshots the user will judge. Fixes 1–4 would raise this to a 4. |

## Locked rules

| Rule | Result | Evidence |
| --- | --- | --- |
| Visual system: only the shared system, dark only, reader tokens, type and components | **Pass** | Every colour, type size, space, radius and timing in `b/*.css` is a `var(--…)`. A grep finds no hex, rgb, ms or cubic-bezier outside `src/ui`. `tokens.css` holds sizes only. The only colour expression is `color-mix(var(--ground) 72%)` for the scrim. Fonts are Plex Sans and Plex Mono only. |
| Banned list | **Pass** | No gradient, shadow, blur, glow, emoji, pills, uppercase, or blue or purple anywhere (grep). Boxes have jobs: bar, panel, dialog, keycap. Text is left-aligned. No hero: `Library` is 24px over dense content. |
| Craft requirements | **Pass** | Tabular numerals in the meta, counts and cue numbers. Real ’ … — “ ” (`Let’s start…`, `Delete “The Haunt That Listens”?`). `balance` on titles, `pretty` on static text, plain wrapping on replies. Transitions use `--dur-quick` and `--dur-base`. Every control has hover and focus. **Minor:** the doc is 926px tall at 1440×900, so the page scrolls 26px, though the spec says it doesn't. |
| Contrast (WCAG AA) | **Pass** | Computed: `--ink-faint` on ground 5.91, on raised 5.31, on hover 5.18 (lowest real text pair). `--ink-muted` on raised 7.97. `--cue` on raised 7.76, on tint 6.97. `--ink` on raised 11.53. Non-text: the panel's fill against the page is only **1.11:1**, and its `--rule-strong` border **1.78:1**. That is why the panel edge is weak (fix 1). |
| 375 to 1440+, no horizontal scroll | **Pass** | `scrollWidth − clientWidth` = 0 at 375, 768, 900, 1024, 1280, 1440 and 1920, with and without a conversation or a stream. |
| Agent input is the most prominent control | **Pass** | See Agent prominence above. |
| Always one click, tap or keystroke away | **Pass** | The band is `position: sticky` at every width. Scrolled at 1024×768, the bar stays at y 16 with the stuck rule (`w1024-scrolled`). |
| A keyboard shortcut focuses it | **Pass** | With focus on `body`, `/` focuses the input and isn't typed (value stays `""`). `aria-keyshortcuts="/"`. **Note:** the `/` keycap only shows while the bar is unfocused, and the bar autofocuses, so a first-time visitor never sees the hint. |
| Open a manual directly | **Pass** | A row click goes to `/read`. Enter on the focused title too. |
| Delete directly, with confirmation | **Pass** | Keyboard: Delete on a focused title opens the `alertdialog`. Focus goes to **Keep it** with a visible ring (`delete-kb`), `.page` is `inert`, `html` gets `overflow: hidden`, Tab cycles Keep it ↔ Delete manual, and Esc returns focus to the title. Delete manual moves focus to the next title (`Negotiating With Geese`) and the meta updates to `6 manuals · 44 of 103`. Mouse: focus starts on Keep it, and a scrim click returns focus to that row's Delete. Deleting the last row moves focus to the previous title, and deleting everything moves it to `Start a new manual ›`. |
| Start a new manual opens the agent with a starter prompt | **Pass** | The bar fills with exactly `Let’s start a new manual about `, caret at the end. The readout says `Finish the sentence, then press Enter`. It opens the panel when there's a conversation. Same from the empty state. |
| Simulated agent: type and send | **Pass** | Enter sends. Focus stays in the bar and the draft clears. |
| Visible thinking state before the first words | **Pass** | Thinking from 1ms to 611ms: ring, `Thinking…` in cue, and the write head (`live-thinking`, `thinking-*.png`). |
| Streams in as markdown | **Pass** | The list and bold render mid-stream with no raw syntax (`streaming-desktop.png`, `help-stream`). **But** at 768–1023px the write head on the live block is clipped and never visible (fix 2). |
| Replies are canned and do nothing | **Pass** | `CueLine` only calls `useAgent().send`. Nothing in the conversation path imports `deleteManual` (only `index.tsx` does, for the direct delete). |
| The conversation stays | **Pass** | Never cleared and never on a timer. Esc, Hide and click-away only fold it; `N exchanges · Show ↓` brings it back. |
| Scrolled up → a new reply never pulls you down | **Pass** | At 1280×500, I scrolled up mid-reply: `scrollTop` stayed 0 while `scrollHeight` grew 308 → 400, and `Latest ↓` appeared. Clicking it scrolled to 141 of 141, the bottom. |
| Each manual shows title, subtitle, progress and last opened | **Pass** | At every width. Below 1024 they become an inline meter plus `7 of 18 written · Opened today`. |
| Deleting removes the manual in memory | **Pass** | The row collapses, then `deleteManual`. The store is in memory, so a reload restores it. |
| Empty state | **Pass** | `No manuals yet`, a line, and `Start a new manual ›` in the reader's "Begin at" style. The placeholder and suggestions switch (`empty-*.png`). |
| Opening any manual goes to the reader | **Pass** | `/read`. |
| Boundaries | **Pass** | Everything is in `b/`. Imports are only `../../ui`, `../../library`, `../../agent`, React and React Router (grep). `/library/b` works. |
| Scenarios 1–9 | **Pass** | All 16 shots render. Their quality is covered under the fixes. |

**Rule failures: none.** Fixes 1–4 are spec and craft failures (the spec promises a write head at every width and a confirmation over the cue line), not locked-rule failures.

## Prioritized fix list

### 1. Give the open panel a clean edge against the library (highest impact)

**Problem.** The panel is an overlay whose height follows the content, so its bottom edge lands anywhere and slices rows:

- the Haunt row's subtitle and meter fragment hang under it (`streaming-desktop.png`, y 304–335);
- the title kisses the panel's border with about 2px clear (`fallback-desktop.png`, panel bottom 284, title 291);
- the head rule pokes out as an orphan line (`thinking-desktop.png`, y 252);
- on phone, titles are cut in half.

The panel's fill is 1.11:1 against the page and its border 1.78:1, so the eye doesn't separate the two layers. It looks like a rendering bug, not a deliberate overlay. This is the first thing the user will notice in four of the nine scenarios.

**Fix**, staying flat and keeping the trade-off:

- Surround the open panel with a solid `--ground` mat: `outline: var(--space-4) solid var(--ground)` outside the `--rule-strong` border (sides and bottom; not a shadow). This leaves a clean 16px of ground between the panel and whatever it cuts.
- Also lower the opacity of `.shelf` while the panel is open (for example to 0.5 over `--dur-base`, instant under reduced motion). The cut rows then read as background, not as broken content. The rows stay visible and clickable.
- On phone, apply the same mat on the bottom edge.

### 2. Restore the write head at 768–1023px

At these widths `--hang` is 0 (`tokens.css:27`), so `--panel-inset` is 16px (`conversation.css:2`). The write head sits `--write-head-offset` (28px) left of the text edge (`conversation.css:186`), which puts it outside the scroller. It gets clipped. Measured at 900: text edge x 49, head x 21, scroller left x 33. The shot `wh-900` has no bar and no lamp.

So the variant's signature, and the live-edge marker the spec promises, vanish on tablets. **Fix:** below 1024, either:

- set `--write-head-offset: 12px` (as on phone) and `--panel-inset` to at least `--space-6`; or
- give the panel padding of `--space-10` there.

### 3. Make the delete confirmation actually sit *on* the cue line

At 1440 the dialog is 672px wide (x 152–824) and the bar is 1104px (x 152–1256). The right 432px of the bar, with its `/` keycap, sticks out dimmed beside the dialog. The dialog then ends 10px above the dimmed meta line (`delete-confirm-desktop.png`). The composition looks accidental.

Its text starts at x 177, 23px off the text edge that everything else shares (x 200).

**Fix:**

- Make the confirmation the bar box's exact width and left edge, so the cue line itself becomes the question.
- Set its inline padding to put the title and the **Keep it** text on x 200 (padding-left `--hang`, with **Keep it**'s −16px bleed kept).
- Optional, cheap: give the target row `--ground-tint` under the scrim (or raise it above the scrim), so a keyboard user sees which manual is meant.

### 4. Phone: make the bar and the dropped panel agree

When open, the bar squares its bottom corners and swaps its bottom border to `--rule` (`cue-line.css:41–44`), as if the panel were attached. On phone, though, the panel starts 8px lower and full-bleed (`conversation.css:283`). The result is an inset box with a missing-looking bottom over a separate sheet (`phone-demo`, `thinking-phone.png`).

**Fix:** below 768, keep the bar's full radius and `--rule-strong` border while open. Alternatively, attach the panel flush (top 100%) and make the bar full-bleed too. Pick one geometry.

### 5. A click-away shouldn't also open a manual

At 1440, nearly every pixel below the panel is a row link (rows span x 184–1256). The natural gesture "click the library to put the answer away" therefore navigates to the reader. I measured a click 6px under the panel go straight to `/read`. The conversation survives, but the user didn't ask to leave.

**Fix:** when a `pointerdown` outside folds the panel, swallow the click that follows. Use a one-shot capture-phase `click` listener that calls `preventDefault` and `stopPropagation`. A second click then opens the manual. Keep the focus-based fold as it is.

### 6. Keep the answer you're following up on

Every send folds all earlier exchanges to one muted line (`Conversation.tsx:20–24`), so a follow-up ("which one?") hides the answer it refers to. The panel's right half is empty at 1440 anyway (the cue width is capped at the 576px measure inside a 1104px panel).

**Fix:** let folded lines run the panel's width. After the ask, show a one-line excerpt of the reply in `--ink-faint`, with an ellipsis (`What do I have?  —  Everything you own is in your library…`). History becomes scannable without unfolding, and the empty half gets a job. The number, chevron and click behaviour stay as they are.

### 7. Make your words read as *yours*

The ask is 16/24 500 `--ink-strong`; the reply is 16/24 400 `--ink`. That is too close: in `streaming-desktop.png`, the ask reads as the reply's first line. Spending the `›` prompt mark is cheap and on-concept: set it in `--ink-faint` before the ask text (shell-transcript style: the prompt, then the output), so the ask visibly echoes the bar. Optionally add a little more space (`--space-3`) between the ask and the reply.

### 8. Don't say "Thinking…" twice

While the panel is open, the bar's slot and the panel both show ring + `Thinking…` / `Replying…`, 56px apart (`thinking-desktop.png`). **Fix:** while the panel is open, show only the ring in the bar's slot (the phone already does this), keeping the hidden words for screen readers. Show the words only while the panel is folded, where they are the only status.

### 9. Don't hide `Start a new manual` behind the open panel

At 1440, any open panel covers the library head, so the direct "start" control is gone until you fold the panel. The rule is satisfied (one Esc away), but findability suffers.

**Fix:** put a `Start a new manual` text button at the right of the panel foot. `Latest ↓` can sit left of it, or replace it while visible. It fills the bar directly above, which is natural.

### 10. Balance the bar at 1024–1279px

With a 64px gutter and a 48px hang, the bar starts at x 16. That nearly touches the dev switcher strip (x 0–15), which `README.md` says to keep clear. It also leaves the bar 16px from the left edge and about 33px from the right (`w1024*.png`). **Fix:** at 1024–1279, use a 32px hang, or start the bar box at the gutter with the `›` inline as below 1024.

### 11. Small polish

- **Phone readout:** the readout line appears after the first send and pushes the library down 32px (`Library` at y 84 → 116), against "the conversation never moves the library". Reserve the line on phone from the start, or show the conversation state inside the band.
- **The `/` hint is never seen on first visit** (the bar autofocuses, and the keycap only shows unfocused). Add `/ to return here` to the panel foot hint, or show the keycap in the readout's `Try` line on fine pointers.
- **The page scrolls 26px at 1440×900** (doc height 926, bottom padding `--space-24`). Trim it so the designed size doesn't scroll, as the spec claims.
- **Repeated `Opened`:** the word is on every row. Consider dropping it on desktop, where the column already says it by position, and keeping it on the compact inline meta.
- **Phone empty placeholder:** `Your first manual…` reads like a label. `What should your first manual teach?` is the same length class.

## What to keep

These are the best parts; don't trade them away in the fixes:

- the resting composition;
- the reader-identical rows;
- the write head, thinking line and settle;
- the keyboard model: `/`, ↑ recall, Esc, Delete on a title;
- the focus handling around delete;
- the empty state's "Begin at"-style link;
- the restraint: one green, no ornament.
