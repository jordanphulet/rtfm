# src/ui

The shared design system: the tokens, fonts, base type, focus style, the write head and the
components that aren't specific to one page. The reader (`src/reader/`, at `/read`) and the landing
page (`src/home/`, at `/`) are both built on it. The design rules, the banned list and the
reasoning behind every value are in `DESIGN.md`.

## Using it

```tsx
import { ExternalLink, ReplyMarkdown, Sheet, StatusRing } from "../../ui";

export default function Home() {
  return <div className="ui home">…</div>;
}
```

- **Import from `src/ui` (its `index.ts`).** The import also loads the fonts and every shared
  stylesheet. Import it before your own stylesheets, in every file that imports one.
- **Put `className="ui"` on your page's root element.** It sets the ground, ink and font, and every
  shared style is scoped under it (`.ui .ring`, `.ui :focus-visible`, …).
- **The specificity rule:** every shared rule is one root class plus the target (`.ui .x`). Scope
  every one of your rules under your own root class the same way (`.home .x` or `.reader .x`,
  with `className="ui home"` on the root). Your rules then match the shared ones in specificity and
  win because they load later, so you can override any shared property (a radius, a color, a
  margin) without `!important` or extra selectors. A bare `.x` in your CSS loses to `.ui .x`.
- **Use only these tokens** for color, type size, spacing, radii and timing. Don't define new
  ones in a page. Layout sizes that belong to one page (column widths, header heights) are the
  page's own, in its `tokens.css` (`src/reader/tokens.css`, `src/home/tokens.css`).
- Dark only. Desktop first, phone from 375px.

## Files

