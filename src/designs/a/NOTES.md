# Design A — build notes

## Pass 1

**Saw**
- The skeleton holds at 1440: index · text · outline. Hanging `3.1`, the head rule meter at 50%, the
  ring states and the waiting tail line with its write head all read as specified.
- The written state was close to a generic dark docs template: H2s were plain bold lines, and
  the only typographic signature was the hanging section number.
- Numeric table cells wrapped (`150` / `ms` on two lines) in the 2.4 budget table.
- The TOC column always scrolled to centre the current row, so on most pages the manual title and
  count were scrolled out of view.
- Start page (phone): the meta line broke as “· 7 / written”.
- Pager (phone): stacked cells kept “Next” right-aligned, which looked misplaced in one column.
- External-link corner mark sat a little far from its word.

**Changed**
- **Clause numbers.** Every H2 now carries a hanging clause number (`2.4.1`, `2.4.2` …) in the
  gutter, set like the hanging section number, built with a CSS counter and the section label as a
  custom property. It doubles as the heading’s anchor link (replacing the hover `#`), and the
  outline shows the same numbers. This is the engineering-manual trait (numbered clauses) that
  separates A from a docs template, without adding any colour.
- Right-aligned (numeric) table cells no longer wrap.
- The TOC column only scrolls when the current row would sit in its lower 40%.
- Meta items on the start page never break inside an item.
- Phone pager cells are both left-aligned.
- Corner mark tightened to 0.2em.

## Pass 2

**Saw**
- Clause numbers give the written pages the numbered-manual look (2.4.1, A.1.3 …) and line up with
  the hanging section number; the outline repeats them.
- Bug: the footnotes block’s own (hidden-label) `h2` went through the numbered heading component,
  so “Footnotes” got a stray clause number and lost its `footnote-label` id.
- Outline rows with a number wrapped under the number instead of hanging.
- Phone tables: with `width: max-content` no cell wrapped, so the A.1 steppers table ran one
  sentence per row far off-screen.
- Live check (Playwright, port 5177): the cross-reference preview opened *above* links that had
  room below. Chrome remembers the last successful `position-try` fallback; the preview had first
  been laid out while its link was below the fold, so it stayed flipped.

**Changed**
- The footnotes label keeps the renderer’s id and no number.
- Outline links are flex rows, so numbers hang and titles wrap beside them.
- Phone table cells wrap, with an 8rem minimum per cell; wide tables still scroll in their own
  wrapper with the sticky first column.
- The preview is `display: none` until hovered or focused (fading in with
  `transition-behavior: allow-discrete` and `@starting-style`), so its position is recomputed on
  every opening. Verified: it now opens below its link and flips only when needed.

## Pass 3

**Saw**
- Desktop states read cleanly: waiting (title, summary, “Waiting for the first words…”, the write
  head beside the tail line), streaming (meter at 50%, green ring in the TOC, outline listing only
  the clauses written so far), written (no green anywhere), appendix (lettered clauses `A.1.1`–
  `A.1.3`, pager announcing `Previous · Chapter 5 · 5.2`). Reduced-motion captures match the
  normal ones, as they should: every state is static information.
- 1100px (two columns): the current TOC entry expands with the numbered outline behind its rule;
  the section label sits inline because the center is under 760px.
- Keyboard: on a fresh load the page focused the H1 (React StrictMode runs mount effects twice, so
  a “first page” flag didn’t hold), which made Tab jump past the skip link and TOC into the body.
- Start page: after outline links became flex rows, “In this manual” lost the space between label
  and title (`1A Haunt…`).

**Changed**
- The H1 is focused only after a router PUSH (link navigation); a fresh load starts at the skip
  link. Verified the Tab order: skip link → manual title → TOC rows, with a visible green focus
  ring; Enter on a row navigates and focus lands on the new title.
- Start-page outline uses the same hanging number style as the section outline.
- Tidied two event handlers (no `&&` statements), dropped an unused width token and export.

## Live checks (dev server on 5177, Playwright)

- **Nothing above moves / never auto-scrolls:** streamed 3.2 from open to written at 1440 and 375,
  sampling every 200ms. Every block above the live one kept its document position (0 moves) and
  `scrollY` never changed (0 changes). Repeated after the last pass: same result.
- **Wrapping:** the streamed section stays `data-wrap="plain"` after completion; a section loaded
  already written gets `pretty`.
- **Write head:** on the live block while writing; retracts (`scaleY` → 0) on completion.
- **Follow:** pressing it kept the tail line 24px above the viewport bottom while text arrived
  (scrollY 487 → 734); one upward wheel turned it off and the page stayed put.
- **Line length:** ≈78 characters per line at 1440, ≈48 at 375. No horizontal page scroll at
  1440, 1200, 1024 or 375.
- **← / →** move to the previous/next section; the contents sheet takes focus to the current row,
  Esc closes it and returns focus to the location button.
- No console errors in any run.

## Response to code review

- **Done:** compact-bar sizes now come from tokens (`--tap`, `--space-*`, `--text-lead`,
  `--leading-body`); no off-grid values left outside drawn glyph details.
- **Done:** sheet scroll lock is CSS only and scoped below 1024px; verified that opening it at 900px
  and widening to 1440 leaves the page scrollable.
- **Done:** ←/→ ignore auto-repeat and already-handled events (verified a repeat event does not
  navigate).
- **Done:** the streamed-this-load set lives in `streamedThisLoad.ts`.
- **Done:** repeated layout widths are tokens (`--label-col`, `--label-col-wide`, `--status-col`,
  `--tap`, `--list-indent`, `--check-size`, `--preview-width`, `--bar-width`); ring alignment is
  derived from line-height and ring size.
