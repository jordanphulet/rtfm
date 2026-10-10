# B — The Book · Design review (P2.B.review)

Reviewer: independent. I looked at every image from `npm run shot -- b` (18 of 18, no errors). I
also ran my own dev server on 5183 and drove it with Playwright probes, sampling every 80ms
while sections streamed and measuring contrast, overflow, line length, focus and motion. My
screenshots and scripts are in the session scratchpad, not the repo.

## Verdict

This is the most *book* of any reader I'd expect in this exercise. It has hung labels and
margin headings, real sidenotes, a dot-leader contents page with drawn state leaves, booktabs
tables that break into the margin, and back matter set tighter like a parts catalogue. The
streaming mechanics are flawless. What holds it back from "ship it" is the signature itself and
a handful of rule collisions. The wet-ink rule reads as a layout grid line, not as ink, and the
small typographic slips (stacked rules, a drop-cap jog, eager hyphenation, an inverted appendix
hierarchy) are exactly what a book designer would notice first.

**Pastiche check:** it passes. Umber, parchment and one vermilion, with no swashes, skulls or
blackletter, read as a crafted night edition, not a Halloween theme. The only risk is
orange-on-black on a haunted-house manual. The rubric `#E0674B` is red enough, and its sparing
use (numbers, marks, state) keeps it on the right side. Don't add more red.

---

## Scores (1–5)

| Area | Score | Evidence |
| --- | --- | --- |
| Hierarchy | 4 | Chapter pages are excellent: rubric hung `3.1`, 49px title, italic summary, status line, lozenge rule (`written-desktop.png`). But in the appendix, the H2 "SERVOS" (13px caps, right-aligned, far edge) is outranked by the H3 *Notes on servos* (25px italic) directly below it (`appendix-desktop.png`). |
| Spacing consistency | 4 | A 4px grid and a 32px body rhythm hold throughout. Two collisions break it: an H2 rule and a table's top rule stack 13px apart with different extents (`written-desktop.png`, "The senses…"), and the drop cap pushes paragraph 2 into a 72px jog (1.2, live). |
| Reading comfort | 4 | 71 characters at 20/32 (≥1280), 67 (1024–1279), 47 at 18/28 (375); ink is 13.7:1. Ragged right plus `hyphens: auto` breaks too often, though: three of the first six lines of 2.4 end in hyphens (`mil-`, `no-`, `cus-`), and so do the italic epigraphs on phone (`generous-/ly`, 4.1). |
| State clarity | 4 | Three signals per state in the contents (leaf glyph, colour, roman or italic), the fore-edge tick lengths, the status line, and a written cross-reference (solid) vs an unwritten one (dotted). On the page, the "writing" signal mostly comes from the status line; the wet rule doesn't read as "still writing" (see Signature). |
| Streaming feel | 4 | Measured on 1.2 at 1440 and 375: over 173 samples, no block above the edge moved, the opener stayed at 234px, `scrollY` stayed 0, and note stubs held at 1429/1705px and then filled in. The nib rides the line. It still feels slightly mechanical: the nib is 10×16 and the rule beside it reads as grey structure. |
| Phone layout | 4 | A genuinely different structure: label above the title, H2s in the column, endnotes, a full-bleed code plate, and a folio bar with Contents and Follow (`streaming-mobile.png`). Two flaws: the nib is squeezed 2px from the screen edge (`streaming-full-mobile.png`), and table cells wrap into two lines, including `1,550 / ms` (`dense-mobile.png`). |
| Signature moment | 3 | The idea is right: nib, wet rule, drying, tailpiece. But `--rubric-wet` is 2.19:1 against `--rule-strong`'s 2.35:1, so the rule looks like a column divider. It also crosses every H2 rule as a "+" (`streaming-desktop.png`, x=431, y=530 and 786). |
| Would a professional ship this | 4 | Yes, after one round of fixes. Nothing is broken, the system is coherent and every interaction works from the keyboard. What's left is the polish a book designer would catch in proofs. |

**Desktop-first check:** nothing on desktop is simplified for the phone. Folio has a fore-edge, a
240px margin with hung H2s, 256px of sidenotes, 880px wide blocks, hover previews and tick
labels. Quarto (1024–1279) and octavo (768–1023) are each their own adaptation
(`tier-1024`, `tier-900` in the scratchpad).

---

