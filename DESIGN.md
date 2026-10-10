# RTFM reader — design

The single source of truth for the reader's design. The first half holds the rules: what the
reader must do and the craft bar it must meet. The second half is the design itself: concept,
tokens, layout, states, streaming and markdown. Where the code and this doc disagree, one of them
is a bug.

## What the reader is

- The reader shows **one manual whose table of contents already exists**: today, the sample
  manual in `src/manual/sample/`.
- An LLM will write each section when it is first opened. There is no LLM yet: a fake streamer in
  `src/manual/` plays each section's body in.
- **Happy path only:** no manual creation, no error or failure states.
- **Dark only.**
- Routes: `/read` is the manual's start page, `/read/:sectionId` is a section, and every other path
  redirects to `/read`.

## Data model

Defined in `src/manual/types.ts`. The reader reads it and never changes it.

```ts
interface Manual {
  id: string;
  title: string;
  subtitle: string;
  voice: string;          // writing-style brief for the (future) LLM; the reader may ignore it
  chapters: Chapter[];
  appendices: Chapter[];  // same shape as chapters, lettered A, B, …
}

interface Chapter {
  id: string;
  label: string;          // "3" for chapters, "B" for appendices
  title: string;
  sections: Section[];
}

interface Section {
  id: string;
  label: string;          // "3.2" or "B.1"
  title: string;
  summary: string;        // one line, always available (it comes with the TOC)
  status: "unwritten" | "writing" | "written";
  body: string;           // markdown; only shown once the section is written or streaming
}
```

Opening an `unwritten` section switches it to `writing`. The fake streamer then plays its `body`
in, and the section becomes `written`. The hooks and the markdown renderer that expose this are
documented in `src/manual/README.md`.

## Reader behavior

These rules are locked: any change to the reader keeps them.

**Section states**
- `unwritten`, `writing` and `written` each look clearly different, **both in the TOC and on the
  section page**.
- A section that is waiting for its first words shows its **title and summary**. Never a blank page.

**Streaming**
- Streaming text appears **in the final reading layout**, styled exactly as it will be when finished.
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

**Baseline quality**
- The TOC and previous/next work from the keyboard, with a visible focus state.
- Text contrast meets **WCAG AA**.
- **`prefers-reduced-motion`** is respected: every animation has a calm fallback that keeps all
  of its information.

## Desktop first, phone too

- **Desktop is the primary experience.** It is designed at full strength: wide layouts, several
  columns and hover previews are all welcome.
- **The desktop layout is never simplified to make the phone layout easier.** The phone gets its
  own adaptation at narrow widths (a different structure, a sheet, content moved), not a shared
  lowest-common-denominator layout.
- Works from **375px to 1440px+** wide, with no horizontal page scroll.

## Craft requirements

**System**
- All colors, type sizes, spacing, radii and timings are tokens defined in **one place**
  (`src/ui/tokens.css`).
- A modular type scale and a **4px** spacing grid.
- At most **two font families**, plus a monospace font for code.
- The background is not pure black (`#000`), and text is not pure white (`#fff`).

**Typographic detail**
- Curly quotes and apostrophes, real en and em dashes, a real ellipsis.
- Tabular (even-width) numerals wherever numbers line up, such as section labels in the TOC.
- `text-wrap: balance` on headings and `text-wrap: pretty` on body text, so no single word is left
  alone on a line. **Exception:** `pretty` can re-wrap a whole paragraph when it changes, so text
  that is streaming, or that streamed in during this page load, uses ordinary wrapping. Only text
  that was already written when the page loaded uses `pretty` (see "The wrapping rule").
- Every interactive element has a clear hover state and a clear focus state.
- UI transitions are about **150–250ms**, with deliberate easing.

## Banned

These are the usual giveaways of an LLM-made interface. Don't use them.

- Gradients, glassmorphism / frosted blur, glows, neon
- Emoji used as icons
- Everything wrapped in rounded cards with drop shadows
- Pill badges everywhere
- The default Tailwind look: Inter on slate-900
- Purple or blue "AI" accent colors
- A border on every element
- Centering everything
- Giant hero headings with little content underneath
- Decorative icons that don't carry meaning

How the reader stays clear of them:

