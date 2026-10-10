# Design C — build notes

## Pass 1

**Saw**
- Every section page threw “destroy is not a function”: `window.scrollTo` now returns a promise in
  Chromium, and an arrow effect returned it as its cleanup.
- The start page threw on load: the render loop’s `setVisible` used `this` after being passed as a
  bare callback.
- Footnote references sat apart from their word (“conversation.  ¹  Leave”) because of a 24px
  minimum width and padding.
- The follow control kept its 68px slot after a section was written, leaving a hole above
  previous/next.
- The drawer scrolled the current row to the middle, which pushed the drawer’s header off the top
  in the `toc` shot.
- Phone tables squeezed four columns into 343px and hyphenated every cell (“detec-tion”). Phone
  hyphenation also split inline code (“cen-tre”).
- The house: the ground plane read as a lighter slab with a visible edge, and the chimney was
  hidden behind the ridge.

**Changed**
- Braced the scroll effect, and rewrote the loop’s methods as plain closures.
- Footnote references use a slim inline padding.
- The follow control is only rendered while the section is not yet written. The space it leaves
  is below the live edge, so nothing above moves.
- The drawer scrolls the current row only if it is out of view (`block: "nearest"`).
- Phone table cells have a 7.5em minimum and no hyphenation, so the table scrolls sideways in its
  own container. Code is never hyphenated.
- Removed the ground plane. The chimney is now an external stack up the side wall facing the
  camera, so it adds to the silhouette.

## Pass 2

**Saw**
- With the ground plane gone, the house reads as one clean silhouette. The side chimney stack
  gives the left edge a real profile, but at 1.1 units deep it read as a second tower.
- In the servo table, “4.8–6.6 V” and “2.5–3.5 N·m” broke across lines even though the lane had
  room.
- The developing tail is below the fold in the frozen `streaming` shot (the locked rule forbids
  scrolling to it). A full-page capture of `?freeze=0.5` showed all three levels working, but the
  level boundaries cut words in half (“ho|w long”), which looked like a rendering glitch.
- Live checks (Playwright on port 5179):
  - Streaming 3.2 at the top of the page, nothing above the live edge moved over 60 samples, and
    `scrollY` stayed at 0.
  - Parked at the bottom mid-stream, `scrollY` never changed on its own.
  - Follow scrolled with the stream and stopped on an upward wheel.
  - Streaming paragraphs used `text-wrap: auto`; an already-written section used `pretty`.
- Escape closed the drawer, but focus landed on `<body>`: the opener was still `inert` at the
  moment it was focused.
- In the footnote preview, the ↗ glyph wrapped onto its own line after “turn-taking”.

**Changed**
- Slimmed the chimney (0.8 × 0.9).
- At wide widths, every table column except the last is `nowrap`. The prose column keeps its
  measure, and the table grows into the lane instead.
- The develop levels start at word boundaries.
- Focus returns to the opener in an effect after the drawer has closed and `inert` is gone.
- External links are `nowrap`, so the glyph stays with its word.

## Pass 3

**Saw**
- In the browser pane, the start page’s stage was empty. The pane reports
  `visibilityState: "hidden"`, so `requestAnimationFrame` never fired, and on-demand frames
  (first paint, resize, status, hover) all waited on it.
- Close crop of the house: the silhouette, inset sashes, string courses and side chimney read well
  in moonlight. The roof slopes were almost black and merged with the bargeboards.
- At 1180 and 900px: no horizontal scroll, about 69 characters per line, and the corner mark and
  bottom bar handed over cleanly at 1100.
- The `-reduced` shots: the house is a still frame with the same lit windows, and the streaming
  page has no develop tint.
- Footnote references still had a hair too much space on the left.
- I tried `pretty` instead of `balance` on the section summary, and it left two-word last lines
  (“can override.”).
- Live checks on a 375px phone: no movement above the live edge over 60 samples, no self-scroll at
  the bottom, and follow starts and stops correctly.
- After 1.2 streamed in, it kept normal wrapping, including when I left it and came back
  (`data-settled` stays off). No highlights were left behind.

**Changed**
- On-demand frames now render synchronously. `requestAnimationFrame` is used only for the
  animation loop (pointer easing, the flickering lamp, colour easing), which still pauses when the
  tab is hidden or the canvas is off screen.
- Lightened the roof (`#1F2833`) so the moon picks out the slopes against the night.
- Trimmed the footnote reference padding.
- Kept `balance` on the summary. It comes from the contents data and never renders partially.

## Pass 4 (code review fixes)

**Changed**
- **Arrow keys:**
  - ←/→ ignore auto-repeat and already-handled events, so holding a key no longer opens every
    section it passes.
  - They also leave the focusable `.c-wide` table and code wrappers alone, so those can scroll
    sideways.
  - `SectionPage` is keyed by id, so the shell, drawer and bottom bar stay mounted across
    navigation.
- **Drawer:**
  - Escape is a document listener while the drawer is open.
  - The panel takes focus (`tabIndex={-1}`) when plain text inside it is clicked.
  - The drawer’s styles moved to `drawer.css`. The follow control and prev/next styles moved next
    to their components.
- **Previews:** they close on Escape, and add `c-preview` to the trigger’s `aria-describedby`
  while open, keeping the renderer’s `footnote-label`.
- **Follow control:**
  - It is rendered only while writing, and its listeners attach once.
  - Its threshold is the prose’s computed line-height (the old constant was wrong on phone).
  - It is never made `inert` while it has focus.
- **Developing tail:** it checks for `CSS.highlights`, walks backwards for about 200 characters
  instead of joining the whole body on every chunk, and treats block starts as word starts.
- **House:**
  - No per-frame allocations.
  - Reduced motion is a live setter, so the scene is built once per canvas.
  - Dispose also disposes the `InstancedMesh` and calls `forceContextLoss()`.
  - One-off renders are coalesced per microtask.
  - Pointer handling is a closure with one `getBoundingClientRect` per move.
  - If WebGL or the chunk fails, the stage is removed and the start page is text only.
- **Tokens:** spacing steps are generated from one exported scale (`space(n)`, also used for
  preview offsets). The label and mark column widths and the UI glyph size moved to `tokens.ts`.
  Removed dead table-alignment and checklist CSS.
- **Kept on purpose:** one-off frames still render while the tab reports `hidden`. Claude’s
  browser pane reports `hidden` while it is on screen, and skipping showed an empty stage there.
  It is one frame, never a loop.

**Saw**
- After the move to `base.css`, the start page’s lamp count lost its spacing and size, because the
  shared rule now loaded after `start.css`. I scoped the start-page rule to win.
- `streaming-full-desktop` shows the three-level tail.
- Live checks on port 5179:
  - Held ArrowRight stays put, and ArrowRight inside a table wrapper stays put.
  - After clicking the legend, Escape still closes the drawer and focus returns to Contents.
  - Navigating from the drawer closes it and lands at the top.
  - The preview closes on Escape, and `aria-describedby` is added and restored.
  - Four start-page round trips leave one canvas and no errors.
  - With `getContext` stubbed to fail, the stage is gone and nothing is thrown.
  - Streaming at 1440 and 375: no movement above the live edge, no self-scroll, follow works.