| File | What it holds |
| --- | --- |
| `index.ts` | The entry: loads `fonts.ts` and the stylesheets, exports the components |
| `fonts.ts` | IBM Plex Sans (variable: weight and width axes, roman and italic) and IBM Plex Mono (400 and 700, roman and italic) |
| `tokens.css` | Every shared token, on `:root` |
| `base.css` | The page, the `.ui` root, selection, focus, `.visually-hidden`, `.skip-link`, `.scroll-x`, the `breathe` and `target-flash` keyframes |
| `controls.css` | `.text-button`, `.link`, `.external-link` |
| `markdown.css` | `.markdown` (shared by the reader's prose and `ReplyMarkdown`) and `.reply-markdown` |
| `write-head.css` | The write head: `.write-head`, `.write-head-line`, `.write-head-lamp` |
| `StatusRing.tsx`, `status-ring.css` | The state ring |
| `Sheet.tsx`, `sheet.css` | The modal panel |
| `ExternalLink.tsx` | A link that leaves the app |
| `ReplyMarkdown.tsx` | Short markdown for the agent's replies |

## Tokens

All on `:root`, in `src/ui/tokens.css`. "Phone" means below 768px.

**What stays in each page's `tokens.css`** (on its root class): its own geometry, such as the
reader's `--toc-width`, `--header-height` and `--code-bleed`, or the landing page's
`--panel-width` and `--dock-height`. Each page also sets `--write-head-offset`, how far left of its
text the write head sits (see The write head).

### Fonts

| Token | Value | Role |
| --- | --- | --- |
| `--font-sans` | `"IBM Plex Sans Variable", system-ui, sans-serif` | Text and interface |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, monospace` | Code and readouts (status lines, counts, percentages) |
| `--wdth-tight` | `85` | Width axis for dense UI: use `font-stretch: calc(var(--wdth-tight) * 1%)` |

### Type scale

Minor third on a 17px base; line heights on the 4px grid. Weights 400, 500 and 600.

| Token | Size / line (phone) | Role |
| --- | --- | --- |
| `--text-micro` / `--leading-micro` | 12 / 16 | Status readouts and meta (Mono, `letter-spacing: 0.02em`), small labels (Sans 600) |
| `--text-ui` / `--leading-ui` | 14 / 20 | Lists, navigation, previews, secondary text (usually `--wdth-tight`) |
| `--text-reply` / `--leading-reply` | 16 / 24 | The agent's replies (`ReplyMarkdown`) |
| `--text-body` / `--leading-body` | 17 / 28 (16 / 24) | Reading text, primary row titles |
| `--text-lead` / `--leading-lead` | 20 / 28 (17 / 28) | Subtitles, summaries |
| `--text-h3` / `--leading-h3` | 20 / 28 | Small headings (600, −0.005em) |
| `--text-h2` / `--leading-h2` | 24 / 32 | Headings (600, −0.008em) |
| `--text-h1` / `--leading-h1` | 29 / 36 | Page title (600, −0.012em) |
| `--text-title` / `--leading-title` | 35 / 40 (29 / 36) | The largest title, once per page (600, −0.015em) |

`--text-reply` is 16/24 at every width, the size the reader's body text takes on a phone: replies
sit in narrower columns than the reader's text, and a short line wants tighter leading. It is the
smallest size for text people read (DESIGN.md: body text at least 16px).

### Spacing

The 4px grid: `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 ·
`--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48 · `--space-16` 64 ·
`--space-24` 96 (px).

### Color

| Token | Value | Role |
| --- | --- | --- |
| `--ground` | `#121314` | The page |
| `--ground-side` | `#17191b` | A side column; the tonal step is the divider (no border) |
| `--ground-raised` | `#1c1e20` | Code blocks, previews, raised panels |
| `--ground-tint` | `#24272a` | Current row, inline code, hover on buttons and rows |
| `--ground-hover` | `#1e2023` | Hover on a list row that can also be current (lighter than the tint) |
| `--rule` | `#2b2e31` | Quiet hairlines: row lines, tracks, header bottom line |
| `--rule-strong` | `#3c4044` | Strong hairlines: section rules, panel borders; scrollbar thumbs |
| `--ink-strong` | `#edefef` | Headings, `strong`, current items |
| `--ink` | `#d3d7d8` | Body text |
| `--ink-muted` | `#aeb4b7` | Secondary text, labels; the written ring's fill |
| `--ink-faint` | `#8c9296` | Tertiary text, numerals, meta; the unwritten ring |
| `--cue` | `#5fc48a` | The GO green. Only two meanings: live (being written, in progress) and actionable (link hover, focus) |
| `--cue-deep` | `#377d57` | Link underlines (non-text) |
| `--cue-tint` | `#15261d` | A briefly highlighted target |
| `--selection` | `#22412f` | `::selection` background |

There is no second accent, and the green never decorates.

### Radii, motion, focus and sizes

| Token | Value | Role |
| --- | --- | --- |
| `--radius-s` | 2px | Code, inline code, small buttons, the focus ring |
| `--radius-m` | 4px | Row highlights, previews, header buttons. Nothing else is rounded |
| `--dur-quick` | 150ms | Hover color |
| `--dur-base` | 200ms | Panels and previews appearing, rows arriving |
| `--dur-settle` | 250ms | State changes (a ring filling, a meter settling) |
| `--dur-breathe` | 1600ms | One cycle of the live pulse (`breathe`) |
| `--dur-target` | 1600ms | A target highlight fading out |
| `--delay-preview` | 300ms | Hover delay before a preview opens |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Things arriving |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | State changes |
| `--focus-ring` | `2px solid var(--cue)` | The focus outline |
| `--focus-offset` | 2px | Its offset (use `calc(-1 * var(--focus-offset))` inside a scroll container, so it isn't clipped) |
| `--measure` | 576px | The longest line of reading text (about 76 characters at 17px) |
| `--tap` | 44px | The smallest touch target |
| `--ring` | 10px | The state ring's diameter |
| `--write-head-width` | 3px | The write head's bar |
| `--write-head-lamp` | 7px | The write head's lamp (a square) |
| `--write-head-lamp-inset` | 2px | How far the lamp reaches past each side of the bar, so it is centred on it |
| `--list-indent` | 28px | Markdown list indent |

Under `prefers-reduced-motion: reduce`, `--dur-quick`, `--dur-base`, `--dur-settle` and
`--delay-preview` are 0ms. Switch off your own animations there too, keeping their information
(see DESIGN.md).

## Base styles

- **The page** (`html`, `body`): `--ground` background, `color-scheme: dark`, no body margin,
  `scrollbar-gutter: stable` (content never shifts when the page starts to scroll) and scrollbars
  in `--rule-strong` on a transparent track (`scrollbar-color`, inherited by every scroll
  container).
- **`.ui`** (your root): at least the viewport's height, `--ground`, `--ink`, `--font-sans`,
  kerning and antialiasing. Inside it everything is `box-sizing: border-box`.
- **Selection:** `--selection` with `--ink-strong` text.
- **Focus:** every `:focus-visible` gets `--focus-ring` at `--focus-offset`, with `--radius-s`
  corners (`.ui :focus-visible`). A control whose own rule sets `border-radius` (scoped as in the
  specificity rule) keeps that radius while focused, because your rule loads later. Don't remove
  the ring; restyle the offset only where a container would clip it.
- **`.visually-hidden`:** hidden on screen, read by screen readers (for "opens in a new tab", live
  regions, button state).
- **`.scroll-x`:** a sideways-scrolling region (code, wide content) with `overflow-x: auto` and an
  always-visible 8px scrollbar (`--rule-strong` thumb with `--radius-s` corners, transparent
  track), so clipped content reads as scrollable even where the OS hides scrollbars until you
  scroll. It is drawn with `::-webkit-scrollbar` (Chromium, Safari), which is why `.scroll-x`
  resets the page's inherited `scrollbar-color` to `auto`: Chromium ignores the webkit styling
  while a standard scrollbar property is set, and with overlay scrollbars (macOS) the standard
  properties draw nothing until you scroll. Firefox gets `scrollbar-color` instead. Don't set
  `scrollbar-width` or `scrollbar-color` on a `.scroll-x` element. Make the region focusable and
  labelled (`tabIndex={0}`, `aria-label`) so the keyboard can scroll it.
- **`breathe`:** keyframes for the live pulse (opacity 1 → 0.35 → 1). Use it as
  `animation: breathe var(--dur-breathe) var(--ease-in-out) infinite`, and turn it off under
  reduced motion.
- **`target-flash`:** keyframes for a briefly highlighted target (a `--cue-tint` background
  fading out). Use it as `animation: target-flash var(--dur-target) var(--ease-in-out)`, and under
  reduced motion replace it with a steady `--cue-tint` background while the target is current.

## Components

### `StatusRing`

A 10px ring whose shape says the state: hollow `--ink-faint` (unwritten), a `--cue` ring with a
breathing centre dot (writing, live), a solid `--ink-muted` disc (written). The dot scales up to
fill the ring when writing finishes. Decorative (`aria-hidden`): always put the state in words
next to it or in the control's label.

```ts
type RingStatus = "unwritten" | "writing" | "written";
function StatusRing(props: { status: RingStatus }): JSX.Element;
```

```tsx
<StatusRing status="writing" /> Being written
```

It is an inline-block `span.ring`; align it in your own layout (e.g. `.my-row .ring { margin-top: … }`).

### `Sheet`

A panel with a focus trap. **It is not a modal on its own** (see below). While open it moves focus
inside, keeps Tab and Shift+Tab inside its focus scope (pulling focus back in if it has left, for
example after a click on plain text), and calls `onClose` when Escape is pressed anywhere on the
page. While closed it is hidden and `inert`. It opens with opacity 0 → 1 and
`translateY(-8px → 0)` over `--dur-base` `--ease-out`, and closes the same way.

```ts
interface SheetProps extends Omit<ComponentProps<"div">, "ref"> {
  open: boolean;
  onClose: () => void;                                    // called on Escape
  focusScope?: RefObject<HTMLElement | null>;             // where Tab is contained; defaults to the sheet
  focusOnOpen?: (sheet: HTMLDivElement) => HTMLElement | null; // the element to focus on open; defaults to the first focusable
}
```

"Focusable" means links with an `href`, and buttons, inputs, textareas and selects that aren't
disabled, plus any element with a `tabindex` other than `-1`. Other props (`id`, `className`,
`role`, `aria-*`, `onClick`, …) go to the panel's `div` (class `sheet`).

```tsx
<Sheet
  id="delete-sheet"
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="delete-title"
  aria-describedby="delete-body"
  open={open}
  onClose={close}
  className="confirm"
>
  <h2 id="delete-title">Delete The Haunt That Listens?</h2>
  <p id="delete-body">It leaves your library. This can’t be undone.</p>
  <button type="button" className="text-button" onClick={close}>Keep it</button>
  <button type="button" className="text-button" onClick={confirmDelete}>Delete</button>
</Sheet>
```

What it leaves to you:

- **Making it modal.** For a confirmation or anything else that must be answered first, add all
  of these:
  - `role="alertdialog"` (or `"dialog"`), `aria-modal="true"`, and `aria-labelledby` /
    `aria-describedby` pointing at its title and text;
  - a scrim: a fixed, full-viewport element behind the sheet in `--ground` at reduced opacity
    (flat, no blur), which closes it on click if cancelling is safe;
  - `inert` on the rest of the page while it is open (e.g. on the element that wraps everything
    but the sheet), so nothing behind it can be clicked or focused.
- **Position and size.** It is a plain block with `overflow-y: auto` and a `--ground`
  background; place it in your CSS (e.g. `.home .confirm { position: fixed; inset: auto 0 0; }`).
- **The trigger.** Give it `aria-expanded` and `aria-controls` (for a disclosure-style panel), and
  in `onClose` set `open` to false and return focus to it. Use `focusScope` when the trigger
  should stay reachable by Tab while the sheet is open (the reader's header and contents sheet
  share one scope).
- **Page scroll.** It doesn't lock the page; if you need that, add
  `html:has(.home .sheet[data-open]) { overflow: hidden; }`.

### `ExternalLink`

A link that leaves the app: the `.link` underline, a small corner mark after the text, a new tab,
and a visually hidden "(opens in a new tab)". Takes every `<a>` prop; a `className` is added after
`link external-link`, and `target` and `rel` are set for you.

```tsx
<ExternalLink href="https://example.com">IBM Plex</ExternalLink>
```

### `ReplyMarkdown`

Renders one short markdown reply (the agent's) with the same treatment as the reader's prose, so a
reply reads like the manual's text.

```ts
interface ReplyMarkdownProps {
  children: string;    // the markdown
  className?: string;  // added after "markdown reply-markdown"
}
```

```tsx
<ReplyMarkdown className="reply">{message.text}</ReplyMarkdown>
```

- **Supported:** paragraphs, line breaks, **bold**, *italic*, bulleted and numbered lists
  (nested too), `inline code`, and links. `http(s)` links are `ExternalLink`s (new tab); other
  links are `.link`s in the same tab. Other markdown is flattened: headings, tables, block quotes
  and strikethrough render as their plain text, a code block as inline code, a checklist as a
  bulleted list, and images not at all. Footnotes and the reader's `section:` cross-references
  are not supported.
- **Look:** `--text-reply` (16/24) `--font-sans` in `--ink`; paragraphs and lists 16px apart;
  bold 600 `--ink-strong`; italic is Plex's true italic; inline code Plex Mono at 0.88em on
  `--ground-tint` with `--radius-s`; bulleted items marked with an en dash in `--ink-faint` hanging
  in the 28px indent (nested: `·`, 24px further); numbered markers 600 `--ink-muted` with tabular
  figures. No margin above the first block or below the last, so it sits flush in any container.
- **Streaming:** pass the repaired text as it grows (`useAgent()` repairs it). Text only ever
  appears at the end, and it uses ordinary wrapping (never `text-wrap: pretty`), so earlier lines
  never re-flow. It is memoized: finished messages don't re-render while another streams. Mark the
  live edge yourself on the last message only (put it in a `.write-head`; see The write head).
- It sets no width: cap it at `--measure` (or less) in your layout.

## The write head

The mark beside text that is being written: a `--cue` bar `--write-head-width` wide, inset
`--space-1` top and bottom, with a `--write-head-lamp` square lamp at its foot that breathes. Both
sit `--write-head-offset` left of the text edge; set that token on your page's root class. It is
plain CSS in `write-head.css`; the reader's prose and tail line, and the landing page's replies,
"Thinking…" line and "Replying ↓" button use it.

- **`.write-head`** goes on an element that holds rendered markdown (a `.markdown`, at any
  depth). The head marks the markdown's last block, not counting footnotes, and makes that block
  `position: relative`. While the element has `data-live`, the bar stands at full height (growing
  in over `--dur-quick` when a new block starts) and the lamp is lit. When `data-live` goes, the
  lamp goes out and the bar retracts downwards over `--dur-settle`.
- **`.write-head-line`** goes on a line of its own (a status line, "Thinking…"). It always has the
  bar; `data-live` adds the lamp. On a line, `data-live` means the text will be written here next
  (the reader's tail line has it until the first words arrive). It becomes `position: relative`.
- **`.write-head-lamp`** is the lamp on its own, for an element in a line of text: an inline-block
  with its size, colour and breathing. Place it yourself.

Under reduced motion the lamp is steady, and the bar appears and goes at once.

```tsx
<li className="turn-reply write-head" data-live={live || undefined}>
  <ReplyMarkdown>{message.text}</ReplyMarkdown>
</li>
<li className="thinking write-head-line" data-live>Thinking…</li>
```

To move the head for one kind of block, repeat the shared selector under your root class. The
reader shifts it right for a code block, which bleeds into the margin:

```css
.reader .write-head .prose-root > .code-block:nth-last-child(1 of :not(.footnotes))::after {
  left: calc(var(--code-bleed) - var(--write-head-offset));
}
```

## CSS classes

| Class | Use it on | What it gives |
| --- | --- | --- |
| `ui` | Your page's root | See Base styles |
| `visually-hidden` | Text for screen readers only | See Base styles |
| `scroll-x` | A sideways-scrolling region | See Base styles |
| `skip-link` | The page's first focusable element, a link past its header or navigation ("Skip to text") | Hidden above the viewport until focused by keyboard, then fixed 8px from the top left (above everything, `z-index` 40) on `--ground-raised`, 500 `--text-ui` in `--ink-strong` |
| `text-button` | A quiet `<button>` in a line of text or a readout ("Copy", "Follow ↓", "Cancel") | No border or fill; padding 4/8, `--radius-s`; inherits the font but not `letter-spacing` (add `letter-spacing: inherit` inside a Mono readout); `--ink-muted`, and on hover `--ink-strong` on `--ground-tint`. Pull it back by `calc(-1 * var(--space-2))` on the aligned side so its text lines up |
| `link` | An inline text link | The surrounding text color with a 1px `--cue-deep` underline at 0.18em; `--cue` text and underline on hover, over `--dur-quick` |
| `markdown` | A container of rendered markdown | The shared prose treatment (paragraphs, bold, inline code, lists); set its font size yourself. `ReplyMarkdown` and the reader's prose use it |
| `write-head` | An element holding markdown that is being written; add `data-live` while it is | See The write head |
| `write-head-line` | A line of its own beside text being written; `data-live` lights the lamp | See The write head |
| `write-head-lamp` | An inline lamp ("Replying ↓") | See The write head |

```tsx
<button type="button" className="text-button" onClick={cancel}>Cancel</button>
<Link to="/read" className="link">Open the reader</Link>
```
