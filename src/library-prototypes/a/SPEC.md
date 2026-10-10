# Library A — The prompt corner

Variant **A, agent beside the library**. The library fills the page as a ledger; the librarian
sits in a docked panel on the right, where the reader keeps its outline column. Both are always in
view on desktop, and they point at each other.

## Concept

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

The agent's replies change nothing, so this link is visual only: a mark and a jump, never an
action.

## What this variant is not

- **Not B (a command line):** the conversation is never transient. It is a persistent, scrollable
  log that stays beside the library for the whole visit.
- **Not C (a conversation page):** the library is never inside the conversation, and the
  conversation never holds controls that act on the library. The two have separate homes, joined
  only by marks and jumps.

---

## Layout

### Desktop, 1280px and up (designed at 1440 × 900)

```
| library area: 1fr                                  | panel 440 |
|   gutter 64 | ledger ≤ 960 | gutter ≥ 64             | --ground-side, sticky, 100dvh |
| 1440: ledger x 64–936 (872 wide), panel x 1000–1440                              |
| 1920: ledger 960 wide, centred in the 1480px library area (equal space each side)|
```

- **No top bar**, like the reader. The library head starts 64px from the top.
- **The page scrolls the library.** The panel is `position: sticky; top: 0; height: 100dvh`, so
  it never scrolls away. Its conversation has its own scroll (`overscroll-behavior: contain`).
- **The tonal step is the divider:** the panel is `--ground-side` on a `--ground` page, with no
  border, like the reader's TOC.
- The dev switcher's 15px strip at the left edge stays clear: nothing sits left of x = 64.

### 1024–1279px

The panel narrows to **384px** and the library gutter to **32px**. The ledger drops its "Last
opened" column: the time moves into the manual cell, under the subtitle (see the ledger).

### Below 1024px, designed at 375

The panel becomes a **dock and a sheet** (see "The agent on phone"). The library takes the full
width, with a **16px** gutter on phone and **32px** from 768 to 1023px. At 768–1023px the ledger
keeps its 1024px columns; below 768px rows stack.

### Variant-local sizes

In `src/library-prototypes/a/tokens.css`, on `.library-a` (layout sizes are the page's own, as in
`src/reader/tokens.css`):

| Size | Value | Use |
| --- | --- | --- |
| `--panel-width` | 440px (384px at 1024–1279) | The docked panel |
| `--gutter` | 64px (32px below 1280, 16px below 768) | Library side space |
| `--ledger-max` | 960px | The ledger's widest |
| `--written-col` | 136px | The progress column (the reader's `--status-col`) |
| `--opened-col` | 112px | The "Last opened" column |
| `--action-col` | 72px | The Delete column |
| `--panel-pad` | 24px (16px below 768) | Panel side padding |
| `--panel-gutter` | 40px (28px below 768) | Panel left padding: room for the write head |
| `--head-width` | 3px | The write head's bar (the reader's `--write-head-width`) |
| `--lamp` | 7px | The write head's lamp (the reader's `--write-head-lamp`) |
| `--head-offset` | 16px (12px below 768) | Bar distance left of the reply text |
| `--tick` / `--tick-pitch` / `--tick-height` | 2px / 4px / 8px | The section strip |
| `--mark` | 2px | The "named in the conversation" mark on a row |
| `--lamp-inset` | `(--lamp − --head-width) / 2` | Centres the lamp on the bar |
| `--dock-height` | 112px | The phone dock's resting height: the library's bottom clearance and the rows' scroll margin |
| `--dock-max` | 720px | The dock's content width at 768–1023 |

---

## The library

### Head (in the library area, left-aligned)

1. **Title** `Library`, `<h1>`, `--text-title` (35/40, phone 29/36) 600 `--ink-strong`, 12px below.
2. **Meta**, `--text-micro` mono `--ink-faint`, tabular, live: `7 manuals · 47 of 117 sections
   written` (`1 manual · …`; empty: `No manuals`). 24px below.
3. **Start a new manual ›**, a `<button>` in the plain `.link` style: `--text-body` 400 `--ink`
   with the 1px `--cue-deep` underline, `--cue` on hover. Deliberately quieter than the reader's
   green "Begin" link, so it never competes with the librarian's input. Always here, in every
   state, so it has one home. What it does is under "Direct controls".

48px below: the ledger. The library area's padding is 64px on top and 48px below, so at 7
manuals the page fits 900px without scrolling.

### The ledger (1280px and up)

A list, not cards: the reader's start-page rows with a column header, so the shelf reads like a
console's channel list.

