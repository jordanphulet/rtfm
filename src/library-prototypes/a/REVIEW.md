# Library A — design review

Reviewer: an independent design agent (LB.6.A). I didn't build this variant.

**Sources.** I read all 16 screenshots from `npm run shot:library -- a` (`shots/library/a/*.png`)
and compared them with `shots/reader/start-desktop.png` and `written-desktop.png`. I also ran live
Playwright checks against my own dev server on port 5200, at 1440, 1920, 1279, 1024, 768 and 375,
with and without reduced motion. I computed contrast from the hex values in `src/ui/tokens.css`.
Live captures are cited by name (for example `d-blurred`). They are scratch files and aren't in the
repo.

## Verdict

This is the most "finished-looking" kind of library you could put in front of the reader. It is
clearly the same product, every locked rule passes, and the reader's write head carries over into
the conversation well. Its weakness is that the agent is the quieter half of the page whenever
the field isn't focused. The panel is mostly empty on first visit, and a few small craft slips
show at in-between widths and on the phone. All of these can be fixed in one round without
changing the design.

## Scores (1–5)

| Area | Score | Why |
| --- | --- | --- |
| Hierarchy | **4** | The order is clear: the 35px `Library` title, the meta line, the ledger header, then the rows. The panel reads as a second column, just as the reader's outline does. Points lost: the panel's top half is empty on first visit (`first-visit-desktop.png`: the 14px `Librarian` label at y 30, then nothing until y 475), and the empty state shows a sortable column header over no rows (`empty-desktop.png`). |
| Agent prominence | **3** | On load, the field is the only green thing on the page (the focus ring), so it wins. Once anything else is clicked, it becomes a dark well in the bottom-right corner. Its fill is 1.06:1 against the panel and its border 1.69:1 (`d-blurred`, `delete-confirm-desktop.png`). At that point the 17px underlined `Start a new manual ›` and the row titles pull harder than the field does. `Send` looks the same with an empty draft as with a full one. |
| Direct controls easy to find | **4** | Every row is one large target (with a hover tint, the title turning cue, and a focus ring around the whole row, as in `d-kbd-focus`). `Delete` is visible on every row at every width, and `Start a new manual ›` has one fixed home. Point lost: Start is the quietest link on the page, even in the empty state, where it's the only thing to do. |
| Conversation feel | **4** | Distinctive and calm. Your lines are quoted with a 2px rule and the librarian's are plain prose. The reader's lamp and bar mark thinking and the live block, then settle. The `In your library:` line is a genuinely good idea. Points lost: the hint line wraps to an orphaned `line` at 1024–1279, the panel header never changes, `Send` gives no sign of readiness, and a cue loads silently into the field, so a first-time user may think the click did nothing. |
| Library scanability | **4** | A real ledger: column header, tabular readouts, and the section strip, which shows each manual's size and progress at a glance without a gradient bar. Points lost: all the metadata is 12px faint mono, so the right half of each row reads as texture. The "named" mark, a 2px `--ink-muted` bar floating 8px outside the row, is easy to miss (`typing-desktop.png`, x 54–56). |
| Phone layout | **4** | A proper adaptation. The dock always holds the field and a status toggle, rows stack with a one-line meta strip, Delete has a 44px target, and the confirmation rises from the bottom. Points lost: the conversation sheet has no header, so its top 60% is empty, plain ground (`thinking-phone.png`, `streaming-phone.png`, `fallback-phone.png`); `Thinking…` appears twice, 60px apart; and hover states stick after a tap (`p-start`). |
| Consistency with the reader | **5** | Same tokens, type scale, start-page row pattern (hover tint, title to cue, stretched link), tonal-step side column, write head and lamp, target flash and skip link. Side by side with `start-desktop.png` it is unmistakably the same product. No hex values, raw durations or off-token type sizes appear in the variant's CSS. |
| Would a professional ship this | **4** | Yes, after fixes 1–4. It is restrained, typographically careful and free of chat clichés. The layout is the familiar "app plus side chat", but the strip, the write head and the shelf links make it feel designed rather than assembled. |

## Locked rules

