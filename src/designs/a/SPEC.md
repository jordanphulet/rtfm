# Design A — Dense reference · SPEC

## Concept

**The show-control desk.** This manual is written by a showman, but it is used by a builder with a
multimeter in one hand: someone who jumps to A.1 for a torque figure, checks 2.4’s latency budget,
then follows a cross-reference to 5.1. So A reads like the best engineering docs, set for the
booth’s console: a neutral **graphite** ground with no warm cast, cool off-white ink, and one
**cue-light green** — the stage manager’s “GO” — that means only two things: *this is live* (being
written) and *you can act on this* (links, focus).
Everything is visible at once on desktop: the whole manual’s state in the left index, the text in
the middle, the section’s outline and outgoing references on the right. One sans family in
IBM’s engineering-manual tradition, numbers that line up, hairlines with jobs, no ornament. The
theatre lives in the words; the interface stays the calm stage manager.

## Borrowed from the references

| Image | Trait taken | How A uses it |
| --- | --- | --- |
| `linear-docs-desktop` | Three columns: index · text · “on this page” | The ≥1200px skeleton. |
| | Right list indented by heading level, a bar on the current heading over a hairline track | Outline column, exactly this, plus a section-title row at the top so something is always current. |
| | Quiet breadcrumb above the title | Becomes the head’s eyebrow row (`Chapter 2 · Performers Without a Pulse`). |
| `linear-docs-mobile` | Sidebar and outline both vanish into one control in a slim header; text full width | Phone header (48px) with one location button that opens the contents. |
| `rust-book-desktop` | Numbered index (“4.1”) with strong numerals, whole book visible at once | Tabular label column in the TOC; no collapsed groups (18 sections fit). |
| | Current section expands in place to list its headings behind a rule | The outline lives here at 1024–1199px and in the phone contents sheet. |
| | Previous/next always at hand, arrow-key navigation (mdBook) | Compact `‹ 2.3 · 3.1 ›` in the head’s eyebrow row, ←/→ keys, full pager at the end. Not the giant gutter chevrons. |
| `claude-platform-docs-desktop` | Thin dividers between parts of a page | The head rule (which doubles as the progress meter) and `hr`. |
| | Current page as a filled row in a grouped sidebar | Tinted row + 2px bar; square corners, not a pill. |
| | A utility control by the title (“Copy page”) | A status line under the title; “Copy” on code blocks (the cast’s prompts are meant to be pasted). |
| | A quiet, low-chroma dark ground that isn’t slate | Graphite palette below (neutral, slightly cool, not blue). Its serif headings are **not** taken (that is B’s lane). |

**Clearly not B or C:** no serif anywhere, no margin notes (footnotes stay at the end), no drawn
ornament; all navigation stays on screen (no drawer at desktop), no atmosphere, and streamed words
simply appear — the live edge is marked by the write head, not by fading text.

## Typefaces

| Role | Font (module) | Settings | Why |
| --- | --- | --- | --- |
| Text and interface | **IBM Plex Sans Variable** (`ibm-plex-sans`) | wght 400 / 500 / 600; wdth 100 for reading, **85** (`--wdth-tight`) for index, outline, tables, pager, previews | Engineering-manual lineage; has every glyph the content needs (`I²C`, `1½`, `N·m`, `‹ ›`, `↑ ↓`) — Instrument Sans lacks `²` and `½`. wdth 85 packs dense UI ~6% tighter without a second family. |
| Code and readouts | **IBM Plex Mono** (`ibm-plex-mono`) | 400 (700 unused) | Same superfamily, so metrics and texture match; the “machine voice” for status readouts, language tags, percentages. |

One family plus mono. Body italics are Plex’s true italic. No `font-optical-sizing` (Plex has no
opsz axis). Measured with Playwright on the sample text: Plex Sans 17px ≈ 7.58 px/char, 16px ≈
7.13 px/char.

## Tokens (one file: `src/designs/a/tokens.css`, custom properties on `html:has(.design-a)`)

### Type scale — minor third (×1.2) on a 17px base; line-heights on the 4px grid