| Banned | In the reader |
| --- | --- |
| Gradients, glass, glows, neon | Flat fills only. The green is a muted indicator-lamp green, never saturated or haloed; the meter and write head are solid 1–3px lines; previews have a border, no blur, no shadow. |
| Emoji as icons | None. Every mark is a glyph IBM Plex contains (`‹ › ↑ ↓`) or is drawn in CSS (rings, chevron, corner mark, tick). |
| Rounded cards with shadows | Nothing is a card. The start page is a list; code is a tinted block with 2px corners; no shadows anywhere. |
| Pill badges | Status is a ring plus a word. The current-row tint has 4px corners. |
| Inter on slate-900 | IBM Plex on low-chroma graphite `#121314` (slate-900 is a saturated blue). |
| Purple or blue accent | One cue-light green with exactly two meanings (live, actionable). It never decorates. |
| A border on every element | Hairlines with a named job only: head rule, `hr`, table rows, outline track, pager tops, previews, compact header, appendix dividers, start-page chapter lines. Columns are separated by tone or space. |
| Centering everything | All text is left-aligned (only the pager's "Next" is right-aligned, pointing forward). |
| Giant hero heading | A 35px title, then the contents immediately. |
| Decorative icons | Every glyph carries state or direction. No icons beside TOC entries. |

Also avoided: uppercase tracked eyebrows (labels are sentence case), 8–16px rounding on
everything, card grids, gradient progress bars. Density comes from the type system (wdth 85,
tabular columns, hanging numbers), not from shrinking everything.

## Concept

**The show-control desk.** The sample manual is written by a showman, but it is used by a builder
with a multimeter in one hand: someone who jumps to A.1 for a torque figure, checks 2.4's latency
budget, then follows a cross-reference to 5.1. So the reader reads like the best engineering docs,
set for the booth's console: a neutral **graphite** ground with no warm cast, cool off-white ink,
and one **cue-light green** (the stage manager's "GO") that means only two things: *this is live*
(being written) and *you can act on this* (links, focus).

Everything is visible at once on desktop: the whole manual's state in the left index, the text in
the middle, the section's outline and outgoing references on the right. One sans family in IBM's
engineering-manual tradition, numbers that line up, hairlines with jobs, no ornament. The theatre
lives in the words; the interface stays the calm stage manager.

## Tokens

Every color, type size, spacing step, radius and timing is a custom property in
`src/ui/tokens.css`, set on `:root` and shared with the library (see `src/ui/README.md`). The
reader's own layout and component sizes (column widths, header height, gutter, write-head
geometry, label and outline columns) are in `src/reader/tokens.css`, set on `.reader`. No other
file defines a color, type size, spacing step, radius or timing.

### Typefaces

| Role | Font (loaded by `src/ui/fonts.ts`) | Settings | Why |
| --- | --- | --- | --- |
| Text and interface | **IBM Plex Sans Variable**, `--font-sans` | wght 400 / 500 / 600; wdth 100 for reading, **85** (`--wdth-tight`) for the TOC, outline, tables, pager and previews | Engineering-manual lineage, and it has every glyph the content needs (`I²C`, `1½`, `N·m`, `‹ ›`, `↑ ↓`). wdth 85 packs dense UI about 6% tighter without a second family. |
| Code and readouts | **IBM Plex Mono**, `--font-mono` | 400 | Same superfamily, so metrics and texture match. It is the "machine voice" for status readouts, language tags and percentages. |

Body italics are Plex's true italic. No `font-optical-sizing` (Plex has no opsz axis). Measured on
the sample text: Plex Sans 17px is about 7.58px per character, 16px about 7.13px.

### Type scale

Minor third (×1.2) on a 17px base; line heights on the 4px grid. Each size is a `--text-*` token
with a matching `--leading-*` token.

| Token | Size / line | Weight · width | Use |
| --- | --- | --- | --- |
| `--text-micro` | 12 / 16 | Mono 400, +0.02em; or Sans 600 | Status readouts, code language tag, table headers, outline and group labels |
| `--text-ui` | 14 / 20 | 400–600 · wdth 85 | TOC, outline, tables, previews, footnotes |
| `--text-reply` | 16 / 24 | 400 · wdth 100 | The library agent's replies (`ReplyMarkdown`); not used by the reader |
| `--text-body` | **17 / 28** (phone **16 / 24**) | 400 · wdth 100 | Paragraphs, lists, H4, pager titles |
| `--text-lead` | 20 / 28 (phone 17 / 28) | 400 | Section summary, start-page subtitle, blockquotes |
| `--text-h3` | 20 / 28 | 600, −0.005em | H3, start-page chapter headings |
| `--text-h2` | 24 / 32 | 600, −0.008em | H2, start-page "Appendices" |
| `--text-h1` | 29 / 36 | 600, −0.012em | Section title |
| `--text-title` | 35 / 40 (phone 29 / 36) | 600, −0.015em | Manual title on the start page only |

"Phone" means below 768px. The phone body steps off the scale to 16/24 on purpose: at 375px it
keeps the measure at about 48 characters (17px would sit at the 45 limit), and a short line wants
tighter leading. `--text-reply` takes the same 16/24 at every width, for the same reason: replies
sit in narrow columns.

### Spacing

4px grid: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 ·
`-12` 48 · `-16` 64 · `-24` 96 (px).

### Palette: graphite and the GO light

The booth's console: charcoal panels, off-white legends, and the cue light. A stage manager's cue
light turns green for **GO**, the moment something happens live, which is exactly this accent's
job. A muted signal green (not neon, not teal), so it reads as an indicator lamp, not a brand.

| Token | Hex | Role | Contrast on ground |
| --- | --- | --- | --- |
| `--ground` | `#121314` | Page: graphite, neutral with a faint cool lean | — |
| `--ground-side` | `#17191B` | TOC column; the tonal step *is* the divider (no border) | — |
| `--ground-raised` | `#1C1E20` | Code blocks, previews, skip link | — |
| `--ground-tint` | `#24272A` | Current TOC row, inline code, hover on buttons and start-page rows | — |
| `--ground-hover` | `#1E2023` | TOC row hover (lighter than the current row, so "here" stays unique) | — |
| `--rule` | `#2B2E31` | Table row lines, outline track, compact header line, start-page chapter lines | — |
| `--rule-strong` | `#3C4044` | Head rule, `hr`, table header line, pager rules, preview border, appendix dividers | — |
| `--ink-strong` | `#EDEFEF` | Headings, `strong`, current items | 16.1:1 |
| `--ink` | `#D3D7D8` | Body text (cool off-white, no cream) | 12.8:1 |
| `--ink-muted` | `#AEB4B7` | Summaries, labels, outline, footnotes, written-ring fill (1.5:1 above ink-faint, so the two meta tiers stay apart) | 8.9:1 |
| `--ink-faint` | `#8C9296` | Unwritten titles, label numerals, meta (at least 4.7:1 on every ground, including tint) | 5.9:1 |
| `--cue` | `#5FC48A` | GO green: live/writing state, link hover, footnote references, focus ring (at least 7.0:1 on every ground) | 8.6:1 |
| `--cue-deep` | `#377D57` | Link underlines and the writing-link dash (non-text, at least 3:1 on ground) | 3.8:1 |
| `--cue-tint` | `#15261D` | Footnote `:target` highlight (ink on it 10.9:1) | — |
| `--selection` | `#22412F` | `::selection` background (ink-strong on it 9.8:1) | — |

No second accent. Hairlines are always `--rule` or `--rule-strong`.

### Radii, motion and sizes

- **Radii:** `--radius-s` 2px (code, inline code, checkboxes, focus ring, small buttons),
  `--radius-m` 4px (TOC and start-page row highlights, previews, compact header buttons). Rings are
  circles. Nothing else is rounded.
- **Durations:** `--dur-quick` 150ms (hover color), `--dur-base` 200ms (preview, contents sheet,
  outline rows), `--dur-settle` 250ms (write-head retract, rule color, ring fill, progress fill),
  `--dur-breathe` 1600ms (the writing pulse), `--dur-target` 1600ms (footnote target fade),
  `--delay-preview` 300ms.
- **Easing:** `--ease-out` `cubic-bezier(0.2, 0.8, 0.2, 1)` for things arriving; `--ease-in-out`
  `cubic-bezier(0.4, 0, 0.2, 1)` for state changes; **linear** for the progress fill (it tracks a
  measurement, so easing would make it lurch).
- **Focus:** `--focus-ring` `2px solid var(--cue)`, `--focus-offset` 2px.
- **Shared sizes** (`src/ui/tokens.css`): `--measure` **576px** (about 76 characters of 17px
  Plex) · `--tap` 44px (touch targets) · `--ring` 10px (1.5px border, so the writing dot and the
  solid fill centre cleanly) · `--list-indent` 28px.
- **Reader layout sizes** (`src/reader/tokens.css`): `--toc-width` 272px · `--outline-width` 240px
  · `--start-width` 720px · `--header-height` 48px · `--gutter` 64px (32px below 1024px, 16px on
  phone).
- **Reader component sizes** (`src/reader/tokens.css`): `--bar-width` 2px (current-item bars) ·
  `--write-head-width` 3px · `--write-head-lamp` 7px · `--write-head-offset` 28px (12px on phone) ·
  `--code-bleed` 20px (16px on phone) · `--label-col` 36px · `--label-col-wide` 48px (40px on
  phone) · `--outline-number-col` 40px (48px below 1024px) · `--status-col` 136px ·
  `--check-size` 14px · `--preview-width` 320px.
- **Reduced motion** sets `--dur-quick`, `--dur-base`, `--dur-settle` and `--delay-preview` to 0ms;
  each animation (breathe, outline rows, write head, footnote target) is switched off where it is
  defined.

### Page

`src/ui/base.css` gives `html` `background: var(--ground)`, `color-scheme: dark`,
`scrollbar-gutter: stable` (so the page growing past the viewport never shifts text sideways) and
scrollbar colors (`scrollbar-color: var(--rule-strong) transparent`). The reader's root is `<div class="ui
reader">`: `.ui` sets the base type, selection and focus, and scopes the shared styles; all of the
reader's own CSS is scoped under `.reader`.

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
its H2 and H3 headings over the outline track. "Referenced here" is dropped, because inline
cross-references carry their status anyway.

### Compact, below 1024px: header and contents sheet

The phone at 375px is the design target.

- **Sticky header**, 48px, `--ground`, 1px `--rule` bottom line:
  - Left, flexible: the **location button** (40px tall, `data-shot="toc-toggle"`): status ring ·
    `2.4` (tabular, ink-faint) · title (14/20, 500, wdth 85, ellipsis) · a CSS chevron that turns
    when open. On the start page it reads "Contents".
  - Right: `‹` and `›` links, 44×44, `aria-label="Previous: 2.3 Staying in Character"`. A missing
    side is omitted, never a dead glyph. On the start page, `›` goes to 1.1.
- **Contents sheet** (one tap): fixed from the header to the bottom, `--ground`, its own scroll,
  page scroll locked while open. The same TOC, capped at the measure, with rows at body size and a
  44px minimum height for touch; the current entry is expanded with its live outline. It opens
  with opacity 0→1 and translateY(−8px→0) over `--dur-base` `--ease-out`.
- **Text:** full width minus the gutter (32px at 768–1023px, where body text returns to 17/28 and
  caps at the measure; 16px on phone). The centre starts 24px below the header. The measure at
  375px is about 48 characters.
- No hover previews below 1024px or on `hover: none` devices.
- The outline is **never in the reading flow**: a disclosure that grew while headings streamed in
  would push the text down. It lives in the sheet instead.

### Article head (every section, every state)

Top to bottom (phone values in brackets):

1. **Eyebrow row**, 14/20 wdth 85: left `Chapter 2 · Performers Without a Pulse` (ink-muted, links
   to that chapter on the start page); right `‹ 2.3   3.1 ›` (tabular, ink-muted, cue on hover;
   at 1.1 and B.2 only the side that exists). Appendices read `Appendix A · Parts and Sensor
   Reference`. 16px below. Below 1024px only the left part shows; previous/next live in the header.
2. **Title**, H1 29/36 ink-strong, `text-wrap: balance`. The label `2.4` hangs in the left gutter
   (see Hanging numbers): same size, weight 400, ink-faint, tabular, 16px left of the text edge, so
   the title aligns with the body. 12px below.
3. **Summary**, 20/28 [17/28] ink-muted, `text-wrap: pretty`. 16px below.
4. **Status line**: one line, a fixed 16px tall, micro mono, nowrap (the text changes, the layout
   doesn't):
   - waiting: writing ring + `Waiting for the first words…` (cue)
   - streaming: writing ring + `Being written · 46%` (cue, tabular)
   - written: solid ring + `Written · 1,184 words` (ink-faint; ring ink-muted)
5. **Head rule**: 1px `--rule-strong` across the measure, 16px below the status line, 32px above
   the body. While writing it doubles as the progress meter (see The write head).

The head is identical in the waiting, streaming and written states, so nothing in it ever reflows.

### The TOC

- **Masthead** (padding 20/16/8): the manual title, 14/20 600 ink-strong, linking to `/read` (it
  takes the current-row tint on the start page); under it `7 of 18 sections written`, micro mono
  ink-faint, live; then the status legend (see Section states).
- **Chapter row:** 14/20 600 ink-strong, wdth 85; the label in a 36px tabular column, ink-faint. A
  heading, not a link (chapters have no page). 8px above each chapter group.
- **Section row:** 24px tall (padding 2/12), so the dense index fits the screen. Grid
  `36px label | title | 16px status`: labels align as a column (`2.4`, `A.1`), titles wrap under
  the title, and rings form a status column at the right edge. 14/20 wdth 85; label ink-faint,
  tabular.
- **Hover:** `--ground-hover`, title to ink-strong, `--dur-quick`. **Focus:** the cue ring with a
  −2px offset, inside the scroll container so it isn't clipped.
- **You are here:** the current row gets `--ground-tint`, a 2px ink-strong bar at its left edge,
  title ink-strong 600, label ink-muted, `aria-current="page"`. The TOC scrolls (its own
  `scrollTop`, never the page) to bring the current row into view when it is out of comfortable
  view.
- **Appendices** come after the chapters: 16px gap, a 1px `--rule-strong` line, 12px, the group
  label `Appendices` (12/16 Sans 600 ink-muted, sentence case), then the appendix groups with
  lettered labels.

### Outline column (1200px and up)

- **On this page** (label 12/16 Sans 600 ink-muted): the first row is the section title, so
  something is always current. Then H2 rows with their clause number in `--outline-number-col`,
  and H3 rows indented to the H2 *titles* so they nest under them. 14/20 wdth 85 ink-muted, over a
  1px `--rule` track.
- **Current heading:** ink-strong and a 2px ink-strong bar on the track. Current is the last
  heading whose top is above 25% of the viewport (a rAF-throttled scroll listener), else the title.
- Built from the text (H2 and H3 lines outside code fences), so it grows as headings stream in.
  While writing, new rows fade in over `--dur-base`. Rows only ever append. Before the first
  heading, a hint reads `Headings appear as they’re written.`
- **Referenced here** (32px below): every `section:` link in the text, de-duplicated, in order of
  appearance: label (tabular, ink-faint) · title · ring. It tells the reader where this section
  points and what is still unwritten, and also grows during streaming.

### Start page (`/read`)

The annotated contents, in the same shell. A reference is entered through its index: the sidebar
(compact, no summaries) and this page (summaries and states) do different jobs.

- **Head** (capped at the measure), 64px from the top:
  - title `The Haunt That Listens`, 35/40 [29/36] ink-strong, 12px below;
  - subtitle, 20/28 [17/28] ink-muted, `text-wrap: balance`, 16px below;
  - meta, micro mono ink-faint: `5 chapters · 2 appendices · 18 sections · 7 written`, 24px below;
  - **Begin at 1.1 Why a Haunt Should Listen ›**, 17/28 600 ink-strong with a 2px cue underline
    (cue text on hover).
- **Contents** (width 720), 48px below the head. Each chapter starts with a 1px `--rule` line and
  24px of space, then a heading row (20/28 600, label in the 48px label column). Section rows sit
  on a grid `48px label | title + summary | 136px status`: title 17/28 500 (ink-strong, or
  ink-muted while unwritten), summary 14/20 ink-muted, status as ring + word in micro mono (cue
  while writing). The whole row is the link: padding 8/12, hover `--ground-tint` and title to cue.
  On phone the status moves under the summary.
- **Appendices:** 48px, a 1px `--rule-strong` line, 48px, an H2-sized `Appendices` heading, then
  the same chapter blocks with lettered labels.
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

- **Pager**, 64px below the body (or the tail line): two cells, `1fr 1fr`, 16px apart, each with
  a 1px `--rule-strong` top line and 12px above its text. Line 1, micro mono ink-faint:
  `‹ Previous · 2.3` / `Next · Chapter 3 · 3.1 ›` (the chapter or appendix is named whenever the
  link crosses a boundary). Line 2: the title, 17/28 500 wdth 85 ink-strong, with its status ring.
  Next is right-aligned. Hover: title and top line to cue.
- The ends of the manual are never empty: before 1.1 the cell reads `Start of the manual` /
  `Back to contents`, after B.2 `End of the manual` / `Back to contents`.
- Phone: stacked, full width, 24px apart, 44px+ targets.
- Also: the eyebrow's `‹ 2.3  3.1 ›` (1024px and up), the header links (below 1024px), and the
  **← / →** keys. The keys ignore auto-repeat and modifier keys, and do nothing while focus is in a
  text field, a code block or a table, where arrows already scroll.

### Keyboard and focus

- First focusable: "Skip to text", shown on focus at the top left (14/20 500 on `--ground-raised`).
- DOM order: compact header and sheet → TOC → main (eyebrow links, body links, Copy, Follow, pager)
  → outline.
- Focus ring everywhere: `outline: var(--focus-ring); outline-offset: var(--focus-offset)` (2px
  cue, 2px out), radius 2, or the control's own radius where it has one (offset −2px inside the
  TOC). `:focus-visible` only.
- Route change to a section: scroll to the top. After link navigation (a router PUSH, not a fresh
  load) focus moves to the H1 (`tabindex=-1`, `preventScroll`), so a fresh load still starts at
  the skip link. The start page scrolls to the chapter in the URL hash, or to the top.
- Contents sheet: focus moves to the current row on open, Tab is contained in the header and
  sheet, Esc closes it and returns focus to the location button, and choosing a link closes it.
- Code blocks and table wrappers are focusable, labelled scroll regions.

## Section states

| State | TOC row (and sheet) | Section page | Inline cross-reference |
| --- | --- | --- | --- |
| **unwritten** | Title ink-faint; hollow ring (1.5px ink-faint) | Never painted: opening starts the writing, so it renders as *waiting* | Dashed underline (ink-faint), hollow ring after the text |
| **writing, waiting** | Title ink; green ring with a half-size green centre that breathes (opacity 1 → 0.35 → 1 over 1.6s) | The head with `Waiting for the first words…`; the body holds only the tail line, with the write head beside it; the outline shows the title row and its hint | Dashed underline (cue-deep), green ring |
| **writing, streaming** | Same as waiting | The final layout growing at the bottom; the write head on the live block; the head rule filling; the tail line `Being written · 46%  Follow ↓` | Same as waiting |
| **written** | Title ink; solid ink-muted disc | No green anywhere; status `Written · n words`; no tail line | Solid 1px cue-deep underline, no ring |

The shape differs by state (hollow, centre dot, solid), so state never depends on color alone. A
legend in the TOC masthead explains the three rings in one line (`Written · Writing · Not written`,
micro, ink-faint, rings drawn in CSS). Rings are the shared `StatusRing` component (`src/ui`).

## Streaming

- Text renders with `<Markdown>` in the final layout from the first chunk. Chunks just appear,
  with no fade; the live edge is marked by the write head.
- **Nothing above the reading position moves:** the head is a fixed height; the progress fill and
  write head use `transform` only; the code blocks' Copy button keeps its space with
  `visibility: hidden` until the section is written; outline and TOC changes happen in their own
  columns; `scrollbar-gutter: stable`; growth only happens below the last block.
- **It never scrolls on its own.** The **tail line** sits just below the live block: micro mono,
  the readout `Being written · 46%` in cue, and a **Follow ↓** text button (`aria-pressed`). When
  pressed it reads `Following ↓` in cue and keeps the tail line 24px above the viewport bottom after
  each chunk (an instant scroll, never smooth). Any upward scroll (wheel, touch, PageUp, ↑, Home)
  or a second press stops it. The tail line is removed when writing ends; it is the lowest thing
  on the page, so nothing above moves.
- Screen readers: a visually hidden `aria-live="polite"` region announces only state changes
  ("Being written", "Written"), never percentages.

### The write head

The reader's signature: the change bar from a code editor's gutter, put to work on a document
being written. It answers the three questions a reader has while text arrives without the page
moving: *where is the live edge, how far has it got, is it done?* CSS only.

1. **Gutter bar.** While writing, the block being written, selected as
   `.prose-root > :nth-last-child(1 of :not(.footnotes))`, carries an `::after`: 3px wide, cue,
   `--write-head-offset` (28px; 12px on phone) left of the text edge, so it clears a code block's
   bleed, inset 4px top and bottom, so it grows with the paragraph, list or table as it fills. An
   `hr` as the live block gets a bar 12px past each side, so the bar never collapses. Each new
   block's bar draws in with `scaleY(0→1)`, origin top, `--dur-quick`. Solid fill: no glow, no
   shadow.
2. **The lamp.** At the foot of that bar, level with the line being written, sits a 7px square cue
   lamp (`::before`) that breathes like the TOC's writing ring. It is the cue light of the concept:
   the exact line where words land.
3. **The tail.** The tail line under the live block carries the same 3px bar for the whole stream,
   and its cue readout sits beside **Follow ↓**, so bar, lamp, percentage and Follow read as one
   instrument. While waiting, the bar and lamp sit beside the tail line alone.
4. **Head rule as meter.** `.head-rule::after`: cue over the head rule, drawn 2px tall while
   writing (`inset: -0.5px 0`, no layout change), `transform: scaleX(var(--progress))`, origin
   left, `transition: transform var(--dur-settle) linear`. `--progress` is the only value JS
   provides.
5. **Footnotes wait.** While writing, the footnotes block (whose notes are empty stubs until the
   last chunks) is `display: none`, so the tail line hugs the live text. It appears with the
   settle, below everything, so nothing above the reader moves.
6. **The settle** (writing → written), all at once: the gutter bar retracts (`scaleY(1→0)`, origin
   bottom, `--dur-settle` `--ease-in-out`; the `::after` exists on the last block in every state
   and only its transform changes, so the transition can run); the meter's color fades from cue
   to `--rule-strong`; the status line swaps to `Written · n words`; the TOC ring's centre dot
   scales up to fill the ring while turning ink-muted. Green leaves the page; the section is now
   reference.

Why it serves reading: the bar marks exactly where new words land, so someone reading higher up
knows the live edge without being dragged to it; the meter answers "how much is left" from the
head, where the eye returns; the settle is the single, quiet signal that the section can be
trusted as finished.

**Reduced motion:** the bar and a steady lamp are on the live block while writing and gone when
written; the meter steps with each chunk; the ring shows a static half-size centre dot; outline
rows and the contents sheet appear without movement; the footnote highlight is a static tint while
targeted. All the information stays, none of the motion. (Playwright's `animations: "disabled"`
resets infinite animations to their first keyframe, so the breathe keyframes start at opacity 1.)

### The wrapping rule

`text-wrap: pretty` can re-flow a whole paragraph when its content changes, so it never applies
to text that streams:

- The prose root carries `data-wrap="pretty"` **only if the section was already written when this
  page load first saw it**. Otherwise it gets `data-wrap="plain"` (ordinary wrapping) and keeps it
  after completion. There is no switch at the end, so finishing never re-flows anything.
- "Streamed this load" is a module-level `Set` of section ids (`streamedThisLoad.ts`), filled by
  the shell from `useManual()` whenever a section is seen `writing`. This also catches a section
  that kept streaming while the reader was elsewhere. It resets on reload, like the store.
- Under `[data-wrap="pretty"]`: `pretty` on paragraphs, list items, blockquotes and table cells,
  and `balance` on prose H2–H4. A chunk can end mid-heading (`## The Half`), so under
  `[data-wrap="plain"]` headings wrap normally too.
- Static text outside the prose (summaries, the subtitle, previews, the TOC) never changes while
  visible and keeps `pretty` or `balance`. The H1 and the manual title are always balanced.

## Markdown

Every element the sample manual uses has a deliberate treatment, all under `.prose-root`.
Paragraphs, bold, inline code and lists come from the shared `.markdown` treatment in
`src/ui/markdown.css`, which the library's agent replies use too (at `--text-reply`); the rest is
the reader's own, in `prose.css`.

- **Paragraphs:** 17/28 [16/24] ink, 16px below, ragged right, no automatic hyphens.
- **Headings:** H2 24/32 600 ink-strong, 48px above, 12px below. H3 20/28 600, 32 / 8. H4 17/28
  600, 24 / 4 (a run-in-weight label at body size). An H3 or H4 directly after a heading: 16px
  above. Ids are slugs from one scan of the text (see Build structure). `scroll-margin-top` 24px
  (64px under the compact header).
- **Clause numbers.** Every prose H2 carries a clause number (`2.4.1`, `2.4.2`, `A.1.3`), set like
  the section label: same size, weight 400, ink-faint, tabular, hanging 16px left of the text edge
  (inline before the heading where section labels are inline). A CSS counter on `.prose-root > h2`
  and the section label as a custom property (`--section-label: "2.4"`) build it, so it never
  appears in the text or in find-in-page. The number is the heading's anchor link (cue on hover).
  The outline shows the same numbers. The footnotes label `h2` is unnumbered. This is the
  numbered-clause habit of real engineering manuals, and it keeps the page from reading as a
  generic docs template.
- **Bold:** 600 ink-strong. **Italic:** Plex true italic, same color.
- **Bulleted lists:** 28px indent; the marker is an en dash `–` in ink-faint, drawn with
  `li::before` in the indent; nested lists 24px further, marker `·`; 4px between items, nested
  list 4px above.
- **Numbered lists:** `::marker` in ink-muted 600 tabular, so `1.`–`5.` align.
- **Checklists** (`ul.contains-task-list`): no dash; the disabled checkbox gets
  `appearance: none` as a 14×14 box, 1.5px ink-faint border, radius 2, hanging in the indent and
  centred on the first line. Checked: filled ink-muted, with a tick drawn by
  `li:has(> input:checked)::before` as a rotated L of 2px `--ground` borders. The text stays ink:
  these are preflight checks, not struck-out tasks.
- **Blockquotes** (pull quotes and the cast's spoken lines): 20/28 ink-strong, a 2px
  `--rule-strong` left rule, padding-left 20, 24px above and below. No italic and no added quote
  marks (the content brings its own).
- **Tables:** in a wrapper with `overflow-x: auto` (focusable, labelled), 24px above and below,
  full measure. 14/20 wdth 85, tabular figures; header 12/16 600 ink-muted with a 1px
  `--rule-strong` line under it; rows separated by 1px `--rule`; no vertical lines, no zebra;
  cell padding 8/12, with the first and last columns flush. The first column is 500 ink-strong
  (it names the row). GFM `---:` columns align right and never wrap (`150 ms` stays whole). A
  total row (first cell bold) gets a 1px ink-faint sum line above it, set as the bottom border of
  the row before, since collapsed borders favour the upper cell. **Phone:** the first column is
  `position: sticky; left: 0` on `--ground` with a 1px `--rule` right edge, so the row stays named
  while a wide table scrolls; text cells keep at least 8rem and wrap inside it, and the cut-off
  column at the right edge shows that the table scrolls.
- **Code blocks** (`CodeBlock`): `--ground-raised`, radius 2, extended `--code-bleed` (20px) into
  each gutter so the code aligns with the body text; on phone the bleed reaches the screen edges
  and the radius is 0. A 32px strip at the top: the language tag on the left (`ts`, `text`; micro
  mono ink-faint), **Copy** on the right (a `.text-button`: micro mono ink-faint, ink-strong on
  hover; `Copied` or `Couldn’t copy` for 1.5s in a polite live region; hidden with `visibility`
  while writing). Code 14/20 Plex Mono, ink, padding 8/20/16. `language-text` (the cast's prompts)
  uses `pre-wrap` so prose prompts read on a phone; other languages scroll sideways (`.scroll-x`)
  with an always-visible 8px scrollbar (rule-strong thumb, drawn with `::-webkit-scrollbar` after
  resetting the inherited `scrollbar-color` to `auto`, which Chromium requires), so a clipped line
  reads as scrollable even where the OS hides scrollbars.
- **Inline code:** Plex Mono 0.88em, `--ground-tint`, padding 1px 4px, radius 2.
- **Horizontal rule:** 1px `--rule-strong` across the measure, 40px above and below.
- **Footnote references:** `sup` at 12px, 600, cue, tabular, `line-height: 0` with a relative
  offset (no line-gap bump), underline on hover.
- **Footnotes:** 48px above, a 1px `--rule-strong` top line, 16px below it. The renderer's hidden
  `h2` is shown as a label, 12/16 600 ink-muted. Notes 14/20 ink-muted, markers ink-faint, 8px
  apart. Back-links render as `↑` instead of the renderer's `↩` (via `components.a` on
  `data-footnote-backref`, keeping the `aria-label`; the loaded font subset has U+2191 but not
  `↩`, `→` or `↗`), ink-faint, cue on hover. A targeted note or reference flashes `--cue-tint`,
  fading over 1.6s.
- **External links** (`ExternalLink` from `src/ui`, styled by `.link`): ink text, a 1px cue-deep
  underline at a 0.18em offset; cue text and underline on hover (`--dur-quick`). A trailing CSS
  corner mark (5px, top and right 1.5px borders, ink-faint) says "leaves the manual". They open in
  a new tab, with a visually hidden "(opens in a new tab)".
- **Cross-references** (`SectionLink`, styled by `.link`): to a written section, the external-link
  underline without the corner mark; to an unwritten or writing one, see Section states. On hover
  (after 300ms) or keyboard focus (at once), a **preview** opens below the link (1024px and up,
  hover devices only): `4.2 · Chapter 4` in micro mono, the title 14/20 600 ink-strong, the summary 14/20
  ink-muted, and a status line with its ring (`Not yet written — opening it starts the writing.`
  for an unwritten target). 320px wide, `--ground-raised`, a 1px `--rule-strong` border, radius 4,
  padding 12/16, no shadow, fading in over `--dur-base`.
  - Positioned with **CSS anchor positioning** (`position-area: bottom span-right`, with
    `position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline`), so it never causes
    horizontal scroll. Hidden entirely under `@supports not (anchor-name: --x)`.
  - It is a `<span role="tooltip">` (styled as a block; a `div` inside the `<p>` would be invalid
    nesting) beside the link and referenced by `aria-describedby`, so it never joins the link text
    or find-in-page. Each link gets its own `anchor-name` and `position-anchor`, built from
    `useId()`.
  - It is `display: none` until shown (fading in with `allow-discrete` and `@starting-style`):
    Chrome remembers the last successful position-try fallback while a box exists, so a preview
    first laid out below the fold would otherwise stay flipped above its link.

## Typographic detail

- All UI copy uses real punctuation: ’ “ ” – — … (`Waiting for the first words…`,
  `Not yet written — opening it starts the writing.`). The content is already typographic.
- Tabular figures: TOC, outline and pager labels, status percentages and word counts (with
  thousands separators), table cells, ordered-list markers, footnote references.
- `::selection` in `--selection` with ink-strong text.
- `text-wrap` follows the wrapping rule above.

## Build structure

The reader lives in `src/reader/`. It is built on two shared folders:

- **`src/ui/`, the design system** (documented in `src/ui/README.md`), shared with the library.
  Importing it loads the fonts (`fonts.ts`), the tokens (`tokens.css`, on `:root`), the page and
  base styles (`base.css`: the `.ui` root, selection, focus, `.visually-hidden`, `.scroll-x`, the
  `breathe` keyframes), `controls.css` (`.text-button`, `.link`, `.external-link`) and
  `markdown.css` (the shared `.markdown` prose treatment and `.reply-markdown`). Its components are
  `StatusRing`, `Sheet` (a panel with a focus trap: focus on open, Tab contained, Escape
  closes), `ExternalLink` and `ReplyMarkdown` (the library agent's replies). It knows nothing
  about manuals, sections or streaming.
- **`src/manual/`** for the manual's data, store, streaming and markdown renderer. The reader
  styles the renderer's output rather than forking it.

In `src/reader/`:

- One component per file; each one that has styles imports its own stylesheet, after its import
  from `src/ui`, so the shared styles come first in the cascade. `tokens.css` holds the reader's
  layout and component sizes (on `.reader`); `shell.css` the skip link and the column grid.
  - `index.tsx` (the route: `StartPage` or `SectionPage`) · `Shell` (the `ui reader` root, layout,
    TOC column, outline column) · `CompactBar` (compact header, and the contents sheet as a
    `Sheet` whose focus scope includes the header) · `Toc` · `StatusLegend` · `SectionPage` ·
    `ArticleHead` · `Prose` (renderer components; `prose.css` holds the reader-only markdown
    treatment and the write head) · `CodeBlock` · `SectionLink` (and its preview) · `TailLine`
    (and Follow) · `Pager` · `Outline` (the outline, "Referenced here" and "In this manual") ·
    `StartPage`.
  - Helpers: `markdownScan.ts` (headings with unique ids, source lines and clause numbers; linked
    sections; word count), `manualParts.ts` (every section in reading order, chapter names, paths
    and chapter anchors), `statusWords.ts` (the status words), `streamedThisLoad.ts`,
    `useActiveHeading.ts`, `usePrevNextKeys.ts`.
- `Shell` stays mounted while moving between sections (only the article is keyed by section id),
  so the TOC keeps its scroll position.
- Heading ids come from one scan of the text: `Prose` looks each heading's id up by its source
  line, so the outline and the page always agree, and duplicates get `-2`, `-3`.
- The contents sheet locks page scroll with CSS only (`html:has(.reader .sheet[data-open])`, below
  1024px, in `compact-bar.css`), so widening the window releases it.
- `useSection` is called only by the section page. The TOC, outline, previews and pager read
  `useManual()` and `findSection()`, so they never open a section.
- `SectionLink` and the renderer `components` are defined at module level, so focus and hover
  survive each streamed chunk.
- The control that opens the TOC at narrow widths carries `data-shot="toc-toggle"`, so
  `npm run shot` can open it. It is hidden at 1024px and up, and the script only clicks a visible
  toggle.
