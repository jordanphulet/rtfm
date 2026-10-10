# Design C — Focused reader: “Lamplight”

## Concept

Reading this manual should feel like standing outside a dark house on a cold night, where one room
has a lamp burning. The page is a blue-black night with pale, cool ink. A large, sturdy screen serif
owns the middle of the screen, and the headings stay small so the *text* is the loudest thing
there. The interface stays in the dark until you reach for it: a two-line mark in the corner and a
contents drawer. The only warmth is lamplight. Amber means *being written*, and the pale gold of
lit windows means *written*. When a section is written for you, the end of the text **develops
like a print in a darkroom tray**. The newest words are faint, the ones behind them are firmer, and
everything earlier is full ink. Nothing above the newest words moves. The one piece of atmosphere
is on the starting page: **the house itself**, in WebGL, standing in the moonlight beside the
contents. Lit windows are written sections, dark windows are still to be written, and a lamp
flickers in the room being written now. The drawer’s state marks are tiny windows from the same
house. The manual is about a haunt that listens, so its reader is a house that keeps a light on
for you.

## Borrowed from the references

| Image | Trait | In C |
| --- | --- | --- |
| `c/stripe-press-home-desktop.png` | A starting page that is mostly atmosphere: one 3D object with real depth on a dark ground, and nothing competing with it | The lit house on `/c`, alone on its stage with one caption line under it |
| | The interface reduced to a two-line wordmark top-left (“Stripe Press / *Ideas for progress*”) | Corner mark on section pages: *The Haunt That Listens* over **Contents** |
| `c/claude-ai-streaming-start.jpg` | The newest words are faint where the line ends, with no cursor | The developing tail: three ink levels by position, no caret |
| | No chrome around the text: a serif body on a plain ground | The reading column has no container, border or background |
| | A quiet one-line status above the reply | The meta line: section number, chapter, state |
| `c/claude-ai-streaming-later.jpg` | Streaming in the final layout (bold lead-ins, list numbers in place); only the last line or two still faint; nothing above moves | Only colour changes, and only in the last 160 rendered characters. Bold lead-ins are kept. |
| `c/claude-ai-finished.jpg` | The page didn’t scroll itself, and offers a small “jump to bottom” arrow instead | **Follow the writing**: opt-in, and shown only while new words are out of view |

**How C differs from A and B:**
- A is a graphite, three-column sans reference with permanent sidebars and ring status marks. C has
  no sidebars, one large-serif column on a blue-black ground, a drawer, and **window** marks.
- B is a warm printed book with a large type scale, hanging section numbers, italic standfirsts,
  margin notes, SVG ornament and a fore-edge index. C keeps its headings small (H1 36px under a
  21px body), puts the section number in a plain meta line, sets the summary in sans, quotes in
  roman, and shows margin content only on demand.

## Avoiding the generic

| Banned or generic | What C does instead |
| --- | --- |
| Inter on slate-900 | Literata and Instrument Sans on `#0A0F15`, a deeper and much less saturated night than slate-900 `#0F172A` |
| Purple or blue “AI” accent | There is no cool accent at all. Blue is only the night. The accents are lamplight and mean state. |
| Gradients, glass, blur, glows, neon | Flat fills only, and a flat scrim with no backdrop blur. In WebGL: no bloom, no additive blending, no post-processing, no shader haze. Lit windows are flat, unlit colour with nothing around them. |
| Loading bars | No progress bar or top-edge line. The state shows in the meta line, the marks and the house. |
| Cards with drop shadows | No shadows. Panels are flat `--bg-raised` with a 2px radius. |
| Pill badges | State is a 7×9px window mark plus a word |
| A border on everything | Hairlines only where they carry structure: table rows, the drawer’s edge, the prev/next rule, the ground line |
| Centering everything | All text is left-aligned. At ≥1280 the column sits left of centre. |
| Giant hero | The start title is 44px, set like the first line of a page, with the full contents under it |
| Decorative icons or emoji | The few glyphs (→, ↗, ↓, ↩, ‹, ›, ×, the list glyph) are inline SVG and each one means something. No Unicode arrows, which aren’t in the font subsets and can turn into emoji on iOS. |
| The usual LLM look | No gradient text, no hero with two buttons, no feature grid, no shimmer skeletons. The waiting state is the real title and summary. |

## Tokens

There is one source, `src/designs/c/tokens.ts`. It exports the values, plus `tokenStylesheet`,
which the design renders as one `<style>` that declares every custom property on `:root`, with the
phone overrides in a `max-width: 600px` block. CSS, the WebGL scene and the developing-text hook
all read from it. Media-query breakpoints are written as literals in CSS, because custom
properties can’t be used in media queries.

### Typefaces