- **Column header** (`aria-hidden`; each cell carries its own words for screen readers):
  `--text-micro` Sans 600 `--ink-muted`, sentence case: `Manual` · `Written` · `Last opened ↓`
  (the arrow says the sort: most recent first, from `useLibrary()`). 8px below, a 1px
  `--rule-strong` line across the ledger.
- **Row** (`<li>`), grid `1fr | --written-col | --opened-col | --action-col`, 24px column gap,
  padding 12px, `--radius-m`, 4px between rows; 8px of space above the first row and below the
  last, then a closing 1px `--rule` line.
  - **Manual cell:** title `--text-body` (17/28) 500 `--ink-strong`, `text-wrap: balance`; the
    title is the row's link to `/read`, stretched over the whole row with an `::after`, so the row
    is one click target. Subtitle `--text-ui` (14/20) `--ink-muted`, `text-wrap: pretty`.
  - **Written cell:** the readout `3 of 14`, `--text-micro` mono, tabular, `--ink-muted` (`--ink-faint`
    at 0), with a visually hidden ` sections written`; 4px below, the **section strip**.
  - **Last opened cell:** `--text-micro` mono `--ink-faint`, `formatLastOpened()` as is (`today`,
    `3 days ago`, `Dec 28, 2025`), with a visually hidden `Last opened `.
  - **Delete cell:** a `.text-button` `Delete` (`--text-ui`, wdth 85), `--ink-faint`, aligned to
    the first line of the title, pulled right by `--space-2` so its text meets the ledger edge.
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

**At 7 manuals** the head and ledger end around y = 800, inside 900: the whole shelf, no scroll.
**At 1** the ledger is one row and its closing line; nothing stretches to fill the page.

### The ledger at 1024–1279 and 768–1023

Grid `1fr | --written-col | --action-col`. The header reads `Manual` · `Written`. Last opened
moves into the manual cell, 4px under the subtitle: `Opened yesterday`, `--text-micro` mono
`--ink-faint`.

### The ledger on phone (below 768)

- No column header. Rows are full width (padding 12px 0), separated by 1px `--rule` lines (a job:
  the rows have no hover tint to separate them on touch).
- Title `--text-body` (16/24 on phone) 500 `--ink-strong`; subtitle `--text-ui` `--ink-muted`.
- 8px below, one meta line: the section strip, `3 of 14`, `·`, `yesterday` (`--text-micro` mono,
  tabular), and **Delete** at the right end: `--text-ui`, `--ink-faint`, a 44 × 44 hit area
  (`--tap`) centred on its text.
- Bottom padding on the library: the dock's height plus 24px, so the last row clears the dock.

### Named in the conversation (the shelf mark)

- **Which manuals:** the ones named by **the draft in the input, if it isn't blank, or else the
  latest message you sent**. So typing "Delete the manual about birthday parties" marks *The
  Birthday Party Field Manual* as you type, and the mark stays after you send.
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
  | Open the cat one / Open the cat’s manual | Moving House Without Losing the Cat |
  | Can you translate the sourdough manual into Klingon? | Keeping a Sourdough Starter Alive |
  | Sing me a sea shanty about geese | Negotiating With Geese |
  | Let’s start a new manual about building a treehouse | nothing |
  | Which one should I read first? · Can you walk me through it? · How long will this take? · Tell me about your rescue dog · Start a manual about planning a wedding · What do I have? | nothing |

---

## The librarian panel (1024px and up)

`<aside aria-labelledby="librarian-title">`, a grid of three rows: header, conversation (`1fr`,
scrolls), composer.

### Header

`LibrarianHead`: one line, `--text-ui` wdth 85, padding 20px `--panel-pad` 12px `--panel-gutter`
(aligned with the conversation's text). `Librarian` (`<h2 id="librarian-title">`, 600
`--ink-strong`), a `·`, then **what the librarian is doing**, in the same words as the phone dock:
- empty: `Try asking`;
- idle: `6 messages` (`--ink-muted`);
- thinking: `StatusRing status="writing"` + `Thinking…` in `--cue`;
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
  announces `Thinking`, then the whole reply once it's complete.
- **Your message:** plain text (`white-space: pre-wrap`), `--text-reply` (16/24) `--ink-strong`,
  set like the reader's spoken-line blockquote: a 2px `--rule-strong` rule on its left, 12px
  padding. A visually hidden `You:` starts it.
