# RTFM — design

The single source of truth for what RTFM's two pages share: what both must do, the craft bar, the
concept and the tokens. Its rules bind both pages. Each page's own design is in its folder:
[`src/home/DESIGN.md`](src/home/DESIGN.md) for the landing page at `/`, and
[`src/reader/DESIGN.md`](src/reader/DESIGN.md) for the reader at `/read/<manual>`. Where the code
and these docs disagree, one of them is a bug.

## What RTFM is

- A web app for reading hypothetical manuals. An LLM writes a manual's table of contents first,
  then each section when it is first opened.
- Two pages (the routes are in `README.md` › Where things live):
  - **The landing page** (`/`, `src/home/`): your library of manuals, beside a librarian agent
    you talk to, which lists, finds, opens and proposes deleting manuals, and starts new ones.
  - **The reader** (`/read/<manual>`, `src/reader/`): one manual's start page and its sections.
- A local API server (`server/`, described in `server/README.md`) stores the manuals, writes their
  sections, and runs the librarian.
- **The passcode screen** (`src/passcode/`): when the server has a passcode and the browser hasn't
  entered it, or a library's link is closed, it takes either page's place ([The passcode
  screen](#the-passcode-screen)).
- **The link page** (`/l#<secret>`, `src/link/`): a library's link, which opens its library at `/`
  with no button ([The link page](#the-link-page)); `/admin` leaves it again.
- **Failure states only where something can fail:** a section the server couldn't write has two
  (see [When a section can’t be written](src/reader/DESIGN.md#when-a-section-cant-be-written));
  on the landing page, the library can fail to load ([The library can’t be
  reached](src/home/DESIGN.md#the-library-cant-be-reached)), a delete can fail ([When a delete
  fails](src/home/DESIGN.md#when-a-delete-fails)), and a reply can fail ([When a reply
  fails](src/home/DESIGN.md#when-a-reply-fails)). A new manual whose plan fails its checks isn't
  created, and the librarian says so in its reply, as words, not as a failure state. The passcode
  screen says when a passcode is wrong or couldn't be checked, and the link page when the server
  didn't open the library.
- **Dark only.**

## Data model

The API's types live in `server/api/types.ts`; the reader reads them and never changes them. A
manual has a title, a subtitle, numbered chapters and lettered appendices (`A`, `B`), each holding
labelled sections (`3.2`, `B.1`). Every section has a one-line summary, which comes with the table
of contents and so is always available, and a status: `unwritten`, `writing` or `written`.

A section's body is not part of the manual: the reader fetches it when the section is opened.
Opening an `unwritten` section switches it to `writing`; the server writes it and streams it in,
and the section becomes `written`. If the server can't write it, the section goes back to
`unwritten` and the reader says why. The hooks and the markdown renderer that expose this are
documented in `src/manual/README.md`, and the API in `server/api/README.md`.

The landing page lists summaries of manuals (`ManualSummary`), documented in
`src/library/README.md`.

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

## The passcode screen

With a passcode set on the server (`server/api/README.md` › The passcode), any `401` from the API
replaces whichever page asked with this screen, at the same URL. It is the stage door: one
question, asked plainly, then you're back where you were. A recipient whose library's link is
closed gets it too, from any request answered `401 { error: "Link closed" }` or from the link
page, with one line saying why.

- **Root** `<div class="ui passcode">`, its CSS in `src/passcode/PasscodeScreen.css`, scoped under
  `.passcode`. No header, no panel, no dock, no skip link: the field is the first stop.
- **Placed like the library's head**: left-aligned, 64px from the top and the left (32px gutter at
  768–1023px; 32px from the top and a 16px gutter on phone), its content capped at `--measure`.
  Nothing is centred and nothing is boxed.
- **Content**, top to bottom:
  - **only when the link is closed**, `This link is closed.`, `--text-ui` 600 `--ink-strong` (the
    status line's title voice, so the screen's news all speaks alike), 16px above the title. It
    comes first because it is why the screen is there: a recipient reads the reason before the
    question;
  - `This library is private`, `<h1>`, `--text-h3` 600 `--ink-strong`, `balance` (the notice
    size, not a hero), 4px above `Enter its passcode to open it.`, `--text-lead` `--ink-muted`;
  - 32px, the label `Passcode`, `--text-micro` Sans 600 `--ink-muted`, 8px above one row:
  - **the field**, a `type="password"` input (`autocomplete="current-password"`, so a password
    manager can fill it), filling the row: the librarian's field in one line, `--tap` tall, 1px
    `--ink-faint` border (`--ink-muted` on hover), `--radius-m`, `--ground`, `--text-reply`
    `--ink-strong`, the standard focus ring;
  - 8px to its right, **Open**, as tall as the field: Send's style, `--text-ui` 600 wdth 85
    `--ink-strong` on `--ground-tint`, `--radius-s`, `--cue` text on hover. While the field is
    empty or a check is under way it is `aria-disabled` (still focusable), `--ink-faint` on no
    fill, with no hover.
  - 12px below the row, the status line (`role="status"`, so it is announced), `--text-ui`
    `--ink-muted` starting with a 600 `--ink-strong` title, empty until there is something to say.
- **Focus on load** on hover-and-fine-pointer devices, so you can type at once; touch devices
  never get a keyboard they didn't ask for.
- **Enter or Open** sends it. Open reads `Checking…` until the server answers:
  - **right:** the page reloads at the same URL, so you land where you were;
  - **wrong:** **Wrong passcode.** “Check it and try again.” The field keeps focus with its text
    selected, so typing replaces it;
  - **no answer** (no server, an error, or 10 seconds): **Couldn’t check the passcode.** “The server
    didn’t answer. Try again in a moment.”
- No red, no lock icon, no warning glyph: the words carry it. No motion beyond the shared hover
  and focus transitions.
- **States** (`npm run shot`, `passcode/<state>-<desktop|phone>.png`): `start` (desktop: the
  field focused), `wrong` (a wrong passcode entered); and with the closed line, the link page's
  `closed`.

## The link page

A library's link, `/l#<secret>` (`README.md` › A library's link), is a door held open: the
recipient clicks once and is in their library, with no button and nothing to read on the way.

- **Root** `<div class="ui library-link">`, its CSS in `src/link/LinkPage.css`, scoped under
  `.library-link`.
- **While the server checks the link**, the bare ground, as every page shows while it loads: no
  spinner, no words, and never a flash of the passcode screen. A visually hidden status says
  `Opening your library…` to screen readers. The secret leaves the address before the request is
  sent, so the address bar reads `/l` and the back history never holds it.
- **Open:** the address becomes `/`, replacing `/l`, and the landing page loads as on any visit.
- **Closed:** the passcode screen, with `This link is closed.` above it, at `/`, so entering the
  passcode opens the admin's library.
- **Not opened** (the server fails, gives any other answer, or doesn't answer within 10
  seconds): a notice in the type and words of the landing page's unreachable library, placed like
  the passcode screen (its padding and `--measure`). `Couldn’t open your library`, `<h1>`,
  `--text-h3` 600 `--ink-strong`, `balance`, 4px above
  `Your library didn’t open, so there’s nothing to show yet. Try again.` in `--text-lead`
  `--ink-muted`, **Try again** a `.link` button in `--ink-strong`, which sends the same secret
  again; the page holds it, since the address no longer does. Never the closed line: a server
  that failed hasn't said the link is closed.
- **`/admin`** shows the same bare ground while it leaves the library, then opens `/`: the admin's
  library on this machine with no passcode, or the passcode screen.
- **States** (`npm run shot`, `link/<state>-<desktop|phone>.png`): `opening` (the server not yet
  answering), `failed` (a `500`) and `closed` (a link the server refuses).

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
  that is streaming, or that streamed in during this page load, uses ordinary wrapping (see
  `src/reader/DESIGN.md` › The wrapping rule). The librarian's replies always wrap normally.
- Every interactive element has a clear hover state and a clear focus state.
- UI transitions are about **150–250ms**, with deliberate easing.

## Banned

These are the usual giveaways of an LLM-made interface. Don't use them. Each page's design doc
shows how it stays clear of them, under "Avoiding the generic".

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
rack of prompt books (see `src/home/DESIGN.md` › Concept: the prompt corner).

## Tokens

Every color, type size, spacing step, radius and timing is a custom property in
`src/ui/tokens.css`, set on `:root` and shared by both pages. `src/ui/README.md` lists them with
their values and how to use them; this section says why they are what they are. Each page's own
layout and component sizes are in its `tokens.css` (`src/reader/tokens.css` on `.reader`,
`src/home/tokens.css` on `.home`). No other file defines a color, type size, spacing step, radius
or timing.

### Typefaces

| Role | Font (loaded by `src/ui/fonts.ts`) | Settings | Why |
| --- | --- | --- | --- |
| Text and interface | **IBM Plex Sans Variable**, `--font-sans` | wght 400 / 500 / 600; wdth 100 for reading, **85** (`--wdth-tight`) for dense UI: the TOC, outline, tables, pager, previews and the librarian's header and lines | Engineering-manual lineage, and it has every glyph the content needs (`I²C`, `1½`, `N·m`, `‹ ›`, `↑ ↓`). wdth 85 packs dense UI about 6% tighter without a second family. |
| Code and readouts | **IBM Plex Mono**, `--font-mono` | 400 and 700, roman and italic, are loaded; readouts use 400 | Same superfamily, so metrics and texture match. It is the "machine voice" for status readouts, language tags, percentages and counts. |

Body italics are Plex's true italic. No `font-optical-sizing` (Plex has no opsz axis). Measured on
the sample text: Plex Sans 17px is about 7.58px per character, 16px about 7.13px.

### Type scale

A minor third (×1.2) on the body size, with line heights on the 4px grid. Each size is a
`--text-*` token with a matching `--leading-*` token.

| Token | Weight · width | Use |
| --- | --- | --- |
| `--text-micro` | Mono 400, +0.02em; or Sans 600; or Sans 400 wdth 85 | Status readouts, code language tag, table headers, outline and group labels, the ledger's column header and readouts; the status legend (Sans 400) |
| `--text-ui` | 400–600 · wdth 85 (TOC, outline, tables, previews) or 100 (footnotes, start-page summaries, ledger subtitles, cues) | TOC, outline, tables, previews, footnotes, start-page summaries, subtitles in the ledger, cues |
| `--text-reply` | 400 · wdth 100 | The librarian's replies (`ReplyMarkdown`), your messages and the field |
| `--text-body` | 400 · wdth 100 | Paragraphs, lists, H4, pager titles, ledger titles |
| `--text-lead` | 400 | Section summary, start-page subtitle, blockquotes, the empty library's sentence |
| `--text-h3` | 600, −0.005em | H3, start-page chapter headings, the empty conversation's "Ask about your manuals", the delete confirmation's title, the unreachable library's title |
| `--text-h2` | 600, −0.008em | H2, start-page "Appendices" |
| `--text-h1` | 600, −0.012em | Section title |
| `--text-title` | 600, −0.015em | The page's one largest title: the manual title on the start page, `Library` on the landing page |

"Phone" means below 768px. On phone the body steps off the scale on purpose: at 375px it keeps
the measure at about 48 characters (the desktop size would sit at the 45 limit), and a short line
wants tighter leading. `--text-lead` and `--text-title` step down with it. `--text-reply` is the
phone body size at every width, for the same reason: replies sit in narrow columns. It is the
smallest size for text people read.

### Spacing

The 4px grid, `--space-1` to `--space-24`; the steps are listed in `src/ui/README.md`.

### Palette: graphite and the GO light

The booth's console: charcoal panels, off-white legends, and the cue light. A stage manager's cue
light turns green for **GO**, the moment something happens live, which is exactly this accent's
job. A muted signal green (not neon, not teal), so it reads as an indicator lamp, not a brand.

| Token | Role | Contrast on ground |
| --- | --- | --- |
| `--ground` | Page: graphite, neutral with a faint cool lean; the librarian's field (an inset) | — |
| `--ground-side` | The TOC column, the librarian's panel and dock; the tonal step *is* the divider (no border) | — |
| `--ground-raised` | Code blocks, previews, skip link, the delete confirmation | — |
| `--ground-tint` | Current TOC row, inline code, hover on buttons and start-page rows, the ready Send button | — |
| `--ground-hover` | TOC and ledger row hover (lighter than the current row, so "here" stays unique) | — |
| `--rule` | Table row lines, outline track, compact header line, start-page chapter lines, the ledger's closing line, the composer and dock top lines | — |
| `--rule-strong` | Head rule, `hr`, table header line, pager rules, preview border, appendix dividers, the ledger's header line, the rule beside your messages | — |
| `--ink-strong` | Headings, `strong`, current items | 16.1:1 |
| `--ink` | Body text (cool off-white, no cream) | 12.8:1 |
| `--ink-muted` | Summaries, labels, outline, footnotes, the failed status line, written-ring fill and written ticks (1.5:1 above ink-faint, so the two meta tiers stay apart) | 8.9:1 |
| `--ink-faint` | Unwritten titles, label numerals, meta, the field's border (at least 4.7:1 on every ground, including tint) | 5.9:1 |
| `--cue` | GO green: live/writing state, link hover, footnote references, focus ring (at least 6.9:1 on every ground, including tint) | 8.6:1 |
| `--cue-deep` | Link underlines and the writing-link dash (non-text, at least 3:1 on ground) | 3.8:1 |
| `--cue-tint` | A briefly highlighted target: a footnote, a ledger row, the field (ink on it 10.9:1) | — |
| `--selection` | `::selection` background (ink-strong on it 9.8:1) | — |

No second accent. Hairlines are always `--rule` or `--rule-strong`.

### Radii, motion and sizes

- **Radii:** `--radius-s` for code, inline code, checkboxes, the focus ring and small buttons;
  `--radius-m` for the TOC's `Library` link and manual title, start-page and ledger row
  highlights, previews, compact header buttons, the librarian's field, the cue rows, the dock's
  toggle and the delete confirmation. Rings are circles. Nothing else is rounded.
- **Durations:** `--dur-quick` for hover color; `--dur-base` for previews, sheets, outline rows
  and rows collapsing; `--dur-settle` for the write-head retract, rule color, ring fill and
  progress fill; `--dur-breathe` for the live pulse; `--dur-target` for a target highlight
  fading; `--delay-preview` before a hover preview opens.
- **Easing:** `--ease-out` for things arriving; `--ease-in-out` for state changes; **linear** for
  the progress fill (it tracks a measurement, so easing would make it lurch).
- **Focus:** `--focus-ring` (a solid cue outline) at `--focus-offset`.
- **Shared sizes:** `--measure`, about 76 characters of body Plex; `--tap`, the touch target;
  `--ring`, the state ring, with a 1.5px border so the writing dot and the solid fill centre
  cleanly; `--write-head-width` and `--write-head-lamp`; `--list-indent`.
- **Reduced motion** sets `--dur-quick`, `--dur-base`, `--dur-settle` and `--delay-preview` to 0ms;
  each animation (breathe, outline rows, write head, target flash, thinking line) is switched off
  where it is defined.

### Page

The page keeps `scrollbar-gutter: stable`, so growing past the viewport never shifts text
sideways. Each page's root is `<div class="ui reader">` or `<div class="ui home">`, and all of a
page's own CSS is scoped under its own class (`src/ui/README.md` › Using it).