| Role | Font (module) | Settings | Why |
| --- | --- | --- | --- |
| Text and headings | **Literata Variable** (`literata`) | `font-optical-sizing: auto` (opsz 7–72). Body weight 380 on desktop, 400 on phone. Bold 640. | Built for long reading on screens. Its large x-height holds up as light text on dark, and 380 offsets light-on-dark bloat. |
| Interface, summaries, tables | **Instrument Sans Variable** (`instrumentSans`) | Weights 400/600, `tnum` | A narrow, quiet grotesque that steps back from the serif |
| Code | **JetBrains Mono Variable** (`jetbrainsMono`) | Weight 420, `calt` off | Its x-height matches Literata at 0.76×, and `=>` reads as written |

Literata averages **0.464em per character** on this manual (measured in Chromium). Neither family
has small caps, so C never fakes them.

### Type scale

**Ratio 1.2** (minor third). The base is **21px** on desktop and **16px** on phone. The headings
sit only one to three steps above the body, so the running text dominates.

| Token | Desktop px/lh | Phone px/lh | Face | Use |
| --- | --- | --- | --- | --- |
| `--size-micro` | 12/16 | 12/16 | Sans 600, uppercase, +0.06em | Eyebrows (“Next”, “Footnotes”), table headers, H4 |
| `--size-caption` | 13/20 | 13/20 | Sans 400 | Drawer summaries, legend, lamp count, preview state |
| `--size-small` | 15/24 | 13/20 | Sans 400 | Meta line, UI rows, previews, house caption |
| `--size-summary` | 18/28 | 16/24 | Sans 400, `--ink-2` | The section summary under the title; start-page summaries |
| `--size-data` | 18/28 | 16/24 | Sans 400, `tnum` | Tables |
| `--size-note` | 18/28 | 16/26 | Literata, `--ink-2` | Footnotes |
| `--size-code` | 16/26 | 13/20 | Mono | Code blocks (inline code is 0.84em) |
| `--size-body` | **21/34** | **16/26** | Literata | Paragraphs, lists, blockquotes, H3 (at weight 620) |
| `--size-h2` | 25/32 | 19/26 | Literata 540 | H2 |
| `--size-h1` | 36/44 | 28/34 | Literata 480 | Section title |
| `--size-title` | 44/52 | 33/40 | Literata 460 | Manual title on `/c` |

**Measure.**
- Desktop: the column is **672px**, about **69 characters** at 21px.
- Phone: 16px text with 16px gutters gives about **46 characters** at 375px and 53 at 430px. Phone
  body text also gets `hyphens: auto`.

### Spacing (4px grid)

The steps are 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96 and 128 (`--space-1` to `--space-12`).

| Gap | Desktop | Phone |
| --- | --- | --- |
| Between paragraphs | 20 | 16 |
| Above / below H2 | 64 / 16 | 48 / 12 |
| Above / below H3 | 40 / 8 | 32 / 8 |
| Above / below H4 | 32 / 8 | 24 / 8 |
| Around quotes, tables, code, rules | 40 | 32 |
| Between list items | 8 | 6 |
| Head to body | 48 | 32 |
| Body to prev/next | 96 | 64 |

### Palette: a blue-black night, lamplight only for state

Contrast is against `--bg`, with the value on `--bg-hover` in brackets.

| Token | Hex | Role | Contrast |
| --- | --- | --- | --- |
| `--bg` | `#0A0F15` | Night ground; WebGL clear colour | — |
| `--bg-cellar` | `#070B10` | Appendix pages (“below stairs”) | — |
| `--bg-raised` | `#121820` | Drawer, bottom bar, code, previews, corner-mark backing | — |
| `--bg-hover` | `#1A222C` | Row hover, current TOC row, `:target` note | — |
| `--scrim` | `#05080B` at 72% | Behind the open drawer | — |
| `--ink` | `#CDD5DC` | Body, headings, written titles | 12.9 (10.8) |
| `--ink-2` | `#9DA8B2` | Summary, blockquotes, footnotes, ticked items | 8.0 (6.6) |
| `--ink-3` | `#828E99` | Labels, meta, unwritten titles, list markers | 5.8 (4.8) |
| `--ink-4` | `#66727E` | Non-text only: unwritten window frames, checkbox borders | 3.9 (3.3) |
| `--line` | `#1E2731` | Table hairlines, the drawer’s edge | — |
| `--line-strong` | `#334150` | Rules, link underlines, the ground line | — |
| `--select` | `#263444` | `::selection` background | ink on it 8.5 |
| `--lit` | `#CDAE7C` | **Written**: lit-window marks and lit windows in the house | 9.1 |
| `--lamp` | `#E0A85E` | **Being written**: writing marks, the flickering window | 9.1 |
| `--fresh-1/2/3` | `color-mix(in oklab, var(--ink) 30% / 55% / 80%, var(--bg))` | The developing tail | — |

