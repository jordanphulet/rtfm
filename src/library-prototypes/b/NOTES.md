# Library B — build notes

## Screenshot passes

### Pass 1 (first build)

All 16 screenshots rendered with no console errors. Critique:

- **The bar's focus ring was cut off.** The ring sat 2px outside the bar, and with the panel open
  it stopped where the panel attaches, so the open state looked broken. **Fix:** the ring sits on
  the bar's own border (a −1px offset). Its bottom edge is now the line between the bar and the
  panel.
- **Desktop-only hints showed on phone.** Playwright's mobile emulation still reports a fine
  pointer, so the `/` keycap and the `↑ recalls your last message` hint appeared. A real phone
  reports a coarse pointer, but the hints are only meant for desktop. **Fix:** both are also gated
  on `min-width: 768px`.
- **The phone meta line wrapped awkwardly** (`7 of 18 written ·` / `Opened today`), because
  Delete took the end of that line. **Fix:** below 1024px, Delete moves up to the title's line and
  the meta line spans the full width. The longest one (`15 of 22 written · Opened Dec 28, 2025`)
  now fits at 375.
- **"Start a new manual" wrapped under the meta line on phone,** off the text edge, because the
  meta line made the heading's column wide. **Fix:** the head is a grid: H1 and button on one row,
  meta spanning the next.

### Pass 2

The phone rows and head now read cleanly. The focus ring and the open panel read as one unit.
Checked thinking, streaming, conversation, delete-confirm, fallback and empty at both sizes.
Nothing to fix. I considered narrowing the desktop panel to the reply's measure. I kept it the
full bar width: a narrower panel would leave the right-hand columns of the rows it covers (their
progress, dates and Delete) showing beside it.

### Pass 3 (live, and at 1024 and 800)

- Ran the conversation live on my own dev server (port 5193) with a Playwright script kept
  outside the repo. It sent "help" and watched the reply go from thinking to streaming to
  settled. In a 1280 × 460 window, so the panel overflows, it scrolled up mid-reply. Results are
  below.
- At 1024 and 800, with and without a conversation: no horizontal overflow at 1024, 800 or 375.
  At 800 the `›` mark and the cue numbers sit inline as specified.
- **Fix:** the confirmation was moved up to 16px from the top below 1024px for no reason (the
  bar rests at y 48 there too); that rule was removed.

## Verified live

| Check | Result |
| --- | --- |
| The bar takes focus on load (desktop, fine pointer); none on phone | Pass |
| Send → `Thinking…` in the panel and the bar's slot → `Replying…` while streaming → settles (the write head retracts) | Pass |
| The panel opens on send, and focus stays in the bar | Pass |
| Newest message in view on load with `?conversation=demo`, and after a send | Pass |
| While streaming and at the bottom, it stays at the bottom (ResizeObserver) | Pass |
| Scrolled up mid-reply: scrollTop stays put while the content grows by 90px; `Latest ↓` appears; clicking it returns to the bottom and follows again | Pass |
| Esc folds the panel; a second Esc keeps the draft | Pass |
| ↑ recalls the last message; ↓ returns to an empty draft | Pass |
| A click in the library folds the panel; `/` focuses the bar, reopens the panel and isn't typed | Pass |
| Start a new manual: fills exactly `Let’s start a new manual about ` with the caret at the end, and keeps an existing draft | Pass |
| Delete key on a focused title opens the alertdialog, focus on Keep it, page inert; Esc returns focus to the title | Pass |
| Delete manual: the row collapses and is removed, focus moves to the next title, `Deleted “Negotiating With Geese”. 6 manuals left.` is announced, and the meta updates | Pass |
| Reduced motion: the write head is shown without the draw-in, and the lamp is steady | Pass |
| Phone: tapping the bar drops the suggestions down; tapping one fills the bar | Pass |
| No console errors in any run | Pass |

## Deliberate deviations from the first spec

All of these are reflected in `SPEC.md`.

- **Phone layout** (review note): the bar stays sticky at the top and the panel drops down,
  instead of a bottom bar with a rising panel. That removed the keyboard inset, the catch layer and
  the phone panel header; the panel foot is the same at every width.