| Token | Size / line | Weight · width | Use |
| --- | --- | --- | --- |
| `--text-micro` | 12 / 16 | Mono 400, +0.02em; or Sans 600 | Status readouts, code language tag, table headers, outline/group labels |
| `--text-ui` | 14 / 20 | 400–600 · wdth 85 | TOC, outline, tables, pager, previews, footnotes |
| `--text-body` | **17 / 28** (phone **16 / 24**) | 400 · wdth 100 | Paragraphs, lists, H4 |
| `--text-lead` | 20 / 28 (phone 17 / 28) | 400 | Section summary under the title |
| `--text-h3` | 20 / 28 | 600, −0.005em | H3 |
| `--text-h2` | 24 / 32 | 600, −0.008em | H2 |
| `--text-h1` | 29 / 36 | 600, −0.012em | Section title |
| `--text-title` | 35 / 40 (phone 29 / 36) | 600, −0.015em | Manual title on the start page only |

Phone body steps off-scale to 16/24 on purpose: at 375px it keeps the measure at ~48 characters
(17px would sit at the 45 limit), and a short line wants tighter leading.

### Spacing — 4px grid

`--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 ·
`-16` 64 · `-24` 96 (px).

### Palette — “graphite and the GO light”

The booth’s console: charcoal panels, off-white legends, and the cue light. A stage manager’s cue
light turns green for **GO** — the moment something happens live — which is exactly this accent’s
job. A muted signal green (not neon, not teal), so it reads as an indicator lamp, not a brand.

| Token | Hex | Role | Contrast on ground |
| --- | --- | --- | --- |
| `--ground` | `#121314` | Page: graphite, neutral with a faint cool lean (never `#000`, not slate-blue) | — |
| `--ground-side` | `#17191B` | TOC column; the tonal step *is* the divider (no border) | — |
| `--ground-raised` | `#1C1E20` | Code blocks, previews | — |
| `--ground-tint` | `#24272A` | Current TOC row, hover rows, inline code | — |
| `--rule` | `#2B2E31` | Table row lines, outline track | — |
| `--rule-strong` | `#3C4044` | Head rule, `hr`, table header line, pager rules, preview border | — |
| `--ink-strong` | `#EDEFEF` | Headings, `strong`, current items (never `#fff`) | 16.1:1 |
| `--ink` | `#D3D7D8` | Body text (cool off-white, no cream) | 12.8:1 |
| `--ink-muted` | `#9BA1A4` | Summaries, labels, outline, footnotes, written-ring fill | 7.1:1 |
| `--ink-faint` | `#8C9296` | Unwritten titles, label numerals, meta (≥4.7:1 on every ground, incl. tint) | 5.9:1 |
| `--cue` | `#5FC48A` | GO green: live/writing state, link hover, footnote refs, focus ring (≥7.0:1 on every ground) | 8.6:1 |
| `--cue-deep` | `#377D57` | Link underlines and the unwritten-link dash (non-text, ≥3:1 on ground) | 3.8:1 |
| `--cue-tint` | `#15261D` | Footnote `:target` highlight (ink on it 10.9:1) | — |
| `--selection` | `#22412F` | `::selection` background (ink-strong on it: 9.8:1) | — |

No second accent. No amber (C), no red (B), no blue or purple (banned). Hairlines are always
`--rule`/`--rule-strong`.

### Radii, motion, sizes

- Radii: `--radius-s` 2px (code, inline code, checkboxes, focus ring), `--radius-m` 4px (TOC row
  highlight, previews). Rings are circles. Nothing else is rounded.
- Durations: `--dur-quick` 150ms (hover colour), `--dur-base` 200ms (preview, contents sheet,
  outline entry), `--dur-settle` 250ms (write-head retract, rule colour, ring fill, progress fill),
  `--dur-breathe` 1600ms (writing-ring pulse), `--dur-target` 1600ms (footnote target fade),
  `--delay-preview` 300ms.
- Easing: `--ease-out` `cubic-bezier(0.2, 0.8, 0.2, 1)` for things arriving;
  `--ease-in-out` `cubic-bezier(0.4, 0, 0.2, 1)` for state changes; **linear** for the progress
  fill (it tracks a measurement — easing would make it lurch).
- Sizes: `--toc-width` 272px · `--outline-width` 240px · `--measure` **576px** (≈76 characters of
  17px Plex) · `--start-width` 720px · `--header-height` 48px · `--gutter-phone` 16px ·
  `--gutter-tablet` 32px · `--ring` 10px (1.5px border, so the writing dot and the solid fill
  centre cleanly).