House-only colours (in `tokens.ts`, used only by the scene, so they are not CSS variables):
`wall #2A3542`, `trim #344252`, `roof #1F2833`, `glass #0C1219` (an unwritten window), `moon
#B4C3D4` (key light), `sky #3A4A5C` (hemisphere fill). They are set lighter than the page, because
the dim moonlight darkens them on screen. Warm colour appears only in windows and state marks.

### Radii, timing, layers

- **Radius:** `--radius` is 2px everywhere. Window marks are square-cornered.
- **Timing:** `--t-fast` 150ms (hover, previews), `--t-base` 200ms (the follow control), `--t-slow`
  240ms (drawer).
- **Easing:** `--ease-out` is `cubic-bezier(0.2, 0, 0, 1)`.
- **Layers:** content 0 · corner mark 10 · follow control 20 · previews 30 · scrim 40 · drawer 50.

### Glyphs

`Glyph.tsx` draws each glyph as inline SVG: a 1.5px `currentColor` stroke at 0.8em, `aria-hidden`.

| Glyph | Use |
| --- | --- |
| Arrow right | Begin |
| Arrow up-right | External links |
| Arrow down | Follow the writing |
| Return | Footnote back-link, replacing the renderer’s `↩` text via `components.a` while keeping its `aria-label` |
| Chevrons ‹ › | Bottom bar |
| Close | Drawer |
| List (three lines: 14, 10 and 14px) | Contents |

The remaining punctuation (“ ” ’ – — … ·) is in the font subsets.

### State marks: windows

| State | Mark (7×9px, square corners, inline-block `<span>`) |
| --- | --- |
| Written | Solid `--lit` (a lit window) |
| Unwritten | A 1px `--ink-4` frame with a dark centre (a dark window) |
| Writing | A 1px `--lamp` frame with the **lower half** filled `--lamp` (a lamp lit at the sill). Static: it doesn’t animate. |

The three marks differ in shape (full, empty, half) as well as colour. Each carries hidden text:
“written”, “not yet written” or “being written”. They are the house’s windows in miniature.

## Layout

| Name | Width | Structure |
| --- | --- | --- |
| **Wide** | ≥ 1280 | Corner mark; column left of centre; preview lane on the right; tables and code may widen into the lane |
| **Desktop** | 1100–1279 | Corner mark; column centred; previews as popovers under the link |
| **Narrow** | 601–1099 | Opaque bottom bar (Contents, ‹, ›); column centred with 32px gutters; popovers for fine pointers only |
| **Phone** | ≤ 600 | Bottom bar; phone scale; 16px gutters; contents as a bottom sheet; no previews |

Below 1100, the corner mark (24 + 168px) no longer clears the centred 672px column, so the chrome
moves to the bottom bar.

### Section page at 1440

