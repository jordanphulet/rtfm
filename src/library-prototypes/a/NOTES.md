# Library A — build notes

## Screenshot passes

Each pass: `npm run shot:library -- a`, read every state at 1440 and 375, fix, repeat.

### Pass 1

- **The page was 55px taller than 900** with 7 manuals, so it scrolled for nothing. The library's
  bottom padding drops from 96px to 48px.
- **Replies slid under the "Librarian" header with nothing between them** once the conversation
  scrolled. A 1px `--rule` line now appears under the header only while the conversation is
  scrolled away from its top. When there's nothing above, there's no line, so the empty panel
  isn't framed by hairlines.
- **The phone dock read "Librarian  · Try asking"**, with a flex gap and a space both before the
  dot. Only the live status (ring and words) uses the gap now.
- **The empty state's closing line stopped at the measure** while the header line spans the
  ledger. The text is capped at the measure inside a full-width block.
- **The confirmation cut through the next row's "Written" readout** at an arbitrary x. Its left
  edge is now placed so its text starts on the Written column's line (at least 360px wide).

### Pass 2

- **The page was still 17px too tall:** the visually hidden live regions sat after the grid, and
  their paragraph margins extended the document. They come first in the root now.
- **The phone full-page capture of the conversation showed the library below the fixed sheet.**
  This was a real flaw, not only a capture artifact: the document kept its full height behind the
  sheet. The library is now `display: none` while the sheet is open (its scroll position is saved
  and restored), which also replaces the `html { overflow: hidden }` lock.

### Pass 3

- **Widths 768, 1024, 1279 and 1920 checked live**, with no horizontal overflow at any of them.
  At 1024 the confirmation for the last row flips above it, as specified. At 1920 the ledger
  centres in its area.
- **At 768 the sheet's replies ran to about 100 characters a line.** The conversation is capped
  at `--measure` everywhere (in the 440px panel this changes nothing).
- **Code read-through:** the phone sheet's scroll restore also ran on first mount (a pointless
  `scrollTo(0, 0)` that could fight the browser's own restoration). It now only restores a
  position it saved.

## Live checks

A Playwright script against a dev server on port 5192 (stopped by its handle afterwards). All
passed:

- **Desktop:**
  - The field has focus on load.
  - On load the newest message is in view (distance from the bottom: 0).
  - `/` from a row link focuses the field and types nothing.
- **"help" sent:**
  - The thinking line appears with the conversation at the bottom.
  - Streaming follows at the bottom.
  - Scrolling up 300px mid-reply holds the position while the reply grows (distance 300 → 416),
    and the readout reads `Replying ↓`.
  - `Newest ↓` returns to the bottom.
- **Start a new manual:**
  - It keeps an existing draft.
  - With an empty draft it fills exactly `Let’s start a new manual about `, caret at 31.
- **Named-manual link:** focuses the row's title and flashes the row.
- **Delete:**
  - Focus opens on Keep it, and the page is inert.
  - Escape returns focus to that row's Delete.
  - Delete manual removes the row, focuses the next row's title, and announces it.
- **Reduced motion:**
  - The lamp and the write head have no animation.
  - The delete collapse is instant.
- **Phone:**
  - A send opens the sheet with focus kept in the dock's field.
  - Closing the sheet restores the library's scroll (300px).
  - A named-manual link closes the sheet and focuses the row.
  - Escape returns focus to the toggle.

## Deliberate deviations from the first spec

All are now written into SPEC.md.

- **Review notes folded in:**
  - The field autofocuses on fine pointers.
  - "Start a new manual" is a plain `.link`.
  - The phone sheet's `focusOnOpen` is chosen by what opened it.
  - Send and Delete manual hover to `--cue` text on `--ground-tint`.
  - Stick-to-bottom uses a `ResizeObserver`.
  - The shared starter prompt, the draft-keeping Start, the `Delete “<title>”?` title and the
    `Delete manual` / `Keep it` buttons.
  - No stacking context above the lifted row.
- **Cut: the "· no longer in your library" branch** (the review's first cut if time ran short).
  The named-manual line matches against the library as it is now, so a deleted manual simply
  drops out of it. Keeping it would have meant remembering every manual ever named.
- **Anchored placement from 768px, not only at 1024px and up.** The 768–1023 ledger has room for
  it, and the bottom sheet is kept for phones.
- **The confirmation's width follows the ledger's columns** instead of a fixed 360px (see pass 1).
- **The thinking line is part of `Conversation`**, not its own component: it is one `<li>`.
- **`cues.ts` became `cuePrompts.ts`:** macOS's case-insensitive file system can't hold both
  `cues.ts` and `Cues.tsx` for TypeScript's module resolution.
- **The row collapse uses the Web Animations API**, timed from the tokens, rather than a
  `grid-template-rows` transition. The row has to finish leaving before `deleteManual` removes
  it, and reading `--dur-base` makes reduced motion instant for free.

## Response to code review

- **The name matcher marked manuals nobody named, and missed named ones.** It was rewritten to
  the review's rules:
  - a match needs at least one title word or at least two subtitle words;
  - 3-letter title words count (`cat`);
  - `-ies` becomes `y` (`parties` → `party`), and `-ed` is dropped from long words
    (`haunted` → `haunt`);
  - the seed-specific stop words are gone.
- **What replaced those stop words:** title words ending in `-ing` are ignored, because they name
  an activity, not a topic. Without that rule, the frozen treehouse message ("…building a
  treehouse") would mark *Building a Backyard Observatory* in the thinking and streaming states.
  `through` joined the function-word stop list, so "walk me through it" no longer counts as two
  Haunt subtitle words.
- **The test** uses an inline list of manuals, covers every negative case from the review, and
  includes typed curly and straight apostrophes.
- **The confirmation** writes its left and width before reading its height. Its text inset is
  read from the panel's computed border and padding instead of a mirrored constant. Geometry was
  checked live: at 1440 its text starts at x 556, the Written column's line; at 1024 it keeps its
  360px minimum.
- **Off-grid sizes are gone or named:**
  - the 32px buttons use `min-height: var(--space-8)`;
  - `--dock-field-pad`, `--meta-nudge`, `--said-rule` and `--field-border` are derived tokens in
    `tokens.css`;
  - the `kbd` padding is on the grid.
- **One `NewestButton`** serves the panel and the phone sheet.
- **Nits:**
  - `ComposerState`, `NewestJump` and `Cue` are no longer exported, and the composer props are
    spread;
  - the phone sheet's open at load explicitly leaves focus where it is (checked: `BODY`);
  - `AgentStatus` and `findRow` are used throughout;
  - `useFocusShortcut` takes only the field;
  - the keyframes are prefixed `library-a-`.

## Known limits

- `field-sizing: content` (the growing field) is Chromium-only today. Elsewhere the field keeps
  its resting height and scrolls, which still works.
- The phone dock's clearance (`--dock-height`) is fixed at its resting height. While a long draft
  grows the dock, the last row can sit under it until the draft is sent.
