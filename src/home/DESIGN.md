# RTFM — the landing page's design

The landing page at `/` (`src/home/`): its rules, layout, library, librarian and states. What both
pages share, from the craft bar and the banned list to the tokens, is in
[`DESIGN.md`](../../DESIGN.md), and its rules bind this page too. Where it borrows from the
reader, the reader's version is in [`src/reader/DESIGN.md`](../reader/DESIGN.md).

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

The panel and the library gutter narrow (`--panel-width`, `--gutter`). The ledger keeps its
columns.

### Below 1024px, designed at 375

The panel becomes a **dock and a sheet** (see "The librarian on phone"). The library takes the
full width, with a **16px** gutter on phone and **32px** from 768 to 1023px, and its bottom padding
is the dock's height plus 24px, so the last row clears the dock. At 768–1023px the ledger keeps its
1024px columns; below 768px rows stack and the library starts 32px from the top.

### Landing page sizes

The landing page's own sizes are tokens in `src/home/tokens.css`, on `.home`: the panel's width
and padding (its left padding, `--panel-gutter`, is wider than its right, to leave room for the
write head) and the library's gutter (stepping down below 1280px and 768px), the ledger's widest
and its column widths (`--written-col` is the reader's `--status-col`), the section strip's ticks,
the shelf mark and the rule beside your messages, the field's border, and the dock's height and
content width. Two are derived: `--dock-field-pad` makes one line of the dock's field fill a touch
target, and `--meta-nudge` drops the ledger's readouts onto the title's first line.
`--dock-height` is the phone dock's resting height, used for the library's bottom clearance and
the rows' scroll margin.

## The library

### Head (in the library area, left-aligned)

1. **Title** `Library`, `<h1>`, `--text-title` 600 `--ink-strong`, 12px below.
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
- **Order:** by title, as the server sends them. It is the only order, so the header carries no
  sort arrow.
- **Row** (`<li>`), grid `1fr | --written-col | --action-col`, 24px column gap,
  padding 12px, `--radius-m`, 4px between rows; 8px of space above the first row and below the
  last, then a closing 1px `--rule` line.
  - **Manual cell:** title `--text-body` 500 `--ink-strong`, `text-wrap: balance`; the
    title is the row's link to `/read/<its id>`, stretched over the whole row with an `::after`, so
    the row is one click target. Subtitle `--text-ui` `--ink-muted`, `text-wrap: pretty`.
  - **Written cell:** the readout `3 of 14`, `--text-micro` mono, tabular, `--ink-muted`
    (`--ink-faint` at 0), with a visually hidden ` sections written`; 4px below, the **section
    strip**.
  - **Delete cell:** a `.text-button` `Delete` (`--text-ui`, wdth 85), `--ink-faint`, aligned to
    the first line of the title, pulled right by `--space-2` so its text, not its padded box, ends
    on the row's text edge. Accessible name `Delete The Birthday Party Field Manual`.
    `data-shot="delete"`. It sits above the stretched link (`position: relative; z-index: 1`).
- **Hover:** the row takes `--ground-hover`, the title turns `--cue` (`--dur-quick`). Hovering
  Delete gives the button its own `--ground-tint` and `--ink-strong`, and the title stays
  `--ink-strong`.
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
- Title `--text-body` 500 `--ink-strong`; subtitle `--text-ui` `--ink-muted`.
- 8px below, one meta line: the section strip, `3 of 14` (`--text-micro` mono, tabular), and
  **Delete** at the right end: `--text-ui`, `--ink-faint`, a 44 × 44 hit area (`--tap`).

### Named in the conversation (the shelf mark)

- **Which manuals:** the ones named by **the draft in the input, if it isn't blank, or else the
  latest message you sent**. So typing "Delete the manual about birthday parties" marks *The
  Birthday Party Field Manual* as you type, and the mark stays after you send. A draft is matched
  against the library as it is now; a sent message is matched once, when it is sent (see the
  named-manual line).
- **The mark:** a `--mark` `--ink-strong` bar on the row's own left edge, the row's full
  height: the reader's current-item bar. The library has no "current" row, so it stays unique.
  On phone, where rows have no side padding, it sits in the gutter, 8px left of the text. A
  visually hidden ` — named in the conversation` is added to the title link. It fades in and
  out over `--dur-base`. No tint, so "hover" stays unique, and never `--cue`.
- **Matching** (`references.ts`; its cases are pinned in `references.test.ts`): words are
  lower-cased, stop words dropped and each reduced to a base form. A manual is named when the
  message shares a title word (from 3 letters, not an `-ing` activity word) or two subtitle words
  (from 4) with it; the best match wins. A message that asks for a new manual (“start a new manual
  about…”) names none, since it describes a manual that doesn't exist.

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
- **Your message:** plain text (`white-space: pre-wrap`), `--text-reply` `--ink-strong`,
  set like the reader's spoken-line blockquote: a `--said-rule` `--rule-strong` rule on its
  left, 12px padding. A visually hidden `You:` starts it.
- **The librarian's reply:** `ReplyMarkdown` with `className="reply"`, flush with the
  conversation's text edge, in `--ink`, set in the shared `.markdown` treatment
  (`src/reader/DESIGN.md` › Markdown) at `--text-reply`. No box, no fill, no name; a visually
  hidden `Librarian:` starts it. The difference between the speakers is typographic: your lines
  are quoted, the librarian's are prose.
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

The reader's signature (`src/reader/DESIGN.md` › The write head), brought into the panel, so a
reply arrives the same way a section does. Both use the shared write head
(`src/ui/write-head.css`), set `--write-head-offset` left of the text edge.

- **Thinking** (`status === "thinking"`): one line, 12px under the last message (yours, or the
  words the librarian wrote before a tool), exactly one reply line tall (24px), a `.write-head-line` with `data-live`: the cue bar with its breathing lamp,
  and beside them the activity, `--text-micro` mono `--cue`. It fades in over `--dur-base`.
  - **The activity** starts as `Thinking…`. While the librarian runs a tool, it is that tool's
    status line (`Searching the shelves…`; `server/agent/README.md` › The librarian lists them
    all), and stays until the next words arrive. The words change in place, with no motion.
  - **Planning a manual** takes many seconds (`server/README.md` › Configuration has the measured
    time), so its line moves on as the plan does: about a second in, once the planned title has
    arrived, `Planning “Restoring a Vintage Pinball Machine”…`; if the first plan fails its
    checks, `Revising the plan…`, then `Revising “…”…`.
  - The activity is one line, here and in the header: a line too long for the panel ends in an
    ellipsis (`text-overflow`), and the live region still says it whole.
  - **Words before a tool stand until new words replace them.** The librarian sometimes writes
    before it calls a tool (“Let me check…”). Those words stay while the tool runs: they settle
    (the bar retracts, the lamp goes out) and the thinking line fades in 12px under them with the
    tool's line, so the page reads as the librarian saying what it is about to do, then doing it.
    - If the librarian writes more after the tool, the first new chunk replaces the earlier words
      in place, at once, with no motion, and the thinking line goes, as it does for any first
      chunk.
    - If it writes nothing more, the earlier words are the reply.
    - A reply with no words at all leaves no empty message: the thinking line goes at the settle,
      and the page carries out the reply's action.
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

The librarian's tools hand the page an action (when each is handed over is in
`src/librarian/README.md`). The page carries out an open or a proposed delete **when the reply is
done**, so you read what the librarian said first; a reply that fails carries nothing out. While a
confirmation is open, those actions do nothing.

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
  - **The librarian hears how it ended** (`reportDeleteOutcome` in `src/librarian/README.md`):
    nothing is said on the page, but your next message tells the librarian whether you kept the
    manual or deleted it, so asking again after Keep it opens the confirmation again. After a
    failed delete, Keep it reports nothing, since the delete may still have happened on the
    server.

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
  while a reply is in progress (thinking or streaming). It jumps to the bottom (instant) and resumes
  following. It lives in a fixed slot, never floating over the text.

