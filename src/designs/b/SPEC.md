# B — The Book · Design spec

## Concept

**A rubricated book read by lamplight in the workshop after closing.** Warm umber-black paper,
parchment-coloured ink, and one second colour, vermilion: the *rubric* that printers have used
for two thousand years to mark what matters: numbers, headings, notes, the place you stopped.
The manual's own voice suits it. It is a showman's book about steel, fire code and fear, and its
most important prop is a red mushroom button. ("Write that on the wall of your shop. I did. In
red.") Everything is set in **one serif family** the way a real book is, in printers'
conventions: indented paragraphs, a drop cap, headings hung in the margin, notes beside the text,
a contents page with dot leaders, a ribbon bookmark, and back matter set tighter than the body.
The only interface is what a book already has: running heads, a fore-edge index, a contents page
and a turn of the page. While a section is written, you see the **ink go down** in the margin;
when it's done, the ink dries and a tailpiece is drawn. Dark because it is night, not because a
light theme was inverted: the ground is brown, the ink is warm, and nothing is pure.

**How B differs from the others:** A is sans-serif, three fixed columns, compact. C has almost
no interface, a drawer and WebGL atmosphere. B is entirely serif, has visible book furniture,
puts notes in a wide margin, and draws its details in SVG.

---

## Borrowed from the references

| Image | Traits taken | Where they show up in B |
| --- | --- | --- |
| `practical-typography-desktop` | Left margin column holding a **right-aligned heading under a heavy rule**; italic summary under the title; **grey margin notes level with the paragraph they gloss**; caps labels; a **ruled table with caps column heads** | H2s hang in the left margin, right-aligned under a rule; hung section labels; sepia margin notes; table style |
| `stripe-press-home-desktop` | **Tick-mark index down the left edge instead of a menu**; warm near-black ground; tiny serif wordmark with an italic tagline | The **fore-edge index** (one tick per section, showing its state); umber ground; running head |
| `stripe-press-book-desktop` | Serif title over an **italic byline**; ragged-right serif body at a comfortable measure; **joined, square, ruled buttons** with an arrow cell | Title page; ragged body; prev/next as two joined ruled cells |
| `gwern-design-desktop` | Italic description plus a **metadata line with a status word** ("finished"); nested numbered contents with **muted numbers and bright titles**; hyphenated body; monochrome | Status line under each section summary; contents label/title contrast; `hyphens: auto` |
| `gwern-design-footnote-popup-desktop` | **Framed popup beside the link**, square, with no shadow; **right-aligned caps heading over a full-width rule** | Cross-reference preview slips; appendix H2 style |
| `tufte-css-desktop` | **A wide right margin kept for notes**; large title with an italic byline; serif at a narrow measure on a near-black ground | The 256px notes column; title page |
| `tufte-css-sidenotes-desktop` | **Numbered sidenotes level with their reference**; italic section headings | Footnotes as sidenotes; italic H3s |
| `tufte-css-figures-desktop` | **Figures that break the text column** while the margin serves the text | Tables and code blocks widen into the right margin ("wide blocks") |

Deliberately *not* taken: Gwern's justified text (justified lines would re-space while
streaming), Gwern's boxes around the TOC and abstract (too many borders), Stripe Press's WebGL
(B's medium is SVG).

---

## Avoiding the generic

| Banned / cliché | What B does instead |
| --- | --- |
| Gradients, glass, glows, neon | Flat colours only. Dot leaders and ornaments are SVG, not `*-gradient()`. The scrim is a flat colour. "Writing" is shown by a line being drawn, never a glow or a pulse. |
| Emoji as icons | Every glyph is a drawn SVG. The footnote backref `↩` (outside Newsreader's Latin subset, and drawn as an emoji on iOS) is replaced through `components.a`. |
| Rounded cards with shadows | `--radius: 0` everywhere (paper has square corners). No `box-shadow` anywhere. |
| Pill badges | States are shown by drawn leaf glyphs and type style (roman, italic, rubric), never pills. |
| Inter on slate-900 | No sans-serif at all, even in the interface. Newsreader on warm umber. |
| Purple/blue "AI" accents | Umber, parchment and vermilion. No blue anywhere, links included. |
| A border on every element | Rules only where a printed book has them: table rules, the H2 rule, a sheet edge, a preview frame. Code sits on a tinted plate, with no border. |
| Centring everything | Everything aligns to the text column, and labels hang right-aligned into the gutter. Only two things are centred, both by book convention: the section-break asterism and the tailpiece. |
| Giant hero heading | The title page's 61px title is followed straight away by the contents, which starts above the fold. |
| Decorative icons | Every drawn glyph has one meaning, listed in [Drawn details](#drawn-details-svg). |
| The usual LLM-made look | No sparkles, no chat bubbles, no blinking cursor, no "AI is thinking" shimmer. Writing looks like a pen working in a margin. |

---

## Typefaces

Measured in the browser at 20px: Newsreader averages **8.0px per character** (Literata 9.4,
Source Serif 4 8.9, EB Garamond 7.6).

| Role | Family (module → CSS name) | Use | Why |
| --- | --- | --- | --- |
| Everything | **Newsreader** (`shared/fonts/newsreader` → `"Newsreader Variable"`), wght 200–800, **opsz 6–72**, roman and italic | Body, headings, labels, interface | One family, as a book is set. Its optical-size axis acts as both a text face (sturdy at 16–20px) and a display face (fine hairlines at opsz 72), so a second display family isn't needed. Warm and literary. |
| Code | **IBM Plex Mono** (`shared/fonts/ibm-plex-mono` → `"IBM Plex Mono"`), 400 and italic | Code blocks and inline code | Its slab serifs and typewriter shapes sit beside a serif body like a manual's typescript. JetBrains Mono looked heavy and technical next to Newsreader. |

**Settings**
- `font-optical-sizing: auto` everywhere, except **display** sizes (≥39px: title, section title,
  hung numerals, drop cap), which pin `font-variation-settings: "opsz" 72` for the finest hairlines.
- Weights: text **380** (light text on a dark ground looks heavier, so 400 is trimmed slightly),
  bold **600** (700 looks blotchy in reverse), heads **500**, display **340**, hung numerals **300**.
- `font-kerning: normal`, `font-variant-ligatures: common-ligatures`.
- **Numerals:** Newsreader has `tnum` but no `onum`. `tabular-nums` applies to every label,
  contents number, fore-edge number, table, progress percentage and note number. Running text
  keeps proportional figures.
- **No real small caps:** I checked the shipped files, and none of the fonts' GSUB tables include
  `smcp` or `c2sc`. So B **never uses `font-variant-caps`** (synthesised small caps look thin and
  wrong). It uses a **caps label** instead: uppercase, 13px, `letter-spacing: 0.08em`, weight 500.
- **Glyphs outside the Latin subset** (`↗ ↩ → ❦`) are never typed. They are drawn in SVG. `§ · – — … ½ ²`
  are in the subset and are used in the text.
- `hyphens: auto` with `lang="en"` on body text. Ragged right, never justified.
- Curly quotes, en/em dashes and `…` in all interface copy. The manual text already uses them.

## Type scale

Ratio **1.25** (major third) from a **20px** base. Every line-height is a multiple of 4.

| Token | Size / line | Weight · style | Used for |
| --- | --- | --- | --- |
| `--text-caps` | 13 / 16 | 500, uppercase, +0.08em | Kept rare: table heads, H4, "Contents" / "Previous" / "Next", the contents and back-matter heads |
| `--text-note` | 16 / 24 | 380 *italic* | Running heads, status line, chapter lines (italic instead of tracked capitals) |
| `--text-small` | 16 / 24 | 380 | Margin notes, tables, contents summaries, previews, prev/next |
| `--text-body` | 20 / 32 (phone **18 / 28**) | 380 | Body text |
| `--text-body-back` | 18 / 28 | 380 | Appendix body text (back matter is set smaller) |
| `--text-head` | 25 / 32 | 500 (H2), 400 italic (H3) | H2, H3, contents chapter titles |
| `--text-quote` | 25 / 36 | 350 italic | Blockquotes |
| `--text-title-s` | 31 / 36 | 340, opsz 72 | Section title on phone |
| `--text-numeral` | 39 / 48 | 300, opsz 72 | Hung chapter numerals in the contents; title on phone |
| `--text-title` | 49 / 56 | 340, opsz 72, −0.01em | Section title on desktop, hung section label |
| `--text-display` | 61 / 64 | 300, opsz 72, −0.015em | The manual's title on the title page |
| `--text-code` | 14 / 24 | Plex Mono 400 | Code blocks. Inline code is 0.85em of its context. |

Line length: desktop **576px ≈ 72 characters**; 1024 tier **544px ≈ 68**; phone at 375px, 18px
on 343px **≈ 47**; appendix 18px on 576px **≈ 80**. All within 45–90.

## Spacing scale

4px base: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32 · `-7` 48 · `-8` 64 ·
`-9` 96 · `-10` 128. Paragraphs have **no gap** between them (book indents). Block elements
(lists, tables, code, quotes) get `--space-4` above and below, half a line, which keeps the
32px rhythm. H2s get `--space-7` above. Chapters in the contents are `--space-7` apart.

## Palette

Every text pair passes WCAG AA. Ratios are against `--ground`, then `--raised`. On
`--ground-back` they are ink 13.1, soft 7.4, faint 4.7 and rubric 5.3.

| Token | Hex | Role | Contrast |
| --- | --- | --- | --- |
| `--ground` | `#16120E` | The page: umber-black, like lamp-black on brown stock | — |
| `--ground-back` | `#1C1712` | Back matter (appendix pages): a slightly lighter "endpaper" stock | — |
| `--raised` | `#1D1813` | Code plate, contents sheet, preview slips, hover fill | — |
| `--ink` | `#E6DCC6` | Body text and titles: parchment, never `#fff` | 13.7 / 12.9 |
| `--ink-soft` | `#B3A68E` | Sepia: summaries, margin notes, labels, table heads | 7.8 / 7.4 |
| `--ink-faint` | `#8F826D` | Pencil: running heads, unwritten entries, `§` labels, unwritten glyph outlines | 4.95 / 4.68 |
| `--rubric` | `#E0674B` | Vermilion: section numbers, note marks, drop cap, ribbon, the writing state, focus ring, link underlines | 5.5 / 5.2 |
| `--rubric-wet` | `#7A3A2B` | The wet-ink margin rule (decorative only, never text) | 2.2 |
| `--rule` | `#3A3128` | Hairlines: table inner rules, sheet edge | decorative |
| `--rule-strong` | `#5C4F40` | Table top/bottom rules, H2 rule, preview frame | decorative |
| `--selection` | `#4A2219` | `::selection` background (text stays `--ink`, 10:1) | — |
| `--scrim` | `rgb(12 10 8 / 0.72)` | Flat dimming behind the contents sheet | — |

Why: two-colour printing gives a clear, restrained hierarchy. Red is for *structure and state*,
never for decoration, and it doubles as the manual's own safety-button red.

## Tokens and timing

All of the above live in one file, `src/designs/b/styles/tokens.css`, as custom properties, together
with `--line-snug` (28px, for 20px text in tight places), `--wght-initial` (400, the drop cap),
`--wght-quote` (350), `--preview-width` (360px), `--entry-label` (the contents label column, 48px;
36px on phone and in the back matter; 40px in the sheet), the SVG masks for dot leaders and the
checklist tick (coloured by `background-color`, so no palette hex is repeated), and:

| Token | Value | Use |
| --- | --- | --- |
| `--radius` | `0` | Everything |
| `--dur-quick` | 150ms | Hover colour and underline changes |
| `--dur-base` | 200ms | Preview slips, nib lifting, note highlight |
| `--dur-sheet` | 250ms | Contents sheet slide and scrim |
| `--dur-rule` | 600ms | Head rule drawn while waiting; the ink drying |
| `--dur-draw` | 900ms | Tailpiece drawn on completion (the signature, so longer than UI transitions) |
| `--dur-quill` | 1600ms | Loop for the "being written" leaf glyph and fore-edge tick |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Things arriving |
| `--ease-in-out` | `cubic-bezier(0.45, 0, 0.2, 1)` | Strokes being drawn |
| `--delay-preview` | 300ms | Hover delay before a cross-reference preview appears (an `animation-delay`; none on focus) |

---

## Layout

### Breakpoints

| Tier | Width | Structure |
| --- | --- | --- |
| **Folio** | ≥ 1280 | Fore-edge · left margin · text · notes margin (full strength) |
| **Quarto** | 1024–1279 | Same, with a narrower left margin. H2s move into the text column. |
| **Octavo** | 768–1023 | No fore-edge; folio bar instead. A single 576px column, footnotes become endnotes. |
| **Pocket** | < 768 | Phone. See below. |

### Desktop, 1440 (Folio): the section page

```
 0    64        168          408   456             1032  1080          1336      1440
 ┌────┬─────────┬────────────┬─────┬────────────────┬─────┬─────────────┬─────────┐
 │fore│         │ left margin│ gap │  text (576)    │ gap │ notes (256) │         │
 │edge│ (auto)  │  (240)     │ 48  │                │ 48  │             │ (auto)  │
 └────┴─────────┴────────────┴─────┴────────────────┴─────┴─────────────┴─────────┘
```

- **Fore-edge index** (fixed, 64px, full height). See [Navigation](#navigation).
- **Page grid** `240 | 48 | 576 | 48 | 256` (1168px), centred in the space to the right of the
  fore-edge. Asymmetric like a recto page: a narrower inner margin, a wider outer margin for notes.
- **Running head** (top 40px, scrolls with the page, italic `--text-note`): over the text
  column, the chapter line *Chapter 2 · Performers Without a Pulse* (`--ink-soft`); right-aligned
  at the notes column's edge, *The Haunt That Listens* (`--ink-faint`, a link to the title page).
  For appendices: *Appendix A · Parts and Sensor Reference*.
- **Opener**, starting 72px below the running head:
  - The **section label** `2.4` hangs in the left margin, right-aligned, `--text-title` 300
    weight, rubric, tabular, on the title's first baseline (Butterick's hung title).
  - **Title** (H1) in the text column, `--text-title`, `text-wrap: balance`.
  - **Summary** below in italic `--text-body`, `--ink-soft`: the section's "argument", as in a
    Victorian chapter head.
  - **Status line** (italic `--text-note`, `--ink-faint`) with a leaf glyph, like Gwern's
    metadata line: *Written · about 520 words* or *Being written · 42%*. It has a fixed height and
    `min-width` tabular figures, so updates never shift anything.
  - **Head rule**: a 6px rubric lozenge plus a 96px `--rule-strong` hairline, `--space-5` above
    and `--space-6` below.
- **Body**: `.prose` in the text column, `display: flow-root; position: relative`.
- **Wide blocks** (tables, code blocks) are **880px** wide (text + gap + notes) and run into the
  notes margin, like Tufte's full-width figures. Margin notes are laid out to clear them.
- **Tailpiece**, then **turn the page** (prev/next) at the end, then 128px of bottom margin.

### Quarto (1024–1279)
Fore-edge 56 · grid `128 | 40 | 544 | 40 | 200`. The left margin holds only the hung label.
**H2s move into the text column** (with their rule above). Wide blocks are 784px.

### Octavo (768–1023)
No fore-edge. The **folio bar** appears (as on phone). One 576px column (20/32, ≈72 characters)
between 64px gutters, centred. The opener uses the phone structure (label on its own line above the
title) at desktop sizes. Footnotes are **endnotes** (as on phone). Wide blocks stay at the
column width and scroll inside themselves.

### Phone (Pocket, < 768; designed at 375)
A different structure, not a squeezed desktop:
- **16px side gutters**, body **18/28** (≈47 characters). Pocket editions have narrow margins.
- **Running head** at the top: only the chapter line, in italic (scrolls away).
- **Opener:** the label `2.4` on its own line (rubric, `--text-body`, tabular), the title at
  `--text-title-s`, the summary in italic 18/28, the status line, then the head rule.
- **H2s are in the column** at 20/28 (the phone `--text-head`), weight 500, with the rule above spanning the measure and
  40px of space above it.
- **Footnotes are endnotes**: the renderer's own jump links and back-links (see Footnotes).
- **Wide blocks are full-bleed** (negative 16px margins), with code and tables scrolling sideways
  *inside* their own box (`overflow-x: auto`, `tabindex="0"`, labelled region). The page itself
  never scrolls sideways.
- **Folio bar** (fixed at the bottom, 48px + `env(safe-area-inset-bottom)`, `--ground`, 1px
  `--rule` top): on the left, the **Contents** button (`data-shot="toc-toggle"`); on the right,
  the current label `2.4` and its leaf glyph (animated while writing). Thumb-reachable and always
  one tap away. A book's folio lives at the foot of the page. The page reserves the bar's height plus 128px at
  the bottom so the bar never covers the last line.
- The nib (signature) sits in the gutter at 3px from the edge, scaled to 8×12. The wet rule is
  left out: there is no room for it.
- Prev/next cells are stacked and full width.

---

## Navigation

### The starting page `/b`: title page and contents in one

A reader of a manual comes to choose a section, so the front matter is compressed into one page
and the contents begins above the fold.

**Desktop (1440):** in the text column, from the top:
1. Italic line *A manual in five chapters and two appendices* (`--ink-faint`, computed from data).
2. **Title** `The Haunt That Listens`, `--text-display`, balanced.
3. **Subtitle** in italic, `--text-head` 25/36, `--ink-soft`, at most about 2 lines.
4. An italic meta line: *7 of 18 sections written · Begin at 1.1 →* (the last part is a link,
   and the arrow is drawn).
5. The **head rule** (the same lozenge and hairline as every section opener).
6. Caps `CONTENTS`, then the **contents** (below).

In the **right margin**, level with `CONTENTS`, a **key** as a margin note: the three leaf glyphs
with *written*, *being written*, *not yet written*, and "Opening a section that isn't written yet
starts the writing."

**Contents entries (chapters):**
- **Chapter numeral** hangs in the left margin: `--text-numeral`, rubric, right-aligned.
  **Chapter title** in the text column at `--text-head` 500.
- Each **section** is one row: label (48px column, tabular, `--ink-soft`) · title
  (`--text-body`) · **dot leaders** (SVG dots, 1.5px every 8px, `--rule-strong`, filling the
  space) · **leaf glyph** where a printed book puts the page number. Under the title, the
  **summary** in italic `--text-small` `--ink-soft`, indented to the title.
- Entries are `--space-4` apart, chapters `--space-7`.
- **Hover:** the title gets a 1px rubric underline (offset 4px), and the leaders go from
  `--rule-strong` to `--ink-faint` (`--dur-quick`). **Focus:** rubric outline around the whole
  row.

**Back matter (appendices), set apart like the back of a book:** after the last chapter, the
asterism ornament, then caps `BACK MATTER`. The two appendices are set **side by side in two
columns** across text and notes (880px → 2 × 416, gap 48). Each has an *italic* rubric letter
(`A`) at `--text-head` and a title at 20/28 weight 500. Entries are denser: `--text-small` for
titles and summaries, entries 8px apart. Tighter, smaller and in columns, the way an index or a
parts list is set at the back of a printed book.

**Phone:** the same order. Title at `--text-numeral` (39/48), subtitle in italic 18/28, the key
as a compact three-item line under the meta line. Chapter numerals sit inline before the chapter
title (rubric). Entries drop to `--text-small` and keep short leaders; the leaf glyph stays right-aligned. Back matter is one
column. No folio bar on `/b`, because this page *is* the contents.

### State in the contents (and everywhere else a section is listed)

| State | Leaf glyph (12×16) | Title | Label | Screen reader |
| --- | --- | --- | --- | --- |
| **written** | Page outline with three text lines, `--ink-soft`: *a printed page* | Roman, `--ink` | `--ink-soft` | — |
| **writing** | Outline and lines in **rubric**. The lines draw themselves one after another on a `--dur-quill` loop. The resting frame shows 2 of 3 lines. | Roman, `--ink` | **Rubric** | "being written" |
| **unwritten** | Empty page outline, `--ink-faint` (≥3:1): *a blank leaf* | *Italic*, `--ink-faint` | `--ink-faint` | "not yet written" |

Three signals per state (glyph, colour, roman/italic), so none relies on colour alone. The
resting frame of the writing loop is the base style, so Playwright's `animations: "disabled"`
and reduced motion both show a meaningful "being written" glyph.

### "You are here": the ribbon

A drawn **bookmark ribbon** (10×28, rubric, swallow-tail end) hangs from the top of the current
entry, just left of its label, like a real ribbon laid across the contents page. The current
title is weight 600, and the row has `aria-current="page"`. In the fore-edge, the current tick
*is* a short ribbon. On `/b` the ribbon marks the **last section opened in this visit**
(in-memory), so returning to the contents shows where you were.

### Fore-edge index (desktop and quarto): the contents as a diagram

A fixed strip at the left edge, like a book's thumb index (Stripe Press's tick index):
- At the top, a **"Contents" button**: the word in caps set vertically (`writing-mode:
  vertical-rl`, rotated to read bottom-to-top like a spine), `--ink-soft`. It has
  `data-shot="toc-toggle"` and opens the **contents sheet**.
- Below it, **one tick per section** at a 24px pitch (each tick is a 64×24 hit target, shrinking
  to a 16px pitch on short viewports), with a 16px gap between chapters and a 32px gap before
  the back matter. The appendix ticks sit on a `--raised` band, a thumb-index tab for the back
  of the book.
- Tick by state: **written** 20×2px `--ink-soft`; **writing** 20×2px rubric, drawn left-to-right
  on the quill loop (resting frame: full); **unwritten** 10×1px `--ink-faint`; **current**: a
  24×6px rubric ribbon with a notched end.
- **Hover or focus on a tick** opens a label slip to its right (`--raised`, 1px `--rule-strong`
  frame): `2.4  The Half-Second Problem` plus the leaf glyph and state word. Clicking goes there.
- It is a `nav` with `aria-label="Sections"` and **roving tabindex**: one tab stop, ↑/↓ move
  between ticks, Home/End jump to the ends, Enter opens.

Why: the whole book's state and your place in it are visible at a glance, it's one click to any
section, and it takes 64px instead of a sidebar.

### Contents sheet (all section pages, every width)

- Opened by the fore-edge "Contents" button (desktop) or the folio bar button (phone/octavo).
- **Desktop:** a 560px sheet slides in from the left over the fore-edge (`translateX(-100%) → 0`,
  `--dur-sheet`, `--ease-out`). Background `--raised`, one 1px `--rule` right edge (paper laid on
  paper), and a flat `--scrim` over the page.
  **Phone:** full screen.
- Content: caps `CONTENTS` with a text "Close" button (with an `Esc` hint on desktop), then the
  same entries as `/b` **without summaries** (the sheet is for jumping; the page is for
  choosing), with the ribbon, leaders and leaf glyphs.
- When it opens, it scrolls the current entry into view and **focuses it**. Focus is trapped
  inside. Esc, the scrim or Close shut it and return focus to the button that opened it.
  Choosing an entry navigates and closes it.

### Turn the page (prev/next)

After the tailpiece: **two joined ruled cells** across the text column (Stripe Press's joined
buttons): 1px `--rule-strong` frame and a shared middle rule, square corners.
- Each cell: caps `PREVIOUS` / `NEXT` (`--ink-faint`) with a drawn arrow; if it crosses a
  chapter or into the back matter, an italic chapter line (*Chapter 3 · Rooms That Notice* /
  *Back matter · Appendix A*); the label and title (`--text-body`); the leaf glyph; the summary
  in italic `--text-small`. The Next cell is right-aligned.
- **Hover:** fill `--raised`, title underline rubric. **Focus:** rubric outline on the cell.
- At **1.1** the Previous cell becomes "Contents". At **B.2** the Next cell becomes "End of the
  manual · Return to contents".
- Phone: stacked, full width.

---

## The section page in each state

| State | What the reader sees |
| --- | --- |
| **unwritten** | Never painted (writing starts first). If it is, it renders exactly like *waiting*. |
| **waiting** (`writing`, no text) | The full opener: chapter line, hung label, title, **summary**, status line *Being written* with the rubric leaf. Then the **head rule draws itself** (`--dur-rule`), the **nib** appears at the first line's position, and one italic `--ink-faint` line reads *"The first words are on their way…"*. Never blank. |
| **streaming** | Text in the final layout. The **nib** rides beside the newest line, the **wet-ink rule** runs down the left margin, the status line counts up *Being written · 42%*, and the fore-edge tick and leaf glyph show the writing state. Prev/next are already there at the end. |
| **written** | No nib, no rule, a drawn **tailpiece** under the last line, status line *Written · about 520 words*. |

The `<article>` carries `data-status`. The status line is an `aria-live="polite"` region that
announces only state changes ("Being written", "Written"). The percentage is `aria-hidden`.

### Streaming: why nothing above the reading position moves

- Text only **appends**. The opener above it is fixed in size. The status line has a fixed width
  and tabular figures.
- **Line breaking (the shared rule):** `.prose` carries a `data-wrap` attribute fixed for the
  whole page load:
  - **`plain`**: any section that is `unwritten` or `writing` when its page opens, *and* any
    section that streamed earlier in this page load. A module-level `Set` of section ids records
    each one the first time it is seen writing, so returning to it later in the same load stays
    plain. Everything in it (paragraphs, list items, cells, markdown headings, blockquotes) uses
    ordinary `text-wrap: wrap`. Appending words never re-breaks earlier lines, and **nothing
    switches on completion**: the text stays exactly as it was set.
  - **`fine`**: a section that was already `written` when the page loaded. Body text uses
    `text-wrap: pretty`, and markdown headings and blockquotes use `balance`.
  - **Only on the opener title, the title page and the contents is `balance` always used.**
    Those come whole from the TOC data and are never partly rendered. The shared repair *does*
    render markdown headings partially mid-stream, so in `plain` sections they stay on `wrap`.
- **Margin notes** are absolutely positioned outside the text column, so they never move text.
  Footnote definitions come at the very end of the markdown, so **while writing, every note is a
  number-only stub** (one line high) at its reference's height. The stubs are laid out top-down as
  references arrive, and earlier stubs never move. **On completion the notes fill in and the
  overlap pass runs once.** Below desktop the notes list is hidden until the section is written,
  then appears at the end, below everything.
- The **tailpiece's box is reserved while writing** (`visibility: hidden`), so it appears on
  completion without pushing prev/next.
- **The page never scrolls by itself.** When the writing edge is below the viewport, a quiet
  **"Follow the writing"** text button (italic, drawn ↓ arrow) appears. It never covers text or
  code: on desktop it is set vertically at the foot of the fore-edge strip, and below 1024px it
  sits inside the folio bar. Clicking it scrolls to the edge (smooth, or instant under reduced
  motion) and keeps the newest line in view until the reader scrolls, drags, taps, presses a key,
  or the section finishes. While following it reads "Following the writing" (`aria-pressed`) and
  clicking it again stops. It stays visible while it has focus, and when the section finishes
  focus moves to the text instead of dropping to the page.
- New text appears without a fade. The text is *set*; the nib shows where.

---

## Markdown, element by element

The `.prose` styles apply to the shared `<Markdown>`. `components` (defined at module level) are
overridden only for `a` (external links, backrefs), `table` (scroll wrapper) and `pre` (a
labelled scroll region).

| Element | Treatment |
| --- | --- |
| **First paragraph** | A **2-line drop cap** in rubric: `::first-letter` with `initial-letter: 2`, opsz 72, weight 400, with a float fallback. Only when the section opens with a paragraph. None in appendices. |
| **Paragraphs** | No gap between them. `p + p { text-indent: 1.5em }` (book indents). No indent after a heading, list, table, quote, code block or rule. `hyphens: auto`. `text-wrap: pretty` only in sections that loaded already written; ordinary wrapping in any section that streams in this page load (see Streaming). |
| **Bold / italic** | Weight 600 / Newsreader's true italic. Bold lead-ins in lists stay `--ink`. |
| **H2** | Folio: **hung in the left margin**, right-aligned, `--text-head` 500, `text-wrap: balance` in `fine` sections only (see Streaming), **without floats**: the `h2` is an in-flow, zero-height block, and its text (a `span` added through `components.h2`) is absolutely positioned into the margin, so the paragraph after it starts on the same line. Above it, a 1px `--rule-strong` rule spans the left margin and text (Butterick plus Gwern), with `--space-7` above. `hr + h2` drops the rule (the asterism already separates them). Quarto and below: in the column, rule above. |
| **H3** | In the column. *Italic* `--text-head` 400 (Tufte), `--space-6` above, `--space-2` below. |
| **H4** | Caps label (`--text-caps`, weight 600, `--ink-soft`), `--space-5` above, `--space-1` below, followed by an unindented paragraph. |
| **Bulleted lists** | Indent 1.5em (same as the paragraph indent). The marker is a **6px rubric lozenge** (an SVG mask on `::before`) hanging in the indent, centred on the first line. Items have no gap between them. |
| **Numbered lists** | `::marker` in `--ink-soft`, tabular, followed by a period, right-aligned in the indent. |
| **Nested lists** | One more 1.5em step. Nested bullets are a 10px `--ink-faint` en-dash (drawn), and nested numbers are lowercase letters. |
| **Checklists** | `input` with `appearance: none`, 14px. Unchecked: a drawn square in `--ink-faint`. Checked: the same square with a **hand-drawn rubric tick** overrunning its corner, like a pencil check in a real manual. Text is not struck through; checked items are `--ink-soft`. The box hangs in the list indent. |
| **Blockquotes** | The manual's quotes are mottoes and character lines, so they are set as **epigraphs**: *italic* `--text-quote`, indented `--space-7`, `--ink`, no bar and no border, `text-wrap: balance` in `fine` sections only. |
| **Tables** | **Wide block** (880px on folio). "Booktabs" rules: 2px `--rule-strong` top and bottom, 1px `--rule` under the head, no vertical rules, no zebra stripes. Head: caps label, `--ink-soft`. Cells `--text-small`, padding 8px 16px 8px 0, top-aligned. GFM alignment is honoured (right-aligned numbers, tabular). Wrapped in a `role="region"` with `tabindex="0"` and a label for internal scrolling on narrow screens. |
| **Code blocks** | **Wide block**. A `--raised` plate with no border or radius, padding 16px 24px, Plex Mono `--text-code`, `--ink`, `overflow-x: auto` inside. The 98-character latency-guard line fits at 880px. No syntax colours (two-colour book). |
| **Inline code** | Plex Mono at 0.85em, `--ink`, no fill, no border: the face alone marks it, as in Tufte. |
| **Horizontal rule** | A drawn **asterism**: three 5px rubric lozenges 16px apart, centred, `--space-6` above and below. The classic section break. |
| **Footnote references** | Rubric tabular numerals at 0.65em, raised with `position: relative` (not `vertical-align`, so line spacing stays even). The hit area is padded to 24px. Hover or focus highlights the matching note. |
| **Footnotes, desktop** | **Sidenotes** in the notes column, **level with their reference's line**: `--text-small`, `--ink-soft`, led by a rubric number. A small layout hook measures each `a[data-footnote-ref]`, sets `--note-top` on its `li`, and pushes notes down to avoid overlaps (16px gap) and wide blocks. A pushed note simply sits lower with its rubric number, as in Tufte; there are no leader lines. **While writing, notes are number-only stubs**; they fill in on completion and the pass runs once more (see Streaming). Backrefs are hidden (the note is already beside its reference). |
| **Footnotes, phone/octavo** | **Endnotes**, using the renderer's own jump links and back-links. The renderer's **"Footnotes"** label is shown as a caps head at the end (under a short 64px rule, the classic footnote separator); `--text-small`, `--ink-soft`, with backrefs drawn as small return hooks labelled "Back to reference 1". Hidden while the section is writing (the definitions only arrive at the end). |
| **External links** | `--ink` text, 1px `--ink-faint` underline (offset 4px), followed by a **drawn 8px ↗** (meaning "leaves the manual"). Opens in a new tab, with the screen-reader text "(opens in a new tab)". Hover: underline becomes rubric. |
| **Cross-references** | A book's "see §4.2": the link text is followed by a small non-breaking **`§4.2`** (0.75em, tabular, `--ink-faint`) inside the link. The underline shows state: **written**: solid 1px rubric. **writing**: solid rubric plus a tiny writing leaf after the label. **unwritten**: **dotted 1.5px `--ink-soft`** (not yet set in type). Hover: underline thickens to 2px rubric. |
| **Cross-reference preview** (pointer devices) | After `--delay-preview` on hover, or at once on focus: a **framed slip** under the link, rendered through a **portal** into the `.design-b` root (never a `div` inside a `p`), placed from `--anchor-left`/`--anchor-top` and clamped inside the gutters in CSS, flipped above near the bottom of the viewport, `--preview-width`, `--raised`, 1px `--rule-strong` frame, no shadow (Gwern). It shows the italic chapter line, `4.2 The Director`, the summary in italic, and the state: leaf plus *"Written"*, *"Being written now"*, or *"Not yet written. Opening it starts the writing."* Read with `useManual()` + `findSection()`, so a preview never opens a section. `role="tooltip"`, tied to the link with `aria-describedby`. Esc closes it. |
| **Selection** | `--selection` background, `--ink` text. |

---

## Appendices: the back of the book

- **Ground** is `--ground-back` (a slightly lighter endpaper stock). The running head reads
  `APPENDIX A · …`, and the fore-edge highlights the thumb-index band.
- **Opener** is quieter: the label `A.1` hangs in **italic** rubric, the title is
  `--text-numeral` (39/48) rather than 49, and there is **no drop cap**.
- **Body** at `--text-body-back` (18/28), with **block paragraphs** (12px gap, no indent): the
  reference register.
- **H2s** follow Gwern: **caps label, right-aligned to the wide-block edge, over a full-width
  1px rule**, like a tab in a parts catalogue. H3 in italic as in chapters.
- Tables run wide everywhere, which suits the parts tables.
- Prev/next and the contents mark the boundary: `BACK MATTER · APPENDIX A`.

---

## Signature moment: wet ink

**What it is:** the margin shows the book being written, and then shows it is finished. It is
built from inline SVG and CSS only, and it lives entirely **in the left margin and below the
text**, never behind anything being read.

1. **Waiting (≈1.2s).** Under the summary, the **head rule draws itself** left to right (SVG
   `stroke-dashoffset`, `--dur-rule`, `--ease-in-out`), and the rubric **nib** (a drawn split-nib
   pen point, 10×16) appears in the margin 28px left of the text, level with the first line.
2. **Streaming.** The nib **rides beside the newest line**. A layout effect (re-run on every
   chunk and on a `ResizeObserver`) measures the bottom of the last rendered block that is *not*
   `section.footnotes` (that section is the last child from the first footnote reference onward)
   and sets `--live-edge` on the body. The nib and rule are positioned from it, so a
   `?freeze=0.5` screenshot shows the nib in place. A 1px **wet-ink rule** (`--rubric-wet`) runs from the top of the body down to the nib, 24px
   left of the text. From anywhere on the page, the reader can see that this section is still
   being written and how much exists.
3. **Finished.** The nib **lifts** (fades out with a 4px rise, `--dur-base`). The wet rule
   **dries**, fading from `--rubric-wet` to transparent over `--dur-rule`. Then the **tailpiece**
   (a 6px rubric lozenge between two 40px `--rule-strong` hairlines, from the same lozenge
   family as the bullets, asterism and head rule) **draws itself** under the last line: the
   lozenge appears, then the hairlines grow outward from it (`--dur-draw`). The
   status line changes to `WRITTEN`, and the live region announces it.
   This plays **only on a live writing → written change**. A section that was already written
   shows its tailpiece at rest.

**Why it serves reading:** a streaming reader has to answer three questions: *where are new
words landing*, *is it still writing*, and *is it finished or stalled?* The nib answers the
first, the wet rule answers the second from any scroll position, and the tailpiece (the
printer's sign for "end of chapter") answers the third. The animation lasts about a second and
happens once, as the reader reaches the end.

**Reduced-motion fallback:** nothing is drawn or faded. The head rule and tailpiece appear
complete. The nib and wet rule are static while writing (they move only because text is added,
like the text itself) and disappear instantly at completion. The leaf glyph and fore-edge tick
show their static "being written" frame.

### Drawn details (SVG)

One ornament family built from the **lozenge** (bullets, asterism, head rule, tailpiece). No swashes or pictorial flourishes, to stay clear of Halloween-book pastiche. All are inline SVG components using `stroke="currentColor"`, 1px hairlines with
`vector-effect: non-scaling-stroke` and butt caps (engraved, not rounded), so tokens colour them.

| Drawing | Meaning |
| --- | --- |
| Leaf glyph (3 states) | Section state |
| Ribbon (contents, fore-edge) | You are here |
| Fore-edge ticks | Each section, its state, and your place in the book |
| Head rule (lozenge + hairline) | Start of the text (section openers and the title page) |
| Asterism | Section break (`hr`) |
| Tailpiece (hairline · lozenge · hairline) | End of section: the text is complete |
| Nib + wet rule | Where the writing is now; still writing |
| Dot leaders | Connect a contents entry to its state |
| Lozenge bullet, en-dash sub-bullet | List items |
| Checkbox square + pencil tick | Checklist items |
| ↗ arrow | Leaves the manual |
| Return hook | Back to the note's reference |
| ↓ / → arrows | Follow the writing / Begin reading, previous/next |

---

## Interaction, keyboard and focus

- **Focus:** `:focus-visible` gives a 2px solid rubric outline, offset 3px, square. It is used
  for every link, tick, button, contents row, prev/next cell and scroll region.
- **Hover** on every interactive element (`--dur-quick`): text links' underlines go rubric or
  thicker; contents rows get a rubric underline and darker leaders; ticks grow 4px and open a
  label; buttons ("Contents", "Close", "Follow the writing") go from `--ink-soft` to `--rubric`;
  prev/next cells fill with `--raised`.
- **Tab order:** "Skip to text" link (visible on focus) → fore-edge (Contents button, one stop
  for the ticks) → running-head links → body links → Follow → prev/next. On phone the folio bar
  comes last in the DOM but is always visible.
- **Keys:** Esc closes the sheet and previews. ↑/↓/Home/End move within the fore-edge.
  There are no other shortcuts.
- **Touch targets** are at least 24×24 (ticks, note references, checkboxes) and 44px tall in the
  folio bar.

## Motion summary and reduced motion

| Motion | Default | `prefers-reduced-motion: reduce` |
| --- | --- | --- |
| Contents sheet | Slides in, `--dur-sheet` | Appears instantly (0ms opacity) |
| Scrim, previews, tick label slips | Fade, `--dur-base` | Instant |
| Head rule while waiting | Drawn, `--dur-rule` | Static, complete |
| Leaf glyph / fore-edge tick while writing | Quill loop, `--dur-quill` | Static resting frame |
| Nib / wet rule at completion | Lift and dry | Removed instantly |
| Tailpiece at completion | Drawn, `--dur-draw` | Static, complete |
| Follow the writing | Smooth scroll | Instant jump |
| Hover colour and underline | `--dur-quick` | Unchanged (not motion) |

---

## Build structure

- Every rule is nested under the `.design-b` root (native CSS nesting), so names like `.prose`
  and `.page` can't collide with other designs. Keyframes are prefixed `b-`. Tokens sit on
  `body:has(.design-b)`.
- `src/designs/b/styles/`: `tokens.css` (the single token source), `base.css`, `drawings.css`
  (glyph colours and stroke animations), `navigation.css` (fore-edge, folio bar, follow button,
  sheet, turn the page), `title-page.css`, `contents.css`, `section.css` (opener and the
  signature), `prose.css` (markdown and notes), `preview.css`.
- Components: `index.tsx` (routing and the sheet state), `TitlePage`, `Contents` (shared by `/b`
  and the sheet), `ContentsSheet` (a native modal `<dialog>`: focus trap, Esc and focus return
  come with it), `ForeEdge` (sets `--tick-count` from the manual), `FolioBar`, `SectionPage`
  (a `<main>`, keyed by section id), `Opener`, `SectionBody` (prose, nib, wet ink, tailpiece),
  `TurnThePage`, `FollowButton`, `SectionLink` (with its portalled preview),
  `markdownComponents` (`a`, `h2`, `table`, `pre`, `hr`), `drawings.tsx` (every SVG).
- `book.ts` (paths, chapter lines, state words) and `readingMemory.ts` (sections streamed this
  load, the last one opened).
- Hooks: `useLiveEdge` (writes `--live-edge` and keeps the value in a ref, so streaming causes no
  extra renders) and `useMarginNotes` (desktop only; reads every position, then writes). Each
  creates its `ResizeObserver` once and re-measures on new text.
- On back-matter pages the code plate and the fore-edge thumb band use `--ground`, because
  `--raised` barely differs from `--ground-back`.
