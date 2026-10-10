# Design A: independent design review

**Verdict.** A is the most finished-looking and most rule-abiding of the three directions: a calm,
precise three-column reference with hanging clause numbers, real tables and rock-solid streaming
(no block moved and the page never scrolled on its own in any run). Its weak spots are
the live experience and its personality. The signature write head is too faint to notice, empty
footnote stubs appear between the live text and the tail line for most of a stream, and at
1440×900 the left index hides four sections, so it currently reads as a very good docs template
rather than a memorable reader.

No locked rule fails. The fix list below is all quality.

## How I tested

- `npm run shot -- a`: 18 of 18 saved, no errors. I looked at every file in `shots/a/`, including
  `streaming-full-*` and the `-reduced` pair.
- Live: my own `npx vite --port 5181 --strictPort` with Playwright scripts (scratchpad only):
  - streamed `3.2` and `3.3` at normal speed at 1440×900 and 375×812, sampling every 150ms;
  - pressed Follow and scrolled up with the wheel;
  - checked Tab order and focus styles, ←/→, and the phone sheet with Enter, Shift+Tab and Escape;
  - hovered and focused cross-references to unwritten (`A.2`) and written (`4.2`) sections;
  - checked horizontal scroll and characters per line at 375, 414, 768, 1023, 1024, 1100, 1199,
    1200, 1440 and 1920;
  - compared computed animations with and without `prefers-reduced-motion: reduce`.
- Contrast: computed from the hex values in `tokens.css` with the WCAG formula.

## Locked rules

### Scope, data, boundaries

| Rule | Result | Evidence |
| --- | --- | --- |
| Dark mode only | Pass | `color-scheme: dark`, graphite `#121314` ground. |
| Reads the shared data, never changes it | Pass | Everything lives in `src/designs/a/`; uses `useManual`, `useSection`, `<Markdown>`. |
| No new packages, only curated fonts | Pass | IBM Plex Sans Variable + IBM Plex Mono. |
| Routes `/a` and `/a/:sectionId` | Pass | Both work, and so does reload on a section. |
| Hidden TOC control carries `data-shot="toc-toggle"` | Pass | `CompactBar.tsx` location button; `toc-mobile.png` opened through it. |

### Section states

| Rule | Result | Evidence |
| --- | --- | --- |
| Three states look different in the TOC | Pass | Hollow ring and `--ink-faint` title, then green ring with a breathing dot, then solid grey disc and `--ink` title. Shapes differ, so state never relies on colour alone, and a legend is shown (`waiting-desktop.png`). |
| Three states look different on the section page | Pass | Status line `Waiting for the first words…`, then `Being written · 50%` in green with a filling head rule, then `Written · 516 words` with no green (`waiting-`, `streaming-`, `written-desktop.png`). |
| Waiting shows title and summary, never blank | Pass | `waiting-desktop.png`, `waiting-mobile.png`. |

### Streaming

| Rule | Result | Evidence |
| --- | --- | --- |
| Streams in the final layout | Pass | `streaming-full-desktop.png`: tables, code, numbered H2s and the blockquote are already in their final styling. |
| Raw markdown never shows | Pass | Not seen in any frame. |
| Nothing above the reading position moves | Pass | Every block's document top was sampled every 150ms through a full stream: **0 moves** at 1440 and at 375, including after scrolling to 600px mid-stream. |
| Page never scrolls on its own | Pass | **0** `scrollY` changes without Follow. Follow is opt-in (`Following ↓`, scrollY 1412→1571 in 2s), and one upward wheel turned it off (`aria-pressed=false`). |

### Navigation

| Rule | Result | Evidence |
| --- | --- | --- |
| Prev/next crossing chapter and appendix boundaries | Pass | `A.1` pager: `‹ Previous · Chapter 5 · 5.2`. 1.1 shows `Start of the manual`; B.2 shows `End of the manual`. |
| Clear "you are here" in the TOC | Pass | Tinted row, 2px bar, 600 weight, `aria-current="page"`. Phone: the header button repeats ring, label and title. |
| TOC at most one click away at every width | Pass | Always visible at ≥1024px. Below that it is one tap on the header button. |
| Cross-references, including to unwritten sections | Pass | Dashed underline plus hollow ring for unwritten, solid underline for written. The hover/focus preview says `Not yet written — opening it starts the writing.` (`out/hover-unwritten`, `out/hover-written`). |

