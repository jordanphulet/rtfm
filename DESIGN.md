# RTFM — design

The single source of truth for RTFM's design: the landing page at `/` and the reader at
`/read/<manual>`. The first part holds what both pages share: what each must do, the craft bar,
the concept and the tokens. Then come the reader's design and the landing page's design. Where the
code and this doc disagree, one of them is a bug.

## What RTFM is

- A web app for reading hypothetical manuals. An LLM writes a manual's table of contents first,
  then each section when it is first opened.
- Two pages, both loaded lazily by `src/App.tsx`:
  - **The landing page** (`/`, `src/home/`): your library of manuals, beside a librarian agent
    you talk to.
  - **The reader** (`/read/:manualId` is a manual's start page, `/read/:manualId/:sectionId` a
    section; `src/reader/`): one manual whose table of contents already exists.
  - Every other path, bare `/read` included, redirects to `/`.
- A local API server (`server/`, described in `ARCHITECTURE.md`) does the work, with fake models
  by default or with Claude Haiku 4.5 on Amazon Bedrock:
  - the reader shows the manual named in its URL, which the server stores, writes and streams in;
  - the library lists the manuals the same server stores (`src/library/`);
  - the librarian is an agent on the server that lists, finds, opens and proposes deleting
    manuals, and starts new ones, which an LLM plans; the page shows its replies, carries out
    what it opens or proposes, and lists what it creates (`src/agent/`).