## Locked rules

| Rule | Result | Evidence |
| --- | --- | --- |
| Dark mode only, happy path, no LLM | Pass | No light theme and no error UI. |
| Data read-only; stays inside `src/designs/b/`; no new packages | Pass | Only `b/` is touched; it imports `useManual`, `<Markdown>` and `SectionLink` from shared. |
| Uses the shared renderer, styled and not forked | Pass | `components` overrides `a`, `h2`, `table`, `pre` and `hr` only (`markdownComponents.tsx`). |
| Routes `/b` and `/b/:sectionId` | Pass | Both work, including deep links to unwritten sections, which start writing. |
| `data-shot="toc-toggle"` on the hidden-TOC control | Pass | On the spine "Contents" button (≥1024) and the folio bar button (<1024). |
| States clearly different in the TOC | Pass | Written: roman ink, lined leaf. Writing: rubric label and rubric leaf (`sheet-writing` live). Unwritten: italic `--ink-faint`, blank leaf (`toc-desktop.png`). |
| States clearly different on the section page | Pass | "Being written · 50%" with a rubric leaf, the nib and the follow control vs "Written · about 510 words" with the tailpiece. |
| Waiting shows title and summary, never blank | Pass | `waiting-desktop.png` and `waiting-mobile.png`: title, summary, status, drawn rule and "The first words are on their way…". |
| Streams in the final layout | Pass | `data-wrap="plain"` is fixed for the load; nothing re-flows at completion. |
| Raw markdown never shows | Pass | 4.1 sampled every 60ms through the whole stream: no `**`, `](`, `#`, `[^` or fences in `innerText`. |
| Nothing above the reading position moves | Pass | 1.2 at 1440 and at 375: 0 block moves and 0 margin-note moves while writing. |
| Page never scrolls on its own; reader can follow | Pass | `maxScrollY` stays 0. Follow at 375 scrolled with the edge (206 → 1280px over 5s), and focus landed on `#text` at completion. |
| Prev/next across chapter and appendix boundaries | Pass | 2.4 → 3.1 shows "Chapter 3 · Rooms That Notice"; A.1 ← 5.2 (`appendix-desktop.png`). |
| Clear "you are here" in the TOC | Pass | Ribbon, weight 600 and `aria-current` in the sheet (`toc-desktop.png`), plus a ribbon tick on the fore-edge. |
| TOC at most one click away at every width | Pass | Spine button (≥1024), folio bar (<1024), and `/b` is the contents. |
| Cross-references, including unwritten | Pass | Clicking `§A.2` opened A.2 as "Being written". The hover preview says "Not yet written. Opening it starts the writing." (`xref-unwritten`), and the preview for a written section shows the leaf and "Written". |
| Line length 45–90 | Pass | Measured 71 (1280+), 67 (1024–1279), 71 (768–1023), 47 (375), appendix 81 / 77. |
| Body text ≥ 16px | Pass | 20px desktop, 18px phone and back matter. |
| Body is real HTML text | Pass | Plain DOM text: selectable, findable, zoomable. |
| Desktop first, phone gets its own adaptation | Pass | See above. |
| 375–1440+ with no horizontal scroll | Pass | 8 pages × 12 widths (320–1920): `scrollWidth` never exceeded the viewport, and no note overlapped another note or a wide block. |
| TOC and prev/next keyboard operable with visible focus | Pass | Tab order: skip link → Contents → one tick stop → running head → body links → prev → next. Every stop gets a 2px `#E0674B` outline. ↑/↓/Home/End move along the fore-edge, Enter opens. The sheet focuses the current entry, traps focus, and Esc returns focus to the spine button. |
| Text contrast WCAG AA | Pass | On `--ground` / `--ground-back` / `--raised`: ink 13.7 / 13.1 / 12.9, ink-soft 7.8 / 7.4 / 7.4, ink-faint 4.95 / 4.73 / 4.68, rubric 5.51 / 5.26 / 5.21. |
| `prefers-reduced-motion` respected | Pass | Under `reduce`, `document.getAnimations()` is empty while waiting, while streaming and on sheet open. The nib and rule vanish instantly, and the head rule and tailpiece are drawn complete. |
| SPEC before code; ≥3 logged passes | Pass | `SPEC.md` names traits per reference image; `NOTES.md` logs 4 passes. |
| **All spacing, colours and timings are tokens in one place** | **Fail (minor)** | Off-grid, hard-coded offsets outside `tokens.css`: `section.css:115` nib `left: -30px`, `:121` wet rule `-25px`, `:158–161` phone nib `-14px / 8px / 12px / -6px`, `contents.css:55–56` ribbon `-22px / -4px`, `contents.css:229` `-14px`. `prose.css:246` derives an untokenised colour with `color-mix(… 50%, transparent)`. |
| Modular scale; 4px grid | Pass, except the offsets above | 1.25 scale from 20px; every line height is a multiple of 4. |
| ≤2 families + mono; no `#000` or `#fff` | Pass | Newsreader and IBM Plex Mono; ground `#16120E`, ink `#E6DCC6`. |
| Curly quotes, dashes, ellipsis | Pass | Interface copy uses `isn’t` and `…`. |
| Tabular numerals | Pass | Contents labels, ticks, tables and the status percentage. |
| `balance` on headings, `pretty` only on sections already written at load | Pass, with a side effect | The behaviour is correct, but `text-wrap: pretty` is the shorthand, so it resets `text-wrap-mode` and silently undoes `white-space: nowrap` on numeric cells (see fix 3). |
| Hover and focus on every interactive element | Pass | Rows get an underline and leaders darken; ticks open a label slip; cells fill `--raised`; links turn rubric or 2px. |
| UI transitions 150–250ms | Pass | 150 / 200 / 250ms. The 600 / 900ms strokes belong to the signature. |
| Signature: one moment, serves reading, never behind text, calm fallback | Pass | It sits in the gutter and below the text, and is static under reduced motion. Its *quality* is the problem, not its compliance. |

