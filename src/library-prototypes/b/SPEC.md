# Library B — The cue line

## Concept

A stage manager runs the whole show from one line: they call a cue, the booth answers, and the
stage stays in view. In variant B **the library is the page**: a dense, quiet index of your
manuals in the reader's start-page language. **The cue line**, a single prompt bar at the top, is
the only place you talk. The librarian answers in a panel that hangs from the bar, over the
library, and folds away when you turn back to the shelves. Each exchange is a **numbered cue**.
The latest is open. Earlier ones fold to one line each and reopen with a click. Typing works like
a shell: `/` takes you to the line, Enter sends, ↑ recalls what you sent, Esc puts the answer
away. **The conversation never moves the library.**

**How B differs from the other two.** A keeps the conversation permanently beside the library;
C makes the conversation the page. In B the conversation is **summoned and dismissed**: it
belongs to the input, shows one exchange at a time, and takes no space in the layout.

## Solving the hard problems

| Problem | Decision | Why |
| --- | --- | --- |
| "Replies appear briefly", but the conversation stays | Replies are **brief in prominence, never brief in lifetime**. The panel folds on Esc, on Hide, or when you click or Tab into the library, and never on a timer. Folded, a readout under the bar says `3 exchanges · Show ↓`. Focusing the bar reopens it. | A timer would take text away while you read it (WCAG 2.2.1), and the rule says the conversation stays. |
| A multi-turn conversation without letting it dominate | **The cue stack.** Exchanges are a numbered list. The latest is shown in full; each earlier one is a single line (its number and your words) that unfolds its reply on click. | Three exchanges cost about 100px instead of 700, and history reads like shell history. |
| Where a streaming reply lives | In the panel, an **overlay** anchored to the bar that grows downward over the library, up to a cap, then scrolls inside. | Nothing in the layout changes, so the library never moves: not while a reply streams, and not when the panel folds. Pushing the library would shift it with every chunk. |
| What the bar shows when empty | A `›` prompt mark, a placeholder that says what the librarian does, a `/` keycap, and under the bar a line of three suggestions. | It teaches the three things to know (what to ask, where to type, how to get back) without any onboarding. |
| The phone | The bar stays at the **top**, sticky, and the panel drops down from it, like Spotlight. The panel stops 64px short of the bottom, so the library still shows. | A bottom bar with a rising panel would be variant A's phone layout, and it would lose B's defining feature, the bar at the top of the library. |

## Layout

### Variant-local sizes (`src/library-prototypes/b/tokens.css`, on `.library-b`)