All CSS is scoped under `.design-a` (designs are lazy-loaded, but CSS imports are global); the
tokens sit on `html:has(.design-a)` so the page background can use them too.
`html:has(.design-a)` sets `background: var(--ground)`, `color-scheme: dark`, and
`scrollbar-gutter: stable` (so the page growing past the viewport never shifts text sideways).
Thin scrollbars: `scrollbar-color: var(--rule-strong) transparent`.

## Layout

### Desktop ≥1200px (designed at 1440 × 900) — three columns, nothing hidden

```
| TOC 272 (ground-side) | center (fluid; text 576, centred)        | outline 240        |
| sticky, own scroll    | 1440: x 448–1024, 176px gutters          | sticky, top 64px   |
```

- **No top bar.** The center starts with 64px of space; the TOC is always visible, so a header
  would only spend height. (Reason: density without chrome.)
- **TOC column** (sticky, full height, own scroll, `overscroll-behavior: contain`):
  - Header (padding 20/16): manual title “The Haunt That Listens”, 14/20 Sans 600 ink-strong, links
    to `/a`; under it `7 of 18 sections written`, micro mono ink-faint, tabular, live.
  - Chapter rows, then the appendix group, then a legend pinned to the column’s bottom (see TOC).
- **Center:** article head, body, tail line, pager. Gutters hold only things that hang: the
  section number, heading anchors and the write head.
- **Outline column** (sticky; padding-right 24): “On this page” then “Referenced here” (below).
- Hanging section number when the center is ≥760px wide (`@container`), else inline.

### 1024–1199px — two columns

TOC 272 | center. The outline moves **into the TOC**: the current entry expands in place to list
its H2/H3 behind a 1px `--rule-strong` line (the Rust Book trait). “Referenced here” is dropped;
inline cross-references carry their status anyway.

### Compact <1024px — header + contents sheet (phone at 375 is the design target)

- **Sticky header, 48px**, `--ground`, 1px `--rule` bottom:
  - Left, flexible: the **location button** (`data-shot="toc-toggle"`) — status ring · `2.4` (tabular,
    ink-faint) · title (14/20, 500, ellipsis) · CSS chevron. On `/a` it reads “Contents”.
  - Right: `‹` and `›` buttons, 44×44, `aria-label="Previous: 2.3 Staying in Character"`.
- **Contents sheet** (one tap): fixed from 48px to the bottom, `--ground`, own scroll, page scroll
  locked while open. Same rows as the TOC at 17/24 with 44px min height (touch), the current entry
  expanded with its live outline (and `Writing · 46%` if writing), legend at the end. Opens with
  opacity 0→1 + translateY(−8px→0) over `--dur-base` `--ease-out`.
- **Text**: full width minus 16px gutters (32px at 768–1023, where body returns to 17/28 and text
  caps at 576). Measure at 375 ≈ 48 characters.
- No hover previews below 1024px or on `hover: none` devices.
- The outline is **never in the reading flow** on phone: a disclosure that grew while headings
  streamed in would push the text down. It lives in the sheet instead.

## Article head (every section, every state)

Top to bottom, desktop (phone values in brackets):

1. **Eyebrow row** 14/20 wdth 85: left `Chapter 2 · Performers Without a Pulse` (ink-muted; links
   to that chapter on `/a`); right `‹ 2.3   3.1 ›` (tabular, ink-muted → cue on hover; at
   1.1 and B.2 only the side that exists).
   Appendices read `Appendix A · Parts and Sensor Reference`. 16px below. [Phone: left part only;
   prev/next live in the header.]
2. **Title** H1 29/36 ink-strong, `text-wrap: balance`. The label `2.4` **hangs** in the left gutter:
   same size, weight 400, ink-faint, tabular, right-aligned 16px left of the text edge, so the title
   aligns with the body. Below a 760px center (`@container main`) it sits inline before the title,
   still ink-faint. 12px below.
3. **Summary** 20/28 [17/28] ink-muted, `text-wrap: pretty`. 16px below.
4. **Status line** — one line, fixed 16px height, micro mono, nowrap (text changes, layout doesn’t):
   (Rings are the CSS `StatusRing`; `● ◐ ○` in this spec are notation only.)
   - waiting: writing ring + `Waiting for the first words…` (cue)
   - streaming: writing ring + `Being written · 46%` (cue, tabular)
   - written: solid ring + `Written · 1,184 words` (ink-faint; ring ink-muted)
5. **Head rule**: 1px `--rule-strong` across the measure, 16px below the status line, 32px above the
   body. While writing, a green line on top of it fills left→right with `progress` (part of the
   signature moment).