### Reading comfort

| Rule | Result | Evidence |
| --- | --- | --- |
| 45–90 characters per line | Pass | Measured full lines: 1440 ≈ 71–79, 1200 ≈ 65–79 (measure 560), 768–1199 ≈ 68–78, 375 ≈ 45–51 (some lines drop to 41–43 when a long word wraps, average ≈ 48). |
| Body ≥ 16px | Pass | 17px desktop, 16px below 768px. |
| Body is real HTML text | Pass | DOM text, selectable. No canvas. |

### Desktop first, phone too

| Rule | Result | Evidence |
| --- | --- | --- |
| Desktop at full strength | Pass | Three columns, hover previews, "Referenced here", hanging section and clause numbers. Nothing on desktop looks cut back to suit the phone. |
| Phone gets its own adaptation | Pass | 48px header with location button and state ring, full-screen sheet with the current section's outline inline, 44px targets, sticky first table column, full-bleed code. |
| 375 to 1440+ with no horizontal page scroll | Pass | `scrollWidth − clientWidth = 0` on every real route at all 10 widths, and throughout both streams. |

### Baseline quality

| Rule | Result | Evidence |
| --- | --- | --- |
| TOC and prev/next work from the keyboard, with visible focus | Pass | Tab order: skip link, then manual title, then TOC rows. All have a 2px `#5FC48A` outline. ←/→ navigate (2 of 2), and focus lands on the new H1. Table wrappers (`tabindex=0`) and Copy also show the ring. The phone sheet takes focus to the current row, Shift+Tab stays inside, and Esc closes it and returns focus to the button (`aria-expanded=false`). |
| WCAG AA text contrast | Pass | On `--ground`: ink-strong 16.1, ink 12.8, muted 7.1, faint 5.9, cue 8.6. Worst text pair: faint on `--ground-tint` **4.77**. `--cue-deep` underlines are 3.75 (non-text, ≥3 is fine). |
| `prefers-reduced-motion` | Pass | Live: with `reduce`, all duration tokens compute to `0s`, ring and write-head animations are `none`, and `document.getAnimations()` is empty. Without it, `ring-breathe 1.6s` and `write-head-in` run. The ring keeps a static half dot. |

### Craft requirements

| Rule | Result | Evidence |
| --- | --- | --- |
| SPEC before code, NOTES with at least 3 passes | Pass | `SPEC.md`; `NOTES.md` has passes 1–3, live checks and a code-review response. |
| Tokens in one place | Pass | No hex values outside `tokens.css`. The only raw values left are glyph geometry (6px chevron, 1.5px borders) and letter-spacing. |
| Modular scale, 4px grid | Pass | Minor third on 17 (12/14/17/20/24/29/35). Every line height is a multiple of 4. Phone 16/24 is off-scale on purpose and documented. |
| ≤2 families plus mono | Pass | Plex Sans plus Plex Mono. |
| Not #000 or #fff | Pass | `#121314` and `#EDEFEF`. |
| Curly quotes, dashes, ellipsis | Pass | UI copy uses `’ — …` (`Couldn’t copy`, `they’re`, `Waiting for the first words…`). |
| Tabular figures | Pass | Labels, percentages, word counts, table cells and list markers. |
| `balance` / `pretty` and the streaming exception | Pass | A section that was written at load gets `data-wrap="pretty"` (`the-cast`). Sections streamed this load stay `plain` after completion (3.3 checked). The H1 is always balanced. |
| Hover and focus on every interactive element | Pass | TOC rows, eyebrow links, pager, links, Follow, Copy, steps and the location button all have both. |
| Transitions 150–250ms, deliberate easing | Pass | 150/200/250ms with named curves. The 1.6s breathe and footnote-target fade are ambient or highlight effects, not UI transitions. |

### Banned list

| Item | Result |
| --- | --- |
| Gradients, glass, glows, neon | Pass: flat fills only. The single `box-shadow` is an inset 1px hairline on the phone's sticky table column. |
| Emoji as icons | Pass |
| Rounded cards with shadows everywhere | Pass: previews are one bordered box, radius 4, no shadow. |
| Pill badges | Pass: rings plus words. |
| Inter on slate-900 | Pass |
| Purple/blue AI accent | Pass: muted signal green. |
| A border on every element | Pass: hairlines only where they do a job. |
| Centering everything | Pass |
| Giant hero heading | Pass: 35px title, contents immediately below. |
| Decorative icons | Pass: every glyph carries state or direction. |

