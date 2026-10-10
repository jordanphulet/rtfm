# Library C — design review (LB.6.C)

An independent review of variant C, "The prompt book", against the locked library rules in
`WORKLIST.md`, `DESIGN.md` and its own `SPEC.md`.

**Evidence used**

- `npm run shot:library -- c`: 16 of 16 saved, no errors. Every shot in `shots/library/c/` was
  inspected.
- A live run on my own dev server (port 5199) with Playwright. Widths: 1440×900, 1100×800,
  1024×768, 768×1024 and 375×812, plus reduced motion. No console errors in any run.
- Contrast computed from the hex values in `src/ui/tokens.css`.

## Verdict

C is the most typographically accomplished of the three directions. It looks like the reader's
own start page: the hanging speaker names, the ruled table, the write head and the settle are all
the reader's language used correctly, and the first screen at 1440 is excellent. What holds it
back is that its most important control is its quietest surface. After one send the page also
turns into a near-empty screen, where the way back to the library and the record of a deletion
are easy to miss. These are fixable in one round, without changing the concept.

## Scores (1–5)

| Criterion | Score | Why |
| --- | --- | --- |
| Hierarchy | 4 | The first screen is model hierarchy: a 35px title, a mono meta line, one green call to action, the table, then the dock (`first-visit-desktop.png`). After a send, about 75% of the 1440 viewport is empty (`thinking-desktop.png`: content at y 46–84, then nothing until the dock at 790), so the page loses its structure |
| Agent prominence | 3 | The dock is fixed, full width and the largest control. But its band is `#1C1E20` on `#121314` (1.11:1), and the well's border is `--rule-strong` (1.60:1 on the band, 1.78:1 on the ground). At rest, the green-underlined "Start a new manual ›" and the white titles outrank it. It reads as a footer |
| Finding the direct controls | 4 | Open (the whole row, tint plus green title on hover), Delete (always visible, its own hover), and Start a new manual are all obvious on the library. Once the conversation has grown, the only visible way back at ≥1200px is a muted "Library 7" row in a column titled "In this conversation" |
| Conversation feel | 4 | A real script: no bubbles, the user's line reads like a heading, and the reply sits at the measure. The thinking ring, then the write head and lamp, then the settle are the best "live" treatment of the three. Two things hurt it: the page-turn void, and deletions written into the script out of sight |
| Library scanability | 4 | A ruled table with aligned tabular columns, equal-length meters and a clear recency order. Subtitles are never truncated. Seven "Delete" labels in one column add some noise, but at `--ink-faint` it's acceptable |
| Phone layout | 3 | Good bones: stacked rows, a meter plus a mono meta line, a bottom sheet with stacked buttons, and Library ↑. Its problems: the suggestions are buried below seven rows; the first-visit dock has an empty 32px band; the lit row jumps 12px during a delete; two targets are under 44px; and the write head sits 5px from the screen edge |
| Consistency with the reader | 5 | Same tokens, type scale, mono readouts, cue-underlined link (the reader's "Begin at"), table header treatment, ring, write head, "you are here" bar and margin column. Nothing outside the system was found: no raw colors or timings in `c/*.css`, and only `src/ui`, `src/library`, `src/agent`, React and React Router are imported |
| Would a professional ship this | 4 | Yes, after fixes 1–5. The craft is high throughout. What a professional would block on is the quiet input, the invisible delete record and the phone row shift, and all three are small changes |

## Locked rules

### Visual system

| Rule | Result | Evidence |
| --- | --- | --- |
| Shared design system only, dark only | Pass | Every color is a `--token` from `src/ui/tokens.css`. A grep of `c/*.css` for hex, `rgb`, `ms` and raw px finds only 1–2px hairlines, the meter's 2px height and the bar's 2px width. Root is `ui library-c` (`index.tsx:42`) |
| Banned list | Pass | No gradients, glows, blur or shadows (the scrim is a flat `color-mix` of `--ground` at 72%). No emoji or decorative icons, no pills, no cards, no slate or blue. Everything is left-aligned. The title is 35px directly on content |
| Craft: 4px grid, ≤2 families, typography | Pass | All spacing uses `--space-*`. Plex Sans and Plex Mono only. Curly quotes in the suggestions and confirmation (`Delete “…”?`). Tabular figures in the counts, meta and margin count. `balance` on the H1 and the confirmation title; `pretty` on subtitles and your lines; plain wrapping on streamed replies |
| Every interactive element has hover and focus | Pass | Row: tint plus cue title (`hover-row-1440.png`). Delete: ink-strong on tint (`hover-delete-1440.png`). Row focus ring (`tab3-row-focus-1440.png`). Focus ring moved onto the well (`typing-desktop.png`). Margin rows, suggestions and Library ↑ use `.text-button` or the base ring |
| Transitions 150–250ms | Pass | `--dur-quick`, `--dur-base` and `--dur-settle` only |
| Text contrast WCAG AA | Pass | Lowest text pairs: `--ink-faint` on `--ground-tint` 4.77:1 (Delete in the lit row); `--ink-faint` on `--ground-raised` 5.31:1 (hints, "Try"); `--cue` on raised 7.76:1 ("Replying…"); `--ink-muted` on raised 7.97:1 |
| Non-text contrast of the input (WCAG 1.4.11) | **Fail (minor)** | The well's boundary is a `--rule-strong` border: 1.60:1 against the dock and 1.78:1 against its own fill. The band against the page is 1.11:1. WCAG asks for 3:1 for a component's boundary. The placeholder keeps the input identifiable, but this is also the root of the weak prominence (fix 1) |
| Desktop first, 375 to 1440+, no horizontal scroll | Pass | `scrollWidth − clientWidth` is 0 at 1440, 1100, 1024, 768 and 375 |
| Reduced motion | Pass | With `reducedMotion: reduce`: the lamp's `animation-name` is `none` at opacity 1; the bar is a static `scaleY(1)` while live and `scaleY(0)` after; the ring doesn't breathe; a delete collapses in 47ms. Nothing is lost (`rm-streaming.png`) |

### Agent first

| Rule | Result | Evidence |
| --- | --- | --- |
| The agent's input is the most prominent control | **Pass, weakly** | Largest and only full-width control, always on screen. But it's the lowest-contrast surface on the first screen (see above), and "Start a new manual ›" carries the only green at rest. See fix 1 |
| Always one click, tap or keystroke away | Pass | `position: fixed` dock at every width and scroll position. The well is 816×50 at 1440 and 343×50 at 375 |
| A keyboard shortcut focuses it | Pass | `/` from the page focuses `textarea#agent-input` and isn't typed. It is ignored in text fields and while the confirmation is open (focus stayed on "Keep it"). The `/` keycap advertises it |
| Open a manual directly | Pass | The stretched title link covers the row and goes to `/read`. Verified by clicking. Back keeps both exchanges |
| Delete directly, with confirmation | Pass | The row's Delete opens the alertdialog band. Keyboard: focus opens on "Keep it"; Tab cycles the two buttons; Escape returns focus to that row's Delete; confirming moves focus to the next row's link. Mouse: a scrim click keeps the manual; confirming moves focus to the next link. `.page` is `inert` and the page scroll is locked while it's open |
| Start a new manual opens the agent with a starter prompt | Pass | It fills `Let’s start a new manual about ` and focuses the well with the caret at the end, also from the empty state. The third suggestion does the same |

### The agent is simulated

| Rule | Result | Evidence |
| --- | --- | --- |
| You type and send | Pass | Enter sends and Shift+Enter makes a new line. The well grows to 6 lines and then scrolls (`multiline-1440.png`). Focus stays in the well after a send |
| Visible thinking before the first words | Pass | About 600ms of `Thinking…` with a writing ring, "Librarian" in cue and the lamp (`help-thinking-1440.png`) |
| Streams in as markdown | Pass | The list renders formatted mid-stream (`streaming-desktop.png`, `rm-streaming.png`) |
| Canned replies that do nothing | Pass | After sending "Delete the birthday manual", the library still shows 7 manuals (`back-to-library-1440.png`) |
| The conversation stays on the page | Pass | Two exchanges were still there after `/read` and Back |
| Scrolled up: a new reply never pulls you down | Pass | Wheeled up 500px 900ms after a send: `scrollY` went from 1104 to 604 and stayed at 604 for the whole reply (30 samples) |

### The library

| Rule | Result | Evidence |
| --- | --- | --- |
| Title, subtitle, progress (n of m), last opened | Pass | All four in their own columns at ≥768px, and as a meta line on phone |
| A direct delete removes it in memory; reload restores it | Pass | The count went from 7 to 6 and the meta line updated. After a reload there were 7 manuals and no stage directions |
| Empty state | Pass | `Nothing on the shelf.`, one line of text and Start a new manual ›, left-aligned (`empty-desktop.png`, `empty-phone.png`) |
| Opening goes to the reader | Pass | `/read` |

### Boundaries

| Rule | Result | Evidence |
| --- | --- | --- |
| Lives in `c/`; uses only `src/ui`, `src/library`, `src/agent`; no packages; at `/library/c` | Pass | The imports are `../../ui`, `../../library`, `../../agent`, `react` and `react-router` |

### Scenarios

| # | Scenario | Result | Shots |
| --- | --- | --- | --- |
| 1 | First visit | Pass | `first-visit-*`. The whole library and the input fit one 1440×900 screen (last row ends at 755, dock at 790) |
| 2 | Typing | Pass | `typing-*` |
| 3 | Thinking | Pass | `thinking-*` |
| 4 | Mid-stream | Pass | `streaming-*` |
| 5 | Several turns | Pass | `conversation-*` (in the full-page capture, the dock and margin index are drawn at the viewport position, as expected) |
| 6 | Delete confirmation | Pass, with a phone bug | `delete-confirm-*`. On phone the lit row's content shifts 12px (fix 3) |
| 7 | Fallback | Pass | `fallback-*`: an ordinary reply with the capabilities in bold, and the dock idle |
| 8 | Empty library | Pass | `empty-*` |
| 9 | Phone | Pass, with issues | Every state renders at 375. See fixes 3, 5, 8, 9 and 13 |

## Prioritized fix list

Fixes 1–5 most improve the impression and the rule standing. Do those first.

### 1. Make the dock unmistakably the primary control

- **Problem:** at rest, the well's border is `--rule-strong` (1.60:1 against the band). The band
  itself is 1.11:1 against the page, the placeholder is `--ink-faint`, and Send is a faint word
  with no block. On the first screen the input reads as a footer, which fails WCAG 1.4.11 for the
  input boundary and weakens the "most prominent" rule.
- **Fix:**
  - Give the well a resting border of `--ink-faint` (5.31:1 on the band) and a hover border of
    `--ink-muted`.
  - Give the dock a 1px `--rule-strong` top hairline (a hairline with a job: the edge of the
    fixed surface).
  - Set the placeholder in `--ink-muted`.
  - Keep Send's `--ground-tint` block when disabled, with `--ink-faint` text, so the well always
    reads as input plus action.
- **Files:** `dock.css:1–7` (the band), `:15–29` (the well), `:58–61` (the placeholder) and `:99–103` (disabled Send).

### 2. Make a direct delete visible where it happens

- **Problem:** with a conversation going, the stage direction is written after the newest
  exchange, at page y 1895 when you are at `scrollY` 0. Nobody sees it. The only visible feedback
  is the 250ms collapse, and on phone (`phone-after-delete.png`) nothing confirms the deletion.
  The prompt book records the change, but only off-screen.
- **Fix:** keep the stage direction, and also show the confirmation where your eye is. Use the
  dock's fixed-height meta row: its right slot (where `Replying…` goes) reads
  `Deleted Negotiating With Geese` in micro mono `--ink-muted`. It stays until the next send or
  delete, with no new surface and no layout shift.
- **Files:** `Dock.tsx:88–93`, `useDeleteFlow.ts` (it already has the announcement text).

### 3. Phone: the lit row must not move during a confirmation

- **Problem:** `manual-row.css:196–198` adds `padding-left: 12px` to the confirming row on phone.
  The title, subtitle and meta jump from x 16 to x 28, and Delete ends flush against the tint's
  right edge (`delete-confirm-phone.png`, `phone-delete-row5.png`).
- **Fix:** bleed the tint instead of indenting the content. Use `margin-inline: -12px;
  padding-inline: 12px` on the confirming row (the desktop technique), or keep the row's box and
  draw the tint and bar with an inset pseudo-element, so no text moves.

### 4. Make the way back to the library equally obvious at every width

- **Problem:** at ≥1200px, Library ↑ is `display: none` (`dock.css:152–156` only shows it below
  1200). The only visible way back is the margin's "Library 7" row: 14px `--ink-muted`, under a
  label that says "In this conversation", so it reads as a list item rather than navigation.
  Below 1200px, Library ↑ works well (`libup-1100.png`).
- **Fix:**
  - Show Library ↑ in the dock at all widths. At ≥1024px it hangs in the tag column under "You",
    as it already does at 1024–1199px, so it costs no space.
  - In the margin index, set the Library row apart from the questions: an `↑` after "Library",
    and 8px plus a `--rule` line before the first question.
  - Optional (cheap with the existing `useInView`): when the plate head is in view, mark the
    Library row current, with ink-strong and the 2px bar. This is the reader's "you are here".

### 5. Don't hide the suggestions below 1024px; use the empty meta row on phone

- **Problem:** at 768–1023px the suggestions move into the script, and on a first visit they
  start at y 924, behind the dock (whose top is at 914, `first-768.png`). At 375 they start at
  y 1059, under seven rows, with the dock at 710 (`phone-bottom.png`). Meanwhile, the dock's meta
  row is an empty band on a first visit (Library ↑ is `visibility: hidden`): 40px at 768 and 32px
  on phone (`first-visit-phone.png`).
- **Fix:**
  - At 768–1023px, keep the suggestions in the dock as at 1024px. The row needs about 660px, and
    the dock body is 704px wide at 768.
  - On phone, while the conversation is empty and Library ↑ is hidden, fill the meta row with
    the first suggestion: `Try “What can you help with?”`, as a 44px target. Keep the full list
    in the script as now.

### 6. Soften the page-turn void on desktop

- **Problem:** every send puts the new exchange at 32px from the top with nothing above it. At
  1440 that leaves one line and about 700px of empty ground (`thinking-desktop.png`,
  `fallback-desktop.png`, `demo-1100.png`). The longest canned reply is about 260px at 1440, so
  most of that room is never used, and the context that would remind you the library is above is
  thrown away.
- **Fix:** at ≥768px, place the newest exchange so that a reply budget fits below it, instead of
  at the top. For example, `scroll-margin-top: max(32px, var(--window-height) −
  var(--dock-height) − 440px)`. The end of the previous exchange, or the bottom of the table on
  the first send, stays visible above. Keep the end spacer, so a long reply still has room. Keep
  32px on phone.
- **Files:** `exchange.css:1–3`.

### 7. The reply readout isn't right-aligned (a specificity bug)

- **Problem:** `.library-c .dock-meta p { margin: 0 }` (`dock.css:117–119`, specificity 0,2,1)
  beats `.library-c .readout { margin-left: auto }` (`dock.css:143–150`, 0,2,0). So `Replying…`
  sits at x 552, against the key hints (`thinking-desktop.png`), not at the right end as the spec
  says. On phone it sits right after Library ↑.
- **Fix:** scope the margin reset to `.key-hints`, or raise the readout's specificity.

### 8. Phone tap targets under 44px

- **Problem:** Library ↑ measures 71×28 and Start a new manual ›, the head link, 153×24 at 375.
  The spec says 44px targets on phone.
- **Fix:** `min-height: var(--tap)` with negative block margins (the same technique as Delete's
  `manual-row.css:190–194`), so the rows don't grow.

### 9. Phone write head hugs the screen edge

- **Problem:** with `--write-head-offset: 11px` in a 16px gutter, the 3px bar and the 7px lamp
  sit at about x 3–10 (`thinking-phone.png`, `streaming-phone.png`). At a glance it looks like a
  rendering artifact on the bezel.
- **Fix:** use 8px on phone (bar at x 8–11, lamp centred on it), or draw the bar inside the text
  edge with the reply indented 12px while live. The first is the smaller change.

### 10. Row focus ring collides with the header rule

- **Problem:** the row ring is drawn 2px outside the row. On the first row it crosses the
  table's `--rule-strong` header line (`tab3-row-focus-1440.png`), and on every row it overlaps
  the neighbouring `--rule` lines.
- **Fix:** use `outline-offset: calc(-1 * var(--focus-offset))` on `.manual-row`, as the reader's
  TOC does, since the row already bleeds 12px.

### 11. Two "live" readouts say the same thing

- **Problem:** while replying, the script shows `Thinking…` (cue, beside the lamp) and the dock
  shows `Replying…` (cue) at the same time, both 12px mono green. That is more green than the
  reader ever shows at once.
- **Fix (optional):** keep the dock readout only when the live line is out of view. The page
  already has an IntersectionObserver pattern for this (`useInView`). Otherwise, at least fix 7,
  so the two don't sit side by side.

### 12. The phone head meta line orphans its last phrase

- **Problem:** `7 manuals · 47 of 117 sections written · most recent first` wraps to leave
  `recent first` alone on line 2 (`first-visit-phone.png`).
- **Fix:** wrap each part in a `nowrap` span, so the line breaks at a `·`, or drop "most recent
  first" below 768px, where the column headers that it explains are hidden too.

### 13. The empty margin index on first visit

- **Problem:** at 1440 the right column holds only "Library 7" and a two-line hint. It's correct,
  but it is the weakest part of an otherwise strong first screen.
- **Fix (low priority):** shorten the hint to `Your questions appear here.`, so the column reads
  as a quiet promise rather than a placeholder.

## What to keep

- **The first screen at 1440:** the whole library and the input in one view, set like the
  reader's start page.
- **The script typography:** hanging right-aligned names, "You" brighter than "Librarian", and
  your line at 500 ink-strong reading as the exchange's heading.
- **The thinking → write head → settle sequence,** including the reduced-motion version. It is
  the clearest "this is live" signal of the three variants.
- **The delete band:** a true modal, focus on the safe default, the lit row with the reader's
  "you are here" bar, and an inert page.
- **No scroll heuristics:** holding still while you scroll up is guaranteed by construction.