The head is identical in waiting, streaming and written states, so nothing in it ever reflows.

## Section states

| State | TOC row (and phone sheet) | Section page | Inline cross-reference |
| --- | --- | --- | --- |
| **unwritten** | Title ink-faint; hollow ring (1.5px ink-faint) | Never painted — opening starts writing; renders as *waiting* | Dashed underline (ink-faint), hollow ring after the text |
| **writing — waiting** | Title ink; green ring with a 4px green centre that breathes (opacity 1 → 0.35 → 1, 1.6s) | Head + status `Waiting for the first words…`; body area holds only the tail line with the write head beside it; outline shows the title row and “Headings appear as they’re written.” | Dashed underline (cue-deep), green ring |
| **writing — streaming** | Same as waiting | Final layout growing at the bottom; write head on the live block; head rule filling; tail line `Being written · 46%  Follow ↓` (`· 0%` while waiting) | Same as waiting |
| **written** | Title ink; solid 8px ink-muted disc | No green anywhere; status `Written · n words`; no tail line | Solid 1px cue-deep underline, no ring |

Shape differs by state (hollow / centre dot / solid), so state never depends on colour alone. A
legend at the foot of the TOC and sheet explains the three rings (`● Written  ◐ Being written
○ Not yet written`, micro, ink-faint, rings drawn in CSS, not glyphs).

**You are here:** current row gets `--ground-tint`, a 2px ink-strong bar at its left edge, title
ink-strong 600, `aria-current="page"`; on load the TOC scrolls (its own `scrollTop` only, never
the page) to bring it into view.

## The TOC

- Chapter row: 14/20 Sans 600 ink-strong, wdth 85; label in a 36px tabular column, ink-faint
  (`2`). A heading, not a link (chapters have no page). 16px above each chapter group.
- Section row: 28px min height, padding 4/12; grid `36px label | title | 16px status` — labels
  align as a column (`2.4`, `A.1`), titles wrap under the title, rings form a status column at
  the right edge. 14/20 wdth 85; label ink-faint tabular.
- Hover: `--ground-tint`, title → ink-strong, `--dur-quick`. Focus: 2px cue outline,
  offset −2px (inside the scroll container so it isn’t clipped).
- **Appendices** sit after the chapters: 24px gap, 1px `--rule-strong`, 16px, group heading
  `Appendices` (12/16 Sans 600 ink-muted, sentence case), then `A  Parts and Sensor Reference` rows
  with lettered labels.

## Outline column (≥1200px)

- **On this page** (12/16 Sans 600 ink-muted): first row is the section title (so something is
  always current), then H2 (padding-left 12) and H3 (padding-left 24), 14/20 wdth 85 ink-muted,
  over a 1px `--rule` track. Current heading: ink-strong + a 2px ink-strong bar on the track
  (`--dur-quick` colour transition). Current = last heading whose top is above 25% of the viewport
  (rAF-throttled scroll listener). Built from the `text` (H2/H3 lines outside code fences), so it
  grows as headings stream in; new rows fade in over `--dur-base`. Rows only ever append.
- **Referenced here** (32px below): every `section:` link in the text, de-duplicated, in order of
  appearance — label (tabular, ink-faint) · title · ring. Tells the reader where this section
  points and what is still unwritten. Also grows during streaming.

## Streaming

- Text renders with `<Markdown>` in the final layout from the first chunk; chunks just appear (no
  fade — that’s C’s idiom).
- **Nothing above the reading position moves:** the head is fixed-height; the progress fill and
  write head use `transform` only; the code “Copy” control is reserved space with
  `visibility: hidden` until written; outline and TOC changes happen in their own columns;
  `scrollbar-gutter: stable`; growth only happens below the last block.
- **Never auto-scrolls.** The **tail line** sits just below the live block: micro mono ink-faint
  `Being written · 46%` and a **Follow ↓** text button (`aria-pressed`). When pressed it reads
  `Following ↓` in cue and keeps the tail line 24px above the viewport bottom after each
  chunk (instant scroll, never smooth). Any upward scroll (wheel, touch, PageUp/↑/Home) or a second
  press stops it; it ends when writing ends. The tail line is removed on completion (it is the
  lowest thing on the page, so nothing above moves).
- Screen readers: a visually hidden `aria-live="polite"` region announces only state changes
  (“Being written”, “Written”), never percentages.