These are layout and component sizes, which `src/ui/README.md` says belong to the page. Every color, type size,
spacing step, radius and timing comes from `src/ui/tokens.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--column` | 1040px | Content width at 1280px and up |
| `--gutter` | 64px (1024px and up) · 32px (768–1023) · 16px (phone) | Page side margin (minimum) |
| `--hang` | 48px (1280px and up) · 32px (1024–1279, so the bar clears the dev switcher) · 0 below 1024 | The hanging column for the `›` mark and the cue numbers |
| `--text-inset` | `max(var(--hang), var(--space-6))` | Where text starts inside the panel and the confirmation |
| `--hairline` | 1px | The bar box also hangs out by its border, so the text inside it lands on the text edge |
| `--bar-height` | 56px (phone: the field is `--tap`, 44px) | The cue line |
| `--written-col` | 136px | Progress column |
| `--opened-col` | 144px | Last-opened column (fits `Opened Dec 28, 2025` in micro mono) |
| `--delete-col` | 64px | Delete column |
| `--meter-height` | 2px | Progress meter fill, drawn over a 1px track |
| `--meter-width-compact` | 48px | Inline meter below 1024px |
| `--panel-max` | 520px | Panel height cap (desktop) |
| `--library-peek` | 96px | The minimum library height left visible under the panel |
| `--write-head-width` | 3px | The reader's write head, reused (same values as `src/reader/tokens.css`) |
| `--write-head-lamp` | 7px | Its lamp |
| `--write-head-offset` | 28px (12px below 1024, where there's no hang column) | Its distance left of the text edge |

### Desktop, 1280px and up (designed at 1440 × 900)

One centred content column, 1040px wide (x 200–1240 at 1440). All text is left-aligned. A single
**text edge at x = 200** is shared by the bar's text, the cue text, the replies, the heading and
the manual titles. The `›` mark and the cue numbers hang to the left of it in the 48px `--hang`
column, like the reader's section labels.

```
y   48 ┌─ bar box x 152–1256 ─────────────────────────────────────────────────────────┐
       │  ›  │ Ask the librarian — open, start or remove a manual…                 [/] │  56px
   104 └─────┴───────────────────────────────────────────────────────────────────────┘
   120      Try  What do I have? · Delete the manual about geese · What can you help with?
   184      Library                                                Start a new manual
   220      7 manuals · 47 of 117 sections written
   252      ─────────────────────────────────────────────────────────────── (rule-strong)
   264      The Haunt That Listens                    7 of 18 written   Opened today   Delete
            Building haunted houses with improvising  ━━━━━━──────────
            animatronics, rooms that notice you, …
            The Birthday Party Field Manual           3 of 14 written   Opened yesterday  Delete
            …                                                         (7 rows, ends ≈ y 836)
```

- **Page:** `.library-b` has padding-top `--space-8`. The column is `min(var(--column), 100% − 2 × var(--gutter))`, centred.
- **Sticky band** (holds the bar only): `position: sticky; top: 0`, padding-block `--space-4`,
  `--ground` background, z-index above the list. When stuck it gains a 1px `--rule` bottom line
  (an IntersectionObserver sentinel sets `data-stuck`; the line fades in over `--dur-quick`). The
  bar sits at y 48 at rest and y 16 when stuck. With 7 manuals at 900px the page doesn't scroll;
  at 1024 × 768 it does, and the bar stays.
- **The bar box** spans from `--hang` left of the text edge to 16px past the column's right edge,
  so it matches the right edge of the row highlights (x 152–1256).
- **Readout line:** directly under the band (y 120), 24px tall, fixed height. Its content changes
  but its size never does (see The readout line).
- **Library head:** `--space-10` below the readout. On the left the H1 `Library`; on the right the
  `Start a new manual` button. Under the H1, `--space-1` below, the meta line. A 1px
  `--rule-strong` head rule spans the column `--space-4` below that (the reader's head rule).
  The list starts `--space-3` below the rule.
- **Rows:** `grid-template-columns: minmax(0, 1fr) var(--written-col) var(--opened-col) var(--delete-col)`,
  gap `--space-8`. The title block is 600px at 1440. Rows are separated by `--space-1` of space
  and no lines (see The library).
- **Bottom:** `--space-16` of padding, so the designed 1440 × 900 view doesn't scroll.

### 1024–1279px

The same structure, with the column at `100% − 2 × 64px` (896px at 1024, so the title block is
456px). Long subtitles wrap to two lines; nothing else changes. The hanging column still fits
(48 < 64).

### 768–1023px

- The bar stays on top. The gutter is 32px, so the `›` mark and the cue numbers no longer hang:
  they sit **inline** inside the bar's padding and before your words, as the reader's labels do
  below 1024px.
- **Rows:** areas `"main delete" / "meta meta"`. Delete moves up to the title's line, and
  progress and last-opened move to a meta line under the subtitle that spans the full width (the
  same as the phone row, below).

### Phone, below 768px (designed at 375 × 812)

```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │  sticky band, padding 8/16
│ │ ›  Ask the librarian…      Send │ │  field 44px
│ └─────────────────────────────────┘ │
│ Library            Start a new manual│  H1 --text-h2
│ 7 manuals · 47 of 117 sections …    │
│ ─────────────────────────────────── │
│ The Haunt That Listens       Delete │  title 16/24 500
│ Building haunted houses with …      │  subtitle 14/20, wraps
│ ━━──  7 of 18 written · Opened today│  meter 48px + micro mono
│ …                                   │
└─────────────────────────────────────┘
```

- **The bar stays at the top, sticky,** as on desktop. B is defined by the bar at the top of the
  library, and a panel that drops down from it works like Spotlight. The band has padding
  `--space-2` `--space-4` and a `--ground` background, and gets a 1px `--rule` bottom line once
  stuck. The field inside is `--tap` (44px) tall on `--ground-raised`, with a 1px `--rule-strong`
  border and `--radius-m`. Input text is `--text-body`, which is 16px on phone (16px also stops
  iOS zooming in on focus).
- **The page:** gutter `--space-4`. The library head starts `--space-6` below the band.
- **Head:** a grid at every width. The H1 `Library` and `Start a new manual` (a text button)
  share the first row, and the meta line spans the second.
- **Rows:** the title with **Delete** on its line at the right. Under them the subtitle, then a
  full-width meta line: a 48px meter vertically centred on the micro line, then
  `7 of 18 written · Opened today`. Even `12 of 31 written · Opened Dec 28, 2025` fits on one line
  at 375. Delete's hit area is `--tap` tall (negative block margins, so the row doesn't grow).
  Rows are `--space-2` apart, plus their own padding.

## The cue line (the bar)

The most prominent control on the page: the largest interactive text (20px), the only raised and
bordered box at rest, at the top of the page at every width, and the first stop for Tab.

- **Box:** `--ground-raised`, a 1px `--rule-strong` border, `--radius-m`, `--bar-height`. While
  the panel is open, the box's bottom corners are square and the panel continues it, so the two
  read as one instrument.
- **The `›` mark:** in the hang column, right-aligned 16px before the text edge, at `--text-lead`.
  It is `--ink-faint` at rest and `--cue` while the input has focus (`--dur-quick`): the cue light
  on standby. It is `aria-hidden`.
- **The input:** a single-line `<input type="text">` (it is a command line), `--text-lead` 20/28,
  400, `--ink-strong`; on phone `--text-body`. The placeholder is in `--ink-faint` (5.9:1):
  - desktop and tablet: `Ask the librarian — open, start or remove a manual…`
  - phone: `Ask the librarian…`
  - empty library: `Tell the librarian what your first manual should teach…` (phone: `What should your first manual teach?`)
  - It has a visually hidden label `Message the librarian`, `aria-keyshortcuts="/"`, and
    `data-shot="agent-input"`. It is always visible at both sizes, so it needs no opener.
- **Focus:** the input's own outline is removed, and the ring is drawn on the bar box instead
  (`.cue-bar:has(.cue-input:focus-visible)`: `--focus-ring` with a −1px offset, so it sits on the
  bar's own border). It is never hidden. With the panel open, the ring's bottom edge is the line
  between the bar and the panel, so the unit reads as a focused field over its answers, and no
  part of the ring is cut off by the panel.
- **The right slot** (padding-right `--space-4`). Its width is fixed, so the input never resizes:
  - **Idle, unfocused, empty, fine pointer:** a `/` keycap (see Keycap). It is `aria-hidden`.
  - **Idle, focused or with a draft:** a `Send` text button, `--text-ui` 500 at `--wdth-tight`.
    It is `--ink-strong` with a draft, and `disabled` (`--ink-faint`, no hover) without one. On
    phone and touch it is always shown, with a `--tap` hit area.
  - **Thinking:** Send is replaced by `StatusRing status="writing"` and `Thinking…` in micro mono
    `--cue`, the same words as the panel. **Streaming:** the same ring with `Replying…`. The
    words show only while the panel is folded, where they are the only status. While it is open
    (and always on phone), only the ring shows, with the words visually hidden, so `Thinking…`
    never appears twice. The input stays
    editable, so you can draft your next message, but Enter does nothing until the reply is
    finished (sends are ignored, not queued).
- **Autofocus:** on load at 1024px and up with a fine pointer, the bar takes focus, as a terminal
  does. It never autofocuses on touch, because that would open the keyboard.

### The readout line

The line directly under the bar: 24px tall, at most one line, `nowrap`. While the panel is open
it is covered, and it is made `inert` and `visibility: hidden`, so Tab never lands on a hidden
button. Its states:

| State | Content |
| --- | --- |
| No conversation, empty draft | `Try` (micro mono `--ink-faint`), then three suggestions as `.text-button`s (`--text-ui` `--wdth-tight` `--ink-muted`), separated by `·` in `--ink-faint`: **What do I have?** · **Delete the manual about geese** · **What can you help with?** (they hit the list, delete and help replies). On an empty library: **Create my first manual** · **What can you help with?** |
| Typing (draft non-empty) | `Enter to send` (micro mono `--ink-faint`) |
| The starter prompt was just inserted | `Finish the sentence, then press Enter` |
| A conversation, panel folded | `3 exchanges` (micro mono `--ink-faint`, tabular) · a **Show ↓** text button (`aria-expanded`, `aria-controls` the panel). Show opens the panel and moves focus to the bar. |
| A reply finished while the panel was folded | `New reply` (micro mono `--ink-strong`) · **Show ↓**, until it is opened |

A suggestion **fills** the bar (it never sends), focuses it, and puts the caret at the end. One
rule for every shortcut into the bar: you always press Enter yourself.

On fine pointers, the suggestions line ends with `· [/] returns you here`, because the bar is
autofocused on desktop and its own `/` keycap would otherwise never be seen on a first visit.

On phone, the readout line is reserved from the start, so the first send never moves the
library. Before any conversation it shows `Try` and the first suggestion only. All three
suggestions **drop down under the bar while it is focused**, the conversation is empty and the
draft is empty. They appear in the panel's
place, as three `--tap`-tall rows under a `Try` label. Typing hides them. The suggestion buttons
cancel `mousedown`, so focus stays in the input and the list doesn't vanish before the click
lands.

### Keycap

A small variant-local style: micro mono `--ink-faint`, a 1px `--rule-strong` border,
`--radius-s`, padding 0 `--space-1`, 20px tall. It is used for `/` in the bar and `Esc` in the
panel foot. It is only shown for `(hover: hover) and (pointer: fine)`.

## The conversation panel

### Where it is and how big

- **Desktop and tablet:** positioned absolutely inside the sticky band, so it moves with the bar.
  Its top is the bar's bottom edge and it has the same left and right edges as the bar box.
  - `--ground-raised`, a 1px `--rule-strong` border on the sides and bottom, a 1px `--rule`
    divider on top (inside the bar-and-panel unit), radius `0 0 var(--radius-m) var(--radius-m)`.
  - No shadow and no blur: the reader's preview treatment.
  - **A clean edge:** the raised body sits on a flat `--ground` mat, 16px wide on the sides and
    bottom (the panel element itself, with the raised body inside it). Wherever the panel's
    edge lands on the library, there is a band of plain ground between them. While the panel is
    open, the library's head and rows drop to 85% opacity over `--dur-base` (instant under
    reduced motion), so any rows the panel cuts read as background. The row under the pointer
    returns to full opacity, and rows stay clickable. 85% is the lowest level at which every
    text colour still passes AA on `--ground`: `--ink-faint` 4.59, `--ink-muted` 6.71, `--cue`
    6.48, `--ink` 9.50.
  - Height follows the content, up to
    `min(var(--panel-max), 100dvh − (bar bottom) − var(--library-peek))`, which is 520px at 900
    tall. Beyond that the panel scrolls inside, with `overscroll-behavior: contain`.
  - It overlays the library; the library's layout never changes.
- **Phone:** it drops from the sticky band's bottom edge, the full width of the screen.
  - `--ground-raised`, 1px `--rule-strong` lines on the top and bottom, radius 0 (like the
    reader's phone code blocks).
  - The full width keeps replies at about 48 characters; inside the 343px bar they would fall
    below the 45-character minimum.
  - Max height `calc(100dvh − band height − var(--space-16))`, so at least 64px of the library
    always shows below it. The same `--ground` mat sits under its bottom edge.
  - The bar keeps its full radius and `--rule-strong` border while the panel is open, because
    on phone the panel is a separate full-width sheet 8px below it, not attached to it.
- **Not modal.** It has no `aria-modal` and no scrim, so the dev switcher stays live.
- It is a `<section id="conversation" aria-label="Conversation with the librarian">`. When folded
  it is `inert`, with `visibility: hidden` delayed until the fold animation ends (the `Sheet`
  pattern).

### When it opens and folds

| Opens | Folds |
| --- | --- |
| The bar gains focus, or is clicked, while a conversation exists | Esc, with focus in the bar or the panel |
| A message is sent (it opens if folded) | **Hide** in the panel |
| The page mounts with a conversation (the URL options, or coming back from the reader) | A pointerdown outside the bar unit. The click that ends that same gesture is swallowed, so "click the library to put the answer away" never also opens a manual; a second click does. |
| **Show ↓** in the readout | Focus moving to an element outside them (Tab into the library, `Start a new manual`) |

That is the whole rule: one `open` boolean, two document listeners (`pointerdown` and `focusin`)
that are attached only while the panel is open, and Esc. The swallowed click is a one-shot
capture listener. It ends on that click, on `pointercancel`, or on the next `pointerdown` (registered in a microtask, after the current event), never on a timer, because a touch device's synthesized click can arrive late. A click on plain text inside the panel
(to select it) never folds it. Folding with Esc or Hide while focus is inside the panel moves
focus to the bar, so focus is never left on an inert element.

### Content: the cue stack

An `<ol>` of exchanges. An exchange is one user message plus the agent message after it (if
any). Exchanges are numbered from 1. Panel padding: `--space-4` at the top and right, with text
starting at the text edge.

- **It must read as a conversation, not an autocomplete dropdown:** crisp numbers, prose
  replies at reading size, and a clear foot. Nothing in it looks like a selectable result row.
- **Cue numbers:** in the hang column, right-aligned 16px before the text edge, `--text-reply`
  500 `--ink-muted`, tabular. They are aria-hidden: the visually hidden prefixes carry the
  structure. Below 1024px they sit inline before your words, `--space-2` apart. Labelling: a visually hidden
  `You:` before your words and `Librarian:` before each reply. There are no "You" or "Librarian"
  labels on screen, no avatars and no bubbles. Your words are set after a `›` prompt mark in
  `--ink-faint`, echoing the bar, like a shell transcript: the prompt, then the output.
- **The current exchange** (always the last; always open):
  - **Your words:** `--text-reply` 16/24 500 `--ink-strong`, `text-wrap: pretty`, capped at
    `--measure`.
  - **The reply,** `--space-3` below: `ReplyMarkdown` with `className="reply"`, capped at
    `--measure`. On phone it uses the panel's full content width (343px is about 48 characters;
    indenting it would drop below 45).
- **Earlier exchanges** (folded by default; every exchange but the last):
  - One 32px line: a `<button aria-expanded aria-controls>` running the panel's full width,
    padding `--space-1` `--space-2`, with the bleed pulled back so its text stays on the text
    edge.
  - It shows the `›` mark, then your words in `--text-reply` `--ink-muted` (up to the measure,
    with an ellipsis), then a CSS chevron (the reader's location-button chevron, in
    `--ink-faint`) that turns down when open.
  - From 1024px, the rest of the line holds a one-line excerpt of the reply in `--ink-faint`,
    with an ellipsis. History can be scanned without unfolding, and the panel's right half has
    a job. The excerpt is aria-hidden, since unfolding gives the full reply.
  - Hover: `--ground-tint`, text to `--ink-strong` (`--dur-quick`).
  - Opened, your words turn `--ink-strong` 500, wrap in full, and the reply appears under them as
    in the current exchange. Any number can be open at once.
  - Folded lines are `--space-1` apart; `--space-4` separates the stack from the current exchange
    and from any opened earlier exchange.
- **After a send,** every earlier exchange is folded again, so the new exchange always starts
  directly under a short stack.

### Thinking

When status is `thinking`, the current exchange shows your words and, `--space-2` below, a
**thinking line**: `StatusRing status="writing"` (it breathes), then `Thinking…` in micro mono
`--cue`, `letter-spacing: 0.02em`. The line is **24px tall**, exactly one reply line, so when the
first chunk replaces it nothing below changes height. The write head (below) stands beside it.
There are no typing dots.

### Streaming: the write head, reused

The reader's signature marks the live edge of a reply the same way it marks a section being
written. It is CSS only, with the reader's values in variant-local sizes:

1. **Gutter bar:** while the exchange is live (`data-live` on the current exchange), the last
   block of the reply (`.reply > :last-child`) carries an `::after`:
   - `--write-head-width` wide, `--cue`, `--write-head-offset` left of the text edge, inset 4px
     top and bottom, so it grows with the paragraph or list as it fills. Below 1024px the offset
     is 12px and the panel's text starts `--space-6` in, so the bar stays inside the panel;
   - each new block's bar draws in with `scaleY(0 → 1)`, origin top, `--dur-quick`.
   While thinking, the same bar stands beside the thinking line.
2. **Lamp:** a `--write-head-lamp` square in `--cue` at the foot of the bar, breathing
   (`breathe`, `--dur-breathe`).
3. **Settle:** when status returns to `idle`, the bar retracts (`scaleY(1 → 0)`, origin bottom,
   `--dur-settle` `--ease-in-out`) and the lamp goes out. The `::after` exists on the current
   reply's last block in every state, and only its transform changes, so the transition runs.
   Green leaves the panel.
4. Chunks appear with no fade. `ReplyMarkdown` keeps ordinary wrapping, so lines never re-flow.

### Scrolling: the newest is in view, and you are never pulled down

- **On mount with a conversation, and after every send:** the panel opens and its scroll is set
  to the bottom (instantly, in a layout effect). The current exchange is last, so the newest
  message is in view. Because the panel is an overlay, the page itself never needs to scroll.
- **While streaming:** a `ResizeObserver` on the panel's content applies one rule: *if the panel
  was at the bottom (within 8px) before the content grew, keep it at the bottom.* A scroll
  listener keeps the "at the bottom" flag current. If you have scrolled up (wheel, touch, PageUp,
  ↑, Home), the flag is off and growth **does nothing**: a new reply never pulls you back down.
  The same rule covers the font swap and the panel reaching its height cap.
- **Unfolding an earlier cue** turns the flag off first, so the reply you opened stays where you
  are looking instead of being scrolled past.
- **Latest ↓:** while you are scrolled up and there is content below, a `Latest ↓` text button
  appears at the right end of the foot (`visibility` only, so nothing shifts). It scrolls to the
  bottom and turns the flag on again.

### Panel foot

The same at every width: a 1px `--rule` top line, 40px tall, padding `--space-2`, starting at the
text edge.
- A **Hide** text button with an `Esc` keycap after it (the keycap shows on fine pointers only);
  on phone it has a `--tap` hit area.
- `↑ recalls your last message` in micro mono `--ink-faint` (fine pointers only).
- `Latest ↓` (while you are scrolled up), then **Start a new manual** at the right end. The
  open panel covers the library head, so the direct "start" control stays one click away; it
  fills the bar directly above.

### Screen readers

- A visually hidden `aria-live="polite"` region announces `The librarian is thinking.` When a
  reply finishes, it announces `Librarian:` and the full reply as plain text. It never announces
  chunks.
- The conversation panel has no live role of its own.

## The library

### A row (one manual)

Each row is an `<li>`. Its **title is the link** to `/read`; the link's `::after` stretches over
the whole row, so the whole row is clickable. **Delete** is a separate button layered above that
link. Desktop column contents:

| Part | Treatment |
| --- | --- |
| Title | `--text-body` 17/28 500 `--ink-strong`, `text-wrap: balance` |
| Subtitle | `--text-ui` 14/20 `--ink-muted`, full text (no clamp), `text-wrap: pretty` |
| Progress | `7 of 18 written` in micro mono `--ink-faint` (tabular), centred on the title's first line; `--space-2` below it the **meter**: a 1px `--rule` track the column's width with a `--meter-height` `--ink-muted` fill at `n / m` (drawn over the track with no change to layout, as in the reader's head rule). Flat, never green: progress isn't live. |
| Last opened | `today`, `3 days ago`, `Dec 28, 2025` (`formatLastOpened`), micro mono `--ink-faint`, centred on the title's first line. The word `Opened` is kept for screen readers but visually hidden in the desktop column, where position already says it (repeating it on every row made the right half one grey texture). The compact inline meta keeps `Opened` visible. |
| Delete | A `.text-button` reading `Delete`, `--text-ui` `--wdth-tight`, `--ink-faint` at rest, `--ink-muted` while the row is hovered or focused, `--ink-strong` on `--ground-tint` on its own hover. Its accessible name is `Delete <title>` (visually hidden suffix). It has `data-shot="delete"`. |

- **Row box:** padding `--space-3` `--space-4`, bleeding `--space-4` past the column on each side
  so text stays on the text edge. `--radius-m`.
- **Hover:** `--ground-hover`, and the title turns `--cue` (it is actionable), over `--dur-quick`.
- **Focus:** the ring is drawn on the row (`.row:has(.row-link:focus-visible)`, `--radius-m`) and
  the link's own ring is removed. Delete keeps its own ring.
- The link's `aria-describedby` points at the subtitle and the meta.
- The Delete button is **always visible**: one glance, one click. It stays quiet in
  `--ink-faint`, so titles still lead the eye. It isn't hidden behind hover or a menu, so it
  needs no `delete-opener`.
- **Order:** `useLibrary()` order (most recently opened first).

### At 7 manuals and at 1

- **7:** the whole list fits a 900px screen at 1440 (it ends around y 836, and the page doesn't scroll). The meta reads
  `7 manuals · 47 of 117 sections written`; the counts update live as manuals are deleted.
- **1:** one row under the head rule, then empty ground. The meta reads
  `1 manual · 7 of 18 sections written`. There is no filler, no illustration and no stretching
  of the row.

### Start a new manual (direct)

- **The control:** a `.text-button` on the right of the library head, `--text-ui` 500
  `--wdth-tight` `--ink-muted` (hover `--ink-strong` on `--ground-tint`), reading
  `Start a new manual`. In the empty state it is replaced by the empty state's link.
- **What it does:**
  - fills the bar with exactly `Let’s start a new manual about ` (with the trailing space),
    focuses the bar and puts the caret at the end. If the bar already holds a draft, it keeps
    the draft rather than overwriting it, and only focuses the bar;
  - opens the panel if there is a conversation;
  - the readout says `Finish the sentence, then press Enter`.
- It never sends by itself. Sent as it stands, it gets the create reply ("new").

### The empty state (`?library=empty`, or after the last delete)

In place of the meta and the list, under the head rule (`--space-8` below it):

- `No manuals yet`: `--text-h3` 20/28 600 `--ink-strong`.
- `--space-2` below: `Start one and it’s kept here, with how much of it is written and when you
  last opened it.` in `--text-body` `--ink-muted`, `text-wrap: pretty`, capped at `--measure`.
- `--space-6` below: **Start a new manual ›**, the reader's "Begin at 1.1 ›" link style:
  `--text-body` 600 `--ink-strong`, with a 2px `--cue` underline (cue text on hover). It behaves
  like `Start a new manual`.
- The bar's placeholder and suggestions switch to their empty-library versions (see above).
- The head's `Start a new manual` button and the meta line are hidden; the H1 stays.

## Direct controls and the delete confirmation

### Opening a manual

Click or tap anywhere on the row, or press Enter on its focused title. Both go to `/read`.

### Delete

The **Delete** button opens the confirmation, as does the **Delete** or **Backspace** key while a
manual's title link has focus.

**The confirmation appears where the page talks to you:** over the cue line.

- **Component:** `Sheet` from `src/ui`, made modal as its README requires:
  - `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` (the title),
    `aria-describedby` (the body);
  - a **scrim**: fixed, full viewport, `--ground` at 72% opacity
    (`color-mix(in srgb, var(--ground) 72%, transparent)`), flat with no blur, fading over
    `--dur-base`. Clicking it keeps the manual;
  - **`inert`** on the page wrapper: everything except the sheet and the scrim, including the
    bar. The dev switcher goes inert on its own;
  - page scroll is locked with `html:has(.library-b .confirm[data-open]) { overflow: hidden; }`,
    and `scrollbar-gutter: stable` stops the page shifting sideways.
- **Desktop and tablet:** it **is** the cue line for a moment: exactly the bar box's top, left
  edge and width, so the bar itself becomes the question.
  - Placed with CSS anchor positioning (`anchor-name: --cue-bar` on the bar; `top: anchor(top)`,
    `left: anchor(left)`, `width: anchor-size(width)`), so it lands on the bar whether or not the
    band is stuck. Without anchor support it falls back to the bar's resting geometry (y 48, the
    same column math).
  - `--ground-raised`, a 1px `--rule-strong` border, `--radius-m`. Padding `--space-5`
    `--space-6` `--space-6` `--text-inset`, so the title and **Keep it**'s text sit on the
    page's text edge (x 200 at 1440).
  - **The manual in question stays lit:** its row is raised above the scrim with `--ground-tint`,
    so you see which manual is meant, keyboard users included.
  - It drops in with the Sheet's own opacity and `translateY(−8px → 0)`: the cue line asking.
- **Phone:** fixed to the top, full width, over the cue line, the same place as on desktop.
  - A 1px `--rule-strong` bottom line; padding `--space-5` `--space-4`.
- **Content:**
  - Title (H2): `Delete “The Haunt That Listens”?` (curly quotes), `--text-h3` 20/28 600
    `--ink-strong`, `text-wrap: balance`.
  - Body, `--space-2` below, in `--text-reply` `--ink-muted`:
    - `It leaves your library, along with its 7 written sections. This can’t be undone.`
    - With 1 written: `…its 1 written section…`.
    - With none: `It leaves your library. None of its sections have been written yet.`
  - Buttons, `--space-6` below, left-aligned and `--space-2` apart:
    - **Keep it** (first): a `.text-button` at `--text-ui` 500, padding `--space-2` `--space-4`.
    - **Delete manual:** the same size, 600 `--ink-strong`, filled with `--ground-tint`, no
      border, `--radius-s`; on hover its text turns `--cue` (actionable), the convention all
      three variants share. There is no red: the palette has no second accent.
    - On phone the buttons are a `1fr 1fr` grid, each `--tap` tall.
- **Keyboard:**
  - focus starts on **Keep it** (`focusOnOpen`), so Enter is the safe answer;
  - Tab stays inside the sheet;
  - Esc or the scrim keeps the manual.
- **Focus return:**
  - **Keep:** back to the control that opened it (the Delete button, or the title link if it was
    opened with the Delete key).
  - **Delete:** to the next row's title link, or the previous row's if it was the last row, or
    the empty state's **Start a new manual ›** if the library is now empty.
- **After deleting:**
  - the row collapses (see Motion), then `deleteManual(id)` runs;
  - the meta counts update;
  - a visually hidden polite region says `Deleted “Negotiating With Geese”. 6 manuals left.`
  - The conversation is untouched: the agent never learns about it, and canned replies stay
    canned.

## The fallback reply

- A request the librarian can't handle (`Sing me a sea shanty about geese`) gets the canned
  "I can't do that yet, I'm afraid…" reply. It streams like any other reply and looks exactly
  like one: no error color, no warning icon, no different box. Nothing failed; the librarian
  declined, in its own voice, and the reply itself lists what it can do.
- Two things make rephrasing quick, and both are standard in B, not special cases:
  - the bar keeps focus after sending, and **↑ recalls the message** so you can edit it and
    resend;
  - the foot's `↑ recalls your last message` hint teaches this.
- The fallback is not detected (`src/agent` doesn't expose the intent, and matching on the reply
  text would be brittle).

## Keyboard

| Key | Where | Does |
| --- | --- | --- |
| `/` | Anywhere, except in a text field, with a modifier held, or while the confirmation is open | Focuses the bar (which opens the panel if there's a conversation). `aria-keyshortcuts="/"` on the input. **Why not ⌘K:** `/` is the web's long-standing "go to the input" key (GitHub, Gmail, YouTube), takes one keystroke with no modifier, and avoids the palette cliché and the browser's own Ctrl+K. |
| Enter | Bar | Sends (when idle and the draft isn't blank). Focus stays in the bar; the draft clears. |
| ↑ / ↓ | Bar, with an empty draft or while recalling | Steps back and forward through what you've sent, like a shell. ↓ past the newest returns to the empty draft. With a typed draft, the arrows move the caret as usual. |
| Esc | Bar or panel | Folds the panel if it is open; otherwise does nothing (it never clears the draft, which would lose your words). |
| Tab | Page | Bar → Send → the panel's contents (earlier cue lines, links in replies, Hide, Latest) when open, or the readout's buttons when folded → `Start a new manual` → each row's title, then its Delete. |
| Enter / Space | An earlier cue line | Unfolds or folds its reply. |
| Delete / Backspace | A manual's title link | Opens its delete confirmation. |
| Esc, Tab, Enter | Confirmation | Keep; Tab is contained; Enter activates the focused button (Keep it by default). |

Every interactive element has `--dur-quick` hover and the shared `:focus-visible` ring.

## Motion

| What | Motion | Reduced motion |
| --- | --- | --- |
| Panel opens and folds | Opacity 0 → 1 and `translateY(−8px → 0)` over `--dur-base` `--ease-out`: it drops from the bar at every width. It folds in reverse. | Appears and disappears at once (the duration tokens are 0ms). |
| Panel growth while streaming | None: its height follows the content, and nothing outside it moves. | Same. |
| Thinking ring, write-head lamp | `breathe` over `--dur-breathe` | A static half-size dot (StatusRing's own fallback) and a steady lamp |
| Write-head bar | `scaleY` draw-in over `--dur-quick` per block; retracts over `--dur-settle` `--ease-in-out` at the settle | On the live block while live, gone when idle, with no transition |
| An earlier cue unfolding | The chevron turns over `--dur-base`; the reply fades in (opacity) over `--dur-base` | Instant |
| `›` mark on focus, row hover, buttons | Color over `--dur-quick` | Instant |
| Sticky band line | Fades in over `--dur-quick` | Instant |
| Confirmation and scrim | The Sheet's built-in drop-in; scrim opacity over `--dur-base` | Instant |
| A deleted row | Its height, top margin and opacity go to 0 over `--dur-base` `--ease-in-out` (Web Animations, with the duration read from the token), then `deleteManual` runs, so the rows below close the gap smoothly | The token is 0ms, so it is removed at once |

There are no other animations: no shimmer, no typing dots, no spring.

## Scenarios

| # | Scenario | Desktop (1440) | Phone (375) |
| --- | --- | --- | --- |
| 1 | First visit | The bar focused (cue ring, `›` in cue), the three suggestions on the readout line, `Library` with its meta, all 7 rows. | The bar at the top, unfocused, with `Send`; the library under it. |
| 2 | Typing | `Delete the manual about birthday parties` in the bar, `Send` in `--ink-strong`, and the readout says `Enter to send`. | The same in the top bar; the suggestions hide as you type. |
| 3 | Thinking | The panel hangs from the bar: `1  Let’s start a new manual about building a treehouse`, then the thinking line with the write head. The library shows below, dimmed. The bar's slot shows only the ring (the panel says `Thinking…`). | The panel drops from the band, full width, with the same content; the library shows below it. |
| 4 | Mid-stream | The half reply in the panel, with the gutter bar on the live block and the lamp at its foot. | The same, full width. |
| 5 | Several turns | Cues `1` and `2` folded to one line each with a reply excerpt, cue `3` (the Klingon request and its fallback) open. The panel is about 250px tall; the library is visible below it. | The same stack, full width, under the bar. |
| 6 | Delete confirmation | The confirmation exactly over the cue line, the scrim over the page, the manual in question lit, focus on **Keep it**. | A full-width sheet over the bar at the top. |
| 7 | Fallback | `1  Sing me a sea shanty about geese` and the polite reply, settled (no green). The bar is focused and empty; the foot hints `↑ recalls your last message`. | The same; no ↑ hint (touch). |
| 8 | Empty library | `No manuals yet`, the line under it, **Start a new manual ›**, and the empty-library placeholder and suggestions. | The same, stacked. |
| 9 | Phone | Every state above at 375: the sticky top bar, the full-width panel dropping from it, the top confirmation, and rows with inline meta. | — |

The shot hooks are `agent-input` (always visible) and `delete` (always visible). No openers are
needed.

## Locked rules, checked

| Rule | How B meets it |
| --- | --- |
| Only the shared system, dark, banned list, craft | Every color, type size, spacing step, radius and timing is a `src/ui` token. Variant-local tokens are sizes only. IBM Plex Sans and Plex Mono only. See "Avoiding the generic". |
| 375 to 1440+, no horizontal scroll | Breakpoints at 1280, 1024 and 768; the column is `min()`-capped; the input scrolls its own text; long titles wrap. |
| Input is the most prominent control | The largest interactive text, the only raised and bordered box, first on the page and first in Tab order, and autofocused on desktop. |
| One click, tap or keystroke away | The bar is sticky at every width, so it is always on screen. `/` focuses it from anywhere. |
| Shortcut focuses it | `/` |
| Open, delete (with confirmation) and start directly | The whole row is a link; an always-visible Delete leads to a modal `alertdialog`; `Start a new manual` fills the starter prompt. |
| Thinking before the first words | The thinking line, a ring, and the write head, for 600ms |
| Streams as markdown | `ReplyMarkdown`, repaired text, with the write head on the live block |
| Replies do nothing | Nothing in B acts on a reply; the library is changed only by direct delete. |
| The conversation stays | It never folds on a timer and is never cleared. Folding only hides it, and it is one focus away. It survives a trip to the reader (the agent store). |
| Scrolled up → never pulled down | A ResizeObserver keeps the panel at the bottom only if it was there before the growth; otherwise `Latest ↓`. |
| Newest in view on load and after send | The panel opens and scrolls to the bottom on mount with messages and after each send; the page never needs to scroll. |
| Title, subtitle, progress and last opened | All four, in every row at every width. |
| Delete removes in memory | `deleteManual` after the collapse; a reload restores it. |
| Empty state | `No manuals yet` and Start a new manual. |
| Opening goes to the reader | `/read` |
| Boundaries | Everything is in `src/library-prototypes/b/`; it imports only `src/ui`, `src/library`, `src/agent`, React and React Router; no packages are added. |

## From the shared design system

**Used as is:**
- **Tokens:** every `--text-*` / `--leading-*` (`micro`, `ui`, `reply`, `body`, `lead`, `h2`,
  `h3`), `--space-1` to `--space-24`, every color token, `--radius-s` and `--radius-m`, all
  durations and both easings, `--focus-ring`, `--focus-offset`, `--measure`, `--tap`, `--ring`,
  `--wdth-tight`, `--font-sans` and `--font-mono`.
- **Base styles:** `.ui`, `:focus-visible`, `::selection`, `.visually-hidden`, and the `breathe`
  keyframes.
- **Classes:** `.text-button` and `.link`.
- **Components:**
  - `ReplyMarkdown`, for every reply;
  - `StatusRing`, for thinking and replying;
  - `Sheet`, for the delete confirmation, plus the scrim, `inert` and the ARIA it asks for.

**Nothing new is required from `src/ui`.** B keeps three small things local:
- **The write head:** the geometry and CSS, with the reader's values copied into variant sizes.
- **The tint-filled "Delete manual" button,** the convention all three variants share.
- **The keycap.**

If B is chosen, the write head (now used by the reader and the library) and the tint-filled
button should move into `src/ui`. That is the second real use the code standards ask for.

## Avoiding the generic

Command palettes have their own clichés. B avoids them as follows:

| Cliché | In B |
| --- | --- |
| A centred floating box over a blurred backdrop | The bar is part of the page: left-aligned on the page's text edge and always visible. Answers hang from it, flat and with a hairline, like the reader's previews. The only scrim is for the true modal, and it is flat. |
| ⌘K badges everywhere | One `/` keycap, shown only while the bar is unfocused and only on fine pointers. |
| Emoji or icon result rows, a sparkle "AI" mark, a magnifying glass | Every mark carries meaning: `›` (the prompt), `↑ ↓` (direction and history), the CSS chevron (folded or open), the state ring (live). No other icons. |
| Chat bubbles, avatars, "AI" labels | Numbered cues on the reader's hanging-number column, with your words in weight and the reply in prose. It reads like a cue sheet or a FAQ, not a messenger. |
| Typing dots | The reader's writing ring, `Thinking…`, and the write head. |
| Suggestion pills | Plain text buttons in a line, separated by `·`. |
| A purple or blue accent and a glowing input | One cue green, meaning only live (thinking, replying, the lamp) or actionable (focus, link hover). The focused bar shows the standard focus ring, with no glow. |
| A card grid of manuals with cover art | A dense index in the reader's start-page row language. Progress is a 2px flat meter plus a tabular readout, never a gradient bar. |
| A hero ("What would you like to read today?") | A 24px `Library` heading directly over the list. The bar's placeholder does the inviting. |

The cue-line metaphor stays in the structure (one line you call from, numbered cues, the lamp),
not in the copy. No word on screen says "cue", and nothing is theatrical except the manuals
themselves.

## Build structure (files in `src/library-prototypes/b/`)

| File | Job |
| --- | --- |
| `index.tsx` | The `ui library-b` root, the page wrapper (made `inert` while confirming), delete state, focus return and the deletion announcement |
| `tokens.css`, `page.css` | Variant sizes (`.library-b` is an inline-size container, so `--page-inline` uses `100cqi` and means the same thing on the page, the sticky band and the fixed confirmation); the page column and gutters |
| `CueLine.tsx`, `cue-line.css` | The sticky band, the bar and its slot, the open state, `/`, Esc, ↑/↓, Start a new manual (via a ref handle), and the keycap |
| `Readout.tsx` | The line under the bar and its four states |
| `Suggestions.tsx` | The suggestions: the readout line on desktop, the drop-down on phone |
| `Conversation.tsx`, `conversation.css` | The panel, the cue stack, the thinking line, the write head, the foot, Latest ↓, and the reply live region |
| `Shelf.tsx`, `shelf.css` | The library head, the meta, the list and the empty state |
| `ManualRow.tsx`, `manual-row.css` | One row, the meter, the Delete key and the collapse |
| `DeleteConfirmation.tsx`, `delete-confirmation.css` | The `Sheet`, the scrim and the copy |
| `exchanges.ts` | Messages grouped into numbered exchanges; reply text without markdown, for the live region |
| `keys.ts` | `hasModifier`: arrow and Delete shortcuts ignore modified keys and IME composition |
| `useDismissOutside.ts`, `useMediaQuery.ts`, `useSlashKey.ts`, `useStickToBottom.ts` | Light dismiss, media queries, the shortcut and the scroll rule |
