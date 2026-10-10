# Reference screenshots

Captured by `node scripts/inspo.ts` (1440×900 desktop, 375×812 mobile, dark color scheme where the
site has one). The Claude.ai images are copies of 480-wide screenshots from a research session.

## A — Dense reference (Linear docs, The Rust Book, Claude Platform docs)

- `a/linear-docs-desktop.png`: three columns (TOC, text, "on this page"); collapsible sidebar groups with chevrons; small icon + label for the current page; right-hand list indented by heading level with a bar marking the current heading; quiet breadcrumb header.
- `a/linear-docs-mobile.png`: the phone version: sidebar and "on this page" both gone, a single menu button in a slim header, text full width with ~24px gutters.
- `a/rust-book-desktop.png`: numbered TOC ("4.1", "4.2") where the current section expands in place to list its headings behind a blue rule; huge previous/next chevrons in the side gutters; sidebar/theme/search icons in a minimal top bar.
- `a/claude-platform-docs-desktop.png`: serif headings over a sans-serif body; grouped sidebar with a filled pill for the current page; right "on this page" list with a bar on the active item; thin dividers between sections; "Copy page" control by the title.

## B — The book (Practical Typography, Stripe Press, Gwern.net, Tufte CSS)

- `b/practical-typography-desktop.png`: a left margin column holding the right-aligned chapter title, an italic summary and grey margin notes level with the paragraph they gloss; small-caps labels; a ruled box with a two-column table. Light only.
- `b/stripe-press-home-desktop.png`: books drawn in WebGL as stacked spines with real cover textures; tick-mark index down the left edge instead of a menu; tiny serif wordmark; warm near-black ground.
- `b/stripe-press-book-desktop.png`: the whole page takes the book's cover color; serif title with an italic byline; ragged-right serif body at a comfortable measure; boxed, ruled buttons; the same tick-mark index on the left.
- `b/gwern-design-desktop.png`: small-caps title centered over italic description and metadata line; boxed, deeply nested numbered TOC beside a boxed abstract; justified, hyphenated serif body; monochrome palette.
- `b/gwern-design-footnote-popup-desktop.png`: hovering a footnote number opens the note in a framed popup next to it (close/collapse/pin controls on a hatched title bar); boxed footnote marker; right-aligned small-caps section heading over a full-width rule.
- `b/tufte-css-desktop.png`: wide right margin left empty for notes; large title with italic author; ET Book serif at a narrow measure on #111.
- `b/tufte-css-sidenotes-desktop.png`: numbered sidenotes sitting in the right margin level with their reference; "newthought" small-caps paragraph openers; italic section headings.
- `b/tufte-css-figures-desktop.png`: a figure set in the text column with its caption moved into the margin beside it.

## C — Focused reader (Claude.ai streaming view, Stripe Press starting page)

- `c/stripe-press-home-desktop.png`: a starting page that is almost all atmosphere: dark ground, 3D objects with depth, interface reduced to a wordmark and a faint edge index.
- `c/claude-ai-streaming-start.jpg`: the first words of a reply arriving; the newest words fade in from transparent at the end of the line instead of a cursor; no chrome around the text.
- `c/claude-ai-streaming-later.jpg`: mid-stream, already in the final layout (bold lead-ins, numbered list); only the last line or two is still fading in; nothing above it moves.
- `c/claude-ai-finished.jpg`: the reply after streaming, overflowing the view: the page did not scroll itself and offers a small round "jump to bottom" arrow instead.