```
0  24         240                                       912  968          1256     1440
┌────────────────────────────────────────────────────────────────────────────────┐
│ ▐The Haunt That Listens▌ (corner mark on a --bg-raised backing)                │
│ ▐≡ CONTENTS            ▌                                                       │
│                                                                                │
│             2.4 · Chapter 2 · Performers Without a Pulse   ▄ Writing           │
│             The Half-Second Problem                    (36/44)                 │
│             Latency budgets, and the tricks that let…  (sans 18, --ink-2)      │
│                                                                                │
│             Here is the cruellest number in this book…  (21/34) │ [lane:       │
│             | Stage | Target | Ceiling | …  (may widen to 1016px)  previews]   │
│                        [ ▄ Follow the writing ↓ ]                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** `[minmax(240px,1fr)] [text 672px] [gap 56px] [lane 288px] [1fr]`. The text starts 128px
  from the top.
- **What the wide screen gives the reader:**
  1. **Previews on demand** in the lane, level with the link: a cross-reference’s title, summary
     and state, or a footnote’s text. The lane is empty until asked.
  2. **Room for wide blocks.** Tables and code are wrapped in `div.c-wide` via `components.table`
     and `components.pre`, which sit at block level, never inside a `<p>`. They keep the text’s
     left edge and grow right to fit, up to 1016px. The half-second and servo tables (18px) and
     the 97-character code line (16px, about 931px) fit without scrolling, while prose keeps 69
     characters. A preview beside a widened block covers it with an opaque panel until the pointer
     leaves.

### Desktop (1100–1279)

As wide, but the column is centred, there is no lane, and wide blocks stay at the measure (code
bleeds 24px each side) and scroll inside themselves. Previews are popovers 8px under the link:
288px wide, flat `--bg-raised` with a 1px `--line` border.

### Narrow and phone

- **Bottom bar:** `--bg-raised` with a 1px `--line` top edge, 52px tall plus the safe area.
  - The left part is one button: the list glyph and “2.4 The Half-Second Problem” (truncated). It
    opens the contents and carries `data-shot="toc-toggle"`.
  - On the right are 44×44 ‹ and › buttons, labelled for example “Previous: 2.3 Staying in
    Character”.
  - On `/c` it reads “Contents”, with › going to 1.1.
- **Wide blocks:** code and tables go full-bleed (16px inner padding) and scroll sideways inside
  themselves. A table’s first column is `position: sticky` on `--bg`.
- **Footnotes:** references use the renderer’s jump links.

## Chrome and navigation

### Corner mark (section pages, ≥ 1100)

Fixed at (12, 12) on a `--bg-raised` backing with 12px padding (2px radius, no border), so the text
inside sits at (24, 24) and nothing scrolls visibly through it.
- **Line 1:** *The Haunt That Listens* in Literata italic 15, `--ink-2`. It links to `/c`.
- **Line 2:** the **Contents** button (`data-shot="toc-toggle"`): the list glyph and the eyebrow
  “CONTENTS” in `--ink-3`.
- **Hover:** `--ink`.
- It never hides, so the TOC is always one click away.

It is **not shown on `/c`**, where the contents are the page itself (the start page’s phone and
narrow layouts keep the bottom bar).

### Contents drawer

- **Motion:**
  - Desktop: slides in from the left (`translateX`, `--t-slow`, `--ease-out`). It is 400px wide,
    full height, on `--bg-raised`, with a 1px `--line` right edge, over the scrim.
  - Phone: a bottom sheet rising to 88% of the height.
  - Reduced motion: both fade over 150ms with no movement.
- **Header:**
  - The eyebrow “CONTENTS”.
  - The manual title (Literata 21, linking to `/c`).
  - A lamp count: a lit-window mark followed by “7 of 18 rooms lit” (small, `--ink-3`, `tnum`).
  - A 40×40 close button labelled “Close contents”.
- **Rows:** small sans at 15px, 40px tall (48px on phone), laid out as `[window mark] 12px [label,
  3.5ch, tnum, --ink-3] [title]`. Chapter headings are Literata 15/24 at weight 600, 24px above
  their group.
- **Appendices:** 32px of space, a 1px `--line-strong` **ground line**, the eyebrow “APPENDICES ·
  BELOW STAIRS”, italic headings and letter labels.
- **You are here:** the current row has a 2px `--ink` bar on its left edge, a `--bg-hover`
  background, the title at weight 600, `aria-current="page"`, and its summary underneath (13px,
  `--ink-3`).
- **Legend** at the foot, using the real marks: “written · not yet written · being written”.
- **Behaviour:**
  - `role="dialog"` with `aria-modal="true"`.
  - Everything outside the drawer gets `inert`, which is the focus trap.
  - On open, focus goes to the current row, scrolled into view if needed. The panel itself has
    `tabIndex={-1}`, so clicking plain text inside it keeps focus in the drawer.
  - Escape (listened for on the document while open), a scrim click, close or choosing a section
    closes it. Focus returns to the toggle after `inert` is lifted.
  - The shell stays mounted across navigation. Only `SectionPage` is keyed by section id.

### Previous and next

- **Layout:** a 1px `--line-strong` rule, then two columns inside the measure (stacked on phone).
  Next is right-aligned.
- **Each link:** an eyebrow, the window mark, the label (`tnum`, `--ink-3`) and the title (Literata
  21). Next also shows its summary (sans 15, `--ink-3`).
- **Eyebrows** name the boundary being crossed: “NEXT CHAPTER · 3”, “APPENDIX A”, “START” before
  1.1, and “BACK TO THE START” after B.2.
- **Keyboard:** ← and → step between sections when the drawer is closed and no modifier is held.
  Auto-repeat and already-handled events are ignored, so a held key moves one section and doesn’t
  open every section it passes. The keys are left alone in form fields and in the focusable
  `.c-wide` table and code wrappers, which need them for sideways scrolling.
- **Navigating** resets the scroll to the top. There is no route transition.

### Keyboard and focus

- **Focus ring:** `:focus-visible` gets a 2px `--ink` outline, offset 3px, with a 2px radius. It
  is not amber, because amber means writing.
- **Tab order:** corner mark → Contents → article links → follow control → previous → next. The
  bottom bar comes last in the DOM.
- **Hover:**
  - Links: the underline becomes 2px `--ink`.
  - Rows: `--bg-hover`.
  - Buttons: `--ink` on `--bg-hover`.
  - House windows: the frame lightens and the caption updates. They only mirror links that the
    keyboard can reach.

## Section head

- **Meta line:** small sans in `--ink-3`, at every width: “2.4 · Chapter 2 · Performers Without a
  Pulse”, then the window mark and state word (“Writing” or “Written”) in a `nowrap` slot. For
  appendices it reads “A.1 · Appendix A · Parts and Sensor Reference”.
- **Title:** Literata 36/44 at weight 480, `--ink`, 8px below the meta line.
- **Summary:** Instrument Sans 18/28 in `--ink-2`, roman, 12px below the title, up to 34em wide.
- **Then:** 48px of space, then the body.

## Section states

| State | Drawer row | House window | Section page |
| --- | --- | --- | --- |
| **Unwritten** | Dark-window mark; title `--ink-3` | Dark `--glass` | Never painted, because opening it starts writing. It renders as waiting. |
| **Writing: waiting** | Half-lit lamp mark; title `--ink` | Lamp being lit, flickering | The meta line ends with a lamp mark and “Writing”. Title and summary are in place. Where the body will start: “Being written. The first words are on their way.” (small, `--ink-3`). |
| **Writing: streaming** | Same | Same | The developing tail (below). The follow control shows when the newest words are out of view. |
| **Written** | Lit-window mark; title `--ink` | Steady `--lit` | The meta line ends with a lit mark and “Written”. All text is full ink. |

## Streaming: the page develops

**The head never changes size.** The meta line, title and summary render in every state. The first
paragraph replaces the waiting line at the same y position.

**The developing tail.** `useDevelopingText(proseRef, status, text)` uses the CSS Custom Highlight API,
and works by **position**, not by timer, so a frozen screenshot shows it.
- **When:** after each render while `status === "writing"` (in `useLayoutEffect`).
- **What it measures:** it walks **backwards** from the end of the prose with a `TreeWalker`
  (`previousNode()`), collecting rendered text nodes until it has about 200 characters. It skips
  `section[data-footnotes]` (the prose’s last child, which sits after the live edge) and hidden
  text. Level boundaries move forward to the next word start, and a new block (paragraph, list
  item, cell…) counts as a word start.
- **Support:** if `CSS.highlights` is missing, the hook does nothing and words simply appear.
- **The three levels, from the end:**

  | Characters from the end | Highlight | Ink |
  | --- | --- | --- |
  | Last 40 | `c-fresh-1` | 30% |
  | The 60 before those | `c-fresh-2` | 55% |
  | The 60 before those | `c-fresh-3` | 80% |

  The ranges are held until the next update.
- **Live:** chunks arrive every 85ms, so the tail reads as words surfacing.
- **`?freeze=0.5`:** the one update stays visibly developing in the `streaming` shot.
- **When writing ends** (`written`) or on unmount, the three highlights are deleted and all text is
  `--ink`.
- **Why highlights:** `::highlight()` changes only colour, so there is no layout shift and no
  touching React’s DOM. The text stays selectable.
- **Reduced motion:** no highlights. Words appear at full ink.

**Nothing above the reading position moves.**
- Text only ever appends.
- Previews and the follow control are overlays.
- Footnotes and prev/next sit below the live edge.
- `overflow-anchor` stays `auto`.
- Text wrapping follows the rule below.

**Text-wrap rule.** `text-wrap: pretty` can re-wrap a paragraph when it changes. A module-level
`const streamedThisLoad = new Set<string>()` records every section id that `SectionPage` sees in
`writing`. `SectionPage` is keyed by id. The prose gets `data-settled` only when `status ===
"written" && !streamedThisLoad.has(id)`.

| Section | Paragraphs, lists, quotes, notes | In-text h2–h4 |
| --- | --- | --- |
| Writing now | `wrap` | `wrap` (the shared repair renders partial headings mid-stream) |
| Streamed earlier in this page load, revisited or finished | `wrap`, with no switch at completion | `wrap` |
| Already written when the page loaded | `pretty` | `balance` |

The title, summary, start title, drawer titles and prev/next titles come from the contents data and
never render partially, so they always use `balance`.

**The page never scrolls on its own.**
- **When it shows:** **Follow the writing** fades in over `--t-base` while the section is writing
  and the end of the prose is more than one line below the viewport.
- **Look:** 36px tall, `--bg-raised`, 1px `--line-strong` border, 2px radius, small sans in
  `--ink-2`, with the lamp mark and the down-arrow glyph.
- **Position:** it sits in the column right after the prose, `position: sticky` 32px from the
  viewport bottom (16px above the bar on narrow widths), centred on the column. It is rendered only
  while the section is writing. The space it frees is below the live edge.
- **The threshold** is the prose’s computed line-height, so it is right on phone too. While the
  button has focus it stays shown, so it is never made `inert` under the keyboard.
- **Click:** scrolls the newest line to two-thirds of the way down the viewport, then follows it as
  chunks arrive. The label becomes “Following · stop”.
- **Stopping:** an upward wheel, any touch scroll, ArrowUp, PageUp, Home, a second click, or the
  end of writing.

## Markdown elements

All of these are styled under `.c-prose`.

**Inline rule:** anything added next to or inside an in-text link (marks, glyphs, hidden text) is
a `<span>`. Previews and popovers render through `createPortal`: into the lane element on wide
screens, into `document.body` elsewhere. Nothing block-level ever lands inside a `<p>`, because
React 19 logs that as an error and the screenshot script fails on console errors.

- **Paragraphs:** Literata 21/34 at weight 380, `--ink`, 20px apart, no indent.
- **Bold** is weight 640. **Italic** is true italic.
- **Headings:**
  - H2: Literata 25/32 at weight 540, 64px above.
  - H3: body size at weight 620, 40px above.
  - H4: the micro eyebrow in `--ink-2`.

  Small headings let the paragraphs own the screen. They are separated by space and weight, not
  size.
- **Bulleted lists:** an en dash in `--ink-3`, hanging at −1.1em. Nested lists indent 1.5em and use
  “·”.
- **Numbered lists:** `tnum` numbers in `--ink-3`, hanging and right-aligned in 2ch. Nested ones
  use `lower-alpha`, so they can’t be confused with section labels. A `strong` at the start of an
  item reads as a lead-in.
- **Checklists:**
  - The real disabled input is visually hidden but stays accessible.
  - `li::before` draws a hanging 16px box with a 1.5px `--ink-4` border.
  - `li:has(> input:checked)` fills the box with `--ink-2`, and `::after` draws the tick in CSS (two
    borders of a rotated 5×9 box, in `--bg`).
  - Ticked text is `--ink-2` with no strikethrough.
- **Blockquotes:** **roman**, body size, `--ink-2`, indented 2em, 40px above and below, with no bar
  and no added quote glyph. A lowered voice, not a pull-quote.
- **Tables:**
  - Instrument Sans 18/28 with `tnum`. The header is the micro eyebrow in `--ink-3` over a 1px
    `--line-strong` rule.
  - Rows are divided by 1px `--line`. No vertical rules, no zebra stripes.
  - Cells are padded 8×16px, and GFM alignment is honoured.
  - The `c-wide` wrapper gets `tabindex="0"`, `role="region"` and an `aria-label` from the nearest
    heading.
- **Code blocks:** JetBrains Mono 16/26 on `--bg-raised`, 2px radius, padded 20×24px. They bleed
  24px to the left so the code aligns with the prose, scroll inside themselves, and have no syntax
  colour.
- **Inline code:** 0.84em mono on `--bg-raised`, padded 0.1em × 0.3em.
- **Horizontal rules:** 64 × 1px in `--line-strong`, flush left, 64px above and below.
- **Footnotes:**
  - References are sans 12 `tnum` in `--ink-2`, with a 24px hit area. On hover or focus they open
    a preview in the lane (wide) or a popover (desktop).
  - The notes section starts with a 64px rule. `.footnotes h2` is shown as the eyebrow
    “FOOTNOTES”, and the notes are Literata 18/28 in `--ink-2` with hanging `--ink-3` numbers.
  - The back-link is the return glyph.
  - An empty note mid-stream shows “Still being written…” in italic `--ink-3`.
  - A `:target` note gets a `--bg-hover` background. `scroll-margin-top` is 96px.
- **External links:** a 1px `--line-strong` underline, then the up-right arrow glyph (`--ink-3`) in
  a `<span>`, plus hidden text “(opens in a new tab)”. They open with `target="_blank"
  rel="noopener noreferrer"`, because leaving the app would lose a section mid-write.
- **Cross-references** (`SectionLink` and `components` at module level):
  - **Written:** a solid 1px `--line-strong` underline.
  - **Unwritten:** a dotted `--ink-3` underline, then a dark-window mark.
  - **Writing:** a dotted underline, then the lamp mark.
  - **Preview** (built from `findSection`, so it never opens the section): the eyebrow “SEE ALSO ·
    CHAPTER 4”, label, title, summary, then “Written”, “Not yet written. Opening it writes it.” or
    “Being written now.”
- **Preview behaviour:**
  - Previews sit level with the link and stay inside the viewport.
  - They fade in over `--t-fast` after a 120ms hover delay, or immediately on focus.
  - They are informational only (`pointer-events: none`). They close when the pointer or focus
    leaves the link, on Escape (WCAG 1.4.13), and on scroll or resize.
  - While open, the trigger’s `aria-describedby` gains the preview’s id (`c-preview`). The
    renderer’s own value, such as `footnote-label`, is kept and restored.
  - A footnote preview clones the rendered note with its `id`s and back-link removed, so there is
    no second `<Markdown>`.

## Starting page (`/c`)

`/c` is the manual’s threshold, not a redirect to 1.1. A first-time reader needs to know what the
manual is, how much of it exists yet (sections are written on demand), and where to start. The
house answers the second at a glance and the contents answer the third, side by side.

**Wide and desktop:** the grid is `[96px] [text 560px] [64px] [stage 1fr] [48px]`. There is no
corner mark.

- **Text side** (from y = 96), set like the opening of a page, not a hero:
  1. The **title**, “The Haunt That Listens”: Literata 44/52 at weight 460, `--ink`. There is no
     eyebrow above it.
  2. The **subtitle**, run straight on below the title: Literata body size (21/34) in `--ink-2`,
     roman.
  3. The **lamp count**, 24px below: a lit-window mark and “7 of 18 rooms lit. A dark room is
     written the first time you open it.” (small, `--ink-3`).
  4. **Begin**, between two `--line-strong` hairlines: “Begin at 1.1, Why a Haunt Should Listen”
     (Literata 21 at weight 600, `--ink`) with the arrow glyph, and its summary below (sans 15,
     `--ink-3`).
  5. The **contents**: chapter headings in Literata 21 at weight 600. Section rows have a window
     mark, label, title (Literata 21) and **summary** (sans 15, `--ink-3`), 16px apart. The ground
     line and “APPENDICES · BELOW STAIRS” come before the appendices.
- **Stage side:** sticky, `100dvh` tall. Its rows are the canvas (`1fr`) and an HTML **caption**,
  never drawn on the canvas.
  - By default the caption reads “Lit windows are written. Dark ones are written when you open
    them.”
  - On hover or focus it reads, for example, “2.4 The Half-Second Problem · Written”.
- **Linking the two sides:** one shared `hoveredSectionId` connects rows and windows. Clicking a
  window or the door navigates.

**Phone:** the stage comes first, full width, `min(52svh, 440px)` tall, and scrolls away with the
page. Then come the caption, the title (33/40), the subtitle, the lamp count, Begin and the
contents, with the bottom bar below. Tapping a window navigates.

## How the appendices are set apart

- **Drawer and start-page contents:** they sit below the ground line, under “APPENDICES · BELOW
  STAIRS”, with italic headings and letter labels.
- **The house:** a basement strip of windows below the ground line.
- **Their pages:** the ground drops to `--bg-cellar`, and the meta line reads “Appendix A”.
- **Prev/next:** says “APPENDIX A” at the crossing.

## Signature moment: the lit house

**Where:** only on `/c`, in the stage, beside the text on desktop and above it on phone. No text
is ever drawn over the canvas.

**What it shows:** a tall, narrow townhouse with a **straight façade** in about **15° of yaw**,
with the camera slightly low, standing in moonlight. **The house is the manual.** Windows are
spaced evenly across the façade on each floor, and string courses (thin projecting bands) mark the
floors.

| House | Manual | Windows |
| --- | --- | --- |
| Gable | Ch 5 | 2 |
| 4th floor | Ch 4 | 3 |
| 3rd floor | Ch 3 | 3 |
| 2nd floor | Ch 2 | 4 |
| Ground floor | Ch 1 | 2, either side of the **front door**, which is “Begin” (1.1 opens with “Come in, come in.”) |
| Below the ground line | Appendices A and B | A strip of 4 low basement windows, 2 + 2 |

- **Windows are live** from `useManual()`:
  - **Unwritten:** dark `--glass`.
  - **Written:** steady `--lit`.
  - **Writing:** the lamp is lit over 600ms, then flickers gently in `--lamp` (intensity
    0.75 + 0.25 × slow noise), and settles to `--lit` over 400ms when done.
- **Why it serves reading:** it is the one view of the whole manual. At a glance it shows what can
  be read now without waiting, how the manual is organised (floors are chapters, the basement is
  reference), and where to go. It is a clickable index, mirrored one-to-one by the accessible HTML
  list beside it. The stage (canvas and caption) is `aria-hidden`.
- **If WebGL isn’t available** (the renderer throws, or the chunk fails to load), the stage is
  removed and the start page is text only. The caption never describes windows that aren’t there.

**Where the effort goes:**
1. **Silhouette.** A steep gable with deep eaves, and a chimney stack running up the side wall that
   faces the camera, giving a strong profile against the night. An areaway railing runs in front
   of the basement.
2. **Window proportions.** Tall sashes about 1:1.8, **inset** 0.15 units into the wall, with a sill
   and lintel, and upper and lower sashes with glazing bars (mullions). Basement windows are
   landscape, about 1.6:1.
3. **Moonlight.** One cool `DirectionalLight` (`moon`, intensity 2.4) from the upper left and
   front, so the side wall, sills, string courses and the window reveals catch light while the
   façade stays dim. A `HemisphereLight` (`sky` over `--bg`, intensity 1.1) fills the rest.

**Build** (Three.js, loaded with `import()` only by the start page):
- **Geometry:**
  - Walls, string courses, sills, lintels, roof and chimney are `BoxGeometry` and
    `ExtrudeGeometry` (for the gable), merged into one mesh per material.
  - The glass is one `InstancedMesh` with per-instance colour. Frames and bars are one merged mesh.
  - The ground line is a deeper string course at grade, with the railing in front of it. There
    is no ground plane: a lit ground read as a slab with a visible edge.
- **Materials:**
  - `MeshLambertMaterial` for walls, trim and roof.
  - `MeshBasicMaterial` for the glass (flat, unlit).
  - No bloom, no additive blending, no post-processing, no custom shaders.
  - Shadow maps are off. The inset reveals get their shade from the lighting angle.
- **Depth:** subtle `Fog(--bg)` so the far side wall falls into the night.
- **Camera:** 30° field of view, framed to fit the house to the stage’s aspect ratio.
  - Fine pointer: ±2° yaw and ±1° pitch following the pointer (lerp 0.06 per frame).
  - Touch: still.
- **Picking:** a raycast on `pointermove` (once per animation frame) against the windows and the
  door. The hovered window’s frame lightens to `--ink-2` and the cursor becomes a pointer.

**Budget:**
- At most 5 draw calls (wall, trim, roof, glass, hover outline) and about 6,000 triangles. The
  door’s click target is invisible and never drawn.
- `devicePixelRatio` capped at 1.5 on desktop and 2 on phone.
- Under 3ms of GPU time per frame on integrated graphics.
- The `requestAnimationFrame` loop runs only while something moves (pointer easing, a flickering
  window, a colour easing), capped at 30fps.
- One-off frames (first paint, resize, state change, hover) are coalesced into a single render
  per microtask. They render even while the tab reports itself hidden (one frame, not a loop),
  because Claude’s browser pane reports `hidden` while it is on screen.
- No per-frame allocation: target and displayed colours are written into module-level and scratch
  `Color`s.
- The first frame arrives within 150ms of the module loading.

**Pausing:** the animation loop runs only while an `IntersectionObserver` reports the canvas on screen **and**
`document.visibilityState` is `"visible"`. A `ResizeObserver` resizes the renderer. The scene is
created once per canvas. Reduced motion is a live setter, not a reason to rebuild it. On unmount,
the geometries, the `InstancedMesh`, the materials and the renderer are disposed, and
`forceContextLoss()` releases the WebGL context, so revisiting the start page doesn’t pile up
contexts.

**Reduced motion: a still frame.** Screenshots don’t freeze WebGL, so under `reduce` the scene
**never starts a loop**:
- It renders one frame with the camera at rest and a writing window at a steady 80% `--lamp`.
- It renders again only on hover, a state change or a resize. State changes are instant.

## Reduced motion

| Motion | Default | Reduced |
| --- | --- | --- |
| Developing tail | Three ink levels by position | None, full ink |
| Drawer and sheet | Slide, 240ms | Fade, 150ms |
| Follow | Smooth scroll | Instant |
| Previews, follow control | Fade, 150–200ms | Instant |
| House | Pointer parallax, lamp flicker, 600ms lamp-lighting | One still frame |

Hover colour changes keep their 150ms transition. The state marks never animate.

## Typographic detail

- Every UI string uses real curly quotes, dashes and ellipses. Arrows are SVG glyphs.
- `tabular-nums` on every label, table, footnote number and count.
- `balance` and `pretty` follow the text-wrap rule.
- `::selection` uses `--select`.
- UI transitions run 150–240ms on `--ease-out`.

## Setup and files

- **Global styles:** `base.css` sets `html, body { margin: 0; background: var(--bg) }` and
  `color-scheme: dark`. The design switcher reloads the document, so this can’t leak into A or B.
- **Fonts:** import `literata`, `instrumentSans` and `jetbrainsMono` from `src/shared/fonts/`.
- **Files** in `src/designs/c/`:
  - `index.tsx`, `Shell.tsx` (drawer state, ←/→ keys) and `tokens.ts`
  - `base.css`, then one stylesheet beside each component: `chrome.css`, `contents.css`,
    `drawer.css`, `section.css`, `prose.css`, `preview.css`, `follow-control.css`,
    `prev-next.css`, `start.css`, `window-mark.css` and `house/house.css`
  - `manualParts.ts` and `useReducedMotion.ts`
  - `Glyph.tsx` and `WindowMark.tsx`
  - `CornerMark.tsx` and `BottomBar.tsx`
  - `ContentsDrawer.tsx`, plus `ContentsList.tsx` (shared by the drawer and the start page)
  - `SectionPage.tsx` (holds `streamedThisLoad`) and `SectionHead.tsx`
  - `Prose.tsx`
  - `useDevelopingText.ts` and `FollowControl.tsx`
  - `Preview.tsx` (portal) and `PrevNext.tsx`
  - `StartPage.tsx`
  - `house/House.tsx`, `house/plan.ts` (manual → storeys), `house/model.ts` (geometry) and
    `house/scene.ts` (renderer, loop, picking)
- **Check in screenshots:**
  - About 69 characters per line at 1440, and at least 45 at 375.
  - The `toc` shot shows the window marks and the current-row bar.
  - The developing tail is below the fold in the frozen `streaming` shot, because the page never
    scrolls itself. `streaming-full-*` shows the three levels. The reduced shot shows none.
  - The reduced `start` shot shows a still house with lit windows.
  - No console errors.
  - The corner mark never overlaps text between 1100 and 1279.
  - The servo table fits at 1440.