- **Wrapping rule (no re-wrap under the reader).** `text-wrap: pretty` can re-flow a whole
  paragraph when its content changes, so it never applies to text that streams:
  - The prose root carries `data-wrap="pretty"` **only if the section was already written when
    this page load first saw it**. Otherwise it gets `data-wrap="plain"` (ordinary `wrap`), and
    keeps it after completion — no switch at the end, so finishing never re-flows anything.
  - “Streamed this load” is a module-level `Set` of section ids, filled by the shell from
    `useManual()` whenever a section is seen in `writing` (this also catches a section that kept
    streaming while the reader was elsewhere). It resets on reload, like the store.
  - Every `pretty` in this spec is scoped to `[data-wrap="pretty"]` (paragraphs, list items,
    blockquotes, table cells, footnotes). Static text outside the prose — summary, subtitle,
    previews, TOC — never changes while visible and keeps `pretty`/`balance` as specified.
  - Prose headings (H2–H4) use `balance` only under `[data-wrap="pretty"]`. A chunk can end
    mid-heading (`## The Half`), so under `[data-wrap="plain"]` they wrap normally too. The H1 and
    the manual title are static and always balanced.

## Signature moment — the write head (CSS only)

The change bar from a code editor’s gutter, put to work on a document being written. It answers
the three questions a reader has while text arrives without the page moving: *where is the live
edge, how far has it got, is it done?*

1. **Gutter bar.** While `data-status="writing"`, the block currently being written — selected as
   `.prose > :nth-last-child(1 of :not(section.footnotes))`, so the footnotes block appended early
   by the renderer never steals it — carries an `::after`: 2px wide, cue, 28px left of the
   text edge (8px clear of a code block’s bleed; 12px on phone), inset 4px top and bottom, so it grows with the paragraph, list or
   table as it fills. Each new block’s bar draws in with `scaleY(0→1)`, origin top,
   `--dur-quick`. Solid fill: no glow, no shadow. In the waiting state it sits beside the tail line.
2. **Head rule as meter.** `.article-head::after`: 1px cue over the head rule,
   `transform: scaleX(var(--progress))`, origin left, `transition: transform var(--dur-settle)
   linear`. `--progress` is the only value JS provides (`style={{ "--progress": progress }}`).
3. **The settle** (writing → written), all at once: the gutter bar retracts (`scaleY(1→0)`, origin
   bottom, `--dur-settle` `--ease-in-out`; the `::after` exists on the last block in every state
   and only its transform changes, so the transition can run); the meter’s colour fades from
   cue to `--rule-strong`; the status line swaps to `● Written · n words`; the TOC ring’s
   centre dot scales up to fill the ring while turning ink-muted. Green leaves the page; the
   section is now reference.

Why it serves reading: the bar marks exactly where new words are landing, so a reader reading
higher up knows the live edge without being dragged to it; the meter answers “how much is left”
from the head, where the eye returns; the settle is the single, quiet signal that the section can
be trusted as finished.

**Reduced motion** (`prefers-reduced-motion: reduce` sets every duration token to 0ms and removes
the breathe animation): the bar is present on the live block while writing and gone when written;
the meter steps with each chunk; the ring shows a static half-size centre dot; outline rows and the
contents sheet appear without movement; the footnote highlight becomes a static tint while
targeted. All information is kept, none of the motion. (Playwright’s `animations: "disabled"`
resets infinite animations to their first keyframe, so the breathe keyframes start at opacity 1.)

## Markdown, element by element (`.prose`)

- **Paragraphs:** 17/28 [16/24] ink, 0 0 16px, `text-wrap: pretty` only under
  `[data-wrap="pretty"]` (see the wrapping rule in Streaming), ragged right, no auto hyphens.
- **H2:** 24/32 600 ink-strong, 48px above / 12px below, `text-wrap: balance` under
  `[data-wrap="pretty"]` (ordinary wrapping while streaming). **H3:** 20/28 600,
  32 / 8. **H4:** 17/28 600 ink-strong, 24 / 4 (a run-in-weight label, body size). Heading directly
  after heading: 16px above. Ids are slugs via `components.h2–h4`; `scroll-margin-top` 24px
  (64px under the phone header).
