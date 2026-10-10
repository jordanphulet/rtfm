# Library C — build notes

## Screenshot passes

Every pass ran `npm run check:library -- c` and `npm run shot:library -- c` (16 of 16, no errors),
plus extra captures at 800, 1100 and 1920 wide and with reduced motion from a dev server on 5194.

### Pass 1: first build

- **Desktop:** the seven-row table and the dock fit one 1440 × 900 screen, as the spec budgeted.
  The script, write head and settle read as the reader's language.
- **Fixed:**
  - The `/` keycap sat on Send's baseline, not the text line; it is now centred on the first line.
  - Delete sat 2px below the other cells; its offset is removed.
  - The empty library's text ran into its link: a generic `p { margin: 0 }` outranked the
    paragraph's own margin. Margins are now set on each element.
  - The skip link (`position: fixed`, moved off-screen with a transform) showed up mid-page in the
    full-page capture. It is now `position: absolute`.

### Pass 2: phone and in-between widths

- **Phone rows:** the meta line (`3 of 14 written · opened yesterday`) wrapped mid-phrase, because
  it shared its line with Delete. Delete moved to the right of the title line, and the meta line
  is now a wrapping flex row whose halves stay whole.
- **1024–1199:** Library ↑ kept its space while hidden, which pushed the dock's suggestions about
  80px right of the text edge. It now hangs in the tag column under "You", so hiding it moves
  nothing.
- **Desktop empty conversation:** the conversation rule sat over empty space. It is now left out
  at 1024px and up until the conversation has something in it.

### Pass 3: details

- **Hints:** the key hints and keycap showed in the phone shots (the capture doesn't emulate a
  touch device) and wrapped to two lines. They now appear only at 768px and up, as well as on
  hover-capable devices.
- **Stage directions:** seven deletes in a row stacked 44px apart. They now sit 8px apart, 24px
  after an exchange and 48px before the next.
- **Code:** both the page and the dock defined the same suggestion handler; there is now one.

## Live checks (dev server on 5194, Playwright)

- **Thinking, then streaming, then scrolling up:**
  - with `?conversation=demo`, sending "help" placed the new exchange at 32px from the top in the
    same frame, with "Thinking…" under it;
  - the reply streamed with the write head, and the page didn't move;
  - a wheel scroll up of 500px during the reply stayed exactly where it was until the reply
    finished (scrollY 960 before and after).
- **On load:** with `?conversation=demo`, the newest exchange was at 32px.
- **Draft during a reply:** Enter during a reply keeps the draft and sends nothing.
- **Keyboard:**
  - `/` from the page focuses the input; Home returns to the library;
  - Tab order: skip link → Start a new manual → each row's link (ring around the whole row) and
    Delete.
- **Start a new manual:**
  - with an empty input it fills `Let’s start a new manual about ` with the caret at the end;
  - with a draft, it keeps the draft.
- **Delete:**
  - focus opens on Keep it; Tab cycles between the two buttons; Escape keeps the manual and
    returns focus to its Delete;
  - Delete manual collapses the row, moves focus to the next row's link, and writes the stage
    direction.
  - Deleting all seven moves focus to the empty state's link. A reload restores all seven.
- **No horizontal overflow** at 375, 800, 1100 or 1920 (`scrollWidth − clientWidth` is 0).
- **Reduced motion:** the write head shows as a steady bar and lamp; nothing animates.
- **No console errors.**

## Deliberate deviations from the first spec

These were folded into SPEC.md after review.

- **The dock** is `position: fixed` with measured bottom padding, not sticky. A sticky child of
  `<main>` couldn't span the viewport.
- **No Follow.** Every canned reply fits the room the send makes.
- **The margin index** is a static jump list.
- **`--window-height`** comes from `window.innerHeight` rather than `100dvh`.

## Known limits

- In the full-page `conversation` capture, the dock and the sticky margin index are drawn where
  the viewport was (the page is scrolled to the newest exchange), so the index appears halfway
  down the image. In a real window both sit where the spec says.
- After a mouse-driven delete, focus moves to the next row's link without a visible ring, because
  `:focus-visible` follows the browser's pointer heuristics. Keyboard users get the ring.

## Response to code review

- **Skip link (rule gap):** moved inside the inert `.page`, so it can't be focused while the
  confirmation is open. Both live regions (the reply and the deletion) now sit outside `.page`,
  so they keep announcing while the confirmation is open.
- **Placement after the font swap:**
  - on load, the newest exchange is placed again on the next frame, after `fonts.ready`, and on
    the first `loadingdone`;
  - each one reads whichever exchange is newest at that moment, behind a cancelled flag with
    cleanup;
  - the reviewer's warm-browser case (375, `?conversation=demo&agentFreeze=0.5`) now lands at
    32px, not 8px. Its likely cause was that the page measures (`--window-height`,
    `--dock-height`) are set in the parent's layout effect, which runs after the child's
    placement; the next-frame placement covers it.
- **`useInView`:** uses the last entry.
- **The leaving row** is `inert` for its 250ms collapse. A second click can't re-delete it or write
  a second stage direction (checked live).
- **Tokens:** the keycap size, the meta row heights and the hanging-name offsets moved into
  `tokens.css`.
- **Nits:**
  - `STARTER_PROMPT` is no longer exported;
  - the type is now `ExchangeData` (no import aliases);
  - stage-direction ids come from the list's length;
  - the keyframes are now `c-write-head-in` and `c-margin-row-in`;
  - the collapse reads `--dur-settle` in either `ms` or `s`;
  - after the last delete, the empty state is focused from an effect;
  - the textarea refits its height when its width changes;
  - SPEC.md describes the WAAPI collapse.
- **Checks:**
  - `npm run check:library -- c` passes, and `npm run shot:library -- c` saves 16 of 16 with no
    errors;
  - the reviewer's script (run on 5194):
    - load and send both place the newest exchange at 32px;
    - scrolling up during a reply holds;
    - with the confirmation open, the skip link is inert;
    - focus returns as specified;
    - `/` focuses the input and then types normally;
    - phone placement is 32px, with no horizontal overflow and no console errors.