### Banned list

| Item | Result |
| --- | --- |
| Gradients, glass, blur, glows, neon | Pass. Flat colour only, and the scrim is flat. |
| Emoji as icons | Pass. Every glyph, including `↩`, is drawn SVG. |
| Rounded cards with shadows | Pass. `--radius: 0`, no `box-shadow`. |
| Pill badges | Pass. |
| Inter on slate-900 | Pass. |
| Purple or blue "AI" accent | Pass. No blue anywhere. |
| A border on every element | Pass. Rules appear only where a book has them. The prev/next frame and the preview frame are the only boxes. |
| Centring everything | Pass. Only the asterism and tailpiece are centred. |
| Giant hero with little content | Pass. The 61px title is followed by contents above the fold (`start-desktop.png`). |
| Decorative icons without meaning | Pass. Every drawing has one meaning (SPEC "Drawn details"). |

---

## What the references do better

- **Practical Typography:** the heavy rule over a margin heading sits **only over the margin
  column**. B runs its H2 rule across margin *and* text (`prose.css:56–64`). That creates both
  the stacked double rule above wide tables and the "+" crossings with the wet rule. Butterick's
  version is quieter and would remove both collisions.
- **Tufte CSS:** the body is ragged right with *no* automatic hyphenation, so the right edge stays
  calm. B hyphenates aggressively at a measure (71 characters) that doesn't need it.
- **Gwern:** in the appendix-style headings, the right-aligned caps label is backed by
  surrounding *size*, so it's never the smallest heading on the page. B copied the alignment but
  not the rank.
- **Stripe Press:** its tick index works because the page's current position is always obvious
  and its controls are horizontal and legible. B's "Follow the writing" is rotated, italic,
  `--ink-soft`, and sits about 400px from the reading column at the foot of the fore-edge
  (`streaming-desktop.png`, x≈30, y 725–860), so it's easy to miss.
- **Stripe Press (book page):** its joined buttons are short and fit their contents. B's
  prev/next cells are 288px wide, so titles and chapter lines wrap into 4–6 lines and leave
  orphans ("Pulse", "Why a Haunt / Should Listen", `written-desktop.png` and `s1440-done2s`).

---

## Prioritized fix list

### Rule failures

1. **Tokenise the hard-coded offsets and the derived colour.** In `tokens.css`, add
   `--nib-offset: 28px` (replacing `left: -30px` at `section.css:115`), `--wet-offset: 24px`
   (replacing `-25px` at `:121`), `--ribbon-offset: 20px` (replacing `-22px` at
   `contents.css:55`, and `-14px` at `:229` becoming `--space-3`), and `--rule-faint: #271F18` (a
   solid colour standing in for `color-mix(--rule 50%)` at `prose.css:246`). Put the phone nib
   size and offsets (`section.css:158–161`) on tokens too, and keep every offset on the 4px grid.