- **Failure states only where something can fail:** a section the server couldn't write has two
  (see [When a section can’t be written](#when-a-section-cant-be-written)); on the landing page,
  the library can fail to load ([The library can’t be reached](#the-library-cant-be-reached)), a
  delete can fail ([When a delete fails](#when-a-delete-fails)), and a reply can fail ([When a
  reply fails](#when-a-reply-fails)). A new manual whose plan fails its checks isn't created, and
  the librarian says so in its reply, as words, not as a failure state.
- **Dark only.**

## Data model

The API's types, defined in `server/api/types.ts` and re-exported by `src/manual/types.ts`. The
reader reads them and never changes them.

```ts
interface Manual {
  id: string;
  title: string;
  subtitle: string;
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
}
```

A section's body is not part of the manual: the reader fetches it when the section is opened.
Opening an `unwritten` section switches it to `writing`; the server writes it and streams it in,
and the section becomes `written`. If the server can't write it, the section goes back to
`unwritten` and the reader says why. The hooks and the markdown renderer that expose this are
documented in `src/manual/README.md`, and the API in `ARCHITECTURE.md`.

The landing page lists summaries of manuals (`ManualSummary`, from the same file: id, title,
subtitle and the chapter, section and written counts), documented in `src/library/README.md`.

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

## Landing page behavior

These rules are locked: any change to the landing page keeps them.

**Agent first**
- The librarian's input is the most prominent control, and it is always one click, tap or
  keystroke away. A keyboard shortcut focuses it.
- Every action can also be done directly:
  - open a manual (click it);
  - delete a manual, with confirmation;
  - start a new manual, which loads a starter prompt into the librarian's input (keeping any
    draft already there).

**The librarian**
- You type and send.
- A visible "thinking" state appears before the first words, and says what the librarian is
  doing while it works ("Searching the shelves…").
- The reply streams in as markdown.
- It acts only through the page: it can **open** a manual (the page goes to the reader) and
  **propose a delete** (the page opens its own delete confirmation for that manual). **Only your
  confirmation in that dialog deletes**; neither the librarian nor the page deletes on its own.
- It can **start a new manual** when you ask for one. While the manual is planned, the thinking
  state says so; once it is saved, the library shows it at once, and the librarian offers to open
  it.
- The conversation stays while you're on the page.
- If you've scrolled up in the conversation, a new reply never pulls you back down.

**The library**
- Each manual shows its title, subtitle and progress (*n* of *m* sections written), counted by the
  server.
- Manuals are in title order, as the server sends them.
- Deleting removes the manual on the server, so it stays gone after a reload or a restart. A
  delete that fails leaves the manual in place and says so.
- There is an empty state for when every manual is deleted.
- Opening a manual goes to the reader, at `/read/<its id>`.

It handles every state in [Landing page states](#states), at desktop and phone size.

## Both pages

These rules are locked for both pages, as are the craft requirements and the banned list below.

**Baseline quality**
- Every control works from the keyboard (in the reader, the TOC and previous/next too), with a
  visible focus state.
- Text contrast meets **WCAG AA**.
- **`prefers-reduced-motion`** is respected: every animation has a calm fallback that keeps all
  of its information.

**Desktop first, phone too**
- **Desktop is the primary experience.** It is designed at full strength: wide layouts, several
  columns and hover previews are all welcome.
- **The desktop layout is never simplified to make the phone layout easier.** The phone gets its
  own adaptation at narrow widths (a different structure, a sheet, content moved), not a shared
  lowest-common-denominator layout.
- Works from **375px to 1440px+** wide, with no horizontal page scroll.

## Craft requirements

**System**
- All colors, type sizes, spacing, radii and timings are tokens defined in **one place**
  (`src/ui/tokens.css`). Each page's own layout sizes are in its `tokens.css`.
- A modular type scale and a **4px** spacing grid.
- At most **two font families**, plus a monospace font for code.
- The background is not pure black (`#000`), and text is not pure white (`#fff`).

**Typographic detail**
- Curly quotes and apostrophes, real en and em dashes, a real ellipsis.
- Tabular (even-width) numerals wherever numbers line up, such as section labels in the TOC.
- `text-wrap: balance` on headings and `text-wrap: pretty` on body text, so no single word is left
  alone on a line. **Exception:** `pretty` can re-wrap a whole paragraph when it changes, so text
  that is streaming, or that streamed in during this page load, uses ordinary wrapping (see "The
  wrapping rule"). The librarian's replies always wrap normally.
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

How the reader stays clear of them (the landing page's own list is under "Avoiding the
generic"):

| Banned | In the reader |
| --- | --- |
| Gradients, glass, glows, neon | Flat fills only. The green is a muted indicator-lamp green, never saturated or haloed; the meter and write head are solid 1–3px lines; previews have a border, no blur, no shadow. |
| Emoji as icons | None. Every mark is a glyph IBM Plex contains (`‹ › ↑ ↓`) or is drawn in CSS (rings, chevron, corner mark, tick). |
| Rounded cards with shadows | Nothing is a card. The start page is a list; code is a tinted block with 2px corners; no shadows anywhere. |
| Pill badges | Status is a ring plus a word. The TOC's current-row tint is square; start-page and ledger row tints have 4px corners. |
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

The landing page is the same desk's **prompt corner**, where the stage manager sits beside the
rack of prompt books (see "The landing page").

## Tokens

Every color, type size, spacing step, radius and timing is a custom property in
`src/ui/tokens.css`, set on `:root` and shared by both pages. `src/ui/README.md` lists them with
how to use them; this section says why they are what they are. Each page's own layout and
component sizes are in its `tokens.css` (`src/reader/tokens.css` on `.reader`,
`src/home/tokens.css` on `.home`) and are listed under that page. No other file defines a color,
type size, spacing step, radius or timing.

### Typefaces

| Role | Font (loaded by `src/ui/fonts.ts`) | Settings | Why |
| --- | --- | --- | --- |
| Text and interface | **IBM Plex Sans Variable**, `--font-sans` | wght 400 / 500 / 600; wdth 100 for reading, **85** (`--wdth-tight`) for dense UI: the TOC, outline, tables, pager, previews and the librarian's header and lines | Engineering-manual lineage, and it has every glyph the content needs (`I²C`, `1½`, `N·m`, `‹ ›`, `↑ ↓`). wdth 85 packs dense UI about 6% tighter without a second family. |
| Code and readouts | **IBM Plex Mono**, `--font-mono` | 400 | Same superfamily, so metrics and texture match. It is the "machine voice" for status readouts, language tags, percentages and counts. |

Body italics are Plex's true italic. No `font-optical-sizing` (Plex has no opsz axis). Measured on
the sample text: Plex Sans 17px is about 7.58px per character, 16px about 7.13px.

### Type scale

Minor third (×1.2) on a 17px base; line heights on the 4px grid. Each size is a `--text-*` token
with a matching `--leading-*` token.

| Token | Size / line | Weight · width | Use |
| --- | --- | --- | --- |
| `--text-micro` | 12 / 16 | Mono 400, +0.02em; or Sans 600 | Status readouts, code language tag, table headers, outline and group labels, the ledger's column header and readouts |
| `--text-ui` | 14 / 20 | 400–600 · wdth 85 (TOC, outline, tables, previews) or 100 (footnotes, start-page summaries, ledger subtitles, cues) | TOC, outline, tables, previews, footnotes, start-page summaries, subtitles in the ledger, cues |
| `--text-reply` | 16 / 24 | 400 · wdth 100 | The librarian's replies (`ReplyMarkdown`), your messages and the field |
| `--text-body` | **17 / 28** (phone **16 / 24**) | 400 · wdth 100 | Paragraphs, lists, H4, pager titles, ledger titles |
| `--text-lead` | 20 / 28 (phone 17 / 28) | 400 | Section summary, start-page subtitle, blockquotes, the empty library's sentence |
| `--text-h3` | 20 / 28 | 600, −0.005em | H3, start-page chapter headings, the empty conversation's "Ask about your manuals", the delete confirmation's title |
| `--text-h2` | 24 / 32 | 600, −0.008em | H2, start-page "Appendices" |
| `--text-h1` | 29 / 36 | 600, −0.012em | Section title |
| `--text-title` | 35 / 40 (phone 29 / 36) | 600, −0.015em | The page's one largest title: the manual title on the start page, `Library` on the landing page |

"Phone" means below 768px. The phone body steps off the scale to 16/24 on purpose: at 375px it
keeps the measure at about 48 characters (17px would sit at the 45 limit), and a short line wants
tighter leading. `--text-reply` takes the same 16/24 at every width, for the same reason: replies
sit in narrow columns. It is the smallest size for text people read.

### Spacing

The 4px grid, `--space-1` (4px) to `--space-24` (96px); the steps are listed in
`src/ui/README.md`.

### Palette: graphite and the GO light

The booth's console: charcoal panels, off-white legends, and the cue light. A stage manager's cue
light turns green for **GO**, the moment something happens live, which is exactly this accent's
job. A muted signal green (not neon, not teal), so it reads as an indicator lamp, not a brand.

| Token | Hex | Role | Contrast on ground |
| --- | --- | --- | --- |
| `--ground` | `#121314` | Page: graphite, neutral with a faint cool lean; the librarian's field (an inset) | — |
| `--ground-side` | `#17191B` | The TOC column, the librarian's panel and dock; the tonal step *is* the divider (no border) | — |
| `--ground-raised` | `#1C1E20` | Code blocks, previews, skip link, the delete confirmation | — |
| `--ground-tint` | `#24272A` | Current TOC row, inline code, hover on buttons and start-page rows, the ready Send button | — |
| `--ground-hover` | `#1E2023` | TOC and ledger row hover (lighter than the current row, so "here" stays unique) | — |
| `--rule` | `#2B2E31` | Table row lines, outline track, compact header line, start-page chapter lines, the ledger's closing line, the composer and dock top lines | — |
| `--rule-strong` | `#3C4044` | Head rule, `hr`, table header line, pager rules, preview border, appendix dividers, the ledger's header line, the rule beside your messages | — |
| `--ink-strong` | `#EDEFEF` | Headings, `strong`, current items | 16.1:1 |
| `--ink` | `#D3D7D8` | Body text (cool off-white, no cream) | 12.8:1 |
| `--ink-muted` | `#AEB4B7` | Summaries, labels, outline, footnotes, the failed status line, written-ring fill and written ticks (1.5:1 above ink-faint, so the two meta tiers stay apart) | 8.9:1 |
| `--ink-faint` | `#8C9296` | Unwritten titles, label numerals, meta, the field's border (at least 4.7:1 on every ground, including tint) | 5.9:1 |
| `--cue` | `#5FC48A` | GO green: live/writing state, link hover, footnote references, focus ring (at least 6.9:1 on every ground, including tint) | 8.6:1 |
| `--cue-deep` | `#377D57` | Link underlines and the writing-link dash (non-text, at least 3:1 on ground) | 3.8:1 |
| `--cue-tint` | `#15261D` | A briefly highlighted target: a footnote, a ledger row, the field (ink on it 10.9:1) | — |
| `--selection` | `#22412F` | `::selection` background (ink-strong on it 9.8:1) | — |

No second accent. Hairlines are always `--rule` or `--rule-strong`.

### Radii, motion and sizes

- **Radii:** `--radius-s` 2px (code, inline code, checkboxes, focus ring, small buttons),
  `--radius-m` 4px (the TOC's `Library` link and manual title, start-page and ledger row
  highlights, previews, compact header buttons,
  the librarian's field, the cue rows, the dock's toggle, the delete confirmation). Rings are
  circles. Nothing else is rounded.
- **Durations:** `--dur-quick` 150ms (hover color), `--dur-base` 200ms (preview, sheets, outline
  rows, rows collapsing), `--dur-settle` 250ms (write-head retract, rule color, ring fill,
  progress fill), `--dur-breathe` 1600ms (the live pulse), `--dur-target` 1600ms (a target
  highlight fading), `--delay-preview` 300ms.
- **Easing:** `--ease-out` `cubic-bezier(0.2, 0.8, 0.2, 1)` for things arriving; `--ease-in-out`
  `cubic-bezier(0.4, 0, 0.2, 1)` for state changes; **linear** for the progress fill (it tracks a
  measurement, so easing would make it lurch).
- **Focus:** `--focus-ring` `2px solid var(--cue)`, `--focus-offset` 2px.
- **Shared sizes:** `--measure` **576px** (about 76 characters of 17px Plex) · `--tap` 44px (touch
  targets) · `--ring` 10px (1.5px border, so the writing dot and the solid fill centre cleanly) ·
  `--write-head-width` 3px · `--write-head-lamp` 7px · `--list-indent` 28px. The full list,
  including derived ones such as `--write-head-lamp-inset`, is in `src/ui/README.md`.
- **Reduced motion** sets `--dur-quick`, `--dur-base`, `--dur-settle` and `--delay-preview` to 0ms;
  each animation (breathe, outline rows, write head, target flash, thinking line) is switched off
  where it is defined.

### Page

`src/ui/base.css` gives `html` `background: var(--ground)`, `color-scheme: dark`,
`scrollbar-gutter: stable` (so the page growing past the viewport never shifts text sideways) and
scrollbar colors (`scrollbar-color: var(--rule-strong) transparent`). Each page's root is
`<div class="ui reader">` or `<div class="ui home">`: `.ui` sets the base type, selection and focus,
and scopes the shared styles; all of a page's own CSS is scoped under its own class.

# The reader

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
  - Left: **`Library`**, a link to `/`, 14/20 400 wdth 85 ink-muted, 44px tall with 8px side
    padding, so its text lines up with the 16px phone gutter. Hover `--ground-tint` and cue text,
    like `‹ ›`. No glyph: `‹` already means "previous" here.
  - Then, flexible: the **location button** (40px tall, `data-shot="toc-toggle"`): status ring ·
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

### Reader sizes

In `src/reader/tokens.css`, on `.reader`:

- **Layout:** `--toc-width` 272px · `--outline-width` 240px · `--start-width` 720px ·
  `--header-height` 48px · `--gutter` 64px (32px below 1024px, 16px on phone).
- **Components:** `--bar-width` 2px (current-item bars) · `--write-head-offset` 28px (12px on
  phone) · `--code-bleed` 20px (16px on phone) · `--label-col` 36px · `--label-col-wide` 48px (40px
  on phone) · `--outline-number-col` 40px (48px below 1024px) · `--status-col` 136px ·
  `--check-size` 14px · `--preview-width` 320px.

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
   - failed: hollow ring + `Not written · budget reached` or `Not written · couldn’t write this
     section` (ink-muted; see [When a section can’t be written](#when-a-section-cant-be-written))
5. **Head rule**: 1px `--rule-strong` across the measure, 16px below the status line, 32px above
   the body. While writing it doubles as the progress meter (see The write head).

The head is identical in every state, so nothing in it ever reflows.

### The TOC

- **Masthead** (padding 20/16/8): first **`Library`**, a link to `/` that takes you back to the
  library: 14/20 400 ink-muted, the same voice as the eyebrow's chapter link (each goes up a
  level), with no glyph and no underline; cue text on hover, `--dur-quick`. Its box is padding 4/8
  with the padding hung outside the text edge, like the title's, so the focus ring sits around
  the word. It adds 28px to the masthead, and the whole index still fits in 900px. The contents
  sheet leaves it out, because the compact header already has it. Then the manual title, 14/20
  600 ink-strong, linking to the manual's start page (it takes the current-row tint there); under
  it `7 of 18 sections written`, micro mono ink-faint, live; then the status legend (see Section
  states).
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
  lettered labels. A manual with no appendices has no group, label or line.

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

### Start page (`/read/<manual>`)

The annotated contents, in the same shell. A reference is entered through its index: the sidebar
(compact, no summaries) and this page (summaries and states) do different jobs.

- **Head** (capped at the measure), 64px from the top:
  - title `The Haunt That Listens`, 35/40 [29/36] ink-strong, 12px below;
  - subtitle, 20/28 [17/28] ink-muted, `text-wrap: balance`, 16px below;
  - meta, micro mono ink-faint: `5 chapters · 2 appendices · 18 sections · 7 written`, 24px below
    (singular for one: `1 appendix`);
  - **Begin at 1.1 Why a Haunt Should Listen ›**, 17/28 600 ink-strong with a 2px cue underline
    (cue text on hover).
- **Contents** (width 720), 48px below the head. Each chapter starts with a 1px `--rule` line and
  24px of space, then a heading row (20/28 600, label in the 48px label column). Section rows sit
  on a grid `48px label | title + summary | 136px status`: title 17/28 500 (ink-strong, or
  ink-muted while unwritten), summary 14/20 ink-muted, status as ring + word in micro mono (cue
  while writing). The whole row is the link: padding 8/12, hover `--ground-tint` and title to cue.
  On phone the status moves under the summary.
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

- **Pager**, 64px below the body (or the tail line, or the failure notice): two cells, `1fr 1fr`, 16px apart, each with
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

- First focusable: "Skip to text", the shared `.skip-link`, shown on focus at the top left.
- DOM order: compact header (`Library`, location, `‹ ›`) and sheet → TOC (`Library`, manual
  title, rows) → main (eyebrow links, body links, Copy, Follow or Try again, pager) → outline.
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
  - a title at 17/28 600 ink-strong (the H4 treatment), 4px above the text: `Budget reached` or
    `Couldn’t write this section`;
  - one sentence in ink saying what happened and that nothing was kept, with an inline **Try
    again** (a `.link` button: cue-deep underline, cue on hover):
    - budget: “The writing budget won’t cover this section right now, so it stays unwritten, and
      nothing was charged for it. Try again once the budget allows.”
    - error: “Something went wrong while it was being written, so none of it was kept. Try again
      to write it from the start.”
- **Text already streamed stays** where it is, 32px above the notice, because removing it would
  move the page under the reader. It keeps its plain wrapping, its footnotes stay hidden and its
  code blocks keep Copy hidden, as while writing. Footnote references in it stay links to notes
  that are hidden; that is accepted, since the notice says none of it was kept.
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
- **Screenshots:** `?fail=budget` and `?fail=error` on an unwritten section give the two states
  straight away, with no text; `npm run shot` captures them as `budget` and `error`.

## Streaming

- **At most three sections write at once** on one page: the server's limit on runs, so one page
  never overruns it (other tabs still can, which gives `couldn’t write this section`). A fourth
  section opened meanwhile waits in the waiting state (`Waiting for the first words…`) and starts
  when one of the three ends.
- Text renders with `<Markdown>` in the final layout from the first chunk. Chunks just appear,
  with no fade; the live edge is marked by the write head.
- **Nothing above the reading position moves:** the head is a fixed height; the progress fill and
  write head use `transform` only; the code blocks' Copy button keeps its space with
  `visibility: hidden` until the section is written; outline and TOC changes happen in their own
  columns; `scrollbar-gutter: stable`; growth only happens below the last block.
- **It never scrolls on its own.** The **tail line** sits just below the live block: micro mono,
  the readout `Being written · 46%` in cue, and a **Follow ↓** text button (`aria-pressed`). When
  pressed it reads `Following ↓` in cue and keeps the tail line 24px above the viewport bottom after
  each chunk (an instant scroll, never smooth). An upward wheel scroll, any touch scroll, PageUp, ↑,
  Home or a second press stops it. The tail line is removed when writing ends or fails; it is the lowest
  thing on the page, so nothing above moves.
- Screen readers: a visually hidden `aria-live="polite"` region announces only state changes
  ("Being written", "Written", or a failure), never percentages.

### The write head

The reader's signature: the change bar from a code editor's gutter, put to work on a document
being written. It answers the three questions a reader has while text arrives without the page
moving: *where is the live edge, how far has it got, is it done?* CSS only. The bar and lamp are
the shared write head (`src/ui/write-head.css`; its classes are documented in `src/ui/README.md`),
which the landing page uses for the librarian's replies too.

1. **Gutter bar.** The prose is a `.write-head`, with `data-live` while writing. Its last block,
   not counting footnotes, carries an `::after`: `--write-head-width` (3px), cue,
   `--write-head-offset` (28px; 12px on phone) left of the text edge, so it clears a code block's
   bleed, inset 4px top and bottom, so it grows with the paragraph, list or table as it fills. In
   `prose.css` the reader shifts it for a code block (which bleeds into the gutter), and gives an
   `hr` as the live block a bar 12px past its top and bottom, so the bar never collapses. Each new
   block's bar draws in with `scaleY(0→1)`, origin top, `--dur-quick`. Solid fill: no glow, no
   shadow.
2. **The lamp.** At the foot of that bar, level with the line being written, sits a
   `--write-head-lamp` (7px) square cue lamp (`::before`) that breathes like the TOC's writing
   ring. It is the cue light of the concept: the exact line where words land.
3. **The tail.** The tail line under the live block is a `.write-head-line`: it carries the same
   bar for the whole stream, and its cue readout sits beside **Follow ↓**, so bar, lamp,
   percentage and Follow read as one instrument. While waiting it has `data-live`, so the bar and
   lamp sit beside the tail line alone.
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

- The prose (`.prose`, around the prose root) carries `data-wrap="pretty"` **only if the section
  was already written when this page load first saw it**. Otherwise it gets `data-wrap="plain"`
  (ordinary wrapping) and keeps it after completion. There is no switch at the end, so finishing never re-flows anything.
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
reader's own, in `prose.css`.

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
  uses `pre-wrap` so prose prompts read on a phone; other languages scroll sideways (`.scroll-x`,
  see `src/ui/README.md`), so a clipped line reads as scrollable even where the OS hides
  scrollbars.
- **Inline code:** Plex Mono 0.88em, `--ground-tint`, padding 1px 4px, radius 2.
- **Horizontal rule:** 1px `--rule-strong` across the measure, 40px above and below.
- **Footnote references:** `sup` at 12px, 600, cue, tabular, `line-height: 0` with a relative
  offset (no line-gap bump), underline on hover.
- **Footnotes:** 48px above, a 1px `--rule-strong` top line, 16px below it. The renderer's hidden
  `h2` is shown as a label, 12/16 600 ink-muted. Notes 14/20 ink-muted, markers ink-faint, 8px
  apart. Back-links render as `↑` instead of the renderer's `↩` (via `components.a` on
  `data-footnote-backref`, keeping the `aria-label`; the loaded font subset has U+2191 but not
  `↩`, `→` or `↗`), ink-faint, cue on hover. A targeted note or reference flashes `--cue-tint`
  (the shared `target-flash`), fading over 1.6s.
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

The reader lives in `src/reader/`. It is built on `src/ui/` (the design system, documented in
`src/ui/README.md`) and `src/manual/` (the manual's store, which reads from the API, and the
markdown renderer, documented in `src/manual/README.md`). The reader styles the renderer's output rather than
forking it.

- One component per file; each one that has styles imports its own stylesheet, after its import
  from `src/ui`, so the shared styles come first in the cascade. `tokens.css` holds the reader's
  sizes (on `.reader`); `shell.css` the column grid.
  - `index.tsx` (the route: `StartPage` or `SectionPage`) · `Shell` (the `ui reader` root, skip
    link, layout, TOC column, outline column) · `CompactBar` (compact header, and the contents
    sheet as a `Sheet` whose focus scope includes the header) · `Toc` · `StatusLegend` ·
    `SectionPage` · `ArticleHead` · `Prose` (renderer components; `prose.css` holds the
    reader-only markdown treatment and its write-head adjustments) · `CodeBlock` · `SectionLink`
    (and its preview) · `TailLine` (and Follow) · `FailureNotice` · `ManualErrorBoundary` (the
    reader when the manual can't be loaded) · `Pager` · `Outline` (the outline, "Referenced
    here" and "In this manual") · `StartPage`.
  - Helpers: `markdownScan.ts` (headings with unique ids, source lines and clause numbers; linked
    sections; word count), `manualParts.ts` (every section in reading order, chapter names, paths
    and chapter anchors), `statusWords.ts` (the status and failure words), `streamedThisLoad.ts`,
    `useActiveHeading.ts`, `useManualId.ts`, `usePrevNextKeys.ts`.
- `Shell` stays mounted while moving between sections (only the article is keyed by section id),
  so the TOC keeps its scroll position. Moving to another manual remounts the whole reader (it is
  keyed by manual id), so nothing on the page carries over between manuals.
- **Every link within the manual carries the manual id** (only `Library` leaves the manual, for
  `/`), which the reader takes from the route (`useManualId.ts`): the TOC, the start page, the
  pager, the eyebrow, the compact bar, "Referenced here", the cross-references and the arrow keys. The store keeps each manual's state apart (see
  `src/manual/README.md`).
- Heading ids come from one scan of the text: `Prose` looks each heading's id up by its source
  line, so the outline and the page always agree, and duplicates get `-2`, `-3`.
- The contents sheet locks page scroll with CSS only (`html:has(.reader .sheet[data-open])`, below
  1024px, in `compact-bar.css`), so widening the window releases it.
- `useSection` is called only by the section page. The TOC, outline, previews and pager read
  `useManual(manualId)` and `findSection()`, so they never open a section.
- `SectionLink` and the renderer `components` are defined at module level, so focus and hover
  survive each streamed chunk.
- The control that opens the TOC at narrow widths carries `data-shot="toc-toggle"`, so
  `npm run shot` can open it. It is hidden at 1024px and up, and the script only clicks a visible
  toggle.

# The landing page

## Concept: the prompt corner

The library fills the page as a ledger; the librarian sits in a docked panel on the right, where
the reader keeps its outline column. Both are always in view on desktop, and they point at each
other.

In a theatre the stage manager sits in the **prompt corner**, beside the stage, with the prompt
book open, and calls every cue from there. Here the library is the rack of prompt books: a ledger
of manuals you can read at a glance, set like the reader's start page, with each manual's progress
shown as a channel strip. The librarian is the prompt corner beside it, a calm column on
`--ground-side`. The two work as one desk:

- **The shelf hands cues to the corner.** "Start a new manual" and the suggested prompts load a
  line into the librarian's input. Nothing is sent until you press Enter: *standby*, then *GO*.
  On desktop the input already has focus when the page loads, so typing is always the first move.
- **The corner points at the shelf.** When your draft or your latest message names a manual, that
  row is marked on the shelf, and the turn in the conversation carries a link that takes you to it.
- **The corner calls the cue; the shelf runs it.** When the librarian opens a manual, the page
  goes to it; when it proposes a delete, the shelf's own confirmation rises over that row; when
  it starts a new manual, the new row takes its place on the shelf. The librarian only ever adds
  to the library, and only when you ask: deleting is always the library's own control.

The named-manual link is visual only: a mark and a jump, never an action. The conversation is a
persistent log that stays beside the library for the whole visit, never a transient popup; the
library is never inside the conversation, and the conversation never holds controls that act on
the library.

## Layout

### Desktop, 1280px and up (designed at 1440 × 900)

```
| library area: 1fr                                  | panel 440 |
|   gutter 64 | ledger ≤ 960 | gutter ≥ 64             | --ground-side, sticky, 100dvh |
| 1440: ledger x 64–936 (872 wide), panel x 1000–1440                              |
| 1920: ledger 960 wide, centred in the 1480px library area (equal space each side)|
```

- **No top bar**, like the reader. The library head starts 64px from the top; the library area's
  padding is 64px on top and 48px below.
- **The page scrolls the library.** The panel is `position: sticky; top: 0; height: 100dvh`, so
  it never scrolls away. Its conversation has its own scroll (`overscroll-behavior: contain`).
- **The tonal step is the divider:** the panel is `--ground-side` on a `--ground` page, with no
  border, like the reader's TOC.

### 1024–1279px

The panel narrows to **384px** and the library gutter to **32px**. The ledger keeps its columns.

### Below 1024px, designed at 375

The panel becomes a **dock and a sheet** (see "The librarian on phone"). The library takes the
full width, with a **16px** gutter on phone and **32px** from 768 to 1023px, and its bottom padding
is the dock's height plus 24px, so the last row clears the dock. At 768–1023px the ledger keeps its
1024px columns; below 768px rows stack and the library starts 32px from the top.

### Landing page sizes

In `src/home/tokens.css`, on `.home`:

| Size | Value | Use |
| --- | --- | --- |
| `--panel-width` | 440px (384px below 1280) | The docked panel |
| `--gutter` | 64px (32px below 1280, 16px below 768) | Library side space; the dock's side padding |
| `--ledger-max` | 960px | The ledger's widest |
| `--written-col` | 136px | The progress column (the reader's `--status-col`) |
| `--action-col` | 72px | The Delete column |
| `--panel-pad` | 24px (16px below 768) | Panel side padding |
| `--panel-gutter` | 40px (28px below 768) | Panel left padding: room for the write head |
| `--write-head-offset` | 16px (12px below 768) | The write head's distance left of the reply text |
| `--tick` / `--tick-pitch` / `--tick-height` | 2px / 4px / 8px | The section strip |
| `--mark` | 2px | The "named in the conversation" mark on a row |
| `--said-rule` | 2px | The rule beside your messages |
| `--field-border` | 1px | The field's border |
| `--dock-field-pad` | `(--tap − one reply line − 2 borders) / 2` | The dock field's vertical padding, so one line fills 44px |
| `--meta-nudge` | `(body line − micro line) / 2` | Drops the ledger's readouts to sit on the title's first line |
| `--dock-height` | 112px | The phone dock's resting height: the library's bottom clearance and the rows' scroll margin |
| `--dock-max` | 720px | The dock's content width at 768–1023 |

## The library

### Head (in the library area, left-aligned)

1. **Title** `Library`, `<h1>`, `--text-title` (35/40, phone 29/36) 600 `--ink-strong`, 12px below.
2. **Meta**, `--text-micro` mono `--ink-faint`, tabular, live: `7 manuals · 7 of 117 sections
   written` (`1 manual · …`; empty: `No manuals`). 24px below.
3. **Start a new manual ›**, a `<button>` in the plain `.link` style: `--text-body` 400 `--ink`
   with the 1px `--cue-deep` underline, `--cue` on hover. Deliberately quieter than the reader's
   green "Begin" link, so it never competes with the librarian's input. Always here, in every
   state but the unreachable library, so it has one home. What it does is under "Direct
   controls".

48px below: the ledger.

### The ledger (1280px and up)

A list, not cards: the reader's start-page rows with a column header, so the shelf reads like a
console's channel list.

- **Column header** (`aria-hidden`; each cell carries its own words for screen readers):
  `--text-micro` Sans 600 `--ink-muted`, sentence case: `Manual` · `Written`. 8px below, a 1px
  `--rule-strong` line across the ledger.
- **Order:** by title, as the server sends them (`localeCompare` in English, so *The Haunt That
  Listens* sorts under T). It is the only order, so the header carries no sort arrow.
- **Row** (`<li>`), grid `1fr | --written-col | --action-col`, 24px column gap,
  padding 12px, `--radius-m`, 4px between rows; 8px of space above the first row and below the
  last, then a closing 1px `--rule` line.
  - **Manual cell:** title `--text-body` (17/28) 500 `--ink-strong`, `text-wrap: balance`; the
    title is the row's link to `/read/<its id>`, stretched over the whole row with an `::after`, so
    the row is one click target. Subtitle `--text-ui` (14/20) `--ink-muted`, `text-wrap: pretty`.
  - **Written cell:** the readout `3 of 14`, `--text-micro` mono, tabular, `--ink-muted` (`--ink-faint`
    at 0), with a visually hidden ` sections written`; 4px below, the **section strip**.
  - **Delete cell:** a `.text-button` `Delete` (`--text-ui`, wdth 85), `--ink-faint`, aligned to
    the first line of the title, pulled right by `--space-2` so its text, not its padded box, ends
  on the row's text edge.
    Accessible name `Delete The Birthday Party Field Manual`. `data-shot="delete"`. It sits above
    the stretched link (`position: relative; z-index: 1`).
- **Hover:** the row takes `--ground-hover`, the title turns `--cue` (`--dur-quick`). Hovering
  Delete gives the button its own `--ground-tint` and `--ink-strong`, and the title stays `--ink-strong`.
- **Focus:** the title link shows the focus ring around the whole row (the `::after` takes the
  outline, `--radius-m`); Delete has its own ring.

**The section strip.** One tick per section: `--tick` wide, `--tick-height` tall, `--tick-pitch`
apart; written ticks `--ink-muted`, unwritten `--rule-strong`; flat fills, square ends, drawn as
`aria-hidden` spans. Its length is the manual's size (6 sections is 22px, 31 is 122px), so you
see at a glance which manuals are big and how far each has got. It is the channel meter of the
concept: data, not decoration, and never a gradient bar. It never uses `--cue`: nothing in the
library is live.

**At 7 manuals** the head and ledger end around y = 820, inside 900: the whole shelf, no scroll.
**At 1** the ledger is one row and its closing line; nothing stretches to fill the page.

From 768 to 1279 the ledger is the same, in the narrower library area.

### The ledger on phone (below 768)

- No column header. Rows are full width (padding 12px 0 4px), separated by 1px `--rule` lines (a
  job: the rows have no hover tint to separate them on touch).
- Title `--text-body` (16/24 on phone) 500 `--ink-strong`; subtitle `--text-ui` `--ink-muted`.
- 8px below, one meta line: the section strip, `3 of 14` (`--text-micro` mono, tabular), and
  **Delete** at the right end: `--text-ui`, `--ink-faint`, a 44 × 44 hit area (`--tap`).

### Named in the conversation (the shelf mark)

- **Which manuals:** the ones named by **the draft in the input, if it isn't blank, or else the
  latest message you sent**. So typing "Delete the manual about birthday parties" marks *The
  Birthday Party Field Manual* as you type, and the mark stays after you send. A draft is matched
  against the library as it is now; a sent message is matched once, when it is sent (see the
  named-manual line).
- **The mark:** a `--mark` (2px) `--ink-strong` bar on the row's own left edge, the row's full
  height: the reader's current-item bar. The library has no "current" row, so it stays unique.
  On phone, where rows have no side padding, it sits in the gutter, 8px left of the text. A
  visually hidden ` — named in the conversation` is added to the title link. It fades in and
  out over `--dur-base`. No tint, so "hover" stays unique, and never `--cue`.
- **Matching** (`references.ts`, with a unit test on a small inline list of manuals):
  - Lower-case, split on anything that isn't a letter (so `’` and `'` both split), drop stop
    words (function words such as `the`, `one`, `through`, and request words such as `open`,
    `delete`, `manual`), and reduce each word to a base form: `-ies` → `y`, `-ed` dropped from
    words of 6+ letters, one trailing `s` dropped (not `ss`).
  - Message and title words count from 3 letters (`cat`), subtitle words from 4.
  - Title words ending in `-ing` are ignored: they name an activity (`Building a…`, `Moving
    House…`), not the topic.
  - A manual is named when the message shares **at least one title word, or at least two
    subtitle words** with it. The best match wins (most title words, then most subtitle words),
    ties included.
  - The test pins these (and their opposites):

  | Message | Named |
  | --- | --- |
  | Delete the manual about birthday parties | The Birthday Party Field Manual |
  | delete the one about parties | The Birthday Party Field Manual |
  | Open the one about haunted houses | The Haunt That Listens (title and subtitle beat Moving House’s title alone) |
  | Open The Haunt That Listens | The Haunt That Listens |
  | Open the cat one / Open the cat’s manual | Moving House Without Losing the Cat |
  | Can you translate the sourdough manual into Klingon? | Keeping a Sourdough Starter Alive |
  | Sing me a sea shanty about geese | Negotiating With Geese |
  | Let’s start a new manual about building a treehouse | nothing |
  | Which one should I read first? · Can you walk me through it? · How long will this take? · Tell me about your rescue dog · Start a manual about planning a wedding · What do I have? | nothing |

## The librarian panel (1024px and up)

`<aside aria-labelledby="librarian-title">`, a grid of three rows: header, conversation (`1fr`,
scrolls), composer.

### Header

`LibrarianHead`: one line, `--text-ui` wdth 85, padding 20px `--panel-pad` 12px `--panel-gutter`
(aligned with the conversation's text). `Librarian` (`<h2 id="librarian-title">`, 600
`--ink-strong`), a `·`, then **what the librarian is doing**, in the same words as the phone dock:
- empty: `Try asking` (`--ink-muted`);
- idle: `6 messages` (`--ink-muted`);
- thinking: `StatusRing status="writing"` + the librarian's activity in `--cue`: `Thinking…`, or
  the line of the tool it is running (see the thinking line below);
- streaming: the ring + `Replying…`.

So the corner always says what it's doing, even when the conversation is scrolled away from the
live reply. The `·` is its own flex item, so the gaps on either side are equal. No avatar, no
model name, no sparkle. Once the conversation is scrolled away from its top, a 1px `--rule` line
appears under the header (`--dur-settle`), so text never slides under it unmarked.

### Conversation

The scroll region, padding 0 `--panel-pad` 24px `--panel-gutter`, focusable (`tabIndex=0`) so
the keyboard can scroll it. Its content is capped at `--measure`. Text width at 1440 is 376px,
about 53 characters of 16px Plex (the line-length floor is 45).

- `role="log"` with `aria-live="off"` and `aria-label="Conversation"` (a log is polite by
  default, which would read every streamed chunk). A separate visually hidden polite region
  announces the activity (`Thinking`, `Searching the shelves`), then the whole reply once it's
  complete, or what went wrong.
- **Your message:** plain text (`white-space: pre-wrap`), `--text-reply` (16/24) `--ink-strong`,
  set like the reader's spoken-line blockquote: a `--said-rule` (2px) `--rule-strong` rule on its
  left, 12px padding. A visually hidden `You:` starts it.
- **The librarian's reply:** `ReplyMarkdown` with `className="reply"`, flush with the conversation's
  text edge, in `--ink`. No box, no fill, no name; a visually hidden `Librarian:` starts it. The
  difference between the speakers is typographic: your lines are quoted, the librarian's are prose.
- **Spacing:** 12px from your message to its reply; 32px from a reply to your next message.
- **The named-manual line**, 8px under your message when it names manuals, aligned with its text:
  `--text-ui` wdth 85 `--ink-faint`.
  - Which manuals a message names is decided once, when it is sent (`namedWhenSent` in
    `references.ts`), and never worked out again, so a later delete can't make the line point at
    a different manual.
  - Named manuals still in the library: `In your library:`, then each title as a `.link`-styled
    `<button>`. Activating it scrolls the row into view if it isn't (instant), focuses the row's
    title link, and flashes the row `--cue-tint`, fading over `--dur-target` (the shared
    `target-flash`). Hovering or focusing it gives the row `--ground-hover`.
  - A named manual that has since been deleted: its own line of plain text, `The Haunt That
    Listens — no longer in your library`.

### Thinking, streaming and the settle: the write head

The reader's signature, brought into the panel, so a reply arrives the same way a section does.
Both use the shared write head (`src/ui/write-head.css`), set `--write-head-offset` left of the
text edge.

- **Thinking** (`status === "thinking"`): one line, 12px under your message, exactly one reply
  line tall (24px), a `.write-head-line` with `data-live`: the cue bar with its breathing lamp,
  and beside them the activity, `--text-micro` mono `--cue`. It fades in over `--dur-base`.
  - **The activity** starts as `Thinking…`. While the librarian runs a tool, it is that tool's
    line, and stays until the next words arrive: `Checking the shelves…` (listing),
    `Searching the shelves…` (finding), `Opening the manual…`, `Preparing the delete…`,
    `Planning a manual…` (asked for a new one). The words change in place, with no motion.
  - **Planning a manual** takes about half a minute, so its line moves on as the plan does: about
    a second in, once the planned title has arrived, `Planning “Restoring a Vintage Pinball
    Machine”…`; if the first plan fails its checks, `Revising the plan…`, then `Revising “…”…`.
  - The activity is one line, here and in the header: a line too long for the panel ends in an
    ellipsis (`text-overflow`), and the live region still says it whole.
  - **Mid-reply.** When a tool runs after some of the reply has arrived, the reply settles (its
    bar retracts) and the thinking line returns under it, 12px below, with the tool's line. The
    next words continue the same reply as a new paragraph, and the bar comes back on them.
- **Streaming:** the first chunk replaces the thinking line in the same place, so the first words
  land where the lamp was. The reply is a `.write-head`, and only the last message gets
  `data-live`, so the bar sits on the reply's live block, growing with the paragraph or list as it
  fills, with the lamp at its foot, level with the line being written. Each new block's bar draws
  in. Chunks themselves just appear, with no fade or typewriter effect.
- **The settle** (streaming → idle): the bar retracts and the lamp goes out. Green leaves the
  panel.
- Replies use ordinary wrapping, never `pretty` (nothing in `ReplyMarkdown` or `.markdown` sets
  `text-wrap`), so lines already written never re-flow.

### When a reply fails

The server can fail a reply, as it can a section: **budget reached** when a spending cap would be
crossed or the kill switch is on, and **this reply failed** for anything else (the model failed or
stalled, the stream broke, or the server couldn't be reached). It is the settle without the finish,
in the reader's terms:

- The bar retracts and the lamp goes out; the header returns to the message count. No red, no
  warning glyph: the words carry it.
- In the reply's place (under any text that already arrived, 12px below it), one paragraph,
  `--text-reply` `--ink-muted`, starting with a 600 `--ink-strong` title:
  - **Budget reached.** “The librarian’s budget is used up for now, so this reply stops here. Try
    again once the budget allows.”
  - **This reply failed.** “Something went wrong while the librarian was replying. Send your
    message again to retry.”
- Text that already arrived stays, so nothing above moves. A failed exchange stays on screen but
  is never sent back to the librarian, so the next message starts clean.
- Any action the reply would have carried is dropped.
- The live region announces the reply so far, then the title and the sentence.

### Opening, proposing a delete, and a new manual

The librarian's tools hand the page an action. The page carries out an open or a proposed delete
**when the reply is done**, so you read what the librarian said first; a reply that fails carries
nothing out. While a confirmation is open, those actions do nothing.

- **A new manual:** the server has already saved it, so the page loads the library again **as
  soon as it hears**, before the reply has finished and even if the reply then fails. The new row
  appears in title order, as any row would, with no flash, scroll or focus change: you are still
  talking to the librarian, whose reply names the manual and offers to open it. The named-manual
  line under your message stays as it was when you sent it, before the manual existed.

- **Open:** the page goes to `/read/<its id>`, as clicking the row would. The conversation stays
  for when you come back.
- **Propose a delete:** the page opens [the delete confirmation](#the-delete-confirmation) for
  that manual, as the row's **Delete** would: the row scrolls into view (nearest, instant) and is
  lifted above the scrim, and focus starts on **Keep it**. The reply has already said that the
  manual stays unless you confirm.
  - **Below 1024px** the conversation sheet closes first, so the row and the confirmation are
    over the library. It closes only when the confirmation is about to open.
  - **A manual the page doesn't list** (one that reached the server after the list loaded): the
    page loads the library again, once, and opens the confirmation if the manual is there now.
    If it still isn't, nothing opens and nothing new is said: the reply already explains.
  - **Delete manual** deletes it through the same steps as the row's Delete.
  - **Focus returns to the field**, not the row, because you were talking to the librarian:
    after **Keep it**, Escape or the scrim, and after the manual is deleted.

### Scrolling: newest in view, never pulled down

- **On load** with a conversation (the URL options) the conversation starts scrolled to the bottom.
- **After you send**, it scrolls to the bottom, always (instant), so your message and the thinking
  line are in view.
- **While a reply streams**, it follows only if you were at the bottom: within 24px of it when
  the chunk arrived. If you've scrolled up, nothing moves. Growth only ever happens at the bottom.
- **How** (`useStickToBottom.ts`): a `ResizeObserver` on the conversation's content and on the
  scroll region: if the region was at the bottom before the growth, it stays at the bottom. This
  also covers the font swap and the field growing. "At the bottom" is set by scrolling (within
  24px of the end), lost only by scrolling *up* past that, so a programmatic scroll racing a new
  chunk never counts as scrolling away.
- **Newest ↓.** While you're more than 24px from the bottom, the composer's readout slot (below)
  becomes a `.text-button` `Newest ↓`, or `Replying ↓` with a breathing lamp (`.write-head-lamp`)
  while a reply is in progress (thinking or streaming). It jumps to the bottom (instant) and resumes following. It lives in a
  fixed slot, never floating over the text.

### The composer: the most prominent control

At the panel's foot, padding 12px `--panel-pad` 20px, on `--ground-side`, with a 1px `--rule` line
above it (a job: it separates a scrolling log from a fixed control).

- **Focus on load:** on `(hover: hover) and (pointer: fine)` at 1024px and up, the field takes
  focus when the page loads, so the input is the clearly dominant control and you can type at
  once. Touch devices never get a keyboard they didn't ask for.
- **The field:** a `<textarea>`, `data-shot="agent-input"`, `aria-label="Ask the librarian"`,
  placeholder `Ask the librarian…` (`--ink-faint`). It is the only text field on the page and the
  only well: `--ground` (darker than the panel, an inset), a 1px `--ink-faint` border (5.6:1
  against the panel, so its boundary meets WCAG 1.4.11's 3:1 at rest), `--radius-m`, padding
  12px 16px, `--text-reply` `--ink-strong`. Two lines tall at rest (74px), growing with its text
  to eight lines (`field-sizing: content`), then scrolling. Hover (hover devices): border
  `--ink-muted`. Focus: the standard ring (`--focus-ring` at `--focus-offset`, keeping
  `--radius-m`). It takes at most 4,000 characters (`maxLength`, the librarian's limit for one
  message).
- **Below it, 8px**, one row:
  - Left, the **readout slot**, `--text-micro` mono `--ink-faint`: `Press / to ask` while the field
    isn't focused (hover devices only; the `/` is set like inline code); `Enter sends · Shift+Enter,
    new line` while it is (`nowrap`; 35 characters, so it fits beside Send in the 384px panel);
    `Newest ↓` when scrolled up (above).
  - Right, **Send**, which shows readiness: `--text-ui` 600 wdth 85, `--radius-s`, 32px tall.
    - **Ready** (the draft has text and no reply is in progress): `--ink-strong` on
      `--ground-tint`. Hover: `--cue` text on the same fill.
    - **Not ready** (a blank draft, or a reply in progress): `aria-disabled` but still focusable,
      `--ink-faint` on no fill, with no hover. While busy, its accessible name becomes `Send
      (waiting for the reply)`.
    - So typing, or a cue loading, visibly lights Send. A flat fill, no gradient, no arrow icon.
- **Enter sends** (not during IME composition); Shift+Enter makes a new line. While a reply is in
  progress Enter does nothing and keeps your draft (`send` would ignore it anyway). After a send
  the field clears and keeps focus.

### The empty conversation: cues from the shelf

With no messages, the conversation area holds a short intro and suggestions, **bottom-aligned
against the composer**, so they read as one unit with it (and the first exchange grows from the
same place):

- `Ask about your manuals` `--text-h3` 600 `--ink-strong`; 8px; `It can list, find and open your
  manuals, start a new one, and delete one once you confirm.` `--text-ui` `--ink-muted`, `pretty`.
- 24px; `Try asking`, `--text-micro` Sans 600 `--ink-muted`; 8px; up to four **cues**, each a
  `<button>` row: `--text-ui` `--ink`, in curly quotes, padding 8px 12px pulled left by 12px so the
  text aligns, `--radius-m`, hover `--ground-hover` and `--ink-strong`. Drawn from the library
  (`cuePrompts.ts`):
  1. “Let’s start a new manual about…” (loads exactly `Let’s start a new manual about `)
  2. “What do I have?”
  3. “Open ‹the first manual’s title›”, the first row of the ledger (omitted when the library is
     empty)
  4. “How do I delete a manual?”
- **A cue loads, it doesn't send.** It replaces the draft (you chose that line), focuses the
  field with the caret at the end, and flashes the field `--cue-tint` over `--dur-target`. Enter
  is the GO. Because the text is now the draft, cue 3 marks its manual on the shelf at once.

## The librarian on phone (below 1024)

The phone can't show both, so the composer stays and the conversation folds into a sheet.

### The dock (always visible)

Fixed to the bottom, full width, `--ground-side`, 1px `--rule` line on top, padding 8px `--gutter`
plus `env(safe-area-inset-bottom)`, its content capped at `--dock-max` (at 768–1023px, aligned with
the library's gutter). Two rows, 4px apart:

1. **The conversation toggle**, a full-width button, 44px tall (`aria-expanded`,
   `aria-controls`), `--text-ui` wdth 85, `--ground-tint` on hover. Right: `Show ↑` / `Hide ↓` in
   `--ink-muted`. Left: it names the half you'd go to.
   - Sheet closed: `Librarian` (600 `--ink-strong`) and the same status as the panel header
     (`· Try asking`, `· 6 messages`, `· ◉ Thinking…`, `· ◉ Replying…`).
   - Sheet open: `Library · 7 manuals` (`No manuals`, `1 manual`), `aria-hidden`, so the button's
     accessible name is "Hide ↓" with `aria-expanded`. The live status is already in the sheet's
     own header, so it isn't said twice.
2. **The composer:** the same field and Send, side by side: the field one line tall (44px), growing
   to four lines; Send 44 × 44 to its right. No readout slot (there's no `/` on touch).

### The conversation sheet

A `Sheet` from `src/ui`, used as a disclosure (like the reader's contents sheet, not a modal),
`role="region"`, labelled by its `Librarian` heading: fixed from the top of the viewport
down to the top of the dock (the dock and sheet share one fixed grid, so the dock never moves),
`--ground-side`, the conversation scrolling inside it.

- **The library is hidden (`display: none`) while the sheet is open**, so the document is only
  as tall as the screen: nothing scrolls behind the sheet, and a full-page capture shows exactly
  the sheet. The library's scroll position is saved when the sheet opens and restored when it
  closes.
- Its `focusScope` includes the dock, so Tab moves between the conversation, the toggle and the
  composer. Escape closes it and returns focus to the toggle.
- Contents: at the top, the panel's `LibrarianHead` (padding-top 16px), with its status and its
  hairline once scrolled, so short conversations hang from a titled top instead of floating under
  empty ground. Then the same conversation as the panel (intro and cues when empty), padding 16px
  `--panel-pad` 16px `--panel-gutter`, newest at the bottom. When you've scrolled up, `Newest ↓`
  (`Replying ↓` with the lamp while a reply is in progress) appears in a slot at the sheet's foot.
- **Where focus goes when it opens** (`focusOnOpen`):
  - after a send: the dock's field, so the keyboard stays up;
  - from the toggle: the conversation's scroll region;
  - on the automatic open at load: wherever focus already is, so nothing moves and no ring
    appears.
- It **opens by itself** when you send, so your message and the thinking line are in view, and
  **on load when the conversation isn't empty** (the URL options), so the newest message is in
  view. That second case applies only to a page that loads narrow and has never been wide:
  narrowing a desktop window with a conversation shows the library, not a sheet popping open. The
  scrolling rules are the panel's.
- It rises with the `Sheet`'s fade, overridden to `translateY(8px → 0)` because it comes from
  below.
- A named-manual link closes the sheet first, then jumps to the row.

One `Conversation` component renders in the panel at 1024px and up and in the sheet below; one
`Composer` renders in the panel or the dock. A `matchMedia("(min-width: 1024px)")` hook
(`useMediaQuery.ts`) picks.

## Direct controls

| Action | Control | Result |
| --- | --- | --- |
| Open a manual | The row (its title link, stretched) | Goes to `/read/<its id>` |
| Delete a manual | The row's **Delete** | Opens the confirmation |
| Start a new manual | **Start a new manual ›** in the head | Fills the field with exactly `Let’s start a new manual about ` (caret at the end), focuses it and flashes it `--cue-tint`. **An existing draft is kept**: it only focuses and flashes the field. On phone the sheet stays closed: the field is in the dock |
| Ask the librarian | The field; `/`; the cues | As above |

Every one is a single click, tap or keystroke, at every width.

### The delete confirmation

A true modal, anchored to the row it deletes, so you see exactly what's going. The row's
**Delete** opens it, and so does the librarian when it proposes a delete ([Opening, proposing a
delete, and a new manual](#opening-proposing-a-delete-and-a-new-manual)): the same dialog, the same steps.

- **The modal:** a `Sheet` with `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` on
  its title and `aria-describedby` on its text. The page wrapper (skip link, library, and panel or
  dock) gets `inert`. A **scrim**: a fixed, full-viewport element in `--ground` at `opacity: 0.8`
  (flat, no blur), fading over `--dur-base`; clicking it keeps the manual. The row being deleted
  is lifted above the scrim (`position: relative; z-index` over the scrim's, on `--ground`), still
  inert, still lit: everything else dims around it. Page scroll is locked while it's open
  (`html:has(.home .confirm[data-open])`).
- **Placement at 768px and up:** 8px below the row, or 8px above it if it doesn't fit below; its
  right edge on the row's right edge, and its left edge placed so its text starts on the
  **Written** column's line (at least 360px wide). It is measured once on open. `--ground-raised`,
  1px `--rule-strong` border, `--radius-m`, padding 16px 20px, no shadow.
- **Stacking:** the lifted row's ancestors (`.page`, `main`, the ledger) create no stacking
  context (no transform, opacity, filter, contain or isolation), so the row's `z-index` can rise
  above the scrim's.
- **Phone placement (below 768px):** fixed to the bottom edge, full width, over the dock; a 1px
  `--rule-strong` top line, padding 20px 16px plus the safe-area inset; it rises
  (`translateY(8px → 0)`).
- **Content:**
  - `Delete “The Birthday Party Field Manual”?` `--text-h3` 600 `--ink-strong`, `balance`; 8px.
  - `It leaves your library with its 3 written sections. This can’t be undone.` `--text-ui`
    `--ink-muted` (`It leaves your library. This can’t be undone.` when none are written); 16px.
  - Buttons, right-aligned, 8px apart, in DOM and visual order: **Delete manual**, then **Keep
    it**. Delete manual: `--text-ui` 600 wdth 85, `--ink-strong` on `--ground-tint`, `--radius-s`,
    32px tall (44px and half the width each on phone); hover turns its text `--cue`. Keep it: a
    `.text-button`. No red: the words carry it.
- **Focus:** opens on **Keep it**, the safe answer, which sits on the right, under where the
  pointer just clicked Delete, so a double click never deletes. Tab stays inside. Escape, the
  scrim and Keep it all close it and **return focus to that row's Delete**.
- **After Delete manual:** the confirmation stays open while the server deletes the manual
  (`deleteManual(id)`). Its button reads `Deleting…`, and both buttons are `aria-disabled`,
  `--ink-muted` with no hover; Escape, the scrim and Keep it do nothing until the server answers.
  The request gives up after 10 seconds. A local server answers in a few milliseconds, so this is rarely seen.
- **Once it's deleted** (or the server says it was already gone, a 404): the confirmation closes,
  the row collapses (height, padding, margin and opacity to 0 with the Web Animations API, timed
  by `--dur-base` and `--ease-in-out` read from the tokens, so reduced motion makes it instant),
  then `removeFromLibrary(id)`, and the rows below close up.
  Focus moves to the next row's title link, else the previous row's, else **Start a new manual ›**.
  A polite live region says `Deleted The Birthday Party Field Manual.` The librarian says nothing:
  it didn't do it.

### When a delete fails

The server refuses a delete while a section of that manual is being written (a 409: in another
tab, or in this one, since a section keeps streaming after you leave the reader), and the delete
fails if the server doesn't answer or answers with an error. The manual is then still on the
server, so the row stays exactly where it is, still lit above the scrim, and the confirmation says
so in place, in its own style (re-measured, so it still clears the row):

- Title: `Couldn’t delete “The Birthday Party Field Manual”` (no question mark).
- Text, `--text-ui` `--ink-muted`:
  - being written: “One of its sections is being written right now, so it stays in your library.
    Try again once that section is finished.”
  - anything else (an error, no answer within 10 seconds, no server): “Your library didn’t confirm
    the delete. Try again in a moment.” The delete may still have happened; if so, Try again gets
    a 404 and the row collapses as usual.
- Buttons: **Try again** in Delete manual's place and style, then **Keep it**. Focus stays where
  it was (on the button you pressed, now Try again). Try again deletes again, through the same
  steps; Keep it, Escape and the scrim close it and return focus to the row's Delete, as before.
- The polite live region says `Couldn’t delete The Birthday Party Field Manual.` and the text.
- No red, no warning glyph: the words carry it.

## Loading the library

- **The first load suspends.** The landing page renders nothing until `GET /api/manuals` answers
  (the lazy route's `Suspense`, as in the reader), so the ledger and the cues never appear
  half-filled. A local server answers in a few milliseconds.
- **Coming back** to `/` in the same page load (from the reader, say) shows the list already
  loaded at once and fetches it again in the background, so counts written in the meantime
  appear; nothing blanks or jumps. If that fetch fails, the list already shown stays. In
  development, StrictMode's double mount makes the first visit fetch twice, which is harmless.
- **`?library=empty`** is passed on to the server, whose preview answers with no manuals.

### The library can’t be reached

If the first load fails (the server isn't running, or answers with an error), the page shows a
notice instead of a blank page, like the reader's `Couldn’t open this manual`:

- The library area as usual (same padding and position, left of where the panel would be), with
  only the `Library` title in the head: no meta line and no **Start a new manual ›**, which would
  point at a librarian that isn't there.
- In the ledger's place, framed like the empty library (a 1px `--rule-strong` line, padding 24px
  12px, the closing `--rule` line; on phone padding 20px 0): `Couldn’t open your library`
  (`--text-h3` 600 `--ink-strong`, `balance`), 4px above one sentence in `--text-lead`
  `--ink-muted`, capped at `--measure`: `Your manuals didn’t load, so there’s nothing to show yet.
  Try again.` **Try again** is a `.link` button in `--ink-strong` that reloads the page.
- No panel and no dock: the librarian talks about your manuals, and there are none to talk about.
- Like the reader's boundary, `LibraryErrorBoundary` catches any error thrown while the page
  renders, not only a failed load, and shows the same notice.

## The empty library

The page keeps its structure; the empty shelf becomes an invitation.

- Head: `Library`, meta `No manuals`, **Start a new manual ›** in its usual place.
- No column header: a sort arrow over nothing is noise. Between a 1px `--rule-strong` line and the
  closing `--rule` line, one sentence, `--text-lead` `--ink-muted`, capped at `--measure`: `Your
  library is empty. Start a new manual, or ask the librarian.`
  - Both phrases are `.link` buttons in `--ink-strong`. **Start a new manual** uses the head's
    handler; **ask the librarian** focuses the field and flashes it.
  - On phone, the same.
- No illustration, no icon, nothing centred.
- The panel's cues drop the "Open …" cue: “Let’s start a new manual about…”, “What do I have?”,
  “How do I delete a manual?”.

## The fallback reply

When you ask for something beyond the library (a sea shanty, a translation), the librarian says
so in a sentence, with what it can do instead. It is a reply like any other: prose, the same write
head, the same settle. No error color, no warning glyph, because it isn't an error; the words ("I
can’t do that, I’m afraid…") carry it. If your message named a manual ("…about geese"), the shelf
mark and the named-manual line still appear, so even an unanswered question shows what it was
about.

## Keyboard

- **`/` focuses the field** from anywhere: on desktop the panel's field, below 1024px the dock's.
  It is ignored with Ctrl, Meta or Alt, during IME composition, while typing in a field, and while
  the confirmation is open (the page behind it is inert); it calls `preventDefault` so no `/` is
  typed. The readout shows the hint while the field isn't focused.
- **First Tab stop:** the shared `.skip-link`, `Skip to the librarian`, shown on focus at the top
  left. It focuses the field. (On desktop with a mouse the field already has focus on load.)
- **DOM order:** skip link → library head (Start a new manual) → ledger (each row: title link,
  Delete) → panel (conversation: named-manual links and cues; then the field, then Send). On
  phone: library → dock (toggle, field, Send); while the sheet is open, the library is hidden and
  Tab moves through the sheet's conversation and the dock.
- Enter sends, Shift+Enter is a new line. Escape closes the phone sheet (focus returns to its
  toggle) or the confirmation (focus returns to that row's Delete).
- Focus ring everywhere: `--focus-ring` at `--focus-offset`, with the control's own radius; the
  conversation uses the negative offset, where its scroll would clip the ring.

## Motion

| What | Motion | Reduced motion |
| --- | --- | --- |
| Hover colors (under `(hover: hover)`, or undone under `(hover: none)` for the shared link and text-button hovers, so nothing sticks after a tap on touch) | `--dur-quick` `--ease-out` | Instant (token) |
| Thinking line appearing | Fade in, `--dur-base` | Appears |
| Lamp | `breathe`, `--dur-breathe` | Steady lamp |
| Write-head bar | Draws in, `--dur-quick`; retracts on settle, `--dur-settle` | Present while streaming, gone when done |
| Shelf mark | Fade, `--dur-base` | Appears and disappears |
| Row flash (named-manual jump), field flash (cue loaded) | `target-flash`: `--cue-tint` fading over `--dur-target` | A static `--cue-tint` until focus leaves the row or field |
| Phone sheet, phone confirmation | Fade and 8px rise, `--dur-base` `--ease-out` | Appear (token) |
| Desktop confirmation | `Sheet` fade and 8px drop, `--dur-base` `--ease-out` | Appears (token) |
| Scrim | Fade, `--dur-base` | Appears |
| Deleted row | Collapse, `--dur-base` `--ease-in-out` | Removed at once |
| Panel header line | Fades in, `--dur-settle` | Appears |
| Scroll jumps (Newest ↓, after send, named-manual jump) | Always instant, as in the reader | Same |

Nothing moves on first load. Under `prefers-reduced-motion: reduce` every animation above is
switched off where it is defined; all the information stays.

## States

Each state is set up by a URL option (`src/library/README.md`, `src/agent/README.md`), a few
clicks, or (for the failures and `created`) the shot script answering or rewriting the page's
API requests itself, and
`npm run shot` captures it at both sizes. The library is the seven seed manuals as a fresh server
serves them: *The Haunt That Listens* 7 of 18 written, the others 0. Every reply is the server's
scripted fake model's, so the shots cost nothing and never change between runs.

| State | 1440 × 900 | 375 × 812 |
| --- | --- | --- |
| `first-visit` | Full ledger (7 rows, in title order); panel with the intro and four cues above the field, which has focus | Head and rows; dock reading `Librarian · Try asking` |
| `typing` | Draft in the field (focus ring, hint `Enter sends…`); the Birthday Party row marked | Draft in the dock's field; the Birthday Party row marked |
| `thinking` | Your treehouse line, then the thinking lamp, at the bottom of the panel | Sheet open (conversation loaded), same, above the dock; the sheet's header reads `Thinking…`, the toggle `Library · 7 manuals` |
| `working` | The same, with the planner's line: `Planning “Building a Treehouse”…` in the thinking line and the header | The same in the sheet |
| `streaming` | The reply about the new treehouse manual half-written, bar and lamp on the live paragraph | The same in the sheet; its header reads `Replying…` |
| `created` | The same reply settled (“*Building a Treehouse* is on your shelf… Shall I open it?”); the library has loaded again, with the new *Building a Treehouse* row in title order (8 manuals) | Sheet open on the reply |
| `conversation` | Three exchanges (the list of manuals, “Opening *The Haunt That Listens*.”, the fallback), scrolled to the newest; the Sourdough row marked; named-manual lines under turns 2 and 3 | Sheet open at the newest |
| `delete-confirm` | First row lit above the scrim, confirmation anchored under it on the Written column, focus on Keep it | Confirmation at the bottom edge, first row lit |
| `fallback` | Your geese line, the fallback reply settled; the Geese row marked | Sheet open on the reply |
| `proposed-delete` | You asked to delete the birthday party manual: the reply settled (“It stays unless you confirm…”), the Birthday Party row lit above the scrim, the confirmation above it | Sheet closed; the row lit, the confirmation at the bottom edge |
| `reply-budget` | Your list line, then **Budget reached.** and its sentence; header `2 messages` | Sheet open on the same |
| `reply-failed` | The same with **This reply failed.** | The same |
| `empty` | Head, the empty line; three cues | Head and the empty line; dock |
| `library-unreachable` | `GET /api/manuals` fails: the `Library` title and the notice in the ledger's place; no panel | The same; no dock |
| `delete-failed` | The delete answered 409: first row lit, the confirmation reading `Couldn’t delete …` with Try again and Keep it | The same at the bottom edge |

Hooks: `agent-input` on the field (one is visible at every width), `delete` on each Delete,
`confirm-delete` on the confirmation's Delete manual.

## Avoiding the generic

| Chat cliché | Here instead |
| --- | --- |
| Speech bubbles, left/right alignment | One left edge. Your lines are quoted with a 2px rule, like a spoken line in the manual; the librarian's are plain prose |
| Avatars, names, a "bot" icon | None. A visually hidden `You:` / `Librarian:` for screen readers |
| Typing dots, blinking cursor | The reader's write head: a cue bar and lamp beside the live block, and a settle |
| Gradient or glowing send button, paper-plane icon | A flat `Send` word on `--ground-tint` |
| Sparkle "AI" mark, purple accent | No glyph at all; the only color is the GO green, live or actionable |
| Suggestion chips (pills) | A short list of quoted lines, set as rows; they load the field, they don't fire |
| Floating "scroll to bottom" bubble | `Newest ↓` in a fixed slot under the field |
| Card grid of manuals with cover art | A ledger with a column header and tabular readouts, like a channel list |
| Gradient progress bar | The section strip: one flat tick per section |
| Red destructive button, centred dialog | The words carry it; the confirmation is anchored to the row, which stays lit |
| Empty state with an illustration | The ledger with no rows and one plain sentence |

## Build structure

The landing page lives in `src/home/`. It is built only on `src/ui/`, `src/library/` (the manuals:
`useLibrary()`, `refreshLibrary()`, `deleteManual()`, `removeFromLibrary()`) and `src/agent/` (the
librarian: `useAgent()`, `useAgentActions()`, `LIBRARIAN_LIMITS`).

- `index.tsx`: `Home` wraps `HomePage` in `LibraryErrorBoundary` (its own file, styled by
  `library-error.css`), which shows the unreachable notice. `HomePage` is the `ui home` root. It
  owns what the library and the librarian share (the draft, the named manuals, the hovered row,
  the jump, the delete flow and focus return) and the two live regions. `page.css` holds the
  two-column page, the narrow-width padding and the touch overrides for shared hovers;
  `tokens.css` the sizes above.
- One component per file, each importing its own stylesheet: `LibraryHead`, `Ledger`, `LedgerRow`
  (styled by `ledger.css`), `SectionStrip`, `DeleteConfirmation` (with the scrim),
  `LibrarianPanel` (desktop), `PhoneAgent` (the dock and the conversation sheet),
  `LibrarianHead` (with `StatusDetail`, which the dock's toggle uses too), `NewestButton`,
  `Conversation` (the log, the cues when empty, and the thinking line), `Turn` (one message, the
  named-manual line under yours, and a failed reply's note), `Cues`, `Composer`.
- Page actions: `HomePage` carries them out (`act`: load the library again, navigate, or open the
  confirmation);
  `LibrarianPanel` and `PhoneAgent` receive them with `useAgentActions`, and `PhoneAgent` closes
  its sheet before a proposed delete.
- Helpers: `references.ts` (the matcher and `namedWhenSent`), `cuePrompts.ts` (the cues and the
  starter prompt), `replyFailure.ts` (a failed reply's words), `agentSide.ts` (the props the panel
  and the phone dock share), `motion.ts`
  (the target flash and the row collapse), `useStickToBottom.ts`, `useFocusShortcut.ts`,
  `useMediaQuery.ts`.
- Tests: `references.test.ts` (the matcher), `Turn.test.tsx` (the named-manual line after a
  delete, and a failed reply's note) and `DeleteConfirmation.test.tsx` (its words in each stage).