- **The librarian's reply:** `ReplyMarkdown` with `className="reply"`, flush with the conversation's
  text edge, in `--ink`. No box, no fill, no name; a visually hidden `Librarian:` starts it. The
  difference between the speakers is typographic: your lines are quoted, the librarian's are prose.
- **Spacing:** 12px from your message to its reply; 32px from a reply to your next message.
- **The named-manual line**, 8px under your message when it names manuals: `--text-ui` wdth 85,
  `In your library:` in `--ink-faint`, then each title as a `.link`-styled `<button>`. Activating
  it scrolls the row into view if it isn't (instant), focuses the row's title link, and flashes
  the row `--cue-tint`, fading over `--dur-target` (the reader's target highlight). Hovering or
  focusing it gives the row `--ground-hover`. Names are matched against the library as it is now,
  so a manual you delete drops out of the line.

### Thinking, streaming and the settle: the write head

The reader's signature, brought into the panel, so a reply arrives the same way a section does.

- **Thinking** (`status === "thinking"`): one line, 12px under your message, exactly one reply line
  tall (24px): a `--lamp` square `--cue` lamp that breathes (`breathe`, `--dur-breathe`) on a
  `--head-width` cue bar, both `--head-offset` left of the text edge; beside them `Thinking…`,
  `--text-micro` mono `--cue`. It fades in over `--dur-base`.
- **Streaming:** the first chunk replaces the thinking line in the same place, so the first words
  land where the lamp was. The bar moves to the reply's live block (`.reply[data-live] >
  :last-child::after`): `--head-width` wide, `--cue`, inset 4px top and bottom, growing with the
  paragraph or list as it fills; each new block's bar draws in with `scaleY(0 → 1)`, origin top,
  `--dur-quick`. The lamp (`::before`) sits at the bar's foot, level with the line being written.
  Chunks themselves just appear, with no fade or typewriter effect. Only the last message gets
  `data-live`.
- **The settle** (streaming → idle): the bar retracts (`scaleY(1 → 0)`, origin bottom,
  `--dur-settle` `--ease-in-out`) and the lamp goes out. Green leaves the panel.
- Replies use ordinary wrapping, never `pretty` (`ReplyMarkdown` handles this), so lines already
  written never re-flow.

### Scrolling: newest in view, never pulled down

- **On load** with a conversation (the URL options) the conversation starts scrolled to the bottom.
- **After you send**, it scrolls to the bottom, always (instant), so your message and the thinking
  line are in view.
- **While a reply streams**, it follows only if you were at the bottom: within 24px of it when
  the chunk arrived. If you've scrolled up, nothing moves. Growth only ever happens at the bottom.
- **How:** a `ResizeObserver` on the conversation's content and on the scroll region: if the
  region was at the bottom before the growth, it stays at the bottom. This also covers the font
  swap and the field growing. "At the bottom" is set by scrolling (within 24px of the end), lost
  only by scrolling *up* past that, so a programmatic scroll racing a new chunk never counts as
  scrolling away.
- **Newest ↓.** While you're more than 24px from the bottom, the composer's readout slot (below)
  becomes a `.text-button` `Newest ↓`, or `Replying ↓` with a breathing lamp while a reply streams.
  It jumps to the bottom (instant) and resumes following. It lives in a fixed slot, never floating
  over the text.

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
  `--radius-m`).
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

- `Ask about your manuals` `--text-h3` 600 `--ink-strong`; 8px; `It can talk you through
  starting, opening and deleting manuals. For now it explains rather than acts.` `--text-ui`
  `--ink-muted`, `pretty`.
- 24px; `Try asking`, `--text-micro` Sans 600 `--ink-muted`; 8px; up to four **cues**, each a
  `<button>` row: `--text-ui` `--ink`, in curly quotes, padding 8px 12px pulled left by 12px so the
  text aligns, `--radius-m`, hover `--ground-hover` and `--ink-strong`. Drawn from the library:
  1. “Let’s start a new manual about…” (loads exactly `Let’s start a new manual about `)
  2. “What do I have?”
  3. “Open *{most recently opened title}*” (omitted when the library is empty)
  4. “How do I delete a manual?”
- **A cue loads, it doesn't send.** It replaces the draft (you chose that line), focuses the
  field with the caret at the end, and flashes the field `--cue-tint` over `--dur-target`. Enter is the GO. Because the text is now the draft, cue 3 marks its manual on
  the shelf at once.

---

## The agent on phone (below 1024)

The phone can't show both, so the composer stays and the conversation folds into a sheet.

### The dock (always visible)

Fixed to the bottom, full width, `--ground-side`, 1px `--rule` line on top, padding 8px 16px plus
`env(safe-area-inset-bottom)`. Two rows:

1. **The conversation toggle**, a full-width button, 44px tall (`aria-expanded`,
   `aria-controls`), `--text-ui` wdth 85. Right: `Show ↑` / `Hide ↓` in `--ink-muted`. Left: it
   names the half you'd go to.
   - Sheet closed: `Librarian` (600 `--ink-strong`) and the same status as the panel header
     (`· Try asking`, `· 6 messages`, `· ◉ Thinking…`, `· ◉ Replying…`).
   - Sheet open: `Library · 7 manuals` (`No manuals`, `1 manual`), `aria-hidden`, so the button's
     accessible name is "Hide" with `aria-expanded`. The live status is already in the sheet's
     own header, so it isn't said twice.
2. **The composer:** the same field and Send, side by side: the field one line tall (44px), growing
   to four lines; Send 44 × 44 to its right. No readout slot (there's no `/` on touch).

At 768–1023 the dock's content is capped at 720px and aligned with the library's gutter.

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
  (`Replying ↓` with the lamp while a reply streams) appears in a slot at the sheet's foot.
- **Where focus goes when it opens** (`focusOnOpen`; `Sheet` always moves focus, and a `null`
  would fall back to the first focusable element):
  - after a send: the dock's field, so the keyboard stays up;
  - from the toggle: the conversation's scroll region;
  - on the automatic open at load: the sheet element itself, which isn't focusable, so nothing
    takes focus and no ring appears.
- It **opens by itself** when you send, so your message and the thinking line are in view, and
  **on load when the conversation isn't empty** (the URL options), so the newest message is in
  view. That second case applies only to a page that loads narrow and has never been wide:
  narrowing a desktop window with a conversation shows the library, not a sheet popping open. The
  scrolling rules are the panel's.
- It rises with the `Sheet`'s fade, overridden to `translateY(8px → 0)` because it comes from
  below.
- A named-manual link closes the sheet first, then jumps to the row.

One `Conversation` component renders in the panel at 1024px and up and in the sheet below; one
`Composer` renders in the panel or the dock. A `matchMedia("(min-width: 1024px)")` hook picks.

---

## Direct controls

| Action | Control | Result |
| --- | --- | --- |
| Open a manual | The row (its title link, stretched) | Goes to `/read` |
| Delete a manual | The row's **Delete** | Opens the confirmation |
| Start a new manual | **Start a new manual ›** in the head | Fills the field with exactly `Let’s start a new manual about ` (caret at the end), focuses it and flashes it `--cue-tint`. **An existing draft is kept**: it only focuses and flashes the field. On phone the sheet stays closed: the field is in the dock |
| Ask the librarian | The field; `/`; the cues | As above |

Every one is a single click, tap or keystroke, at every width.

### The delete confirmation

A true modal, anchored to the row it deletes, so you see exactly what's going.

- **The modal:** a `Sheet` with `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` on
  its title and `aria-describedby` on its text. The page wrapper (library and panel, or dock) gets
  `inert`. A **scrim**: a fixed, full-viewport element in `--ground` at `opacity: 0.8` (flat, no
  blur), fading over `--dur-base`; clicking it keeps the manual. The row being deleted is lifted
  above the scrim (`position: relative; z-index` over the scrim's), still inert, still lit:
  everything else dims around it.
- **Placement at 768px and up:** 8px below the row, or 8px above it if it doesn't fit below; its
  right edge on the row's right edge, and its left edge placed so its text starts on the
  **Written** column's line (at least 360px wide). It is measured once on open; page scroll is
  locked while it's open (`html:has(.library-a .confirm[data-open])`). `--ground-raised`, 1px
  `--rule-strong` border, `--radius-m`, padding 16px 20px, no shadow.
- **Stacking:** the lifted row's ancestors (`.page`, `main`, the ledger) create no stacking
  context (no transform, opacity, filter, contain or isolation), so the row's `z-index` can rise
  above the scrim's.
- **Phone placement (below 768px):** fixed to the bottom edge, full width, over the dock; a 1px `--rule-strong`
  top line, padding 20px 16px plus the safe-area inset; it rises (`translateY(8px → 0)`).
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
- **After Delete manual:** the row collapses (height, padding, margin and opacity to 0 with the
  Web Animations API, timed by `--dur-base` and `--ease-in-out` read from the tokens, so reduced
  motion makes it instant), then `deleteManual(id)`, and the rows below close up.
  Focus moves to the next row's title link, else the previous row's, else **Start a new manual ›**.
  A polite live region says `Deleted The Birthday Party Field Manual.` The librarian says nothing:
  it didn't do it.

---

## The empty library

The page keeps its structure; the empty shelf becomes an invitation.

- Head: `Library`, meta `No manuals`, **Start a new manual ›** in its usual place.
- No column header: a sort arrow over nothing is noise. Under the head's `--rule-strong` line, one
  sentence, `--text-lead` `--ink-muted`, capped at `--measure`: `Your library is empty. Start a new
  manual, or ask the librarian.`
  - Both phrases are `.link` buttons in `--ink-strong`. **Start a new manual** uses the head's
    handler; **ask the librarian** focuses the field (and flashes it), as `/` does.
  - Then the closing `--rule` line. On phone, the same.
- No illustration, no icon, nothing centred.
- The panel's cues drop the "Open …" cue: “Let’s start a new manual about…”, “What do I have?”,
  “How do I delete a manual?”.

## The fallback reply

It is a reply like any other: prose, the same write head, the same settle. No error color, no
warning glyph, because it isn't an error; the librarian's words ("I can’t do that yet, I’m
afraid…") carry it. If your message named a manual ("…about geese"), the shelf mark and the
named-manual line still appear, so even an unanswered question shows what it was about.

---

## Keyboard

- **`/` focuses the field** from anywhere: on desktop the panel's field, below 1024px the dock's.
  It is ignored with Ctrl, Meta or Alt, while typing in a field, and while the confirmation is
  open; it calls `preventDefault` so no `/` is typed. The readout shows the hint while the field
  isn't focused.
- **First Tab stop:** a skip link, `Skip to the librarian`, shown on focus at the top left
  (`--text-ui` 500 on `--ground-raised`, as in the reader). It focuses the field. (On desktop with
  a mouse the field already has focus on load.)
- **DOM order:** skip link → library head (Start a new manual) → ledger (each row: title link,
  Delete) → panel (conversation: named-manual links and cues; then the field, then Send). On
  phone: library → dock (toggle, field, Send) → sheet.
- Enter sends, Shift+Enter is a new line. Escape closes the phone sheet (focus returns to its
  toggle) or the confirmation (focus returns to that row's Delete).
- Focus ring everywhere: `--focus-ring` at `--focus-offset`, with the control's own radius; the
  conversation and sheet use the negative offset where their scroll would clip it.

## Motion

| What | Motion | Reduced motion |
| --- | --- | --- |
| Hover colors (only under `(hover: hover)`, so nothing sticks after a tap on touch) | `--dur-quick` `--ease-out` | Instant (token) |
| Thinking line appearing | Fade in, `--dur-base` | Appears |
| Lamp | `breathe`, `--dur-breathe` | Steady lamp |
| Write-head bar | Draw `scaleY(0 → 1)`, `--dur-quick`; retract on settle, `--dur-settle` | Present while streaming, gone when done |
| Shelf mark | Fade, `--dur-base` | Appears and disappears |
| Row flash (named-manual jump), field flash (cue loaded) | `--cue-tint` fading over `--dur-target` | A static `--cue-tint` until focus leaves the row or field |
| Phone sheet, confirmation | `Sheet` fade and 8px rise, `--dur-base` `--ease-out` | Appear (token) |
| Scrim | Fade, `--dur-base` | Appears |
| Deleted row | Collapse, `--dur-base` `--ease-in-out` | Removed at once |
| Panel header line | Fades in, `--dur-settle` | Appears |
| Scroll jumps (Newest ↓, after send, named-manual jump) | Always instant, as in the reader | Same |

Nothing moves on first load. Under `prefers-reduced-motion: reduce` every animation above is
switched off where it is defined; all the information stays.

---

## Screenshot states

| State | 1440 × 900 | 375 × 812 |
| --- | --- | --- |
| `first-visit` | Full ledger (7 rows); panel with the intro and four cues above the field, which has focus | Head and rows; dock reading `Librarian · Try asking` |
| `typing` | Draft in the field (focus ring, hint `Enter sends…`); the Birthday Party row marked | Draft in the dock's field; the Birthday Party row marked |
| `thinking` | Your treehouse line, then the thinking lamp, at the bottom of the panel | Sheet open (conversation loaded), same, above the dock; toggle `Thinking…` |
| `streaming` | The create reply half-written: numbered list growing, bar and lamp on the live block | The same in the sheet; toggle `Replying…` |
| `conversation` | Three exchanges, scrolled to the newest; the Sourdough row marked; named-manual lines under turns 2 and 3 | Sheet open at the newest |
| `delete-confirm` | First row lit above the scrim, confirmation anchored under it on the Written column, focus on Keep it | Confirmation at the bottom edge, first row lit |
| `fallback` | Your geese line, the fallback reply settled; the Geese row marked | Sheet open on the reply |
| `empty` | Head, ledger header, the empty line; three cues | Head and the empty line; dock |

Hooks: `agent-input` on the field (one is visible at every width), `delete` on each Delete. No
openers needed.

---

## From the shared design system

**Taken from `src/ui`:**
- **Tokens:** every color (`--ground`, `--ground-side`, `--ground-raised`, `--ground-tint`,
  `--ground-hover`, `--rule`, `--rule-strong`, the four inks, `--cue`, `--cue-deep`, `--cue-tint`,
  `--selection`), the type scale (`--text-micro`, `-ui`, `-reply`, `-body`, `-h3`, `-title`),
  `--wdth-tight`, the spacing steps, `--radius-s`/`-m`, all durations and easings, `--focus-ring`,
  `--focus-offset`, `--tap`, `--ring`, `--list-indent`.
- **Components:** `ReplyMarkdown` (every reply), `Sheet` (the phone conversation as a disclosure;
  the delete confirmation as a modal), `StatusRing` (the dock's live status).
- **Classes and base:** `.ui` root, `.text-button`, `.link`, `.visually-hidden`, `:focus-visible`,
  the `breathe` keyframes.
- **Patterns** carried over from the reader: the start page's row (hover, stretched link, title
  to cue), the write head and settle, the target flash, the tonal-step column, the skip link,
  instant scroll jumps.

**New:** nothing in `src/ui`. Everything new is local to `a/` (sizes above, the section strip, the
shelf mark, the matcher). If A is chosen, the write head's `--head-width` and `--lamp` should move to
`src/ui` as shared tokens, replacing the reader's `--write-head-width` and `--write-head-lamp`
(same values), and the write-head CSS could become one shared rule.

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

In `src/library-prototypes/a/`:

- `index.tsx`: the `ui library-a` root. It owns what the library and the librarian share (the
  draft, the named manuals, the hovered row, the jump, the delete flow and focus return) and the
  two live regions; `page.css` holds the two-column page, the skip link and the narrow-width
  padding; `tokens.css` the sizes above.
- One component per file, each importing its own stylesheet: `LibraryHead`, `Ledger`, `LedgerRow`
  (styled by `ledger.css`), `SectionStrip`, `DeleteConfirmation` (with the scrim),
  `LibrarianPanel` (desktop), `PhoneAgent` (the dock and the conversation sheet),
  `LibrarianHead` (the title and status line both use, with `StatusDetail`), `NewestButton`,
  `Conversation` (the log and the thinking line), `Turn`, `Cues`, `Composer`.
- Helpers: `references.ts` (the matcher, with `references.test.ts`), `cuePrompts.ts` (the cues
  and the starter prompt), `agentSide.ts` (the props the panel and the phone dock share),
  `motion.ts` (the target flash and the row collapse), `useStickToBottom.ts`,
  `useFocusShortcut.ts`, `useMediaQuery.ts`.
- The agent's state comes from `useAgent()`; the library's from `useLibrary()`.

## Rule check

| Locked rule | Where |
| --- | --- |
| Shared visual system only; banned list; 375–1440+ | From the shared design system; Avoiding the generic; Layout |
| Input most prominent, one click/tap/keystroke away | The composer (the only well and text field, always on screen at every width); `/` |
| Keyboard shortcut focuses it | Keyboard |
| Open, delete (confirmed), start new — directly | Direct controls |
| Type and send; visible thinking; streams as markdown | The composer; Thinking, streaming and the settle |
| Replies do nothing | Concept; the links are marks and jumps only; deletes are silent in the conversation |
| Conversation stays on the page | `useAgent()`; the panel never unmounts it on desktop, the sheet only hides it on phone |
| Never pulled down when scrolled up; newest in view on load and after send | Scrolling |
| Title, subtitle, progress, last opened | The ledger |
| Delete removes it; empty state; opening goes to `/read` | Delete confirmation; The empty library; Direct controls |
| Lives in `a/`, uses only `src/ui`, `src/library`, `src/agent`, no packages; `/library/a` | Build structure |
| Scenarios 1–9 | Screenshot states |
