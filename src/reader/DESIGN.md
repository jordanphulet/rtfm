# RTFM — the reader's design

The reader at `/read/<manual>` (`src/reader/`): its rules, layout, states, streaming and markdown.
What both pages share, from the craft bar and the banned list to the tokens, is in
[`DESIGN.md`](../../DESIGN.md), and its rules bind this page too.

## Reader behavior

These rules are locked: any change to the reader keeps them.

**Section states**
- `unwritten`, `writing` and `written` each look clearly different, **both in the TOC and on the
  section page**.
- A section that is waiting for its first words shows its **title and summary**. Never a blank page.

**Streaming**
- Streaming text appears **in the final reading layout**, styled exactly as it will be when
  finished.
- **Raw markdown syntax never shows**, even mid-stream. The renderer in `src/manual/` handles this.
- **Nothing above the reading position moves** while text streams in.
- **The page never scrolls on its own.** If the reader is at the bottom, they can choose to follow.

**Navigation**
- Previous/next section links, crossing chapter and appendix boundaries.
- A clear "you are here" marker in the TOC.
- The TOC is **always at most one tap or click away**, at every width.
- Cross-references (`[see 4.2](section:<id>)`) work, including links to unwritten sections.

**Reading comfort**
- Body text line length of **45–90 characters**. Body text size **at least 16px**.
- **Body text is real HTML text.** It is never drawn with Canvas or WebGL, and it can always be
  selected, searched with find-in-page, and zoomed.

## Layout

### Desktop, 1200px and up (designed at 1440 × 900): three columns, nothing hidden

```
| TOC 272 | 1fr | main: 576 + 2×64 gutter | outline 240 | 1fr (≥24) |
| 1440:   text x 448–1024, outline at 1088 (64px from the text)       |
| 1920:   text x 688–1264, outline at 1328: the group stays together  |
```

Text and outline form one group: the leftover width goes to the outer edges (two `1fr` tracks),
never between them. On the start page the main track widens to `--start-width`.

- **No top bar.** The centre starts with 64px of space; the TOC is always visible, so a header
  would only spend height.
- **TOC column:** sticky, full height, its own scroll, `overscroll-behavior: contain`. The whole
  index (18 sections, both appendices) fits in 900px of height, so nothing collapses.
- **Centre:** article head, body, tail line, pager. The gutters hold only things that hang: the
  section number, clause numbers and the write head.
- **Outline column:** sticky, its own scroll, starting 68px from the top; "On this page" then
  "Referenced here".
- **Hanging numbers.** Section labels and clause numbers hang in the gutter at 1024–1199px and at
  1280px and up. They sit inline before the heading at 1200–1279px, where the outline column
  leaves the gutter too narrow (a hanging `A.1.3` would touch the TOC), and below 1024px.

### 1024–1199px: two columns

TOC 272 | centre. The outline moves **into the TOC**: the current entry expands in place to list
its H2 and H3 headings over the outline track, without the outline column's title row, because
the entry itself is the title. A section with no headings doesn't expand; while it is being
written it shows the hint until its first heading. "Referenced here" is dropped, because inline
cross-references carry their status anyway.

### Compact, below 1024px: header and contents sheet

The phone at 375px is the design target.

- **Sticky header**, 48px, `--ground`, 1px `--rule` bottom line:
  - Left: **`Library`**, a link to `/`: the `LibraryBig` icon (see The TOC) then `Library`, 8px
    apart, `--text-ui` 500 wdth 85 ink, 44px tall with 8px side padding, so the icon lines up with
    the 16px phone gutter. Hover `--ground-tint` and cue text, like `‹ ›`. The icon is books, not an
    arrow: `‹` already means "previous" here.
  - Then, flexible: the **location button** (40px tall, `data-shot="toc-toggle"`): status ring ·
    `2.4` (tabular, ink-faint) · title (`--text-ui` 500 wdth 85, ellipsis) · a CSS chevron that
    turns when open. On the start page it reads "Contents".
  - Right: `‹` and `›` links, 44×44, `aria-label="Previous: 2.3 Staying in Character"`. A missing
    side is omitted, never a dead glyph. On the start page, `›` goes to 1.1.
- **Contents sheet** (one tap): fixed from the header to the bottom, `--ground`, its own scroll,
  page scroll locked while open. The same TOC, capped at the measure, with rows at body size and a
  44px minimum height for touch; the current entry is expanded with its live outline. It opens
  with opacity 0→1 and translateY(−8px→0) over `--dur-base` `--ease-out`.
- **Text:** full width minus the gutter (32px at 768–1023px, where body text returns to its desktop
  size and caps at the measure; 16px on phone). The centre starts 24px below the header. The measure
  at 375px is about 48 characters.