### Signature moment rules

| Rule | Result | Evidence |
| --- | --- | --- |
| Built with the technique (CSS only) | Pass | `::after` write head, `scaleX(var(--progress))` meter, ring settle. |
| Serves reading, never behind the text | Pass | Sits in the left gutter and on the head rule. |
| Calm static fallback under reduced motion | Pass | See above. |

## Scores (1–5)

| | Score | Evidence |
| --- | --- | --- |
| Hierarchy | 4 | The H1 / lead / status / rule stack and the hanging `3.1.1` clause numbers read instantly. But `--ink-muted` vs `--ink-faint` is only **1.20:1** apart, so the meta tiers flatten into one grey. |
| Spacing consistency | 4 | Strict 4px tokens, and the 1440 gutters are even (176 / 176). Two flaws: at 1920 the columns drift **416px** apart (`out/w1920`), and during streaming the tail line sits 8px under a footnote stub. |
| Reading comfort | 5 | 17/28 Plex at ≈76 characters, ink 12.8:1, excellent tables (tabular, sum line, flush first column). |
| State clarity | 4 | Three ring shapes plus title colour plus a status line, everywhere. Weakened by empty `1. ↑` footnote stubs mid-stream, and by the legend covering the appendix rows at 900px height. |
| Streaming feel | 3 | Technically flawless (0 moves, 0 auto-scroll, good Follow) but mechanical. From 35% to 90% of 3.3 an empty "Footnotes 1. ↑ 2. ↑" block separates the live text from the tail line, and the write head collapses to nothing when the live block is an `hr` (height −7px). |
| Phone layout | 4 | A real adaptation, not a squeeze. But the 2.4 budget table spends 128px per numeric column, so `1,550 ms` shows as **“1,55”** at the cut (`dense-mobile.png`), and on `/a` both header chevrons are dead grey glyphs (`start-mobile.png`). |
| Signature moment | 3 | The right idea (editor change bar, plus a meter in the head rule, plus a settle when done) and correctly built. But a 2px bar and a 1px fill barely register in `streaming-desktop.png`, and a non-designer is unlikely to notice it at all. |
| Would a professional ship this | 4 | Yes, after the fixes below. It is coherent, accessible and disciplined. Its risk is looking like "a nice docs site" next to B and C. |

**Simplified on desktop for the phone's sake?** No. Desktop keeps three columns, previews,
"Referenced here" and hanging numbers. The 1024–1199 band moves the outline into the TOC, which
suits that width.

## Compared with `docs/inspo/a/`

- **Linear (desktop):** the three columns read as one unit. The outline starts close to the text
  and the content group stays centred together. A's text and outline drift apart as the window
  widens: 176px each side at 1440, 416px at 1920. Linear's top bar also gives the page a frame;
  A's manual title is a 14px line in the TOC corner, so the page has little identity at a glance.
- **Rust Book:** the whole book's index is visible and numbered in bold. At 1440×900, A's index
  overflows by **122px** (`.toc-side` scrollHeight 1022 vs 900). A.2, Appendix B, B.1 and B.2 sit
  hidden under the sticky legend, which works against A's own "whole manual's state at once" idea.
  Rust's numerals are also confident (bold), while A's are `--ink-faint` and recede.
- **Claude Platform docs:** headings carry character (serif there), and a utility control sits by
  the title. A gets its character from clause numbers and the GO-green, which works on written
  pages but disappears in the empty waiting state.
- **Linear (mobile):** 24px gutters and a larger H1 feel more generous than A's 16px gutters.
  A's choice keeps the measure near 48 characters, so this is a fair trade-off, not a fix.

## Prioritized fix list

**Rule failures:** none.

**Quality fixes, most impact first:**

1. **Hide footnote stubs while writing, so the tail line hugs the live text.** In `prose.css` add
   `.design-a [data-status="writing"] .prose-root > .footnotes { display: none; }`. It appears
   when the section turns `written`, below everything, so nothing above moves. Today 3.3 shows
   `Footnotes 1. ↑ 2. ↑` with no text from 35% to 90% of the stream (`out/d-follow`, `out/m-follow`),
   and `Being written · 82%` sits under that block instead of under the paragraph being written.
