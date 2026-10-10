# Design C (Lamplight): design review

Reviewer: independent design review, P2.C.review. I judged the desktop first (1440, then 1100–1279),
then the phone (375).

**Evidence used**
- `npm run shot -- c`: 18 of 18 shots, no console errors. I looked at every one, including
  `streaming-full-*` and both `-reduced` shots.
- Live checks with my own Vite server on port 5184 (stopped through its handle). I drove it with
  Playwright scripts kept in the scratchpad:
  - streaming at 1440 and 375;
  - keyboard and drawer;
  - lane previews and popovers;
  - widths 1100, 1180, 1279, 1280, 1099, 900, 768 and 375;
  - start-page house hover, `requestAnimationFrame` counts, offscreen, hidden and reduced-motion
    behaviour;
  - contrast computed from `tokens.ts`;
  - line length measured per rendered line with `Range.getClientRects()`.

## Verdict

The section page is the strongest reading surface I've seen in this project. It's a calm,
large-serif column on a blue-black ground, streaming is rock-solid, and the chrome really does stay
out of the way. The signature house is a strong idea that doesn't fully land yet: it barely reacts
to hover, its "being written" lamp is hard to tell from a lit window, and two smaller things keep
it below a professional ship (the phone measure is a hair short, and tables are weak at mid and
phone widths).

## Locked rules