### Quality fixes (most impact first)

1. **Make the wet ink read as ink, and stop it crossing the H2 rules.** (a) At ≥1280, shorten
   the H2 rule to the margin column only, as Butterick does: in `prose.css:56–64` set
   `left: calc((var(--margin) + var(--gap)) * -1); width: var(--margin)` instead of spanning the
   text. This also removes the stacked rule over wide tables. (b) Raise `--rubric-wet` from
   `#7A3A2B` (2.19:1) to `#A64B37` (3.27:1) so the dry part reads red, not grey. (c) Add a "fresh"
   segment: have `useLiveEdge` also write `--live-block-top` (the top of the newest block), and
   draw a 2px `--rubric` span from there down to the nib, so the wet part is visibly brighter
   than the dried part. Keep the existing dry, lift and tailpiece sequence.
2. **Fix the inverted back-matter hierarchy.** In `[data-matter="back"] .prose > h2`
   (`prose.css:529`), keep the full-width catalogue rule, but set the label in roman
   `--text-head` (25/32) weight 500 `--ink`, left-aligned in the column (hung in the left margin
   at ≥1280 like the chapter H2s). Drop back-matter H3s to `--text-body-back` italic (18/28), so
   that H2 > H3 > H4 on every appendix page.
3. **Stop `text-wrap` from undoing `nowrap`, and keep phone table cells on one line.** In
   `prose.css:490` and `:494`, use `text-wrap-style: pretty` and `text-wrap-style: balance`
   instead of the `text-wrap` shorthand, so `:is(th, td)[style*="right"] { white-space: nowrap }`
   (`:252`) works again (today the Total cell `1,550 ms` breaks on phone, `dense-mobile.png`).
   Below 768px, give `td` and `th` `min-width: 7em` so the table scrolls instead of squeezing
   "Time-of- / flight" and "A warm / body moved" into two lines (`written-mobile.png`).
4. **Fix the drop-cap jog when the first paragraph is short.** Add
   `.prose > p:first-child { min-height: calc(2 * var(--line-body)) }` next to `prose.css:24`, so
   paragraph 2 never starts beside the cap. Today 1.2 sets "Every scare…" 72px in: the cap
   exclusion plus a 1.5em indent.
5. **Calm the hyphenation.** On `.prose` (`prose.css:3`), add `hyphenate-limit-chars: 8 4 4` and
   set `hyphens: manual` on `blockquote`, `h2–h4`, `.section-summary`, `.cell-title`, the chapter
   line, contents entries and previews. The goal is no more than one hyphen in any run of 5 lines
   (2.4's opening and 4.1's epigraph `generous-/ly` fail this today).
6. **Tidy the prev/next cells.** In `navigation.css:346–411`, use `text-wrap: balance` and
   `hyphens: manual` on the chapter line, `.cell-title` and the summary. Clamp the summary to two
   lines (`-webkit-line-clamp: 2`) so "Chapter 2 · Performers Without a / Pulse" and
   "Why a Haunt / Should Listen" stop leaving orphans in the 288px cells.
7. **Show "where you were" on return.** On `/b` (`TitlePage.tsx:32`), when `readingMemory` holds
   a last-opened section, change the meta link to "Continue at 4.2 →". Today the ribbon is drawn
   at y=1710, below the fold, and the line still says "Begin at 1.1". In `ContentsSheet.tsx:19`,
   scroll the current entry's **chapter group** into view with `block: "start"` and give the
   sheet `scroll-padding-top` equal to the sticky head's height. Today the head cuts through a
   row ("2.1 Bodies That Move", the chapter 1 title in `toc-desktop.png` and `toc-mobile.png`).
8. **Make the live-edge cues findable at the edges.** Desktop: colour the spine "Follow the
   writing" `--rubric` and add the small nib glyph above its arrow, so it reads as part of the
   signature (`navigation.css:210–221`). Phone: replace the 8×12 nib squeezed 2px from the
   screen edge with the same 2px `--rubric` fresh-ink segment from fix 1, set in the 16px gutter
   at `left: calc(var(--space-2) * -1)` (`section.css:156–165`).