| Rule | Result | Evidence |
| --- | --- | --- |
| **Visual system:** dark only, shared tokens, type and components | Pass | All CSS uses `src/ui` tokens. The variant's own sizes are in `a/tokens.css` (layout only, like `src/reader/tokens.css`). `grep` finds no hex, `rgb()` or raw durations in `a/*.css`. Components used: `ReplyMarkdown`, `Sheet`, `StatusRing`, `.text-button`, `.link`. |
| **Banned list** | Pass | No gradients, glass, glows or shadows. No emoji or decorative icons: the only glyphs are `›`, `↓` and `↑`, and each points somewhere. Nothing is a card except the one confirmation popover, which has a border and no shadow, as the reader's previews do. No pills: the cues are quoted rows. Nothing is centred. Hairlines all have a job: ledger header and foot, composer top, the panel header once scrolled, the dock top, phone row separators, the confirmation border. The only accent is the cue green, and it means live (lamp, `Thinking…`) or actionable (focus, hover). |
| **Craft:** curly punctuation, tabular figures, wrapping, hover and focus states, 150–250ms | Pass, with one slip | Curly quotes, `…` and `’` throughout. Readouts use `tabular-nums`. Every control has hover and focus states. Transitions use `--dur-quick`, `--dur-base` and `--dur-settle`. **Slip:** the composer hint wraps with a single orphaned word at 1024–1279 (`w1024-conv`, `w1279-conv`: `…for a new` / `line`). See fix 2. |
| **Text contrast, WCAG AA** (computed) | Pass | `--ink-faint` on `--ground` is 5.91:1 (Delete, meta, dates). On `--ground-hover` (a hovered row) it is 5.18:1, and on `--ground-side` (readout, `In your library:`, disabled Send) 5.60:1. The placeholder, `--ink-faint` on the field's `--ground`, is 5.91:1. `--cue` on `--ground-side` (`Thinking…`) is 8.18:1, and on `--ground-hover` (hovered title) 7.58:1. `--ink-muted` on `--ground-raised` (confirmation text, Keep it) is 7.97:1. `--ink` on `--cue-tint` (row flash) is 10.91:1. `--ink-strong` on `--ground-tint` (Send, Delete manual) is 13.01:1. |
| **Non-text contrast** (advisory) | Weak | The field's resting border is `--rule-strong` on `--ground-side`: **1.69:1** (WCAG 1.4.11 asks 3:1 for a component's boundary), and its fill against the panel is 1.06:1. The unwritten ticks are 1.78:1 on `--ground`, which is acceptable because the `3 of 14` readout carries the same information. The field is fix 1. |
| **Desktop first, phone too, 375 to 1440+** | Pass | No horizontal overflow at 375, 768, 1024, 1279 or 1920 (`scrollWidth − innerWidth = 0`). At 1440 the page is exactly 900px tall with 7 manuals, so nothing scrolls. At 1920 the ledger centres in its area and the panel stays 440px wide. |
| **Agent input most prominent, always one action away** | Pass on load, weak at rest | On load the field (392 × 74 at x 1024, y 766) has focus with the cue ring, and on phone it's always in the dock. At rest it loses to the head link and the titles (see the scores). Fix 1 makes this a clean pass. |
| **Keyboard shortcut focuses it** | Pass | `/` from a row link focuses the field and types nothing (field value `""`). It is ignored while the confirmation is open, because the page is inert. The hint reads `Press / to ask` when the field isn't focused. |
| **Open a manual by clicking it** | Pass | Clicking a row goes to `/read`. The whole row is the target, and the focus ring wraps the row (`d-kbd-focus`). |
| **Delete a manual, with confirmation** | Pass | **Keyboard:** Enter on a row's Delete opens the confirmation with focus on `Keep it`. `.page` and the switcher are inert. Tab cycles only `Delete manual` ↔ `Keep it`. Escape returns focus to that row's Delete. **Mouse:** clicking the scrim keeps the manual and returns focus to that row's Delete. **Lifted row:** the row stays at full strength over a scrim at 0.8 opacity (`d-confirm-kbd`, `delete-confirm-desktop.png`). It anchors below the row, or flips above it for the last row (`d-confirm-last`). It sits at the bottom edge on phone (`delete-confirm-phone.png`). **Delete manual:** the row collapses, the meta updates to `6 manuals · 44 of 103`, and focus moves to the next row's title. Deleting the last manual moves focus to `Start a new manual ›`. |
| **Start a new manual opens the agent with a starter prompt** | Pass | The field fills with `Let’s start a new manual about `, caret at 31, focused and flashed (`d-start`). An existing draft is kept. On phone it fills the dock's field without opening the sheet (`p-start`). |
| **Simulated agent: type, send, thinking, streaming markdown** | Pass | After sending `help`: the thinking line shows from 14ms to about 650ms, the first words land where the lamp was, and the reply streams for about 1.6s, then settles. The settled bar is `scaleY(0)`. Lists, bold and numbered items render mid-stream with no raw markdown (`streaming-desktop.png`). |
| **Replies do nothing** | Pass | After sending "Delete the manual about birthday parties", there are still 7 rows. The `In your library:` links only scroll to the row, focus it and flash it. |
| **The conversation stays on the page** | Pass | It survives toggling the phone sheet and resizing 1440 → 800 → 1440 (the messages are kept, because `useAgent()` lives in `index.tsx`). |
| **Scrolled up: a new reply never pulls you down** | Pass | I scrolled up 300px mid-reply. `scrollTop` held at 708 while the distance to the bottom grew from 368 to 416. The slot under the field showed `Replying ↓` with a breathing lamp (`d-replying-readout`). `Newest ↓` returned the distance to 0. After a send, the view always jumps to the bottom. |
| **Library rows: title, subtitle, progress, last opened** | Pass | All four columns show at 1280 and up. At 768–1279, "Last opened" moves under the subtitle as `Opened 3 days ago`. On phone everything is on one meta line (strip, `3 of 14 · yesterday`). |
| **Delete removes it in memory; reload restores it** | Pass | 7 rows → 6 → a reload brings back 7. |
| **Empty state** | Pass | `?library=empty`, or deleting everything, shows a plain sentence between the ledger rules, and the cues drop the "Open …" cue (`empty-desktop.png`, `d-all-deleted`). Its design is weak: see fix 5. |
| **Opening any manual goes to the reader** | Pass | Every row links to `/read`. |
| **Boundaries:** lives in `a/`, uses only `src/ui`, `src/library` and `src/agent`, no packages, `/library/a` | Pass | The imports are `../../ui`, `../../library`, `../../agent`, `react`, `react-dom` (`flushSync`), `react-router`, and `vitest` in the test. The working tree is clean. |
| **Scenarios 1–9** | Pass | Every scenario renders at both sizes, and the run printed "No errors." Phone (scenario 9) is the set of `*-phone.png` captures. |
| **Reduced motion** | Pass | The thinking lamp, the write-head draw-in and the lamp itself have `animation: none`. The scrim's transition is `0s`. The row collapse is instant (6 rows 30ms after confirming). The row and field flashes become a static tint. |