- **Clause numbers.** Every prose H2 carries a clause number — `2.4.1`, `2.4.2`, `A.1.3` — set
  like the section label: same size, weight 400, ink-faint, tabular, hanging 16px left of the
  text edge (inline before the heading below a 760px center). A CSS counter on `.prose-root > h2`
  plus the section label as a custom property (`--section-label: "2.4"`) build it, so it never
  appears in the text or find-in-page. The number is the heading’s anchor link (hover → cue). The
  outline shows the same numbers. The renderer’s footnotes label `h2` is left unnumbered. This is
  the numbered-clause habit of real engineering manuals, and it is what keeps the written page from
  reading as a generic docs template.
- **Bold:** 600 ink-strong. **Italic:** Plex true italic, same colour.
- **Bulleted lists:** 28px indent; marker is an en dash `–` in ink-faint, drawn with `li::before`
  in the indent; nested lists 24px further, marker `·` ink-faint; 4px between items, nested list
  4px above.
- **Numbered lists:** `::marker` in ink-muted 600 tabular, so `1.`–`5.` align; nested bullets as
  above.
- **Checklists** (`ul.contains-task-list`): no dash; the disabled checkbox gets `appearance: none`
  as a 14×14 box, 1.5px ink-faint border, radius 2, hanging in the 28px indent and centred on the
  first line. Checked: filled ink-muted; the tick is `li:has(> input:checked)::before`, a rotated
  L of 2px `--ground` borders drawn over the box. Text stays ink (these are preflight checks, not
  struck-out tasks).
- **Blockquotes** (pull-quotes and the cast’s spoken lines): 20/28 ink-strong, 2px `--rule-strong`
  left rule, padding-left 20, 24px above/below. No italic, no quote glyphs added (the content
  already brings its own “ ”).
- **Tables:** in a wrapper with `overflow-x: auto` (tabindex 0, labelled), 24px above/below, full
  measure. 14/20 wdth 85, all cells tabular figures; header 12/16 Sans 600 ink-muted with a 1px
  `--rule-strong` line under it; rows separated by 1px `--rule`; no vertical lines, no zebra; cell
  padding 8/12 (first column flush left). First column 500 ink-strong — it names the row. GFM
  `---:` columns align right. A total row (first cell bold) gets a 1px `--ink-faint` sum
  line above it (set as the bottom border of the row before, since collapsed borders favour the
  upper cell). **Phone:** first column `position: sticky; left: 0` on
  `--ground` with a 1px `--rule` right edge, so the row stays named while the 5-column servo table
  scrolls; cells keep at least 8rem and wrap inside it, and the cut-off column at the right edge
  shows that the table scrolls. Right-aligned (numeric) cells never wrap (`150 ms` stays whole).
- **Code blocks:** `--ground-raised`, radius 2, extended 20px into each gutter so code aligns with
  the body text (phone: full bleed to the screen edges, radius 0, padding 16). A 28px strip at the top: language tag left
  (`ts`, `text`; micro mono ink-faint), **Copy** right (micro mono ink-faint → ink-strong;
  “Copied” for 1.5s, polite live region; hidden with `visibility` until the section is written).
  Code 14/20 Plex Mono, color ink, padding 0 20 16; `language-text` (the cast’s prompts) uses
  `pre-wrap` so prose prompts read on a phone; others scroll horizontally.
- **Inline code:** Plex Mono 0.88em, `--ground-tint`, padding 1px 4px, radius 2, ink.
- **Horizontal rule:** 1px `--rule-strong` across the measure, 40px above and below.
- **Footnote references:** `sup` at 12px, 600, cue, tabular, `line-height: 0` and relative
  offset (no line-gap bump), hover underline, focus ring.
- **Footnotes:** 48px above, a 1px `--rule-strong` top line, padding-top 16. The renderer’s hidden
  `h2` is shown as a label, 12/16 Sans 600 ink-muted. Notes 14/20 ink-muted, markers ink-faint
  tabular, 8px apart. Back-links render as `↑` instead of the renderer’s `↩` (via `components.a`
  on `data-footnote-backref`, keeping the `aria-label`; the loaded subset has U+2191 but not `↩`,
  `→` or `↗`), ink-faint → cue.
  `li:target` and a targeted reference flash `--cue-tint` fading over 1.6s.
- **External links:** ink text, 1px cue-deep underline at 0.18em offset; hover → cue
  text and underline (`--dur-quick`). A trailing CSS corner mark (5px, top and right 1.5px borders)
  says “leaves the manual”; opens in a new tab with visually hidden “(opens in a new tab)”.