- **The bar's status** says `Thinking…` while thinking and `Replying…` while streaming
  (review note).
- **Delete manual** is a tint-filled button with cue text on hover, not a bordered one
  (review note and shared convention).
- **Esc with the panel folded does nothing**, and never clears the draft (review note).
- **Stick-to-bottom** is a ResizeObserver on the panel content plus a scroll listener, not a
  per-chunk measurement (review note). Unfolding an earlier cue turns the stick off, so the reply
  you opened isn't scrolled away.
- **Light dismiss watches one region,** the bar unit (bar, panel and phone drop-down). The
  readout is `inert` and hidden while the panel is open, so it never needs to count as "inside".
- **The row collapse** animates height, top margin and opacity with the Web Animations API, not
  `grid-template-rows`. It needs no wrapper element, and its `finish` event fires even at 0ms
  (reduced motion), which a CSS transition's `transitionend` doesn't.
- **Phone readout:** before the first send it takes no space (the suggestions live in the
  drop-down instead). The first send adds the `1 exchange · Show ↓` line once, behind the open
  panel.

## Code review fixes

- **Hide and Esc inside the panel left it open.** Focusing the bar fired its `onFocus`, which
  reopened the panel in the same batch as the fold. `foldToBar` now focuses first, then folds.
  Verified live: Hide, and Esc from a focused cue toggle, both leave the panel folded with focus
  in the bar.