## Prioritized fix list

Ordered by how much each one improves the impression and the rules. Fixes 1–4 matter most.

### 1. Make the resting composer read as the main control

*Agent-first rule, agent prominence.*
- **Field border:** at rest, use `--ink-faint` instead of `--rule-strong`: 5.6:1 on the panel,
  up from 1.69:1, which also meets 1.4.11. On hover, use `--ink-muted`. Focus is unchanged.
  - Evidence: `d-blurred` and `delete-confirm-desktop.png`, where the field nearly disappears.
- **Send:** while the draft is blank, give it the same quiet look it has while busy (no fill,
  `--ink-faint`, but still focusable). Once there's text, give it its full `--ink-strong` on
  `--ground-tint`.
  - This gives the field a visible "ready" moment: typing, or a cue loading, lights Send.
  - That also fixes the silent cue click: you see Send come alive.
- Apply both in the panel and in the phone dock.

### 2. Stop the composer hint wrapping at 1024–1279

*Craft rule: no word alone on a line.*
- In the 384px panel, the hint has room for about 35 characters of 12px mono. At 7.44px each,
  that is about 264px beside Send.
- `Enter sends · Shift+Enter for a new line` is 40 characters (about 298px), so `line` drops to
  a second line (`w1024-conv`, `w1279-conv`).
- Fix: give `.readout` `white-space: nowrap`, and use a copy that fits at both panel widths, for
  example `Enter sends · Shift+Enter, new line`, or show only `Enter sends` below 1280.
