# RTFM Reader — Design Rules

These rules apply to every reader design (A, B, C). **Locked** rules are non-negotiable;
everything under **Open** is where each design is expected to be different.

## Scope

- We are designing **the reader only**: one manual, whose table of contents already exists.
- No manual creation flow, no library/manual selection, no error/failure states. Happy path only.
- **Dark mode only.**
- No LLM calls. Section generation is simulated by the shared fake streamer.

## The data (locked)

Defined in `src/shared/types.ts`. Designs read it; they never change it.

```ts
interface Manual {
  id: string;
  title: string;
  subtitle: string;
  voice: string;          // writing-style brief for the (future) LLM; designs may ignore it
  chapters: Chapter[];
  appendices: Chapter[];  // same shape as chapters, lettered A, B, …
}

interface Chapter {
  id: string;
  label: string;          // "3" for chapters, "B" for appendices
  title: string;
  sections: Section[];
}

interface Section {
  id: string;
  label: string;          // "3.2" or "B.1"
  title: string;
  summary: string;        // one line, always available (it comes with the TOC)
  status: "unwritten" | "writing" | "written";
  body: string;           // markdown; only shown once the section is written or streaming
}
```

Opening an `unwritten` section switches it to `writing`. The fake streamer then plays its `body`
in, and the section becomes `written`.

## Boundaries (locked)

- A design lives entirely in `src/designs/<a|b|c>/`. **Never edit `src/shared/`, another design's
  folder, `package.json`, or any config.**
- **No new packages.** Use only what P0 installed (React, router, the shared markdown renderer,
  the curated fonts, Three.js).
- Use the shared hooks and renderer (`useManual`, `useSection`, `<Markdown>`). Style the
  renderer's output; don't fork it.
- Routes:
  - `/:design`: the manual's starting page (what it looks like is up to the design)
  - `/:design/:sectionId`: a section
- If the TOC is hidden behind a control at some width, that control carries
  `data-shot="toc-toggle"`, so the screenshot script can open it.

## Reader behavior (locked)

**Section states**
- `unwritten`, `writing` and `written` must each look clearly different, **both in the TOC and on
  the section page**.
- A section that is waiting for its first words shows its **title and summary**. Never a blank page.

**Streaming**
- Streaming text appears **in the final reading layout**, styled exactly as it will be when finished.
- **Raw markdown syntax never shows**, even mid-stream. The shared renderer handles this.
- **Nothing above the reading position moves** while text streams in.
- **The page never scrolls on its own.** If the reader is at the bottom, they can choose to follow.

**Navigation**
- Previous/next section links, crossing chapter and appendix boundaries.
- A clear "you are here" marker in the TOC.
- The TOC is **always at most one tap or click away**, at every width.
- Cross-references (`[see 4.2](section:<id>)`) work, including links to unwritten sections.

**Reading comfort**
- Body text line length of **45–90 characters**. Body text size **at least 16px**.
- **Body text is real HTML text.** It is never drawn with Canvas or WebGL, and it can always be
  selected, searched with find-in-page, and zoomed.

**Baseline quality**
- Works from **375px to 1440px** wide, with no horizontal page scroll.
- TOC and prev/next work from the keyboard, with a visible focus state.
- Text contrast meets **WCAG AA**.
- **`prefers-reduced-motion`** is respected: every animation has a calm fallback.

## Markdown every design must style

The sample manual uses all of these, and every one needs a deliberate treatment:

H2–H4 headings · paragraphs · **bold** / *italic* · bulleted, numbered and nested lists ·
checklists · blockquotes · tables · code blocks · inline code · horizontal rules · footnotes ·
external links · cross-references to written **and unwritten** sections.

## Craft requirements (locked)

**Process**
- Write `src/designs/<x>/SPEC.md` **before any code**: typefaces, type scale, spacing scale,
  palette, layout at desktop and phone width, how each section state looks, the signature moment,
  and a one-line reason for each choice. The orchestrator reviews it before the build starts.
- **Look at your own work.** Run `npm run shot -- <x>` and actually examine the screenshots.
  Go through build → screenshot → critique → fix **at least 3 times** before reporting done, and
  log each pass in `src/designs/<x>/NOTES.md`.

**System**
- All colors, type sizes, spacing, radii and timings are tokens defined in **one place** per design.
- Use a modular type scale and a **4px or 8px** spacing grid.
- At most **two font families**, plus a monospace font for code. Pick from the preinstalled fonts.
- The background is not pure black (`#000`), and text is not pure white (`#fff`).

**Typographic detail**
- Curly quotes and apostrophes, real en/em dashes, a real ellipsis.
- Tabular (even-width) numerals wherever numbers line up, such as section labels in the TOC.
- `text-wrap: balance` on headings and `text-wrap: pretty` on body text, so no single word is left
  alone on a line.
- Every interactive element has a clear hover state and a clear focus state.
- UI transitions are about **150–250ms**, with deliberate easing.

## Banned

These are the usual giveaways of an LLM-made interface. Don't use them.

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

## The three directions

Each direction comes with reference screenshots in `docs/inspo/<x>/`. The SPEC must name the
specific traits it is borrowing from them.

### A — Dense reference
- **References:** Linear docs, The Rust Book, Claude Platform docs.
- **Feel:** compact, fast, precise. Three columns on desktop: TOC, text, and an
  "on this page" list. Sans-serif interface.
- **Technique:** **CSS only.** It proves how far plain CSS gets us.

### B — The book
- **References:** Butterick's Practical Typography, Stripe Press, Gwern.net, Tufte CSS.
- **Feel:** a well-made printed book. Serif text, generous margins, footnotes as margin notes,
  appendices that feel like the back of a book.
- **Technique:** CSS + **SVG** for drawn details: ornaments, rules, state glyphs, footnote leader
  lines, or a TOC drawn as a diagram.

### C — Focused reader
- **References:** Claude.ai's reading and streaming view, Stripe Press's starting page.
- **Feel:** almost no visible interface. The text owns the screen and the TOC lives in a drawer.
  Streaming feels like a page quietly developing.
- **Technique:** CSS + **WebGL (Three.js)** for **one** atmospheric moment, e.g., a starting page
  with depth, or an effect around the edges while a section is being written.

## Signature moments

Each design gets **one** signature moment built with its technique. It must:

- serve reading rather than decorate,
- never sit **behind the text being read** (WebGL especially),
- turn into a calm static fallback under `prefers-reduced-motion`.