- **The stuck band fell 136px short at 1440:** `--page-inline` used `%`, which resolved against
  different boxes on the page and on the band. `.library-b` is now an inline-size container and
  `--page-inline` uses `100cqi`. The band now spans 0–1440, and the confirmation reuses the
  token (it lands exactly on the bar's left edge, x 152).
- `import "../../ui"` now comes before the stylesheets in `index.tsx`, `Shelf.tsx` and
  `ManualRow.tsx`.
- Raw sizes moved to tokens (`--bar-slot-min`, `--keycap-height`, `--chevron-size`); the 24px
  and 40px heights use `--space-6` and `--space-10`.
- `STARTER_PROMPT` is no longer exported. `Suggestions`' `className` is optional, and the dead
  `readout-suggestions` class is gone.
- Nits:
  - ↑/↓ and the Delete/Backspace shortcut ignore Shift, Alt, Meta, Ctrl and IME composition
    (`keys.ts`);
  - the row reads `onCollapsed` through a ref, so its effect deps are honest;
  - the unfold reset adjusts state during render when the exchange count changes;
  - the no-op `border-radius: inherit` is gone;
  - renamed `onLeft` → `onCollapsed` and `fill` → `fillDraft`.

## Response to review

No locked rule failed. Every item on the fix list is done; nothing was skipped.

1. **A clean edge for the open panel.** The panel is now a flat `--ground` mat (16px on the
   sides and bottom) holding the raised body, so there is plain ground between the panel and
   any row it cuts. While the panel is open, the library also drops to 50% opacity
   (`--dur-base`, instant under reduced motion), so cut rows read as background. They stay
   clickable. On phone the mat sits under the panel's bottom edge.
2. **The write head at 768–1023px.** Below 1024, `--write-head-offset` is 12px, and the panel's
   text starts at `--text-inset` (`max(--hang, --space-6)`). Measured at 900: the head is at
   x 45, inside the scroller (which starts at x 33). The bar and lamp show (`w900-stream`).
3. **The confirmation sits on the cue line.** It is anchored to the bar with CSS anchor
   positioning (same top, left and width; the bar's resting geometry is the fallback). Its text
   starts at `--text-inset`. Measured at 1440, 1100 and 900: zero offset from the bar on every
   edge. The title is on x 200 with the heading at 1440 (and x 64 at 1100). The manual being
   deleted is lit above the scrim with `--ground-tint`.
   - Measuring this showed that the whole bar unit sat 1px right of the text edge (the bar's
     border). The bar box now also hangs out by `--hairline`, so the input, the replies, the
     heading and the row titles all start at x 200.
4. **Phone: the bar and the panel agree.** Below 768, the bar keeps its full radius and
   `--rule-strong` border while the panel is open. The panel is a separate full-width sheet.
5. **A click-away doesn't open a manual.** When a `pointerdown` outside folds the panel, a
   one-shot capture listener swallows the click of that same gesture. It is cleaned up just
   after `pointerup` or `pointercancel` through an `AbortController`. Verified live: the first
   click folds and stays on `/library/b`; a second click opens `/read`.
6. **The answer you're following up on.** Earlier exchanges run the panel's full width, with a
   one-line excerpt of the reply in `--ink-faint` after your words (from 1024px).
7. **Your words read as yours.** A `›` prompt mark in `--ink-faint` before every ask, as in a
   shell transcript. The space between ask and reply is now `--space-3`.
8. **No double `Thinking…`.** While the panel is open, the bar's slot shows only the ring, with
   the words visually hidden. The words show while the panel is folded.
9. **Start a new manual in the open panel:** at the right of the panel foot, after `Latest ↓`.
10. **The bar at 1024–1279:** `--hang` is 32px there. The bar starts at x 31 at 1024, clear of
    the switcher strip.
11. **Polish:**
    - **Phone readout:** reserved from the start, showing `Try` and the first suggestion.
      Measured: `Library` stays at y 116 through the first send.
    - **The `/` hint:** the desktop suggestions line ends with `· [/] returns you here`.
    - **Page height:** bottom padding is `--space-16`, so the document is exactly 900px tall at
      1440 × 900 and doesn't scroll.
    - **`Opened`:** visually hidden in the desktop column (kept for screen readers) and still
      visible on the compact inline meta.
    - **Phone empty placeholder:** `What should your first manual teach?`

### Re-verified live after the fixes (my own dev server on port 5193, stopped by its PID)

- **Scrolling:** at 1280 × 460, scrolled up mid-reply, `scrollTop` stayed at 0 while the
  content grew; `Latest ↓` appeared, then took me to the bottom and followed to the end.
- **Newest in view:**
  - on load with `?conversation=demo`;
  - after a send, while streaming at the bottom (`scrollTop` = max).
- **Delete:** the Delete key opens the dialog, focus starts on Keep it, and the page is inert.
  Esc returns focus to the title. Confirming moves focus to the next title, announces the
  deletion and updates the meta.
- **Fold:** Hide, and Esc from a cue toggle, both leave the panel folded, with focus in the bar.
- **Earlier checks still pass:** autofocus, Thinking → Replying → settle, `/`, ↑/↓ recall,
  Start a new manual (keeps a draft; otherwise fills the starter with the caret at the end),
  modifier guards, reduced motion, and the phone suggestions drop-down.
- No console errors in any run.

### Second code review fixes

- **Dimming and AA.** At 50% the library failed AA, and at the suggested 0.7 `--ink-faint` is
  still only 3.50:1. It now dims to **0.85**, the lowest level where every text colour passes on
  `--ground`:

  | Colour | Contrast at 0.85 |
  | --- | --- |
  | `--ink-faint` | 4.59 |
  | `--ink-muted` | 6.71 |
  | `--cue` (hover) | 6.48 |
  | `--ink` | 9.50 |
  | `--ink-strong` | 11.77 |

  The dimming is applied per element (head, rule, rows, empty state), so the row under the
  pointer returns to full opacity. The `--ground` mat does most of the separating.
- **The swallowed click** now ends on that click, on `pointercancel`, or on the next
  `pointerdown` (registered with `queueMicrotask`, after the current event finishes
  dispatching). There is no timer, so a late synthesized touch click is still caught. Verified
  with mouse and with touch emulation: the first tap folds and stays on the library; a second
  tap opens `/read`.
- **The bar's status words** use the shared `visually-hidden` class (`wordsHidden={open ||
  isPhone}`). The re-implemented copies and their comment are gone from `page.css`. The
  ≥1024 `.row-opened-word` rule moved to `manual-row.css`.
- Nits:
  - the anchor-less fallback now matches the bar at 768–1023 (checked at 900, 1100 and 1440);
  - the dead `data-state` and the duplicate `--write-head-offset` are removed;
  - the cue-line.css comment is removed;
  - `--z-dialog` ties the confirmation, its scrim (one below) and the lit row together.