- **Done:** code block styles moved to `code-block.css`, imported by `CodeBlock.tsx`.
- **Done:** `ManualOutline` lives in `Outline.tsx` with its stylesheet.
- **Done (nits):** no `replaceAll` on `useId()`; `plainText`/`slugify` un-exported; `TITLE_ID` in
  `ArticleHead.tsx`; `CONTENTS_PATH` and `chapterPath()` replace hard-coded `/a`; duplicate
  `display: none` and `box-sizing` rules removed; CSS comment banners removed; copy result shown
  for `COPY_RESULT_SHOWN_MS`, and a clipboard rejection shows “Couldn’t copy”; both scans memoized;
  react-markdown’s node type replaces the hand-written tree type; only http(s) links open a new tab.
- **Done:** Shell lifted above the keyed part (only the article is keyed), so the TOC keeps its
  scroll position across sections (verified: 120px before and after navigating).
- **Done:** heading ids are de-duplicated in one scan and Prose reads them by source line, so the
  outline and the page share one source.
- Re-ran `npm run check -- a`, `npm run shot -- a` (16 of 16, no errors) and the live streaming
  check (0 moves, 0 scroll changes at 1440 and 375).

## Pass 4 (review round)

**Saw (before)**
- In `streaming-full-*` an empty “Footnotes 1. ↑ 2. ↑” block sat between the live paragraph and
  the tail line for most of a stream.
- The write head was a 2px line and a 1px meter: correct but easy to miss.
- At 1440×900 the index overflowed by 122px and the sticky legend covered A.2–B.2.
- At 1920 the text and outline drifted 416px apart.

**Changed**
- Footnotes are hidden while writing and appear with the settle.
- The write head is now an instrument: a 3px bar on the live block, a 7px breathing cue lamp at
  the line being written, the same bar beside the tail line for the whole stream, a green
  percentage beside Follow, and a 2px meter in the head rule while writing. An `hr` live block
  keeps a bar 12px past each side.
- Index: 24px rows, 8px between chapters, a one-line legend under the count instead of a sticky
  footer. The whole index now fits 900px (`scrollHeight` 900 = `clientHeight`).
- Layout ≥1200: text and outline are one group, with leftover width on the outer edges. The gap
  is 64px at 1200, 1280, 1440 and 1920. Hanging labels switched from the `@container` test to
  `min-width: 1280px`, because the main track is now exactly measure + gutters.

**Saw (after)**
- `streaming-full-desktop`: bar, lamp and tail rail read at a glance, and the tail hugs the live
  paragraph. `toc-desktop` shows B.2 with nothing covered. Phone: the budget table shows Stage,
  Target and Ceiling whole, and `/a` shows only a live `›`.

## Response to review

1. Hide footnote stubs while writing: **done.** `[data-status="writing"] .prose-root > .footnotes
   { display: none }`. Verified live on 3.3: never visible while writing, shown once written.
2. Unmistakable write head: **done**, as suggested, plus a breathing cue lamp at the live line
   (static under reduced motion) and the tail readout in cue green. Still flat fills, no glow.
3. Fit the whole index at 1440×900: **done.** 24px rows, 8px chapter gaps, legend in the
   masthead. Measured `scrollHeight` 900 at 900.
4. Keep text and outline together: **done**, with the suggested five-track grid. The main track
   widens to `--start-width` on `/a`.
5. Narrow numeric phone columns: **done.** Right-aligned cells are exempt from the 8rem minimum.
6. Show that a code block scrolls: **done.** Always-visible 8px WebKit scrollbar with a
   `--rule-strong` thumb inside the block’s padding (headless screenshots don’t paint scrollbars,
   so this is checked in the CSS, not the captures).
7. Outline H3 indentation: **done.** `--outline-number-col` (40px; 48px in the phone sheet), with
   H3 rows indented to the H2 titles.
8. No dead chevrons: **done.** A missing side is omitted; on `/a` the `›` links to 1.1 with
   `aria-label="Next: 1.1 Why a Haunt Should Listen"`.
- Minor, muted vs faint 1.20:1: **done.** `--ink-muted` is now `#AEB4B7` (8.9:1 on ground, 1.5:1
  above faint).
- Minor, hover equals current tint: **done.** New `--ground-hover` `#1E2023` for TOC row hover.
- Minor, “3.1 Sensing the Guest , written”: **done.** Rows carry an explicit `aria-label`.
- Minor, chapter list three times on `/a`: **skipped.** Each copy does a different job (compact
  index, annotated contents with summaries and states, jump list), and the sidebar must stay for
  the persistent shell.

**Re-verified live (port 5177):** streamed 3.3 at 1440 and 3.2 at 375 with 200ms sampling: 0
block moves, 0 scroll changes. The write head never collapsed (shortest ≈17px). The index fits
900px. The text-to-outline gap stays 64px from 1200 to 1920, with no horizontal scroll. No
console errors.

## Cleanup after the review round

- Hanging section and clause numbers are back at 1024–1199px. One media query
  (`1024–1199px, ≥1280px`) replaces the `@container` test, which measured the main track’s
  *content* box and so could not tell the roomy two-column band from the tight 1200–1279 band.
  Measured clearance from the TOC: 14px at 1024, 52 at 1100, 102 at 1199, 22 at 1280, 102 at
  1440. At 1200–1279 they stay inline, because a hanging `A.1.3` would reach the TOC at 1250.
- `--outline-number-col: 48px` moved into the ≤1023px token block.
- The lamp offset is one token (`--write-head-lamp-inset`). Ring and lamp share one `breathe`
  keyframe in `status-ring.css`, so `tail-line.css` no longer depends on `prose.css`.
- `.step:hover` and a `.tail-progress` class replace the element-qualified selectors.
