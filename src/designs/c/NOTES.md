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

## Pass 5 (P3 review round)

**Saw**
- With the reviewer’s phone fix (12px gutters and −0.015em tracking at ≤400px), the median line
  length is 45, 46 and 46 characters at 375 across three sections, and 47–48 at 390. Desktop stays
  at 64–66.
- The house hover outline already existed but was invisible. It was drawn at glass depth, inside
  the wall around the opening, so the reveal hid it. The 8% glass lift barely showed.
- The writing window, flickering at 75–100% in a single pane, looked like a slightly oranger lit
  window.
- After narrowing the phone gutter, wide tables and code still bled by the old 16px, which made
  the page 379px wide at 375 (`dense-mobile` was 379px). The coordinator flagged the same thing.
- The sill light and the lower-sash lamp: in a close crop of the start page with 1.2 writing, the
  lit lower sash under a dark upper sash is unmistakable and echoes the drawer mark. The kerb
  railing no longer cuts the basement windows into barcodes.
- Hover from a contents row (4.2) and from a window (2.2): a bright frame around the window, lifted
  glass, the row highlighted, and the caption naming the section.

**Changed**
- Moved the outline in front of the wall and sill, made it 0.09 units in `--ink`, and raised the
  hover lift to 30%.
- Split each window into two sash instances. A writing window lights only its lower sash (pure
  lamp, 45–100% flicker) with an 18% spill above. Written windows are `--lit` at 85%.
- Added sill-light strips to the same `InstancedMesh`, so no extra draw call.
- Replaced the full-height railing with a kerb and a short railing at street level.
- Raised pointer parallax from ±2° to ±4° and tightened the house framing a little.
- Added a `--gutter` on the reader that the phone bleed and the sticky first column use.
  Re-checked eight pages at 375, 390, 768, 1100, 1180, 1280 and 1440: no horizontal overflow, and
  every phone screenshot is 375px wide.

## Response to review

| Item | Status | Notes |
| --- | --- | --- |
| R1 Phone measure | Done | 12px gutters and −0.015em tracking at ≤400px. Measured medians are 45/46/46 at 375 and 47–48 at 390. |
| R2 House window hover | Done | An `--ink` outline in front of the wall and sill, and a 30% lift. Obvious at 1× from both the window and the contents row. |
| Q1 Inline unwritten mark looks like tofu | Done | Every window mark now has a 1px cross of glazing bars. In text it sits on the baseline with 0.2em before it. |
| Q2 Writing lamp | Done | The lower sash is lit in pure lamp with a 45–100% flicker, the upper sash is dim, written windows are lit at 85%, there is sill light, and the railing is lowered to street level. |
| Q3 Table numbers breaking at 1100–1279 | Done | Every table column except the last is `nowrap` at ≥601px. |
| Q4 Phone tables | Done | Text cells have a 10em minimum, numeric cells don’t wrap, the cut column shows the table scrolls, sticky cells use `--page-bg` (no cellar stripe), and code gets extra right padding. Also fixed the 4px page overflow. |
| Q5 Tail too long and dim | Done | 24/40/48 characters at 40/62/80% ink. `streaming-full-*` still shows all three steps, now about one line at 1440. |
| Q6 Name “Writing” in the contents | Done | A caption-size “Writing” in `--lamp` after the title in the drawer and start-page rows (`aria-hidden`, because the mark already says it). |
| Q7 Follow button over the text | Done | Fixed and caption-size at ≥1100, 24px right of the column (in the lane at ≥1280). Checked at 1100, 1180, 1280, 1440 and 1920: the gap is always 24px, and it is on screen. It stays sticky in the column below 1100. |
| Q8 Begin hierarchy | Done | The summary is dropped and the title is set at 25/32, weight 540. |
| Also: blockquote device | Done | A 1px `--line-strong` rule hangs 24px left. |
| Also: ↗ wrapping in footnote previews | Done | `nowrap` on external links in previews. |
| Also: popover above the link at 1180 | Skipped | It only flips above when there isn’t room below, as the spec says. At 1100–1279 the right margin (214–303px) is narrower than a 288px preview plus its gap, so the margin isn’t a reliable home. |
| Also: corner mark backing | Done | Painted in `--page-bg`, so it is unboxed type that is still opaque. |
| Also: switcher reachable while the drawer is open | Skipped | Outside C’s tree. The coordinator says the shared switcher now goes inert while the drawer is open. |
| Also: switcher over the phone bar | Skipped | Outside C’s folder. It has been moved by another task. |

## Pass 6 (code review follow-up)

- Restored the `.c-contents[data-variant="start"]` prefix on the start-page summary size (a
  replace had matched twice). The drawer’s current-row summary is caption size again. Deleted the
  duplicated `.c-row-writing` block.
- The sill-light matrices are placed in `setStatuses` and uploaded only there. Per frame, the loop
  writes colours only.
- Merged each phone block back into one 600px block followed by a 400px override, in
  `section.css` and `prose.css`.
- The numeric-cell selector is `[style*="text-align: right"]`. React serializes it as
  `text-align: right;` (checked live, and it computes `nowrap`).
- Removed the no-op `vertical-align: 0` on the inline mark. In a 2× crop, the 9px mark on the
  baseline already spans the x-height, so lifting it read as floating.
- A raycast hit with no `instanceId` now returns nothing instead of window 0.
- The sill dimensions are one exported `SILL` constant, used by the model and the scene.
- The follow control sits 16px right of the column at 1100–1279 (24px at ≥1280) with tighter
  padding. At 1100 it now clears the right edge by 33px (`f1100` crop).
- The written mark’s glazing bars use the house’s glass tone (`--glass`), so they read in the
  drawer and on hovered rows.
- Re-checked live:
  - streaming at 1440: no movement above the live edge, no self-scroll, follow stops on an upward
    wheel;
  - the house’s writing sash, sill light and hover are still in place;
  - reduced motion makes 0 rAF calls.