- No hover previews below 1024px or on `hover: none` devices.
- The outline is **never in the reading flow**: a disclosure that grew while headings streamed in
  would push the text down. It lives in the sheet instead.

### Reader sizes

The column widths, the header height, the gutter (which steps down below 1024px and on phone) and
the reader's component sizes (bars, label columns, the code bleed, the preview width, the write
head's offset) are tokens in `src/reader/tokens.css`, on `.reader`.

### Article head (every section, every state)

Top to bottom (phone values in brackets):

1. **Eyebrow row**, `--text-ui` wdth 85: left `Chapter 2 · Performers Without a Pulse` (ink-muted,
   links to that chapter on the start page); right `‹ 2.3   3.1 ›` (tabular, ink-muted, cue on
   hover; at 1.1 and B.2 only the side that exists). Appendices read `Appendix A · Parts and Sensor
   Reference`. 16px below. Below 1024px only the left part shows; previous/next live in the header.
2. **Title**, `--text-h1` ink-strong, `text-wrap: balance`. The label `2.4` hangs in the left gutter
   (see Hanging numbers): same size, weight 400, ink-faint, tabular, 16px left of the text edge, so
   the title aligns with the body. 12px below.
3. **Summary**, `--text-lead` ink-muted, `text-wrap: pretty`. 16px below.
4. **Status line**: one line, a fixed 16px tall, micro mono, nowrap (the text changes, the layout
   doesn't):
   - waiting: writing ring + `Waiting for the first words…` (cue)
   - streaming: writing ring + `Being written · 46%` (cue, tabular)
   - written: solid ring + `Written · 1,184 words` (ink-faint; ring ink-muted)
   - failed: hollow ring + `Not written · budget reached` or `Not written · couldn’t write this
     section` (ink-muted; see [When a section can’t be written](#when-a-section-cant-be-written))
5. **Head rule**: 1px `--rule-strong` across the measure, 16px below the status line, 32px above
   the body. While writing it doubles as the progress meter (see The write head).

The head is identical in every state, so nothing in it ever reflows.

### The TOC

- **Library bar**, above the masthead: **`Library`**, a link to `/` that takes you back to the
  library, filling a 48px row (the compact header's height) with 16px side padding and a 1px
  `--rule` bottom line, so it reads as its own place rather than a caption on the title. The
  `LibraryBig` icon (see `DESIGN.md` › Icons) then `Library`, 8px apart, `--text-ui` 500 ink.
  Hover: `--ground-tint` across the row, cue text and icon, `--dur-quick`. Its focus ring sits
  inside the row. The whole index of an 18-section manual still fits in 900px. The contents sheet
  leaves it out, because the compact header already has it.
- **Masthead** (padding 20/16/8): the manual title, `--text-ui` 600 ink-strong, linking to the
  manual's start page (it takes the current-row tint there); under it `7 of 18 sections written`,
  micro mono ink-faint, live; then the status legend (see Section states).
- **Chapter row:** `--text-ui` 600 ink-strong, wdth 85; the label in a 36px tabular column,
  ink-faint. A heading, not a link (chapters have no page). 8px above each chapter group.
- **Section row:** 24px tall (padding 2/12), so the dense index fits the screen. Grid
  `36px label | title | 16px status`: labels align as a column (`2.4`, `A.1`), titles wrap under
  the title, and rings form a status column at the right edge. `--text-ui` wdth 85; label ink-faint,
  tabular.
- **Hover:** `--ground-hover`, title to ink-strong, `--dur-quick`. **Focus:** the cue ring with a
  −2px offset, inside the scroll container so it isn't clipped. After its ring, each row states its
  status in words for screen readers (`, being written`).
- **You are here:** the current row gets `--ground-tint`, a 2px ink-strong bar at its left edge,
  title ink-strong 600, label ink-muted, `aria-current="page"`. The TOC scrolls (its own
  `scrollTop`, never the page) to bring the current row into view when it is out of comfortable
  view.
- **Appendices** come after the chapters: 16px gap, a 1px `--rule-strong` line, 12px, the group
  label `Appendices` (`--text-micro` Sans 600 ink-muted, sentence case), then the appendix groups
  with lettered labels. A manual with no appendices has no group, label or line.

### Outline column (1200px and up)

- **On this page** (label `--text-micro` Sans 600 ink-muted): the first row is the section title, so
  something is always current. Then H2 rows with their clause number in `--outline-number-col`, and
  H3 rows indented to the H2 *titles* so they nest under them. `--text-ui` wdth 85 ink-muted, over a
  1px `--rule` track.
- **Current heading:** ink-strong and a 2px ink-strong bar on the track. Current is the last
  heading whose top is above 25% of the viewport (a rAF-throttled scroll listener), else the title.
- Built from the text (H2 and H3 lines outside code fences), so it grows as headings stream in.
  While writing, new rows fade in and slide 4px from the left over `--dur-base`. Rows only ever
  append. Before the first heading, a hint reads `Headings appear as they’re written.`
- **Referenced here** (32px below): every `section:` link in the text, de-duplicated, in order of
  appearance: label (tabular, ink-faint) · title · ring, with the status in words for screen
  readers. It tells the reader where this section points and what is still unwritten, and also
  grows during streaming.
- Its links take the focus ring inside (−2px), as the TOC's do, so the column's scroll doesn't clip
  it.

### Start page (`/read/<manual>`)

The annotated contents, in the same shell. A reference is entered through its index: the sidebar
(compact, no summaries) and this page (summaries and states) do different jobs.

- **Head** (capped at the measure), 64px from the top:
  - title `The Haunt That Listens`, `--text-title` ink-strong, 12px below;
  - subtitle, `--text-lead` ink-muted, `text-wrap: balance`, 16px below;
  - meta, micro mono ink-faint: `5 chapters · 2 appendices · 18 sections · 7 written`, 24px below
    (singular for one: `1 appendix`);
  - **Begin at 1.1 Why a Haunt Should Listen ›**, `--text-body` 600 ink-strong with a 2px cue
    underline (cue text on hover).
- **Contents** (width 720), 48px below the head. Each chapter starts with a 1px `--rule` line and
  24px of space (a link to it stops 24px below the top, or 16px below the compact header), then a
  heading row (`--text-h3` 600, label in the 48px label column). Section rows sit on a grid `48px
  label | title + summary | 136px status`: title `--text-body` 500 (ink-strong, or ink-muted while
  unwritten), summary `--text-ui` ink-muted, status as ring + word in micro mono (cue while
  writing). The whole row is the link: padding 8/12, hover `--ground-tint` and title to cue. On
  phone the status moves under the summary.
- **Appendices:** 48px, a 1px `--rule-strong` line, 48px, an H2-sized `Appendices` heading, then
  the same chapter blocks with lettered labels. A manual with no appendices ends after its last
  chapter.
- **Outline column:** "In this manual", with chapter and appendix jump links styled like "On this
  page".
- No hero, no illustration: the 35px title sits directly on dense content.
- Phone: the same order, full width; the header button reads "Contents" and opens the same sheet.

### How appendices are set apart

A separate, headed group after a strong rule in the TOC, the sheet and the start page; lettered
labels (`A`, `A.1`); the eyebrow reads `Appendix A · …`; and the pager says so when you cross over
(`Next · Appendix A · A.1 ›`). The reading treatment is otherwise the same: they are reference
tables and deserve the same craft.

### Previous and next

- **Pager**, 64px below the body (or the tail line, or the failure notice): two cells, `1fr 1fr`,
  16px apart, each with a 1px `--rule-strong` top line and 12px above its text. Line 1, micro mono
  ink-faint: `‹ Previous · 2.3` / `Next · Chapter 3 · 3.1 ›` (the chapter or appendix is named
  whenever the link crosses a boundary). Line 2: the title, `--text-body` 500 wdth 85 ink-strong,
  with its status ring. Next is right-aligned. Hover: title and top line to cue.
- The ends of the manual are never empty: before 1.1 the cell reads `Start of the manual` /
  `Back to contents`, after B.2 `End of the manual` / `Back to contents`.
- Phone: stacked, full width, 24px apart, 44px+ targets.
- It is a `nav` labelled `Continue reading`, apart from the eyebrow's `Previous and next section`.
  Each title's ring is followed by its status in words for screen readers (`, being written`).
- Also: the eyebrow's `‹ 2.3  3.1 ›` (1024px and up), the header links (below 1024px), and the
  **← / →** keys. The keys ignore auto-repeat and modifier keys, and do nothing while focus is in a
  text field, a code block or a table, where arrows already scroll, or while the contents sheet is
  open, so they never move the page behind it.

### Keyboard and focus

- First focusable: "Skip to text", the shared `.skip-link`, shown on focus at the top left.
- DOM order: compact header (`Library`, location, `‹ ›`) and sheet → TOC (`Library`, manual
  title, rows) → main (eyebrow links, body links, Copy, Follow or Try again, pager) → outline.
- Focus ring everywhere: `outline: var(--focus-ring); outline-offset: var(--focus-offset)` (2px
  cue, 2px out), radius 2, or the control's own radius where it has one (offset −2px inside the
  TOC and the outline, whose scroll containers would clip it). `:focus-visible` only.
- Arriving at a page (`useArrival.ts`, once per section or start page): it scrolls to the element
  named in the URL hash (a heading or footnote of the section, a chapter of the start page), or to
  the top when there is none. After link navigation (a router PUSH, not a fresh load or Back),
  focus moves without scrolling (`preventScroll`) to the H1 of a section, and on the start page to
  the hash's chapter heading or else the H1 (all `tabindex=-1`, with no focus ring). A fresh load
  still starts at the skip link. Links within a page (the outline, footnotes) are left to the
  browser, so Back returns to where the reader was, and so is a link to the page already shown
  (the manual title on the start page, the current section's row): it neither scrolls nor moves
  focus.
- Contents sheet: focus moves on open to the current entry (`aria-current="page"`: the current
  section's row, or the manual title on the start page). Tab is contained in the visible controls
  of the header and sheet (the sheet's hidden `Library` link is skipped), Esc closes it and returns
  focus to the location button, and choosing a link closes it. The location button names the
  current section's status in words, after its title.
- Code blocks and table wrappers are focusable, labelled scroll regions.

## Section states

| State | TOC row (and sheet) | Section page | Inline cross-reference |
| --- | --- | --- | --- |
| **unwritten** | Title ink-faint; hollow ring (1.5px ink-faint) | Never painted: opening starts the writing, so it renders as *waiting* | Dashed underline (ink-faint), hollow ring after the text |
| **writing, waiting** | Title ink; green ring with a half-size green centre that breathes (opacity 1 → 0.35 → 1 over `--dur-breathe`) | The head with `Waiting for the first words…`; the body holds only the tail line, with the write head beside it; the outline shows the title row and its hint | Dashed underline (cue-deep), green ring |
| **writing, streaming** | Same as waiting | The final layout growing at the bottom; the write head on the live block; the head rule filling; the tail line `Being written · 46%  Follow ↓` | Same as waiting |
| **written** | Title ink; solid ink-muted disc | No green anywhere; status `Written · n words`; no tail line | Solid 1px cue-deep underline, no ring |
| **not written: budget reached** | As unwritten | No green anywhere; status `Not written · budget reached`; the failure notice where the tail line was | As unwritten |
| **not written: couldn’t write** | As unwritten | The same, with `Not written · couldn’t write this section` | As unwritten |

The shape differs by state (hollow, centre dot, solid), so state never depends on color alone. A
legend in the TOC masthead explains the three rings in one line (`Written · Writing · Not written`,
micro, ink-faint, rings drawn in CSS). Rings are the shared `StatusRing` component (`src/ui`).

### When a section can’t be written

The server can fail to write a section: **budget reached** when a spending cap would be crossed
or the kill switch is on, and **couldn’t write this section** for anything else (the model failed,
stalled or wrote something invalid, too many sections were being written, or the stream broke).
Either way nothing is kept, and the section is `unwritten` again on the server.

In the show-control desk this is a cue that didn’t go: the GO light goes out and the stage
manager says plainly what happened. It is the settle without the finish.

- **No green, no alarm.** Writing stopped, so nothing is live: the gutter bar retracts and the
  lamp goes out, the meter fades to `--rule-strong`, and the TOC ring and every ring pointing at
  the section turn hollow, exactly as for an unwritten section. There is no red, no warning
  glyph and no second accent; the words carry it, as on the landing page.
- **Status line:** the hollow ring and `Not written · budget reached` or `Not written · couldn’t
  write this section`, in ink-muted: one tier above the written state’s ink-faint, because the
  reader needs to notice it, but never cue.
- **The failure notice** takes the tail line’s place, the lowest thing above the pager, so
  nothing above the reading position moves. Body type at the measure:
  - a title at `--text-body` 600 ink-strong (the H4 treatment), 4px above the text: `Budget reached`
    or `Couldn’t write this section`;
  - one sentence in ink saying what happened and that nothing was kept, with an inline **Try
    again** (a `.link` button: cue-deep underline, cue on hover):
    - budget: “The writing budget won’t cover this section right now, so it stays unwritten, and
      nothing was charged for it. Try again once the budget allows.”
    - error: “Something went wrong while it was being written, so none of it was kept. Try again
      to write it from the start.”
- **Text already streamed stays** where it is, 32px above the notice, because removing it would
  move the page under the reader. It keeps its plain wrapping, its footnotes stay hidden and its
  code blocks keep Copy hidden, as while writing. Footnote references in it stay links to the
  hidden notes; the notice already says none of it was kept.
- **Try again works in place**, without a reload, so sections still writing elsewhere on the page
  keep going. The kept text is cleared, the page returns to the waiting state (it moves, but only
  because the reader asked), and focus moves to the title, which is scrolled into view if needed.
- **Otherwise it sticks for the page load.** Leaving and coming back shows the same state.
- **If the manual itself can’t be loaded** (the server can’t be reached, or the manual or the
  section doesn’t exist), the reader shows only the same notice in the text column: `Couldn’t
  open this manual`, “The manual didn’t load, so there’s nothing to show yet. Try again, or go
  back to the library.”, where Try again reloads the page and **library** is a `.link` to `/`,
  styled like Try again: the only way back on a page with no TOC or header.
- **Screen readers:** the live region announces `Not written: budget reached` or `Not written:
  couldn’t write this section`.
- **Phone:** the same, at the phone body size.

## Streaming

- **At most three sections write at once** on one page: the server's limit on runs, so one page
  never overruns it (other tabs still can, which gives `couldn’t write this section`). A fourth
  section opened meanwhile waits in the waiting state (`Waiting for the first words…`) and starts
  when one of the three ends.
- Text renders with `<Markdown>` in the final layout from the first chunk. Chunks just appear,
  with no fade; the live edge is marked by the write head. A formula is held back from its
  opening `$$` until its closing `$$` arrives, then appears whole, so the write head stays on the
  block before it meanwhile.
- **Nothing above the reading position moves:** the head is a fixed height; the progress fill and
  write head use `transform` only; the code blocks' Copy button keeps its space with
  `visibility: hidden` until the section is written; outline and TOC changes happen in their own
  columns; `scrollbar-gutter: stable`; growth only happens below the last block.
- **It never scrolls on its own.** The **tail line** sits just below the live block: micro mono,
  the readout `Being written · 46%` in cue, and a **Follow ↓** text button (`aria-pressed`). When
  pressed it reads `Following ↓` in cue and keeps the tail line 24px above the viewport bottom after
  each chunk (an instant scroll, never smooth). It follows the text as it grows, not the
  percentage, which Claude's estimate holds at 99% until the section is written. An upward wheel
  scroll, any touch scroll, PageUp, ↑, Home or a second press stops it. The tail line is removed
  when writing ends or fails; it is the lowest thing on the page, so nothing above moves.
- Screen readers: a visually hidden `aria-live="polite"` region announces only state changes
  ("Being written", "Written", or a failure), never percentages.

### The write head

The reader's signature: the change bar from a code editor's gutter, put to work on a document
being written. It answers the three questions a reader has while text arrives without the page
moving: *where is the live edge, how far has it got, is it done?* CSS only. The bar and lamp are
the shared write head (`src/ui/write-head.css`; its classes are documented in `src/ui/README.md`),
which the landing page uses for the librarian's replies too.

1. **Gutter bar.** The prose is a `.write-head`, with `data-live` while writing. Its last block,
   not counting footnotes, carries the cue bar, set far enough left of the text edge
   (`--write-head-offset`) to clear a code block's bleed, so it grows with the paragraph, list or
   table as it fills. In `Prose.css` the reader shifts it for a code block (which bleeds into the
   gutter), and gives an `hr` as the live block a bar 12px past its top and bottom, so the bar
   never collapses. Each new block's bar draws in from the top. Solid fill: no glow, no shadow.
2. **The lamp.** At the foot of that bar, level with the line being written, sits a square cue
   lamp that breathes like the TOC's writing ring. It is the cue light of the concept: the exact
   line where words land.
3. **The tail.** The tail line under the live block is a `.write-head-line`: it carries the same
   bar for the whole stream, and its cue readout sits beside **Follow ↓**, so bar, lamp,
   percentage and Follow read as one instrument. While waiting it has `data-live`, so the bar and
   lamp sit beside the tail line alone.
4. **Head rule as meter.** While writing, a 2px cue line over the head rule (no layout change)
   fills from the left by `transform: scaleX(var(--progress))`, linearly over `--dur-settle`.
   `--progress` is the only value JS provides.
5. **Footnotes wait.** While writing, the footnotes block (whose notes are empty stubs until the
   last chunks) is `display: none`, so the tail line hugs the live text. It appears with the
   settle, below everything, so nothing above the reader moves.
6. **The settle** (writing → written), all at once: the gutter bar retracts downwards (the bar
   exists on the last block in every state and only its transform changes, so the transition can
   run); the meter's color fades from cue to `--rule-strong`; the status line swaps to
   `Written · n words`; the TOC ring's centre dot scales up to fill the ring while turning
   ink-muted. Green leaves the page; the section is now reference.

Why it serves reading: the bar marks exactly where new words land, so someone reading higher up
knows the live edge without being dragged to it; the meter answers "how much is left" from the
head, where the eye returns; the settle is the single, quiet signal that the section can be
trusted as finished.

**Reduced motion:** the bar and a steady lamp are on the live block while writing and gone when
written; the meter steps with each chunk; the ring shows a static half-size centre dot; outline
rows and the contents sheet appear without movement; the footnote highlight is a static tint while
targeted. All the information stays, none of the motion. Screenshots are taken with Playwright's
`animations: "disabled"`, which resets an infinite animation to its first keyframe, so `breathe`
starts at opacity 1.

### The wrapping rule

`text-wrap: pretty` can re-flow a whole paragraph when its content changes, so it never applies
to text that streams:

- The prose (`.prose`, around the prose root) carries `data-wrap="pretty"` **only if the section was
  already written when this page load first saw it**. Otherwise it gets `data-wrap="plain"`
  (ordinary wrapping) and keeps it after completion. There is no switch at the end, so finishing
  never re-flows anything.
- "Streamed this load" is a module-level `Set` of manual and section ids (`streamedThisLoad.ts`),
  filled by the shell from `useManual(manualId)` whenever a section is seen `writing`. This also
  catches a section that kept streaming while the reader was elsewhere. It resets on reload, like
  the store.
- Under `[data-wrap="pretty"]`: `pretty` on paragraphs, list items, blockquotes and table cells,
  and `balance` on prose H2–H4. A chunk can end mid-heading (`## The Half`), so under
  `[data-wrap="plain"]` headings wrap normally too.
- Static text outside the prose (summaries, the subtitle, previews, the TOC) never changes while
  visible and keeps `pretty` or `balance`. The H1 and the manual title are always balanced.

## Markdown

Every element the sample manual uses has a deliberate treatment, all under `.prose-root`.
Paragraphs, bold, inline code and lists come from the shared `.markdown` treatment in
`src/ui/markdown.css`, which the librarian's replies use too (at `--text-reply`); the rest is the
reader's own, in `Prose.css`.

- **Paragraphs:** `--text-body` ink, 16px below, ragged right, no automatic hyphens.
- **Headings:** H2 `--text-h2` 600 ink-strong, 48px above, 12px below. H3 `--text-h3` 600, 32 / 8.
  H4 `--text-body` 600, 24 / 4 (a run-in-weight label at body size). An H3 or H4 directly after a
  heading: 16px above. Ids are slugs from one scan of the text (see Build structure).
  `scroll-margin-top` 24px (64px under the compact header).
- **Clause numbers.** Every prose H2 carries a clause number (`2.4.1`, `2.4.2`, `A.1.3`), set like
  the section label: same size, weight 400, ink-faint, tabular, hanging 16px left of the text edge
  (inline before the heading where section labels are inline). A CSS counter on `.prose-root > h2`
  and the section label as a custom property (`--section-label: "2.4"`) build it, so it never
  appears in the text or in find-in-page. The number is the heading's anchor link (cue on hover).
  The outline shows the same numbers. The footnotes label `h2` is unnumbered. This is the
  numbered-clause habit of real engineering manuals, and it keeps the page from reading as a
  generic docs template.
- **Bold:** 600 ink-strong. **Italic:** Plex true italic, same color.
- **Bulleted lists:** `--list-indent`; the marker is an en dash `–` in ink-faint, drawn with
  `li::before` in the indent; nested lists 24px further, marker `·`; 4px between items, nested
  list 4px above.
- **Numbered lists:** `::marker` in ink-muted 600 tabular, so `1.`–`5.` align.
- **Checklists** (`ul.contains-task-list`): no dash; the disabled checkbox gets `appearance: none`
  as a `--check-size` square box, 1.5px ink-faint border, radius 2, hanging in the indent and
  centred on the first line. Checked: filled ink-muted, with a tick drawn by `li:has(>
  input:checked)::before` as a rotated L of 2px `--ground` borders. The text stays ink: these are
  preflight checks, not struck-out tasks.
- **Blockquotes** (pull quotes and the cast's spoken lines): `--text-lead` ink-strong, a 2px
  `--rule-strong` left rule, padding-left 20, 24px above and below. No italic and no added quote
  marks (the content brings its own).
- **Tables:** in a wrapper with `overflow-x: auto` (focusable, labelled), 24px above and below,
  full measure. `--text-ui` wdth 85, tabular figures; header `--text-micro` 600 ink-muted with a
  1px `--rule-strong` line under it; rows separated by 1px `--rule`; no vertical lines, no zebra;
  cell padding 8/12, with the first and last columns flush. The first column is 500 ink-strong
  (it names the row). GFM `---:` columns align right and never wrap (`150 ms` stays whole). A
  total row (first cell bold) gets a 1px ink-faint sum line above it, set as the bottom border of
  the row before, since collapsed borders favour the upper cell. **Phone:** the first column is
  `position: sticky; left: 0` on `--ground` with a 1px `--rule` right edge, so the row stays named
  while a wide table scrolls; text cells keep at least 8rem and wrap inside it, and the cut-off
  column at the right edge shows that the table scrolls.
- **Code blocks** (`CodeBlock`): `--ground-raised`, radius 2, extended `--code-bleed` into
  each gutter so the code aligns with the body text; on phone the bleed reaches the screen edges
  and the radius is 0. A 32px strip at the top: the language tag on the left (`ts`, `text`; micro
  mono ink-faint), **Copy** on the right (a `.text-button`: micro mono ink-faint, ink-strong on
  hover; `Copied` or `Couldn’t copy` for 1.5s in a polite live region; hidden with `visibility`
  while writing). Code `--text-ui` Plex Mono, ink, padding 8/20/16. `language-text` (the cast's
  prompts) uses `pre-wrap` so prose prompts read on a phone; other languages scroll sideways in a
  `.scroll-x` region, whose scrollbar always shows.
- **Inline code:** Plex Mono 0.88em, `--ground-tint`, padding 1px 4px, radius 2.
- **Formulas** (LaTeX between double dollars, rendered by KaTeX; `src/manual/README.md` ›
  `<Markdown>`), in the ink of the text around them, in KaTeX's fonts (`DESIGN.md` › Typefaces).
  Inline (`$$v = f\lambda$$` within a sentence) they sit on the line. Display (a `$$` block, a
  ```` ```math ```` fence, or a paragraph that is only a formula) they are set **flush left** at
  the text edge, never centred, 24px above and below, each in a focusable, labelled `.scroll-x`
  region, so a formula wider than the measure scrolls sideways (the cut-off edge and the
  scrollbar show it scrolls, as a table's do), with 4px of padding above and below so tall
  glyphs aren't clipped. KaTeX breaks an inline formula only after its top-level relations and
  operators, so a piece of one can be wider than the line (a long run of subscripts, a
  parenthesized sum). That formula, and only that one, leaves the line: it is set on a line of
  its own at the text edge, still in its inline size, in the same focusable, labelled `.scroll-x`
  region with 4px above and below, and the sentence goes on below it. So the page is never wider
  than the screen, and a formula that fits, or breaks across lines, keeps its place on the
  baseline with no box or scrollbar. A single `$` is always money, never math. A formula KaTeX
  can't read shows its source in Plex Mono at 0.88em, ink-muted: no red. While writing, a
  formula appears only once it is closed (see Streaming), so half-written LaTeX never shows.
- **Horizontal rule:** 1px `--rule-strong` across the measure, 40px above and below.
- **Footnote references:** `sup` at 12px, 600, cue, tabular, `line-height: 0` with a relative
  offset (no line-gap bump), underline on hover.
- **Footnotes:** 48px above, a 1px `--rule-strong` top line, 16px below it. The renderer's hidden
  `h2` is shown as a label, `--text-micro` 600 ink-muted. Notes `--text-ui` ink-muted, markers
  ink-faint, 8px apart. Back-links render as `↑` instead of the renderer's `↩` (via `components.a`
  on `data-footnote-backref`, keeping the `aria-label`; the loaded font subset has U+2191 but not
  `↩`, `→` or `↗`), ink-faint, cue on hover. A targeted note or reference flashes `--cue-tint` (the
  shared `target-flash`), fading over `--dur-target`.
- **External links** (`http(s)` links, which the shared `MarkdownLink` from `src/ui` renders as an
  `ExternalLink`, styled by `.link`; the librarian's replies use the same rule): ink text, a 1px
  cue-deep underline at a 0.18em offset; cue text and underline on hover (`--dur-quick`). A
  trailing CSS corner mark (5px, top and right 1.5px borders, ink-faint) says "leaves the manual".
  They open in a new tab, with a visually hidden "(opens in a new tab)".
- **Cross-references** (`SectionLink`, styled by `.link`): to a written section, the external-link
  underline without the corner mark; to an unwritten or writing one, see Section states. On hover
  (after `--delay-preview`) or keyboard focus (at once), a **preview** opens below the link (1024px
  and up, hover devices only): `4.2 · Chapter 4` in micro mono, the title `--text-ui` 600
  ink-strong, the summary `--text-ui` ink-muted, and a status line with its ring (`Not yet written —
  opening it starts the writing.` for an unwritten target). A `--preview-width` card,
  `--ground-raised`, a 1px `--rule-strong` border, radius 4, padding 12/16, no shadow, fading in
  over `--dur-base`.
  - **It follows WCAG 1.4.13.** It stays open while the pointer is over it: the card sits inside
    8px of transparent padding that bridges the gap to the link, so the pointer can cross to it.
    **Escape** dismisses it while the link or its card is hovered or the link is focused
    (`data-dismissed` on the `.xref`), until the pointer leaves or the link loses focus.
  - Positioned with **CSS anchor positioning** (`position-area: bottom span-right`, with
    `position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline`), so it never causes
    horizontal scroll. Hidden entirely under `@supports not (anchor-name: --x)`.
  - It is a `<span role="tooltip">` (styled as a block; a `div` inside the `<p>` would be invalid
    nesting) beside the link and referenced by `aria-describedby`, so it never joins the link text
    or find-in-page. Each link gets its own `anchor-name` and `position-anchor`, built from
    `useId()`.
  - It is `display: none` until shown (fading in with `allow-discrete` and `@starting-style`), so
    each showing chooses its position afresh: Chrome keeps the last successful position-try
    fallback while a box exists, which would keep a preview flipped above its link.

## Typographic detail

- All UI copy uses real punctuation: ’ “ ” – — … (`Waiting for the first words…`,
  `Not yet written — opening it starts the writing.`). The content is typographic too: the seed
  manuals are written that way, and the server turns Claude's straight quotes and apostrophes
  into curly ones as it streams, outside code (`server/writer/README.md` › The Bedrock writer).
- Tabular figures: TOC, outline and pager labels, status percentages and word counts (with
  thousands separators), table cells, ordered-list markers, footnote references.

## Avoiding the generic

How the reader stays clear of the banned list (`DESIGN.md` › Banned; the landing page's own list
is under `src/home/DESIGN.md` › Avoiding the generic):

| Banned | In the reader |
| --- | --- |
| Gradients, glass, glows, neon | Flat fills only. The green is a muted indicator-lamp green, never saturated or haloed; the meter and write head are solid 1–3px lines; previews have a border, no blur, no shadow. |
| Emoji as icons | None. Every mark is a glyph IBM Plex contains (`‹ › ↑ ↓`) or is drawn in CSS (rings, chevron, corner mark, tick). |
| Rounded cards with shadows | Nothing is a card. The start page is a list; code is a tinted block with 2px corners; no shadows anywhere. |
| Pill badges | Status is a ring plus a word. The TOC's current-row tint is square; start-page and ledger row tints have 4px corners. |
| Inter on slate-900 | IBM Plex on low-chroma graphite (slate-900 is a saturated blue). |
| Purple or blue accent | One cue-light green with exactly two meanings (live, actionable). It never decorates. |
| A border on every element | Hairlines with a named job only: head rule, `hr`, table rows, outline track, pager tops, previews, compact header, appendix dividers, start-page chapter lines. Columns are separated by tone or space. |
| Centering everything | All text is left-aligned (only the pager's "Next" is right-aligned, pointing forward). |
| Giant hero heading | A `--text-title` title, then the contents immediately. |
| Decorative icons | Every glyph carries state or direction. No icons beside TOC entries. |

## Build structure

The reader lives in `src/reader/`. It is built on `src/ui/` (the design system, documented in
`src/ui/README.md`) and `src/manual/` (the manual's store and the markdown renderer, documented in
`src/manual/README.md`). The reader styles the renderer's output rather than forking it.

- One component per file. Each one that has styles imports its own stylesheet, named after it
  (`Toc.css` for `Toc`), after its import from `src/ui`, so the shared styles come first in the
  cascade. A shared stylesheet, which no one component owns, has a lowercase name: `tokens.css`
  holds the reader's sizes. `Shell.css` holds the column grid.
- `Shell` stays mounted while moving between sections (only the article is keyed by section id),
  so the TOC keeps its scroll position. Moving to another manual remounts the whole reader (it is
  keyed by manual id), so nothing on the page carries over between manuals.
- **Every link within the manual carries the manual id** (only `Library` leaves the manual, for
  `/`), which the reader takes from the route: the TOC, the start page, the pager, the eyebrow, the
  compact bar, "Referenced here", the cross-references and the arrow keys.
- Heading ids come from one scan of the text (`markdownScan.ts`): `Prose` looks each heading's id
  up by its source line, so the outline and the page always agree, and duplicates get `-2`, `-3`.
- `Prose`, which brings the renderer and KaTeX, is a chunk of its own (`proseChunk.ts`). The
  reader starts loading it each time it renders (`preloadProse`, which asks once), so on a direct
  link to a section it loads alongside the manual and the section. The section page waits for it
  (`useProse`) in the same suspense as the section's own first request, so the start page never
  waits for KaTeX and a section page never shows a half-built layout. A load that fails is
  forgotten, so the next section page asks for the chunk again.
- The contents sheet locks page scroll with CSS only (`html:has(.reader .sheet[data-open])`, below
  1024px, in `CompactBar.css`), so widening the window releases it.
- Only the section page opens a section (`useSection`); the TOC, outline, previews and pager read
  the manual, so they never start the writing.
- `npm run shot` opens the contents sheet through `data-shot="toc-toggle"`, and clicks it only
  when it is visible (below 1024px).