- **Cross-references** (`SectionLink`, module level): to a written section, the external-link
  underline without the corner mark; to an unwritten or writing one, see the states table. On
  hover (300ms) or keyboard focus (immediate) a **preview** opens below the link (≥1024px, hover
  devices only): micro mono
  `4.2 · Chapter 4`, title 14/20 600 ink-strong, summary 14/20 ink-muted, status line with ring.
  320px wide, `--ground-raised`, 1px `--rule-strong` border, radius 4, padding 12/16, no shadow,
  opacity in over `--dur-base`. Positioned with **CSS anchor positioning**
  (`position-area`, `position-try-fallbacks: flip-block, flip-inline`) so it never causes
  horizontal scroll; hidden entirely under `@supports not (anchor-name: --x)`. It is a
  `<span role="tooltip">` (styled `display: block`; a `div` inside the `<p>` would be invalid
  nesting) beside the link, referenced by `aria-describedby`, so it never joins the link text or
  find-in-page. Each link gets its own `anchor-name`/`position-anchor`, built from `useId()` with
  the colons stripped (`:r1:` is not a valid dashed ident).

## Starting page (`/a`)

The annotated contents, in the same shell. A reference is entered through its index, and the
sidebar (compact, no summaries) and this page (summaries and states) do different jobs.

- Center column, content width 720 (the subtitle capped at 576), 64px from the top:
  - Title `The Haunt That Listens` 35/40 [29/36] ink-strong.
  - Subtitle 20/28 [17/28] ink-muted, `text-wrap: balance`.
  - Meta, micro mono ink-faint: `5 chapters · 2 appendices · 18 sections · 7 written`.
  - **Begin at 1.1 Why a Haunt Should Listen ›** — 17/28 600 ink-strong, 2px cue underline.
  - 48px, then the contents: per chapter, a heading row (20/28 600, label hanging like the section
    title) and section rows on a grid `48px label | title + summary | 120px status`: title 17/28
    500 (ink-strong if written, ink-muted if not), summary 14/20 ink-muted, status as ring + word
    (micro mono). Whole row is the link; hover `--ground-tint` and title → cue. 12px between
    rows, 32px between chapters; hairlines only between chapters.
  - **Appendices**: after a 1px `--rule-strong` line and 48px, an H2-sized `Appendices` heading,
    then the same rows with lettered labels.
- Outline column: “In this manual” — chapter and appendix jump links, same styling as
  “On this page”.
- No hero, no illustration: the 35px title sits directly on dense content.
- Phone: same order, full width; the header button reads “Contents” and opens the same sheet.

## How appendices are set apart

A separate, headed group after a strong rule in the TOC, the sheet and the start page; lettered
labels (`A`, `A.1`); the eyebrow reads `Appendix A · …`; and the pager says so when you cross over
(`Next · Appendix A · A.1 ›`). Same reading treatment otherwise — they are reference tables and
deserve the same craft.

## Previous / next

- Pager 64px below the body (or tail line): two cells, `1fr 1fr`, 16px apart, each with a 1px
  `--rule-strong` top line, padding-top 12. Line 1 micro mono ink-faint: `‹ Previous · 2.3` /
  `Next · Chapter 3 · 3.1 ›` (chapter or appendix named whenever the link crosses a boundary).
  Line 2: title 17/28 500 ink-strong + status ring. Next is right-aligned. Hover: title and top line
  → cue. Ends of the manual are never empty: before 1.1 the cell reads `Start of the manual · Back to
  contents`, after B.2
  `End of the manual · Back to contents`. Phone: stacked, full width, 44px+ targets.
- Also the eyebrow’s `‹ 2.3  3.1 ›` (desktop), the header buttons (compact), and **← / →** keys
  (when focus isn’t in a text field or a horizontally scrollable code block or table).

## Keyboard and focus

- First focusable: “Skip to text”, shown on focus top-left (14/20 on `--ground-raised`).
- DOM order: TOC nav → main (eyebrow links, body links, Copy, Follow, pager) → outline aside.
- Focus ring everywhere: `outline: 2px solid var(--cue); outline-offset: 2px`, radius 2
  (offset −2px inside scroll containers). `:focus-visible` only.
- Route change: scroll to top; after link navigation (a router PUSH, not a fresh load) focus the
  H1 (`tabindex=-1`, `preventScroll`), so a fresh load still starts at the skip link.
- Contents sheet: focus moves to the current row on open, Tab is contained in header + sheet, Esc
  or a choice closes it, focus returns to the location button. Esc also closes any preview.