| Rule | Result | Evidence |
| --- | --- | --- |
| Data untouched; design stays in `src/designs/c/`; no new packages | Pass | Only `src/designs/c/**` is design code. The imports are React, the router, `three`, the shared hooks, `<Markdown>` and fonts. |
| Shared hooks and renderer, styled not forked | Pass | `Prose.tsx` passes `components` to the shared `<Markdown>`. Footnote previews clone the rendered note, so no second renderer is needed. |
| Routes `/c` and `/c/:sectionId` | Pass | `/c` is a real start page; section routes work, including SPA navigation from the drawer, prev/next and the house. |
| `data-shot="toc-toggle"` when the TOC is behind a control | Pass | It's on the corner Contents button (≥1100) and on the bottom-bar button (<1100). The `toc-*` shots open. |
| Three states look different in the TOC | Pass, but weak | Written is a solid `--lit` 7×9 mark with an `--ink` title. Unwritten is a hollow `--ink-4` frame with an `--ink-3` title. Writing is a half-filled `--lamp` mark with an `--ink` title. The **only** thing that tells writing from written is a 4px fill and a small hue shift (see `drawer-writing-2x` crop; at 1× it's easy to miss). See fix Q6. |
| Three states look different on the section page | Pass | The meta line ends with a lamp mark and amber “Writing” (`waiting-desktop.png`), or a lit mark and “Written” (`written-desktop.png`). Unwritten never renders, because opening a section writes it. Unwritten targets show in links, previews (“Not yet written. Opening it writes it.”) and prev/next marks. |
| Waiting shows title and summary, never blank | Pass | `waiting-desktop.png` and `waiting-mobile.png` show the meta line, title, summary, “Being written. The first words are on their way.” and prev/next. |
| Streaming in the final layout; no raw markdown | Pass | Live frames: the H2 “Why a room needs a dull brain” renders as a heading mid-word; bold, italic, code and the external-link glyph are all in place. No `*`, `#` or backticks were seen. |
| Nothing above the reading position moves | Pass | Over 70 samples (85ms chunks) at 1440 and 375, the tops of the first six prose blocks and the h1 never moved by more than 0.5px. Only prev/next below the live edge moves. |
| The page never scrolls on its own | Pass | `scrollY` stayed 0 for the whole stream. Parked at the bottom mid-stream, it stayed at 73 (desktop) and 65 (phone) while `scrollHeight` grew from 973 to 1661. Following is opt-in through “Follow the writing”. |
| Prev/next across chapter and appendix boundaries | Pass | Eyebrows read “PREVIOUS CHAPTER · 2” and “NEXT CHAPTER · 3” (`dense-desktop.png`), and A.1 reads “PREVIOUS CHAPTER · 5” (`appendix-desktop.png`). ←/→ work; held keys and `.c-wide` are ignored. |
| Clear “you are here” in the TOC | Pass | The current row has a 2px `--ink` bar, `--bg-hover`, a weight-600 title, its summary and `aria-current="page"` (`toc-desktop.png`, `toc-mobile.png`). |
| TOC at most one click or tap away at every width | Pass | The corner Contents button (fixed, never hides) covers ≥1100, and the bottom-bar button covers <1100. On `/c` the TOC is the page itself. |
| Cross-references work, including to unwritten sections | Pass | Written links get a solid underline. Unwritten and writing links get a dotted underline plus a mark. The preview states the target's state (`hover-xref-unwritten-1440`). Opening one starts writing. |
| Line length 45–90 characters | **Fail (marginal, phone only)** | Desktop: median **66** at 1440, 1180 and 900. Phone: median **43, 42 and 44** across three sections at 375 (and 44–45 at 390); Literata at 16px on a 343px column doesn't reach 45. Verified fix: R1. |
| Body text at least 16px | Pass | 21px on desktop, 16px on phone (computed). |
| Body is real HTML text | Pass | Prose is DOM text; the develop effect uses `::highlight()`, which recolours only. It's selectable and findable, and the canvas is only on `/c`. |
| Desktop first; phone gets its own adaptation | Pass | Desktop has a preview lane, tables and code that widen into the lane, and a left-of-centre column. The phone has a bottom bar, a bottom sheet, the house first and full-bleed blocks. Nothing on desktop looks simplified for the phone; one desktop gap is noted under Q7. |
| 375–1440+ with no horizontal scroll | Pass | `scrollWidth === clientWidth` on four pages at 1100, 1180, 1279, 1280, 1099, 900, 768 and 375. |
| TOC and prev/next by keyboard with visible focus | Pass | Tab order: corner title → Contents → table region → links → footnote ref → back-ref → Previous → Next. Every focus shows a 2px `#CDD5DC` outline. The drawer opens on the current row, Escape closes it, and focus returns to Contents (`corner-meta-2x`). The phone sheet behaves the same. |
| WCAG AA text contrast | Pass (one caveat) | Against `--bg`: ink 12.95, ink-2 7.95, ink-3 5.75, lit 9.10, lamp 9.09. On `--bg-hover`: ink-3 4.80. On `--bg-raised`: ink-3 5.33. `--ink-4` is non-text only (3.91 ≥ 3:1). Caveat: in the developing tail, `--fresh-1` computes to about **1.9:1** and `--fresh-2` to about **4.0:1**. That's transient (under a second per word), but the newest 40 characters are briefly hard to read (Q5). |
| `prefers-reduced-motion` | Pass | Reduced: no develop highlights (`streaming-desktop-reduced.png`), the drawer fades, previews and follow are instant, and the house makes **0 rAF calls**, idle and while a section writes (a still frame). |
| Tokens in one place; modular scale; 4px grid | Pass | `tokens.ts` defines every colour, size, space, radius and timing, emitted as one stylesheet; no stray hex in the CSS. The scale is 1.2 from 21 (12/15/18/21/25/36/44, plus 13 and 16 as utility steps), and spacing runs 4…128. A few literal component sizes remain (36px follow height, 40/44px buttons, 16px checkbox, 560px start column), all on the grid. |
| At most two families plus mono; not #000 or #fff | Pass | Literata, Instrument Sans and JetBrains Mono, on `#0A0F15` with `#CDD5DC` text. |
| Curly quotes, dashes, ellipsis; tabular numbers | Pass | “Still being written…”, `·`, en dashes in tables; `tnum` on labels, tables, counts and footnote numbers. |
| `balance` on headings, `pretty` on settled body, plain wrap while streaming | Pass | Settled sections have p `pretty` and h2 `balance`. A streaming section's p computes to `wrap`. |
| Clear hover and focus on every interactive element | **Fail (house windows)** | Every HTML control has both. **House windows don't have a visible hover**: `HOVER_LIFT = 0.08` (`house/scene.ts:35`) moves the glass 8% toward ink, which is invisible on a lit window and barely visible on a dark one (`house-window-hover-m`, `house-row-hover-m`). The only feedback is the pointer cursor and a caption about 600px below. |
| UI transitions 150–250ms with deliberate easing | Pass | Transitions run 150/200/240ms on `cubic-bezier(0.2,0,0,1)`. The 900ms `--t-flash` (`:target` footnote background) is a highlight fade, not UI motion, and is acceptable. |
| Signature: serves reading, never behind text, calm fallback | Pass | The house is an index of what exists, sits beside the text (above it on phone), and is never under text. Its stage is `aria-hidden`, and the HTML list mirrors it. Reduced motion gives one still frame. The loop pauses offscreen (phone 0 rAF/s when scrolled away), when hidden (0) and at idle (0 after easing). |

### Banned list

| Item | Result |
| --- | --- |
| Gradients, glass, blur, glows, neon | Pass. There are no gradients or `backdrop-filter`; the only `box-shadow`s are inset fills (the writing mark and the current-row bar). WebGL uses Lambert and Basic materials with no bloom. |
| Emoji as icons | Pass. Every glyph is inline SVG. |
| Rounded cards with shadows everywhere | Pass. Raised panels are flat with a 2px radius. The corner mark's raised box is the one card-like object (see “also noted”). |
| Pills | Pass. |
| Inter on slate-900 | Pass. |
| Purple or blue AI accent | Pass. The accent is amber and gold and means state. |
| A border on every element | Pass. Hairlines appear only on table rows, rules, the drawer edge and the follow button. |
| Centring everything | Pass. Everything is left-aligned; only the house caption is centred. |
| Giant hero with little content | Pass. The 44px title is followed by the full contents. |
| Decorative icons | Pass. |

## Scores (1–5)

| Area | Score | Evidence |
| --- | --- | --- |
| Hierarchy | 4 | The section page reads cleanly: meta (15 sans `--ink-3`), h1 36, summary (18 sans `--ink-2`), then body 21, and the text is the loudest thing on screen (`written-desktop.png`). On `/c`, though, **Begin** uses the same 21/600 serif as the chapter headings and repeats 1.1's title and summary about 200px above the 1.1 row (`start-desktop.png`). |
| Spacing consistency | 4 | The 4px grid holds and the rhythm is even (64 above H2, 20 between paragraphs, 96 to prev/next). Wide blocks end at arbitrary right edges: in `dense-desktop.png` the table ends at about x=1127 and the code at about x=1188. |
| Reading comfort | 4 | Desktop is excellent: 21/34 Literata at 66 characters and 12.9:1 contrast. The phone measure is 43 (below the rule), with heavy hyphenation (four breaks in seven lines in `written-mobile`). The blockquote looks like a stray indented paragraph (`dense-desktop`, “A ghost that pauses…”). |
| State clarity | 3 | The section-page meta line is very clear. Elsewhere state rests on 7×9px marks: writing versus written in the drawer, a lamp in the house that is barely warmer than a lit window (`house-writing-m`), and an inline unwritten mark that reads as a missing-glyph box (“Sensors and Controllers ▯.”, `written-desktop.png`, `hover-xref-unwritten-1440`). |
| Streaming feel | 4 | It's stable, with no self-scroll, and it really does look like the page is developing. The marks move forward at about 12Hz, so it reads as a soft wave, not flicker. But the tail is 160 characters in three hard steps: about 2.5 lines are dim at 1440 and about 4 at 375 (`m-stream-04`), heavier than Claude's one line. The opaque “Follow the writing” box sits in the middle of the column over the text (`streaming-desktop.png`, beside “A room, in states”). |
| Phone layout | 3 | It's a genuine adaptation (bottom bar with ‹ ›, a bottom sheet, the house above the title), but several pieces are weak (fix Q4): **tables** have 3–5-line rows with blank cells, and the fourth column is cut exactly at the edge with no hint that it scrolls (`dense-mobile`). **Appendix tables** show a lighter sticky first column on the cellar ground, because it uses `background: var(--bg)` on `--bg-cellar`. **Code** is clipped mid-token. |
| Signature moment | 3 | The concept is excellent: the house is the manual, lit means written, and the basement holds the appendices. The model has real craft (inset sashes, string courses, a side chimney, a railing), and the loop discipline is exemplary. But at a glance it's a dark, low-contrast silhouette with flat beige rectangles. It barely responds to hover, the writing lamp's flicker (75–100% lamp, `scene.ts:237`) is hard to notice, and the railing slices the basement windows into barcodes (`start-desktop.png`, bottom). It reads closer to a nice illustration than to the living index it's meant to be. |
| Would a professional ship this | 3 | Not as it stands: two rule misses, the house's dead hover, and phone tables. The section reader alone is close to shippable, so one focused round should get it there. |

## Against `docs/inspo/c/`

- **Stripe Press home.** The objects are rich and textured. They fill the centre of the frame
  with obvious depth, and they react strongly to the pointer. C's house is nearly monochrome, sits
  at about half the stage width, shows only a sliver of side wall at 15° yaw, and gives almost no
  response. Stripe's chrome is unboxed type on the ground, while C's corner mark sits on a visible
  raised box.
- **Claude streaming, start and later.** The fade covers only the newest few words, and it's
  smooth. C's three stepped bands over 160 characters dim two to four lines at once, and the
  boundaries show as tone steps in still frames (`streaming-full-desktop.png`). C does match
  Claude's best trait: everything above the newest words is locked.
- **Claude finished.** The jump-to-bottom control is a small round icon that doesn't cover the
  text. C's control is a wide labelled rectangle centred in the reading column.
- **Where C beats the references:** state is legible at the reading position (the meta line), the
  waiting state shows the real title and summary, and previews in the lane don't cover the
  column at ≥1280.

## Prioritized fix list

### Rule failures

**R1. Phone measure below 45 characters at 375–389px** (`section.css` ≤600 block and
`prose.css` ≤600 block). At `max-width: 400px`:
- set `.c-reader { grid-template-columns: var(--space-3) minmax(0, 1fr) var(--space-3); }`
  (12px gutters);
- set `.c-prose { letter-spacing: -0.015em; }`.

I measured this combination at 375: median **45, 45 and 46** characters per line across
`sensing-the-guest`, `the-half-second-problem` and `the-director`, against 43, 42 and 44 now.
Neither change alone is enough, and `opsz` has no effect. Re-measure after the change.

**R2. House windows need a visible hover** (`house/scene.ts`).
- Add the hover outline the SPEC budgets as its fifth draw call. That's one reusable frame
  mesh, about 0.06 units, in `--ink-2`, moved to the hovered window's slot and hidden otherwise.
- Raise `HOVER_LIFT` (`scene.ts:35`) from 0.08 to about 0.3, so a dark window visibly lifts.
- The result must be obvious at 1× in a screenshot taken while hovering a contents row (row hover
  already sets `hoveredId`).

### Quality fixes (highest impact first)

**Q1. The inline “not yet written” mark reads as a missing-glyph box** (`window-mark.css`,
`.c-xref .c-window-mark` at `prose.css:266`).
- Draw the unwritten and writing marks as windows, not empty boxes: add a 1px centre glazing bar
  (horizontal and vertical, in the frame colour) inside the 7×9 frame, so it echoes the house's
  sashes.
- In running text, add `margin-left: 0.2em`, and lift it to sit on the x-height.
- Check “Sensors and Controllers ▯.” in `written-desktop.png` no longer looks like tofu.

**Q2. Make the writing lamp unmistakable in the house** (`scene.ts:237`, plus the basement
railing in `model.ts:158`).
- **Flicker.** Change the flicker to `0.45 + 0.55 × flicker()` so it dips visibly toward dark
  glass.
- **Lamp colour.** Render the writing window in pure `--lamp` and written windows in `--lit` at
  about 85%, so the two separate.
- **Sills.** Give each lit window a flat `MeshBasicMaterial` sill strip in `--lit` mixed 40% into
  trim. That reads as light on the sill, not a glow.
- **Railing.** Lower the areaway railing (or set it forward and thinner) so the four basement
  windows read as windows, not barcodes.

**Q3. Table cells break numbers from units at 1100–1279** (“700 / ms” and “1,550 / ms” in
`hover-xref-1180`).
- Move `.c-prose td:not(:last-child) { white-space: nowrap; }` (`prose.css:388`) out of the
  ≥1280 block into a `(min-width: 601px)` block.
- The `.c-wide` wrapper already scrolls if a table ever exceeds the measure.

**Q4. Phone tables** (`prose.css:404–436`).
- **Cell widths.** Set text cells to `min-width: 10em`. Set right-aligned (numeric) cells to
  `min-width: 0; white-space: nowrap`, so rows drop from 3–5 lines to 1–2.
- **Scroll hint.** Size the visible width so the last visible column is cut mid-cell, which shows
  that the table scrolls; the 16px inner padding plus the wider text cells does this.
- **Cellar stripe.** Give the sticky first column the page's ground, not `--bg`. Add a
  `--page-bg` token that the appendix (`[data-cellar]`) sets to `--bg-cellar`, and use it in
  `section.css:1` and on the sticky cell. That removes the lighter stripe on appendix tables.
- **Code.** Clip code blocks on a token boundary, which already happens. Add 16px of right
  padding inside the scroller, so the last character isn't flush with the screen edge.

**Q5. Shorten and soften the developing tail** (`tokens.ts:36–39`, `82–84`).
- Use levels of **24 / 40 / 48** characters instead of 40 / 60 / 60.
- Raise `--fresh-1` to 40% and `--fresh-2` to 62%.

That keeps the darkroom idea, makes the newest words readable at about 2.6:1 rather than 1.9:1,
and brings the dim zone to about one line at 1440 and two at 375. Re-shoot `streaming-full-*` to
confirm all three steps are still visible.

**Q6. Name the writing state in the drawer and the start-page contents** (`ContentsList.tsx`
Row). For `status === "writing"`, append a caption-size “Writing” in `--lamp` after the title,
as the meta line already does. Today a 4px half-fill is the only cue.

**Q7. Move “Follow the writing” out of the text column on desktop** (`follow-control.css`).
- At ≥1100, make it `position: fixed; bottom: var(--space-7)`, with its left edge 24px to the
  right of the column. At ≥1280 that puts it in the lane, so it never covers a line of text.
- Keep the in-column sticky version for <1100, where it sits above the bottom bar.
- Positions above the live edge stay put, because it remains an overlay.

**Q8. Start page: make Begin the one primary action, and stop repeating 1.1**
(`StartPage.tsx`, `start.css` `.c-begin`).
- Drop `.c-begin-summary`, because the 1.1 row directly below repeats it word for word.
- Set the Begin title at `--size-h2` (25/32) weight 540, so it outranks the 21/600 chapter
  headings it currently matches.

### Also noted (not for this round)

- **Blockquote.** The blockquote (roman, `--ink-2`, 2em indent, no device) reads as a mis-indented
  paragraph. A 1px `--line-strong` rule hung at −24px would mark it without making it a pull-quote.
- **Footnote preview glyph.** In the footnote preview, the ↗ glyph wraps to the start of a line
  (“turn-taking / ↗ find”, `hover-footnote-1440`). Apply the prose's `nowrap` to `.c-preview-note
  a.c-external`.
- **Popover placement at 1180.** The popover opens *above* the link and covers three lines just
  read (`hover-xref-1180`). The SPEC says 8px under it, and there are 254px of empty right margin
  at that width.
- **Corner mark backing.** Its raised box (`chrome.css:1`) is the one visible “card”. Painting it
  in the page ground (`--page-bg`) would keep it opaque while matching Stripe's unboxed wordmark.
  At 1100, checklist boxes (left edge 180px) pass 10px under it while scrolling; text never does.
- **Focus while the drawer is open.** Tab can reach the shared design switcher (A/B/C), which sits
  outside `.c-page` and so isn't `inert`. It's harmless and outside C's tree, but inerting body
  siblings would close it.
- **Phone switcher overlap.** The shared switcher overlaps the phone bottom bar's › button live
  (it's hidden in shots). That's not C's code.
