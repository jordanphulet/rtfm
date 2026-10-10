# Library C — The prompt book

Variant C of the library (`/library/c`): **the conversation is the page.** This spec follows the
library rules in `WORKLIST.md`, the reader's design in `DESIGN.md`, and the shared system in
`src/ui/README.md`. Where a value isn't named here, the reader's value applies.

## Concept

A stage manager runs the show from the **prompt book**: the script, with every cue and every
change written into it as it happens. The library page is that book. It is one long, scrolling
document set like a play script. Speaker names hang in a left column, the way the reader hangs its
section numbers, and the lines sit at the reading measure. The book opens on a **plate**: your
library, set as a ruled table that you can scan, open from and delete from directly. Below it the
conversation is written, line by line, as it happens. The agent's input is pinned to the bottom of
the window as **the next line of the script**, with "You" hanging beside it. So the conversation
isn't a widget on a library page. It *is* the page, and the library is its opening entry.

What sets it apart from the other two:

- **A** puts the agent in a panel beside a library page.
- **B** gives a library page a command line at the top, whose replies don't stay.
- **C** has no library page and no agent panel. There is one chronological document, where
  everything said stays in order, and the input is the document's open last line.

## Decisions at a glance

| Question | Decision | Why |
| --- | --- | --- |
| Where the conversation lives | It is the page: one document that scrolls with the window (no inner scroll box), with the input docked at the bottom | Find-in-page, Home and End, and the browser's own scrolling all work on the conversation |
| How replies look | Script lines: the speaker's name hangs in a 96px column, and the line sits at `--measure`. No bubbles and no avatars | This is the reader's hanging-label language, applied to dialogue |
| Where the library is | The opening plate of the script, 816px wide, always first. It scrolls away as the conversation grows | The conversation is the page. The library is its first entry, not a fixed panel |
| The way back to the library | **Library ↑** in the dock at every width (hidden while the library's head is in view), the "Library ↑" row at the top of the margin index at 1200px and up, and Home | It is always one click or keystroke away |
| What the extra width does at 1440 | The plate is wider than the dialogue (816 against 576), and a 240px margin index lists the conversation's entries | A table needs width and speech needs a measure. The index serves the same purpose as the reader's "On this page" |
| Thinking and streaming | The reader's instruments, scaled down: a writing ring with `Thinking…`, then the **write head** (a cue bar with a lamp at its foot) on the live reply, and a settle when it ends | It looks like the same product: green means live |
| Scrolling during a reply | **The page never moves while a reply streams.** After a send, the new exchange is placed at the top of the window, with room below it for the reply. There is no Follow: every canned reply fits that room at 1440 and at 375 | This meets "never pulls you down" by design, not with a scroll heuristic |
| Suggestions | Quoted lines you could say. They are interface copy, not agent text, and only appear while the conversation is empty | They show what to say without inventing agent output |
| Delete confirmation | A true modal: a band that rises over the dock, with a scrim and an inert page. The manual's row stays lit above the scrim | It is visually unlike a message, and it is clear which manual is meant |
| After a delete | The row collapses, and a **stage direction** is written into the script: *You deleted Negotiating With Geese.* | The book records every change, including the ones you make by hand |

## What is agent text and what is interface

The agent (`useAgent()`) supplies **only** the reply markdown. Everything else is the variant's
own UI, built from `useLibrary()` and the variant's own state.

| On the page | Source | Notes |
| --- | --- | --- |
| The library plate (head, rows, empty state) | `useLibrary()`, `formatLastOpened` | Live: it shrinks when a manual is deleted |
| Your lines | `messages` with `role: "user"` | Plain text, with the line breaks kept |
| The Librarian's lines | `messages` with `role: "agent"`, rendered by `ReplyMarkdown` | The only agent output. It never produces cards, buttons or library changes |
| The thinking readout, the write head, the dock's `Replying…` | `status` | Interface |
| Suggestions (“What can you help with?” and the others) | Fixed copy in the variant | Interface. Each one is worded to reach a real canned intent |
| Stage directions (*You deleted …*) | The variant's own module-level list | Interface. Written only by direct actions, never by a reply |
| The margin index | Derived from `messages` and the library count | Interface |

## Layout

The variant's layout sizes are set on `.library-c` in `c/tokens.css` (see "From the design
system").

| Token | Value | Use |
| --- | --- | --- |
| `--tag-col` | 96px | Hanging speaker names ("You", "Librarian") |
| `--tag-gap` | 32px | From the tag column to the text edge (the write head sits in it) |
| `--plate-width` | 816px | The library plate, the dock's input well and the suggestions |
| `--margin-width` | 240px | The margin index (the reader's `--outline-width`) |
| `--margin-gap` | 64px | From the plate to the margin index |
| `--gutter` | 32px; 16px on phone | The outer page margin below 1200px |
| `--written-col` / `--opened-col` / `--delete-col` | 128px / 104px / 72px | The plate's table columns |
| `--meter-width` | 96px; 48px on phone | The progress meter in each row |
| `--write-head-width` / `--write-head-lamp` / `--write-head-offset` | 3px / 7px / 16px (8px on phone) | The live reply's bar, its lamp, and the bar's distance left of the text edge |
| `--well-pad` / `--send-height` | 10px / 36px (12px / 44px on phone) | The input's vertical padding, and the Send button's height |
| `--well-control-inset` | Derived | Centres Send and the keycap on the input's first line |
| `--keycap-size` | 20px | The `/` key hint |
| `--reply-budget` | 440px | The room kept below a newly placed exchange at 768px and up |
| `--meta-row-height` | 28px; 32px on phone | The dock's meta row |
| `--user-name-offset` / `--reply-name-offset` | Derived (4px / 2px) | Lines the hanging names up with the first line of your line and of a reply |
| `--dock-height` | Measured by JS (ResizeObserver) | The page's bottom padding, the end spacer, and the margin index's maximum height |
| `--window-height` | `window.innerHeight`, set by JS | The end spacer and the margin index (see The end spacer) |

The dialogue (your lines and the replies) is capped at `--measure` (576px). That is about 81
characters of reply text at 16px, inside the 45–90 rule.

### Desktop, 1200px and up (designed at 1440 × 900)

```
| 1fr | tag 96 | 32 | plate 816 (dialogue 576 inside it) | 64 | margin 240 | 1fr |
1440:  outer 96 · tags 96–192 · text edge 224 · dialogue to 800 · plate to 1040 · margin 1104–1344
1920:  the same group, with 336px on each side (the leftover width goes to the outer edges)
```

- **There is no top bar.** The script starts 48px from the top.
- **Script column** (tags, then the plate or the dialogue): one page-level scroll. Every block
  starts at the text edge (x 224). Only the speaker names hang to its left.
- **Margin index:** sticky at 64px from the top. Its height is at most
  `100dvh − 64px − var(--dock-height) − 24px`, it has its own scroll, and it uses
  `overscroll-behavior: contain`.
- **Dock:** `position: fixed; inset: auto 0 0`, outside `<main>`. It spans the full viewport
  width on a `--ground-raised` band, and its inner element uses the same grid template as the page
  (one shared `.page-grid` class), so the "You" tag sits in the tag column and the well spans the
  plate width. Its height is measured (ResizeObserver) into `--dock-height`, and the page grid has
  that much bottom padding, so nothing ends up under it. `100vw` is never used, so
  `scrollbar-gutter: stable` can't cause a sideways scroll. It is the only full-width surface
  on the page, which is part of what makes the input the most prominent control.
- Vertical budget at 1440 × 900 on first visit:
  - head, 48–156;
  - the plate's column header row, at 180;
  - seven rows, ending at about 736;
  - the dock, from about 790.

  So **the whole library and the input are both on the first screen.**

### 1024–1199px

- The margin index is gone. The grid becomes `1fr | 96 | 32 | min(816px, 1fr) | 1fr`, with at
  least 32px at each outer edge.
- Everything else is as on desktop.

### 768–1023px

- **Speaker names move inline**, above each line (as on phone). There is no tag column, the gutter
  is 32px, the plate is the full width (at most 816px), and the dialogue is capped at `--measure`.
- The plate keeps its columns: at 768 the title column is about 360px.
- The suggestions stay in the dock's meta row, as at 1024px (they need about 660px; the row is 704px
  wide at 768).

### Phone, below 768px (designed at 375 × 812)

- Gutter 16. The script starts 32px from the top.
- **Head:** the H1 at `--text-title` (29/36 on phone); the meta line (it wraps); **Start a new
  manual ›** at 16/24.
- **Rows stack** (see The library plate).
- **Dialogue:** the name sits inline above each line (12/16 Sans 600 `--ink-faint`, 4px below it),
  and the text runs the full width (343px, about 48 characters).
- **Suggestions:** the first one in the dock's meta row, and the full list in the script under the
  plate, one per line, each one a 44px-tall target.
- **Dock:** full width on `--ground-raised`. It has the well with **Send** (44×44) on its right,
  then the meta row (the first suggestion or nothing on the left; the status and **Library ↑** on
  the right). Its bottom
  padding includes `env(safe-area-inset-bottom)`. Height about 102px.
- **Delete confirmation:** a bottom sheet over the dock, with the buttons stacked full width.
- No hover-only affordances: every control is visible.

## The script

The `<main>` holds, in order: the plate, the conversation (`<section aria-labelledby>`, with a
visually hidden h2 "Conversation"), and the dock. The margin index follows `<main>` in a
`<nav aria-label="In this conversation">`.

- **Library to conversation:** a 1px `--rule-strong` line across the plate width, 48px below the
  last row, and the first exchange 32px below it. At 1024px and up the rule is left out while the
  conversation is empty (the suggestions are in the dock then), so no line sits over nothing.
- **An exchange** is an `<article>` holding your line and then the Librarian's line, 12px apart.
  Exchanges are 48px apart, separated by space only, with no rules and no boxes.
- **Speaker names** (≥1024px): 14/20 600 wdth 85, right-aligned in `--tag-col`, ending 32px left of
  the text edge, and aligned to the line's first baseline:
  - "You" is `--ink-muted`.
  - "Librarian" is `--ink-faint`, and turns **`--cue` while its reply is live** (thinking or
    streaming). It settles back over `--dur-settle` `--ease-in-out`.
  - The names are real text, so a screen reader hears "You: …", "Librarian: …".
- **Your line:** `--text-body` (17/28; 16/24 on phone), weight 500, `--ink-strong`,
  `white-space: pre-wrap`, `text-wrap: pretty` (it never changes once shown). It is the "heading"
  of its exchange.
- **The Librarian's line:** `ReplyMarkdown` (16/24 `--ink`) with ordinary wrapping, capped at
  `--measure`.
- **Stage directions** (after a direct delete): 14/20 italic `--ink-muted`, with the title in roman
  `--ink`. For example: “You deleted Negotiating With Geese.”, with only “You deleted” and the
  full stop in italic. They sit at the text edge with no name: 24px below the exchange before
  them, and 8px apart from each other.
  - They are placed after the exchange in progress when the delete happened, and never inside one.
    With no exchanges yet, they go directly under the plate's rule.
  - They are kept in a module-level list in the variant, so they survive route changes, like the
    conversation, and reset on reload.
- **The end spacer:** the last exchange, together with any stage directions after it, has
  `min-height: calc(var(--window-height) − var(--dock-height) − 32px)`, so it can always be
  scrolled to the top of the window, leaving room for its reply below. `--window-height` is
  `window.innerHeight`, set from JS on load and on resize, not `100dvh`, because Chromium's
  full-page capture stretches viewport units. With no exchanges there is no spacer.

### The newest message in view

- **On load, if there are messages** (any URL option, or coming back from the reader): the last
  exchange is scrolled into place with an instant scroll. The thinking readout, or the
  half-streamed reply, is right below it.
- **Where "in place" is:**
  - At 768px and up, it is as low as still leaves `--reply-budget` (440px, more than the longest
    canned reply) above the dock: the newest exchange's group has `scroll-margin-top: max(32px,
    var(--window-height) − var(--dock-height) − var(--reply-budget))`, and only this placement
    scrolls the group (a margin-index jump scrolls the exchange itself, to 32px), so 350px from the top at 1440 × 900. The end of
    the previous exchange, or the bottom of the table on a first send, stays in view above, so
    the page never turns into an empty screen.
  - On phone it is 32px from the top, where the window is too short to keep anything above.
- **On load, placed again** on the next frame, after `document.fonts.ready`, and once on the first
  `document.fonts` `loadingdone`. Each time it reads whichever exchange is newest at that moment,
  because the page measures and the web fonts can change the height of everything above. All
  three are cancelled when the page unmounts.
- **After a send:** the same thing, instantly, in the same frame the new exchange renders: your
  new line, with room below it where the reply will land.
- In both cases focus stays where it was (in the well after a send).

### A reply never pulls you down

- **The page never scrolls on its own while a reply streams.** The send already placed the
  exchange at the top, with at least a full window of space below it, and the canned replies fit
  well inside that space at every width (the longest, *create*, is about 260px at 1440 and about
  430px at 375).
- **There is no Follow.** Every canned reply fits the room the send makes, so a Follow control
  would only add clutter to every thinking and streaming state. If a reply ever outgrows the
  window (zoomed text, a very short window), you scroll to read the rest, as with any page.
- So if you have scrolled up, nothing ever moves you down.

## Replies, thinking and streaming

The reader's states, at conversation scale:

| State | In the script | In the dock's meta row |
| --- | --- | --- |
| **Thinking** (`status: "thinking"`) | Under your line, the Librarian's line appears at once. "Librarian" is in `--cue`, and the text slot holds one 24px line: `StatusRing status="writing"` + `Thinking…` (micro mono, `--cue`), vertically centred. The write head stands beside it | Writing ring + `Replying…` (micro mono, `--cue`) |
| **Streaming** (`status: "streaming"`, last message) | The reply's first chunk replaces the readout in the same 24px line box, so nothing shifts. Text grows only at the bottom, with no fade. The write head runs down the live reply | The same |
| **Finished** | The settle: the bar retracts, the lamp goes out, and "Librarian" returns to `--ink-faint`. No green remains. A polite live region reads the whole reply once | The readout is removed. The meta row keeps its height |

**The write head** (local CSS, after the reader's):

- **Bar:** a `::before` on the live reply. It is 3px wide, `--cue`, and sits
  `--write-head-offset` left of the text edge (in the tag gap), spanning the reply's height inset
  4px at the top and bottom, so it grows as the reply does. It draws in with `scaleY(0→1)` from the
  top over `--dur-quick`. The fill is solid, with no glow.
- **Lamp:** a 7px `--cue` square at the bar's foot, level with the last line. It breathes
  (`breathe`, `--dur-breathe`) and is the live edge. **There is no text cursor glyph.**
- **Settle:** the bar runs `scaleY(1→0)` from the bottom over `--dur-settle` `--ease-in-out`, and
  the lamp goes out. The bar's pseudo-element exists in every state, so the transition can run.

**Screen readers:** two visually hidden `aria-live="polite"` regions, outside the inert page (so
they keep working while the confirmation is open), announce:

- "The librarian is thinking";
- then the full reply text once it finishes, never chunk by chunk;
- "Deleted Negotiating With Geese" after a delete.

The conversation section is not a `role="log"`, so chunks are never announced.

### The fallback reply

- It is a reply like any other, in the same type, place and settle. There is no warning color, no
  icon and no retry button.
- The canned text names what the Librarian can do, in bold. The interface adds nothing: it can't
  know it was a fallback, and it doesn't pretend to.
- The suggestions don't return, because they belong to the empty conversation.
- The screenshot shows the exchange at the top of the window, the finished reply under it, and the
  dock idle.

## The library plate

Its `<section aria-labelledby="library-title">` is always the script's first entry, with the anchor
id `library`.

### Head

| Element | Desktop | Phone |
| --- | --- | --- |
| H1 `Library` (`id="library-title"`, `tabindex="-1"`) | `--text-title` 35/40 600 `--ink-strong`, 48px from the top, 8px below | 29/36 |
| Meta: `7 manuals · 47 of 117 sections written · most recent first` | Micro mono `--ink-faint`, tabular, live. Says `1 manual` when there is one, and `No manuals` when empty; the last two parts are dropped at zero. 16px below | Each part is `nowrap`, so it only breaks at a `·` |
| **Start a new manual ›** | 17/28 600 `--ink-strong`, a 2px `--cue` underline at 0.18em (the reader's "Begin at" link), `--cue` text on hover | 16/24 |

### Rows (768px and up): a ruled table

- **Grid:** `title 1fr | Written 128px | Last opened 104px | 72px`, with 16px column gaps. At 1440
  the title column is 464px.
- **Column header row** (`aria-hidden`): `Manual`, `Written`, `Last opened` in 12/16 Sans 600
  `--ink-muted`, with 8px and then a 1px `--rule-strong` line below (the reader's table header).
- **Each row** is an `<li>` with padding 12px. Its inline margin is −12px, so the text sits
  flush with the head and the hover tint bleeds out to the sides. Rows are separated by a 1px
  `--rule` line, with no zebra striping and no boxes. The cells:
  - **Manual:** the title, 17/28 500 `--ink-strong`, a link to `/read`. Under it, the subtitle,
    14/20 wdth 85 `--ink-muted`, `text-wrap: pretty`, never truncated.
  - **Written:** `7 of 18`, 14/20 wdth 85 tabular `--ink-muted`. Then, 8px below, a **meter**:
    - a 2px line `--meter-width` long, with a `--rule` track and an `--ink-muted` fill;
    - every meter has the same length, so they compare down the column;
    - no green, because nothing is live;
    - zero reads `0 of 17` in `--ink-faint` over an empty track, and complete reads `9 of 9` with
      a full fill;
    - visually hidden: "sections written".
  - **Last opened:** `today`, `yesterday`, `3 days ago`, `Sep 21`, `Dec 28, 2025` from
    `formatLastOpened`, 14/20 wdth 85 tabular `--ink-muted`. Visually hidden: "Last opened".
  - **Delete:** a `text-button` (`data-shot="delete"`), 14/20 wdth 85 `--ink-faint`, **always
    visible**, pulled back by −8px. Its accessible name is "Delete The Haunt That Listens" (the
    title in a visually hidden span).
  - The small cells sit 4px down, so their first baselines line up with the title's.
- **Open, directly:** the title link is stretched over the whole row with `::after`. The Delete
  button sits above it (`position: relative; z-index: 1`), so the rest of the row is one target.
  - **Hover** (`.row:has(.row-link:hover)`): the row takes `--ground-tint` with `--radius-m`, and
    the title turns `--cue`, over `--dur-quick`.
  - **Focus:** the focus ring is drawn on the row (`:has(.row-link:focus-visible)`) with
    `--radius-m`, inset by the focus offset, so it never crosses the table's rules.
  - Hovering Delete doesn't tint the row: only the button turns `--ink-strong` on `--ground-tint`.
- **At 7 manuals:** one screen-height of table at 1440, scanned top to bottom by recency, with
  progress and age in aligned columns.
- **At 1 manual:** the same head, header row and a single row. The conversation rule follows 48px
  later, so the conversation and the suggestions rise into the first screen.

### Rows (phone)

- Each `<li>` has padding 12px 0, and rows are separated by a 1px `--rule` line. Inside each row:
  - the title, 16/24 500 `--ink-strong` (the link, stretched over the row);
  - the subtitle, 14/20 `--ink-muted`;
  - then 8px below, a meta line in micro mono `--ink-faint`: a 48px meter (vertically centred) ·
    `7 of 18 written · opened today`. Each half stays whole and wraps as a unit if it must.
- **Delete** sits at the right of the title line, so the meta line keeps the full width. It is
  visible, `text-button` 14/20, with its hit area padded to 44px tall without growing the row
  (negative block margins).
- On press, the row takes `--ground-tint`.

### Start a new manual (direct)

- **Start a new manual ›** puts the starter prompt `Let’s start a new manual about ` into the well when
  the well is empty. If you have already typed something, it keeps your draft and only focuses
  the well.
- On phone the link's target is at least 44px tall (negative block margins keep the layout).
- It focuses the well with the caret at the end, so you type the topic and press Enter. The dock
  is always on screen, so nothing needs to scroll.
- The prompt reaches the canned *create* reply (the keyword "new"). Creating a manual is out of
  scope, and the reply says so.

### The empty library

The plate stays, because it is still the script's opening entry. In it:

- **Head:** the H1, then the meta line `No manuals`. The head's link moves into the block below,
  and the column header row is hidden.
- **The block** (at the measure, 24px below the meta line):
  - `Nothing on the shelf.` at 17/28 500 `--ink-strong`, 8px below;
  - `Manuals you start are kept here, with how much of each is written and when you last opened
    it.` at 16/24 `--ink-muted`, 16px below;
  - **Start a new manual ›**, the same link and behavior as above.
- It has no illustration, no icon and is not centred. It is left-aligned like everything else.
- The conversation follows as usual. With an empty conversation too (`?library=empty`), the first
  screen is:
  - the head and the empty-library block;
  - the rule;
  - the suggestions (phone) or the dock's suggestions (desktop);
  - the dock.
- Deleting the last manual leads here. Focus moves to the block's **Start a new manual ›**.

## The empty conversation and suggestions

- **First visit:** under the plate there is no exchange yet. The dock is the conversation's next
  line, with "You" hanging beside the empty well and the placeholder `Ask the librarian…`.
- **Suggestions** are quoted lines you could say, set as `text-button`s with curly quotes, at 14/20
  wdth 85 `--ink-muted` (16/24 on phone), with hover `--ink-strong` on `--ground-tint`. They have
  no borders, no fill at rest and no pill shape.

| Suggestion | What it does | Reaches |
| --- | --- | --- |
| “What can you help with?” | Sends at once | *help* |
| “Which manuals haven’t I finished?” | Sends at once | *list* |
| “Let’s start a new manual about…” | Fills the starter prompt and focuses the well (the ellipsis means "finish this yourself") | *create* |

- **At 768px and up**, they sit in the dock's meta row, after a `Try` label (12/16 Sans 600
  `--ink-faint`). They show only while the conversation is empty **and** the well is empty, which
  keeps them next to where you type. When the well has text, the row shows the key hints instead.
- **On phone**, the dock's meta row shows `Try` and the first suggestion as a 44px target, and
  the full list sits in the script, under the plate's rule:
  - a `Try asking` label (12/16 Sans 600 `--ink-muted`), 8px below;
  - one suggestion per line, each at least 44px tall.
- They disappear when the first message is sent, and they don't return.

## The dock (the agent's input)

It is the most prominent control: the only full-width surface, raised and edged with a 1px
`--rule-strong` top line, on screen at every scroll position and every width, and the largest
control on the page. Its boundary is the strongest line on the page.

**Structure** (≥1024px): padding 12px at the top and bottom. Two rows:

1. **The "You" tag** in the tag column, aligned to the input's first baseline. Next to it, **the
   well** spans `--plate-width`:
   - `--ground` (an inset in the raised band), a 1px `--ink-faint` border with `--radius-s`
     (5.3:1 against the band, past the 3:1 a control's boundary needs), and hover border
     `--ink-muted`;
   - inside it, a `<textarea data-shot="agent-input" aria-label="Message the librarian">`:
     - 17/28 `--ink-strong`, padding 10px 16px;
     - the placeholder `Ask the librarian…` in `--ink-muted`;
     - one row, growing with the text up to 6 lines (168px), then scrolling inside itself;
   - at the well's right end, bottom-aligned to the last line:
     - the **`/` keycap**: 20×20, a 1px `--rule-strong` border, `--radius-s`, micro mono
       `--ink-faint`. It shows only while the well is unfocused and empty, on hover-capable
       devices at 768px and up;
     - **Send**: 36px tall, padding 0 16px, 14/20 600 wdth 85.
2. **The meta row**, 8px below. It has a **fixed height of 28px**: its contents change, its height
   doesn't, so the page never shifts. It holds:
   - on the left, the suggestions (empty conversation, empty well, and no delete notice; they
     never wrap) **or** the key hints (never wrapping)
     `Enter to send · Shift+Enter for a new line` (micro mono `--ink-faint`; hover-capable
     devices at 768px and up);
   - on the right, **the status slot** (micro mono, truncated with an ellipsis):
     - while replying: writing ring + `Replying…` in `--cue`;
     - after a direct delete: `Deleted Negotiating With Geese` in `--ink-muted`. It replaces the
       suggestions rather than sharing the row with them, and it is the part that truncates. It shows while
       the latest stage direction comes after the newest exchange, so it lasts until the next
       send (or is replaced by the next delete). This is the delete's record where your eye is,
       even when the stage direction is off screen;
   - **Library ↑** (see below).

**Send states:**

| State | Look |
| --- | --- |
| The well is empty | Disabled: `--ink-faint` on its `--ground-tint` block, so the well always reads as input plus action |
| A draft, idle | `--ink-strong` on `--ground-tint`, `--cue` text on hover |
| Replying | Disabled, as when empty. The well stays editable, so you can draft the next line. Enter does nothing, and **the draft is kept**, never cleared (`send` ignores it) |

**Focus:** the focus ring is moved, not removed. The textarea's own outline goes to the well
(`.well:has(textarea:focus-visible)`, with `--focus-ring` at `--focus-offset`), so it outlines the
whole input, Send included.

**Phone:**

- Padding 8px 16px, plus the safe area at the bottom.
- The well is the full width, with text 16/24 and padding 12px. Send is 44×44.
- There is no tag, no keycap and no hints.
- The meta row is 32px: the first suggestion on the left; the status and **Library ↑** on the
  right.

**Library ↑:** a `text-button` at every width. It scrolls the window to the top (instantly) and
focuses the H1. While the library's head is in view (an IntersectionObserver) it is hidden:
- at 1024px and up it hangs in the tag column under "You", so it is hidden with `visibility` and
  takes no row space;
- below 1024px it is the last item at the right end of the meta row, at least 44px tall (negative
  block margins keep the row's height). It is hidden with `display: none` there, so it never
  crowds the suggestions; since it sits at the right end, nothing to its left moves when it
  appears.

## The margin index (1200px and up)

A static jump list, set like the reader's "On this page", for the conversation. It never scrolls
itself: it is for jumping, and the script is short enough that "where am I" is always obvious.
The only "you are here" it shows is on the Library row.

- **Label:** `In this conversation`, 12/16 Sans 600 `--ink-muted`.
- **Rows:** 14/20 wdth 85 `--ink-muted`, over a 1px `--rule` track:
  - **`Library ↑`**, always first, with the manual count at the right (tabular, `--ink-faint`). It
    jumps to the plate and focuses the H1. It is set apart from the questions by 8px, a 1px
    `--rule` line and 8px. While the library's head is in view it is current
    (`aria-current="location"`): `--ink-strong`, with the reader's 2px `--ink-strong` bar on the
    track;
  - **one row per exchange:** your words, clamped to 2 lines with an ellipsis. While that
    exchange's reply is live, the row shows a writing `StatusRing` at its right. It jumps to the
    exchange and focuses it (`tabindex="-1"`, `scroll-margin-top: 32px`; the newest one uses the
    placement above).
- **Hover:** the row's text turns `--ink-strong` over `--dur-quick`.
- **New rows** fade in over `--dur-base` and only ever append.
- **With no exchanges:** the Library row, then the hint `Your questions appear here.` (14/20
  `--ink-faint`).
- **Stage directions** are not listed: the index is for finding things you said.

## The delete confirmation (direct)

- **Trigger:** a row's **Delete** opens it. While it is open:
  - the page behind it is `inert`: one wrapper around `<main>` and the margin index;
  - the page scroll is locked (`html:has(.library-c .confirm[data-open]) { overflow: hidden }`);
    `scrollbar-gutter: stable` keeps the text still.
- **A true modal:**
  - `Sheet` with `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` pointing at its
    title and `aria-describedby` at its text;
  - **a scrim:** a fixed, full-viewport layer of `--ground` at 72% (`color-mix`, flat, no blur).
    A click on it means "keep it".
- **Where it appears:** a band that rises from the bottom of the window **over the dock**. It is
  placed where you would have typed, but it looks nothing like a message.
  - Desktop: fixed to the bottom, the full viewport width, `--ground-raised`, with a 1px
    `--rule-strong` top line (its edge against the dimmed page). Its contents line up with the
    plate (x 224 at 1440).
  - Phone: the same band, full width, with the buttons stacked.
- **The row stays lit:**
  - the row being deleted gets `data-confirming`: `--ground-tint`, the reader's 2px `--ink-strong`
    "you are here" bar at its left edge, and a z-index above the scrim, so it shows undimmed. On
    phone the tint bleeds 12px past the gutter (negative inline margin, matching padding), so no
    text moves;
  - if the row would sit under the band, it is first scrolled (instantly) to 24px above the band's
    top.
- **Content** (padding 24px at the top and 32px at the bottom):
  - **Title:** h2, 20/28 600 `--ink-strong`, `text-wrap: balance`, for example
    `Delete “Negotiating With Geese”?`. 8px below.
  - **Text:** 16/24 `--ink-muted`, at most `--measure`. 24px below.
    - With written sections: `It leaves your library, with the 1 section written so far. This
      can’t be undone.` (plural: `the 7 sections`).
    - With none: `It leaves your library. None of its 17 sections are written yet.`
  - **Buttons**, left-aligned, 16px apart:
    - **Delete manual**: 36px tall (44px on phone), padding 0 16px, 14/20 600 wdth 85
      `--ink-strong` on `--ground-tint`, `--radius-s`, `--cue` text on hover;
    - **Keep it**: a `text-button`.
    - On phone they are stacked full width at 44px: Delete manual, then Keep it.
- **Keyboard:**
  - focus opens on **Keep it**, the safe default;
  - Tab and Shift+Tab cycle the two buttons (`Sheet`);
  - Escape, the scrim, or Keep it closes it.
- **Focus return:**
  - Keep it: focus goes back to that row's **Delete**.
  - Delete manual: focus goes to the next row's title link, or the previous row's if it was the
    last, or the empty state's **Start a new manual ›** if none are left.
- **After deleting:**
  - the row becomes `inert`, so it can't be deleted twice;
  - it collapses with the Web Animations API (its measured height → 0 and opacity 1 → 0, over
    `--dur-settle` `--ease-in-out`, read from the computed style), and the rows below rise into
    its place;
  - then `deleteManual(id)` runs;
  - the head's counts update;
  - the dock's status slot reads `Deleted Negotiating With Geese` until the next send;
  - a stage direction is written into the script, and the live region says "Deleted Negotiating
    With Geese".
- The reply to "delete …" (the canned *delete* intent) points you at this control, so the two
  agree.

## Keyboard

- **First focusable:** `Skip to the librarian` (shown on focus at the top left, 14/20 500 on
  `--ground-raised`). It focuses the well. It sits inside the page wrapper, so it is inert while
  the confirmation is open.
- **DOM order:** the skip link → the plate (Start a new manual, then each row's link and Delete) →
  the conversation (links inside replies; suggestions below 1024px) → the dock (the well, Send,
  the suggestions or Library ↑) → the margin index.
- **`/` focuses the well** from anywhere (the locked shortcut). It is ignored:
  - with a modifier key or on auto-repeat;
  - while focus is in a text field;
  - while the confirmation is open.

  The keypress is consumed, so `/` isn't typed. The keycap in the well advertises it.
- **In the well:**
  - Enter sends (ignored while composing with an IME, and while replying);
  - Shift+Enter makes a new line;
  - Escape blurs the well and keeps the draft.
- **Page:** Home, End, PageUp and PageDown move through the script natively, so Home is also the
  way back to the library.
- **Focus** uses the shared `:focus-visible` ring everywhere, with the row's own `--radius-m` on
  rows and the well's ring moved as described.
- **After a send,** focus stays in the well, ready for the next line.

## Motion

| What | Motion | Reduced motion |
| --- | --- | --- |
| Hover colors | `--dur-quick` `--ease-out` | Instant (the token is 0) |
| A new exchange | No entrance animation. It is placed at the top instantly (see The newest message in view) | Same |
| Thinking ring, lamp | `breathe`, `--dur-breathe` | A static half-size dot and a steady lamp |
| Write-head bar | `scaleY(0→1)` over `--dur-quick`; settles `scaleY(1→0)` over `--dur-settle` | Present while live, gone when finished, with no transition |
| "Librarian" tag color | `--cue` → `--ink-faint` over `--dur-settle` | Instant |
| Streamed text | No fade; chunks just appear | Same |
| Margin index rows | Fade in over `--dur-base` | Appear |
| The confirmation band | `Sheet`'s fade, with its offset overridden to `translateY(8px → 0)` (it rises, because it is anchored at the bottom), over `--dur-base` `--ease-out`. The scrim fades over `--dur-base` | Appears in place (the durations are 0) |
| A row being deleted | Collapses and fades over `--dur-settle` `--ease-in-out` | Removed at once |

Playwright's `animations: "disabled"` resets `breathe` to its first keyframe (opacity 1), so the
screenshots show a lit lamp.

## Scenarios (and their screenshots)

| # | Scenario | Desktop (1440 × 900) | Phone (375 × 812) |
| --- | --- | --- | --- |
| 1 | First visit | The head; the seven-row table; the dock with "You", the empty well, the `/` keycap, and `Try` + three suggestions; the margin index with `Library ↑ 7` current and its hint | The head and the first rows; the dock (well, Send, `Try “What can you help with?”`) |
| 2 | Typing | The well focused (ring around the well), the text `Delete the manual about birthday parties`, Send active, the key hints instead of the suggestions | The well focused, Send active |
| 3 | Thinking | The exchange placed low enough that the end of the table shows above it: your line; "Librarian" in cue with the ring + `Thinking…` and the write head; `Replying…` in the dock; the margin row live | The same, with inline names |
| 4 | Mid-stream | Half of the *create* reply (a numbered list cut mid-way), the bar running down it with the lamp at the last line | The same |
| 5 | Several turns (full page) | The plate, the rule, three exchanges in script form, the end spacer, the dock | The same, stacked |
| 6 | Delete confirmation | The scrim; the first row lit with its bar; the band with `Delete “The Haunt That Listens”?`, the text, Delete manual and Keep it | The bottom sheet with stacked buttons |
| 7 | Fallback | The exchange `Sing me a sea shanty about geese` at the top: your line, the finished fallback reply under it, the dock idle | The same |
| 8 | Empty library | The head with `No manuals`, `Nothing on the shelf.`, Start a new manual ›, the rule, the dock with the suggestions | The same, with the suggestions in the script |
| 9 | Phone | Every state above at 375 | — |

**`data-shot` hooks:**

- `agent-input` is on the textarea, which is always visible at both sizes;
- `delete` is on every row's Delete, which is always visible;
- no `-opener` hooks are needed.

## Locked rules: where each is met

| Rule | Where |
| --- | --- |
| Shared visual system, dark, the banned list, 375 to 1440+ | From the design system; Avoiding the generic; Layout |
| The input is the most prominent control, always one click, tap or keystroke away | The dock: fixed, full width, at every width and scroll position |
| A keyboard shortcut focuses it | `/` (Keyboard) |
| Open directly | The row's stretched title link → `/read` |
| Delete directly, with confirmation | Row Delete → the modal band |
| Start a new manual opens the agent with a starter prompt | **Start a new manual ›** and the third suggestion fill `Let’s start a new manual about ` and focus the well |
| Type and send; visible thinking; streams as markdown | The dock; the thinking readout; `ReplyMarkdown` with the write head |
| Replies are canned and do nothing | What is agent text and what is interface: replies produce only text |
| The conversation stays on the page | `useAgent()`'s store, plus the module-level stage directions |
| A new reply never pulls you down | The page never scrolls during a reply, at all |
| Newest message in view on load and after a send | The last exchange is placed with a reply budget below it (32px from the top on phone), with the end spacer |
| Title, subtitle, progress and last opened | The row cells |
| Delete removes it in memory; reload restores it | `deleteManual`; nothing persisted |
| Empty state | The empty library |
| Opening goes to the reader | Every row links to `/read` |
| Boundaries | Only `src/ui`, `src/library` and `src/agent` (plus React and React Router); no packages; root `ui library-c` |

## Avoiding the generic

| Chat cliché | Here |
| --- | --- |
| Bubbles, with yours on the right | A script: every line is left-aligned at the text edge, and the speaker's name hangs in the margin |
| Avatars, a bot face, sparkles | The names "You" and "Librarian" in 14/20 type. No icons at all |
| "How can I help you today?" | Placeholder `Ask the librarian…`; suggestions are concrete lines that reach real replies |
| Typing dots, a blinking ▍ | The reader's writing ring and write head: a cue bar with a lamp at the live line |
| A gradient or paper-plane send button | The word **Send**, on a `--ground-tint` block |
| Suggestion chips (pills) | Quoted lines as text buttons, with no border and no fill at rest |
| Everything in cards | The library is a ruled table, like the reader's tables. The only raised surfaces are the dock and the confirmation band, and neither has a shadow |
| An empty-state hero with an illustration | Two lines of text and a link, left-aligned |
| Per-message copy, regenerate and thumbs | None: the replies are text, and the book is the record |
| Purple or blue "AI" accent | One cue green, meaning live (thinking, streaming) or actionable (hover, focus) |

It stays in the reader's show-control language:

- hanging labels;
- tabular readouts in Plex Mono;
- hairlines with jobs (table header and rows, the plate-to-conversation rule, the well, the band's
  edge);
- the ring and the write head;
- the "you are here" bar.

## From the design system

**Taken from `src/ui`:**

- **Tokens:**
  - every color: `--ground`, `--ground-raised`, `--ground-tint`, `--rule`, `--rule-strong`, every
    ink, `--cue`, `--cue-deep`, `--selection`;
  - the type scale `--text-micro` to `--text-title`;
  - the spacing from `--space-1` to `--space-12`;
  - `--radius-s` and `--radius-m`;
  - `--dur-quick`, `--dur-base`, `--dur-settle`, `--dur-breathe`, `--ease-out`, `--ease-in-out`;
  - `--focus-ring` and `--focus-offset`, `--measure`, `--tap`, `--ring`, `--wdth-tight`.
- **Base:** `.ui`, `:focus-visible`, `.visually-hidden`, `breathe`.
- **Classes:** `.text-button` (Delete, Keep it, suggestions, Library ↑) and `.link`.
- **Components:**
  - `ReplyMarkdown`, for every reply;
  - `StatusRing` (`writing`), in the thinking readout, the dock's readout and live index rows;
  - `Sheet`, for the confirmation, made modal as its README describes;
  - `ExternalLink` (through `ReplyMarkdown`).

**New, kept in `c/`:**

- **The layout sizes** in `c/tokens.css` on `.library-c` (the table under Layout). These are page
  geometry, which the README says belongs to the page.
- **A compact write head,** reimplemented locally. The reader's version lives in `src/reader/`
  and is tied to its prose. If C is chosen, it is a candidate to move into `src/ui`.
- **One override,** under `.library-c`: the confirmation `Sheet`'s entrance offset
  (`translateY(8px)` instead of −8px), so a bottom-anchored band rises. This is allowed by the
  specificity rule.

**Nothing new is needed in `src/ui`.** There are no new colors, sizes, radii or timings.

## Build structure

The variant has one root, `<div class="ui library-c">`, and every rule is scoped under
`.library-c`. Each component has its own file, and imports its stylesheet after its `src/ui`
import.

**Components:**

- `index.tsx`: the page and its layout, and the inert wrapper while confirming;
- `LibraryPlate`: the head, the table, the empty state;
- `ManualRow`;
- `Conversation`: the exchanges, the stage directions, the end spacer;
- `Exchange`: your line and the Librarian's line, with the thinking readout and the write head;
- `Suggestions`: the quoted lines, in the dock or in the script;
- `Dock`: the well, Send, the meta row;
- `MarginIndex`;
- `DeleteConfirmation`: the `Sheet` and the scrim.

**Helpers:**

- `exchanges.ts`: pairs each question with its reply;
- `stageDirections.ts`: the module-level list;
- `jump.ts`: jumping to the library or an exchange, and focusing it;
- `usePrompt.ts`: the draft, the input's ref, and the starter prompt;
- `useDeleteFlow.ts`: the confirmation state, the row collapse and the focus moves;
- `usePageMeasures.ts`: `--dock-height` and `--window-height`;
- `useInView.ts`: whether the library's head is on screen (for Library ↑);
- `useReplyAnnouncement.ts`: the reply live region's text;
- `useSlashShortcut.ts`.

The newest-in-view placement is a small hook inside `Conversation`.

**Stylesheets:** `tokens.css` (the layout sizes), `layout.css` (the page grid shared by the page,
the dock and the confirmation, and the skip link), and one stylesheet per component.