- Code blocks and table wrappers are focusable scroll regions with labels.
- Every interactive element has a distinct hover (colour or tint, `--dur-quick`) and focus state.

## Typographic detail

- All UI copy is written with real punctuation: ’ “ ” – — … (`Waiting for the first words…`,
  `Not yet written — opening it starts the writing.`). The content is already typographic.
- Tabular figures: TOC/outline/pager labels, status percentages and word counts (with thousands
  separators), table cells, ordered-list markers, footnote numbers.
- `text-wrap: balance` on the H1 and the manual title always, and on prose H2–H4 only under
  `[data-wrap="pretty"]`. `text-wrap: pretty` on summaries and other static text always, and on
  paragraphs, list items, blockquotes, table cells and footnotes only in sections that loaded
  already written (`[data-wrap="pretty"]`); anything that streamed this load wraps normally,
  during and after streaming.
- `::selection` in `--selection` with ink-strong text.

## Avoiding the generic

| Banned / cliché | How A avoids it |
| --- | --- |
| Gradients, glass, glows, neon | Flat fills only. The green is a muted indicator-lamp green (`#5FC48A`), never saturated or haloed; the meter and write head are solid 1–2px lines; previews have a border, no blur, no shadow. |
| Emoji as icons | None. Every mark is a font glyph Plex actually contains (`‹ › ↑ ↓ #`) or drawn in CSS (rings, chevron, corner mark, tick). |
| Rounded cards with shadows | Nothing is a card. The start page is a list; code is a tinted block with 2px corners; no shadows anywhere. |
| Pill badges | Status is a ring plus a word. The current-row tint has 4px corners. |
| Inter on slate-900 | IBM Plex on low-chroma graphite `#121314` (slate-900 is a saturated blue `#0F172A`; this is neutral charcoal). |
| Purple/blue AI accent | One cue-light green with exactly two meanings (live, actionable); it never decorates. |
| A border on every element | Hairlines with a named job only: head rule, `hr`, table rows, outline track, pager tops, previews, phone header, appendix divider. Columns are separated by tone or space. |
| Centering everything | All text left-aligned (only the pager’s “Next” is right-aligned, pointing forward). |
| Giant hero heading | 35px title, then the contents immediately. |
| Decorative icons | Each glyph above carries state or direction. No icons beside TOC entries. |
| The usual LLM look | No uppercase tracked eyebrows (labels are sentence case), no 8–16px rounding on everything, no card grids, no gradient progress bar, no “AI sparkle”. Density comes from a type system (wdth 85, tabular columns, hanging numbers), not from shrinking everything. |

## Build structure

- One component per file, each importing its own stylesheet; `tokens.css` is the only place any
  colour, size, spacing, radius or timing is defined.
  - `index.tsx` (route → `StartPage` or `SectionPage`) · `Shell` (layout,
    TOC column, outline column) · `CompactBar` (phone header + contents sheet) · `Toc` ·
    `StatusRing` (+ legend) · `ArticleHead` · `Prose` (renderer components) · `CodeBlock` ·
    `SectionLink` (+ preview) · `TailLine` (+ Follow) · `Pager` · `Outline` · `StartPage`.
  - Helpers: `markdownScan.ts` (headings with unique ids, source lines and clause numbers; linked
    sections; word count), `manualParts.ts` (chapter names and paths), `streamedThisLoad.ts`,
    `useActiveHeading.ts`, `usePrevNextKeys.ts` (ignores key auto-repeat).
- The Shell stays mounted while moving between sections (only the article is keyed by section
  id), so the TOC keeps its scroll position; it scrolls the current row into view only when the
  row is out of comfortable view.
- Heading ids come from one scan of the text: `Prose` looks each heading’s id up by its source
  line, so the outline and the page always agree and duplicates get `-2`, `-3`.
- The contents sheet locks page scroll with CSS only
  (`html:has(.design-a .sheet[data-open])`, below 1024px), so widening the window releases it.
- `useSection` only on the section page; the TOC, outline, previews and pager read
  `useManual()` + `findSection()` so they never open a section.
- `SectionLink` and `components` are defined at module level (focus and hover survive chunks).
- The preview is `display: none` until shown (fading in with `allow-discrete` and
  `@starting-style`): Chrome remembers the last successful `position-try` fallback while a box
  exists, so a preview first laid out below the fold would otherwise stay flipped above its link.
- The toggle is hidden at ≥1024px; the shot script only clicks a visible toggle.