2. **Make the write head unmistakable.** In `tokens.css` add `--write-head-width: 3px` and use it
   for the gutter bar in `prose.css` and `tail-line.css` (leave `--bar-width` for the TOC and outline
   markers). Keep the green bar beside the tail line for the *whole* stream, not only
   `[data-waiting]`, so bar, percentage and Follow read as one instrument. While writing, draw the
   head-rule meter at 2px (`.head-rule::after { inset: -0.5px 0 }` under `[data-status="writing"]`;
   transform only, no layout change). Give the live block's bar a minimum length, so an `hr` as the
   live block doesn't collapse it: for `hr:nth-last-child(1 of :not(.footnotes))::after` set
   `top: calc(-1 * var(--space-3)); bottom: calc(-1 * var(--space-3))`.
3. **Fit the whole index at 1440×900.** In `toc.css`:
   - `.toc-row` padding `var(--space-1)` → `2px` block (28 → 24px rows);
   - `.toc-chapter` margin-top `--space-4` → `--space-2`;
   - un-stick the legend: drop the `.toc-side .toc-legend` sticky block and set the legend as one
     micro line under `7 of 18 sections written` in `.toc-masthead`.

   Target: `.toc-side` scrollHeight ≤ 900 at 1440×900, with B.2 visible and nothing covering rows.
4. **Keep text and outline together on wide screens.** In `shell.css` at ≥1200px, stop centring the
   text in a fluid `1fr` with the outline pinned to the far right. Give the leftover width to the
   outer edges instead. For example: grid columns
   `var(--toc-width) minmax(var(--gutter), 1fr) minmax(0, calc(var(--measure) + 2 * var(--gutter))) var(--outline-width) minmax(var(--space-6), 1fr)`,
   with main in column 3 and the aside in column 4. At 1440 the text-to-outline gap stays ≈64px plus
   the main gutter. At 1920 it should no longer grow to 416px; the extra width goes to the outer
   edges instead.
5. **Phone tables: let numeric columns be narrow.** In `prose.css` under `max-width: 767px`, exempt
   right-aligned cells (the ones already set `nowrap`) from `min-width: 8rem`. Give them
   `min-width: 0`, so Stage + Target + Ceiling fit inside 343px and a cut never lands inside a
   number (`1,550 ms` currently reads “1,55”).
6. **Show that a code block scrolls.** Desktop lines are clipped flush at the block edge
   (`performer.fallbackLin…` in `dense-desktop.png`, `heartbeat_los…` in
   `streaming-full-desktop.png`), and macOS hides `scrollbar-width: thin` scrollbars until you
   scroll. In `code-block.css`, replace `scrollbar-width: thin` on the `pre` with an always-visible
   classic bar: `::-webkit-scrollbar { height: var(--space-2) }` and
   `::-webkit-scrollbar-thumb { background: var(--rule-strong); border-radius: var(--radius-s) }`.
   Both sit inside the code block's padding.
7. **Fix outline H3 indentation.** H3 rows (`Cameras, if you must`, `Notes on servos`) start at
   24px, *left* of their parent H2's title, which starts ≈48px in after its `A.1.1` number. In
   `outline.css`:
   - give `.outline-number` a fixed width (new token `--outline-number-col: 40px`);
   - set `[data-level="3"] a { padding-left: calc(var(--space-3) + var(--outline-number-col) + var(--space-2)) }`.

   H3s then nest under H2 titles in the outline, the 1024–1199 TOC outline and the phone sheet.
8. **No dead chevrons in the phone header.** In `CompactBar.tsx`'s `StepLink`, don't render the
   `#3C4044` (1.78:1) placeholder glyph when there is no section. On `/a`, make `›` link to 1.1
   (`aria-label="Next: 1.1 Why a Haunt Should Listen"`) and omit `‹`. At 1.1 and B.2, omit the
   missing side. Two grey arrows on the very first screen look broken (`start-mobile.png`).

## Minor notes (not in the fix list)

- `--ink-muted` and `--ink-faint` are 1.20:1 apart. If a later round touches the palette, separate
  them, or merge them into one token.
- A hovered TOC row gets the same `--ground-tint` as the current row. The bar and weight still mark
  "here", but a lighter hover tint would keep "here" uniquely strong.
- On `/a` the chapter list appears three times on one screen: the TOC, the annotated contents and
  "In this manual".
- TOC row `aria-label`s read `3.1 Sensing the Guest , written`, with a space before the comma.