### The composer: the most prominent control

At the panel's foot, padding 12px `--panel-pad` 20px, on `--ground-side`, with a 1px `--rule` line
above it (a job: it separates a scrolling log from a fixed control).

- **Focus on load:** on `(hover: hover) and (pointer: fine)` at 1024px and up, the field takes
  focus when the page loads, so the input is the clearly dominant control and you can type at
  once. Touch devices never get a keyboard they didn't ask for.
- **The field:** a `<textarea>`, `data-shot="librarian-input"`, `aria-label="Ask the librarian"`,
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
   - Sheet open: `Library · 7 manuals` (`No manuals`, `1 manual`: the library head's wording,
     from `manualCount.ts`), `aria-hidden`, so the button's accessible name is "Hide ↓" with
     `aria-expanded`. The live status is already in the sheet's own header, so it isn't said twice.
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
  view. That second case happens once per page load, on the landing page's first showing, and
  only if the page is narrow then and hasn't been wide since: narrowing a desktop window with a
  conversation shows the library, not a sheet popping open, and coming back from the reader shows
  the library too. The scrolling rules are the panel's.
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

A true modal, anchored to the row it deletes, so you see exactly what's going. The row's **Delete**
opens it, and so does the librarian when it proposes a delete ([Opening, proposing a delete, and a
new manual](#opening-proposing-a-delete-and-a-new-manual)): the same dialog, the same steps.

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
- **In a window too short for either side** (each must stay 16px from the window's edge, as in a
  phone held sideways): it sits 16px above the bottom edge and the page scrolls (instant) until
  the row ends 8px above it, with `--confirm-height` giving the library room below its last row,
  as on phone.
- **Stacking:** the lifted row's ancestors (`.page`, `main`, the ledger) create no stacking
  context (no transform, opacity, filter, contain or isolation), so the row's `z-index` can rise
  above the scrim's.
- **Phone placement (below 768px):** fixed to the bottom edge, full width, over the dock; a 1px
  `--rule-strong` top line, padding 20px 16px plus the safe-area inset; it rises
  (`translateY(8px → 0)`). If it would cover the row, the page scrolls (instant) until the row
  ends 8px above it, measured on open and again when its text changes. While it's open the
  library's bottom padding is at least its height plus 8px (`--confirm-height` on `<html>`, set
  when it is measured and removed when it closes), so even the last row can scroll clear of it.
- **Crossing 768px while it's open** (a phone turned sideways, a window resized): it takes the
  other placement at once, placed by the row from 768px up, or scrolling the row clear below.
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
  The request gives up after 10 seconds.
- **Once it's deleted** (or the server says it was already gone, a 404): the confirmation closes,
  the row collapses (height, padding, margin and opacity to 0 with the Web Animations API, timed
  by `--dur-base` and `--ease-in-out` read from the tokens, so reduced motion makes it instant),
  then `removeFromLibrary(id)`, and the rows below close up.
  Focus moves to the next row's title link, else the previous row's, in the library as it is
  once the row has collapsed (a manual created meanwhile counts; if a refresh has already left
  the deleted one out, the row now at its place, else the one before), else **Start a new
  manual ›**.
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

How the list is loaded and refreshed is in `src/library/README.md`. On the page:

- **The first load** shows nothing until the list arrives, so the ledger and the cues never
  appear half-filled.
- **Coming back** to `/` in the same page load (from the reader, say) shows the list at once, and
  counts written in the meantime appear when the background refresh lands; nothing blanks or
  jumps.
- **Where it opens:** a link to `/` (the reader's Library) opens it at the top, not at the
  reader's scroll position. Back leaves the scroll to the browser, which restores where you were.

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
- No column header, since there are no rows to label. Between a 1px `--rule-strong` line and the
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

Each state is set up by a URL option (`src/library/README.md`, `src/librarian/README.md`), a few
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

Hooks: `librarian-input` on the field (one is visible at every width), `delete` on each Delete,
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

The landing page lives in `src/home/`. It is built only on `src/ui/`, `src/library/` (the manuals)
and `src/librarian/` (the librarian), each documented in its README.

- One component per file. Each one that has styles imports its own stylesheet, named after it
  (`Composer.css` for `Composer`), except a part that only its parent renders, which its parent's
  stylesheet styles (`LedgerRow` by `Ledger.css`, `Turn` by `Conversation.css`). A shared
  stylesheet, which no one component owns, has a lowercase name: `tokens.css` holds the page's
  sizes and `page.css` the two-column page. `LibraryErrorBoundary` draws its notice with the
  library's own classes, so it imports `page.css`, `LibraryHead.css` and `Ledger.css` before its
  own `LibraryErrorBoundary.css`.
- `HomePage` owns what the library and the librarian share (the draft, the named manuals, the
  hovered row, the jump, the rows) and the two live regions; `useDeleteFlow.ts` holds the delete
  flow, `LibraryErrorBoundary` the unreachable notice.
- Page actions are carried out by `HomePage` (load the library again, navigate, or open the
  confirmation). Whichever of `LibrarianPanel` and `PhoneLibrarian` is showing receives them with
  `useLibrarianActions`, and `PhoneLibrarian` closes its sheet before a proposed delete.