- Check at 1024 and 1279.

### 3. Give the panel header a job

*Agent prominence, conversation feel.*
- `Librarian` is a 14px label that never changes, above a mostly empty column on first visit.
- Bring the dock's status line to desktop, in the same words and format:
  - empty: `Librarian · Try asking`;
  - idle: `Librarian · 6 messages`;
  - thinking: the writing `StatusRing` with `Thinking…` in cue;
  - streaming: the ring with `Replying…`.
- The corner then always says what the librarian is doing, even when the conversation is
  scrolled away from the live reply, and desktop matches phone.
- Keep the bottom-aligned intro.

### 4. Make the shelf mark visible and attached to its row

*Library scanability, how the shelf and the corner point at each other.*
- Right now it's a 2px `--ink-muted` bar floating 8px outside the row (`ledger.css:73–87`). In
  `typing-desktop.png` and `conversation-desktop.png` it's easy to miss, and it reads as a stray
  line rather than "this one".
- Put it on the row's own left edge (`left: 0`, inside the row box) in `--ink-strong`, the reader's
  current-item bar. The library has no "current" row, so it's still unique.
- Keep the fade, and keep it out of `--cue`.

### 5. Turn the empty library into an invitation

*Hierarchy, how easy direct controls are to find.*
- `empty-desktop.png` shows `Manual · Written · Last opened ↓` (a sort arrow over nothing) above
  one muted sentence, with 550px of empty ground below.
- Fix:
  - Drop the column header when there are no rows. Keep the head's rule.
  - Put the action into the sentence: `Your library is empty. Start a new manual ›, or ask the
    librarian.` The link uses the same handler as the head. "Ask the librarian" focuses the field,
    as `/` does.
- On phone, the same.

### 6. Phone sheet: anchor its top, and say "Thinking…" once

*Phone layout.*
- **Header:** the sheet has no title, so short conversations sit under 400px or more of empty
  ground (`thinking-phone.png`, `streaming-phone.png`, `fallback-phone.png`). Add the panel's
  `Librarian` header at the top of the sheet, styled as on desktop, with the same hairline
  once scrolled.
- **Status:** while the sheet is open, the toggle should read `Librarian` plus `Hide ↓` and drop
  the live status, which is already shown in the conversation 60px above it. Show the status only
  while the sheet is closed.

### 7. No sticky hover on touch

*Phone polish.*
- After a tap, `Start a new manual ›` stays cue green (`p-start`). The same happens to cues,
  named links and the dock toggle.
- Fix: in the variant's CSS, wrap these hover rules in `@media (hover: hover)`. Don't touch
  `src/ui`; override `.start-link` and `.named-link` locally.

### 8. Don't pop the phone sheet open on resize

*Edge case.*
- Narrowing a window with a conversation from 1440 to 800 mounts `PhoneAgent`, which opens the
  sheet over the library because of its "open on load when the conversation isn't empty" rule.
- Fix: only open it on the first mount of the page, not on a width change.

### 9. (Optional) Lift the ledger's metadata one step

*Library scanability.*
- The `Written` readout and the dates are 12px mono. The dates are in `--ink-faint`, and the
  readout in `--ink-muted` (`--ink-faint` at 0).
- Consider `--ink-muted` for "today" and "yesterday" only (recency is the sort key), or a
  `--text-ui` readout, so the right half of the ledger scans as data rather than texture.
- Skip this if it costs fixes 1–8.

## Considered and left alone

- **A `Delete` on every row.** Seven `Delete`s make a quiet column, but always-visible controls
  are what makes deleting easy to find, and they're needed on touch. `--ink-faint` keeps them
  out of the way. Keep them.
- **`Delete manual` filled, `Keep it` as text.** This is a deliberate choice: the words carry the
  danger, and focus starts on `Keep it` under the pointer. With a keyboard the ring shows clearly
  (`d-confirm-kbd`). Fine.
- **The confirmation at 1024.** Its 360px minimum width runs over the next row's title
  (`w1024-confirm`), but those rows are dimmed under the scrim, so it reads as intended.
- **Autofocus and the skip link.** On desktop the field has focus, so the first Tab goes to Send,
  not to the skip link. Shift+Tab from the field reaches the conversation and then the ledger,
  which is acceptable.
