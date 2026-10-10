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
