# B — The Book · Build notes

## Pass 1

**Saw**
- `appendix-desktop` was 1640px wide: the back-matter H2 rule (`width: calc(100% + wide-extra)`)
  also matched the renderer's visually hidden "Footnotes" `h2`, which then overflowed the page.
- Status line read "Written· about 570 words": a negative margin ate the space before the dot.
- An external link's drawn ↗ could wrap onto the next line on its own (the turn-taking note).
- In the contents sheet, scrolling the current entry into view pushed "Contents · Close" off the
  top of the sheet.
- On phone, "Follow the writing" had no background (`.book button` reset beat `.follow-button`), so
  it sat on top of the text unreadably.
- Section summaries with `text-wrap: balance` were squeezed into a narrow two-line block; `pretty`
  reads better for a sentence.
- The footnote reference looked detached ("conversation. ¹") with 2px padding.
- The ribbon overlapped section labels in the phone sheet.

**Changed**
- Prose heading rules now target `.prose > h2` only, so the footnote label is untouched.
- Status detail now relies on the flex gap; external links are `white-space: nowrap`.
- Sheet header is sticky with its own ground and a hairline; follow button styles are scoped to
  beat the reset; summaries use `pretty`; reference padding is 1px; the phone ribbon offset only
  applies on the contents page.
- Back-matter pages also tint `body`, so overscroll matches the endpaper ground.

## Pass 2

**Saw**
- Live streaming in the browser pane (3.3 at 1440): the nib rides the newest line, the wet rule
  runs down the margin, "Follow the writing" appears near the bottom, and on completion the nib
  lifts, the rule dries and the tailpiece draws. Clicking Follow kept the edge in view; wheel or
  key input hands control back.
- A cross-reference label (`§2.2`) laid out 59px wide after streaming, leaving a hole after the
  link text. It was an `inline-flex` box inside running text.
- Probing every width from 375 to 1440 found 24–40px of sideways page scroll at 1024–1280 on
  pages with code blocks: the wide `pre` had `content-box` sizing, so its padding pushed it past
  the notes column.
- Status line now reads "Written · about 570 words" (a no-break space before the dot keeps flex
  from trimming it).
- Cross-reference preview on hover: framed slip under the link with chapter line, title, summary
  and "Not yet written. Opening it starts the writing." No console errors.
- Keyboard: Skip link → Contents → one stop for the ticks; ↓ moves 2.4 → 3.1 → 3.2 across chapter
  groups; the focused tick shows its label slip and a rubric ring.
- Quarto (1100) and octavo (900) both look intentional: hung label and sidenotes at 1100; label
  above the title, endnotes and the folio bar at 900.

**Changed**
- `.xref-label` is a plain inline span; the writing leaf inside it is sized and nudged inline.
- Wide blocks use `box-sizing: border-box`. No page overflows at 375, 600, 768, 900, 1024, 1100,
  1280 or 1440 on the title page, a dense section, an appendix, the cast or the show-must-stop.

**Verified by script** (Playwright against the 5178 dev server, sampling every 200ms until the
section is written): 3.2 at 1440, 2.1 at 375 and 1.2 (with footnotes) at 1440. Every block above
the one being written kept its exact top and height, the opener never changed height, margin
note stubs never moved while writing, `scrollY` stayed 0 throughout, and the nib's bottom stayed
8px above the newest line's bottom.

## Pass 3

**Saw**
- `appendix-desktop` is back to 1440 wide: catalogue-tab H2s right-aligned over full-width rules,
  booktabs parts tables across text and notes, the sidenote clearing the wide table above it.
- On The Cast (back matter) the prompt code plates disappeared: `--raised` (#1D1813) is almost
  the same as the endpaper ground (#1C1712). The fore-edge thumb band vanished there too.
- Title page, lower half: the back matter sits in two tighter columns under the asterism, with
  italic rubric letters, and the written/unwritten entries read clearly.
- Phone written and streaming states: nested en-dash bullets, inline code and the dotted
  unwritten cross-reference all hold at 47 characters a line. The follow button is opaque and sits
  above the folio bar.

**Changed**
- On back-matter pages, code plates and the thumb band use `--ground` (an inset, darker plate).
- SPEC synced with the build: the octavo column is centred, the phone endnotes keep the
  renderer's "Footnotes" label, phone contents keep short leaders, and the build structure is
  listed.

**Final checks**
- `npm run check -- b` passes; `npm run shot -- b` saves 16 of 16 with no console errors.
- No sideways page scroll at any tested width (375–1440).

## Pass 4 (code review fixes)

**Changed**
- Every type value is a token: phone headings use `--text-head` 20/28 (on the scale), 28px leading
  is `--line-snug`, and the drop-cap and quote weights are `--wght-initial` / `--wght-quote`.
- Cross-reference preview: no timer. It renders on pointer enter and appears after
  `--delay-preview` through `animation-delay` (none on focus). TS sets only `--anchor-left` and
  `--anchor-top`. CSS clamps it inside the gutters with `--preview-width`. At 375 it now spans
  16–359px instead of starting off-screen.
- `useLiveEdge` and `useMarginNotes` each create one `ResizeObserver` and re-measure on new text.
  The live edge is written as a CSS variable and kept in a ref, so a chunk causes no second render.
  Notes are measured in one pass, written in a second, and only placed at 1024px and up.
- Follow button: it lives at the foot of the fore-edge (set vertically) on desktop and inside the
  folio bar below 1024px, so it never covers text or code plates. It stops following on
  `pointerdown` too, toggles with `aria-pressed`, stays visible while focused, and hands focus to
  the text when the section finishes. Its listeners are added once.
- The section page is a `<main>`. All styles are nested under `.design-b`, keyframes are prefixed
  `b-`, and the preview portals into that root. New files: `styles/drawings.css`,
  `styles/preview.css`, `styles/title-page.css`, `readingMemory.ts`. `CrossReference.tsx` is now
  `SectionLink.tsx`. `stateWord` lives in `book.ts`, next to the new `contentsPath`.
- The tick pitch derives from `--tick-count` set by `ForeEdge`. Dead tokens, class names and the
  `Lozenge` export are gone. Dot leaders and the checklist tick are masks coloured by tokens.
  `data-just-finished` is a boolean attribute, and the wrap modes are `plain` / `pretty`. The load
  tracking happens in an effect. Contents label widths come from one `--entry-label`.
  The title-page counts are pluralised.

**Saw, and fixed**
- After renaming the root, `.design-b:has([data-matter="back"])` matched the appendix entries in
  the always-rendered contents sheet. That gave every page the endpaper ground and hid the code
  plates. The `:has()` checks now target `.section-page[data-matter="back"]`.
- Checklist ticks sat 8px left of their boxes: the `input` used its own 13px font size for `em`.
  It now inherits the font.
- The "Contents" spine and folio buttons are now really the 13px caps the spec calls for. Before,
  the old `.book button` reset quietly overrode them to 20px.

**Verified**
- No horizontal overflow at 375, 600, 768, 900, 1024, 1100, 1280 or 1440.
- Streaming probes (1.2 at 1440 with notes, 3.2 at 375, 3.3 at 900): nothing above the edge
  moved, notes never moved while writing, `scrollY` stayed 0, and there were no console errors.
- Following by keyboard scrolled with the edge, and focus landed on the text on completion.
