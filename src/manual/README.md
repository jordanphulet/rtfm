# Manual runtime

Everything the app needs to read a manual: the data model, a live store that reads the manual from
the API server and streams unwritten sections from it, and the markdown renderer. The reader in
`src/reader/` is built on it. The librarian in `src/librarian/` repairs its streamed replies with
`repair.ts`, imported straight from that file (it isn't part of the API below), with
`{ formulas: false }`, since nothing renders math in a reply.

```ts
import {
  useManual, useSection, retrySection,
  findSection, chapterOf, previousSection, nextSection,
  sectionsInReadingOrder, chaptersInReadingOrder,
  type Manual, type Chapter, type Section, type FailureReason,
  type UseSectionResult, type SectionLinkProps, type MarkdownProps,
} from "../manual";
import { Markdown } from "../manual/Markdown";
```

`<Markdown>` is imported straight from its file, since it brings KaTeX: the reader loads it
lazily, in its `Prose` chunk, so KaTeX stays out of the reader's own chunk.

The data model (`Manual`, `Chapter`, `Section`) is the API's: `types.ts` re-exports it from
`server/api/types.ts` with `export type`, so nothing from `server/` reaches the bundle. It is
described in `DESIGN.md`, and the API in `server/api/README.md`. The sample manual lives in
`server/seed/`; the browser has no copy.

## Files

- `api.ts`: the API's URLs, `fetch` for the manual and a section, and the `EventSource` for a
  section's stream (closed after its first event that isn't `append`). Uses `apiFetch`
  (`src/reportErrors.ts`).
- `store.ts`: `useManual`, `useSection` and `retrySection`. It keeps each manual's state apart,
  keyed by manual id: the manual, its cached requests, section texts, opened sections, open
  streams and failures. Only the queue of streams waiting for a slot is shared, because the limit
  on open streams is the page's.
- `formula-fences.ts`: `separateFormulaFences`, which puts a formula block's `$$` on lines of
  their own, as remark-math needs them: LaTeX after an opening `$$` (`$$ f = ma`) moves to the
  next line, and LaTeX before a closing `$$` (`f = ma $$`) to the line above, keeping a
  blockquote's `>` or a list item's indent. Code blocks are left alone. A line opens a formula
  block when it starts with `$$` and has no other `$$` after it, the same rule as `repair.ts` and
  the writer's `server/writer/code-fences.ts`.
- `repair.ts`: closes or holds back unfinished markdown, so a partial text renders cleanly. It
  separates formula fences first. An unclosed formula (inline, a `$$` block or a ```` ```math ````
  fence) is held back from its opening, since half a formula can't be typeset. With
  `{ formulas: false }` it leaves dollars to plain markdown.
- `reading-order.ts`: the navigation helpers.
- `Markdown.tsx`: the renderer.
- `Formula.tsx`: one formula, typeset by KaTeX, with KaTeX's stylesheet and fonts.
- `useWiderThanLine.ts`: whether an inline formula has a piece wider than its line.

## Hooks and actions

### `useManual(manualId: string): Manual`

The whole manual, with live section statuses. The first call for a manual fetches
`GET /api/manuals/<manualId>`, once per manual per page load, and **suspends** until it arrives,
so render it inside a `Suspense` (the lazy route's covers it). If the fetch fails it throws, so
render it inside an error boundary too (the reader's `ManualErrorBoundary`); an unknown manual id
fails the same way. Components re-render when any section changes status, so a TOC built from it
is always current. It does not re-render on every streamed chunk.

Statuses start as the server reported them when the page loaded (`writing` for a section another
tab is writing). After that they change only for sections this page opens: a section another tab
was writing at load keeps its `writing` ring until this page opens it or is reloaded.

### `useSection(manualId: string, id: string): UseSectionResult`

`UseSectionResult` is `{ section, status, text, progress, failure? }`.

For the section page. It **suspends** on the section's JSON route (fetched once per section per
page load). **Calling it opens the section**: a section that isn't written opens its stream, which
starts the writing or joins it. Use `useManual(manualId)` + `findSection()` for anything that
should not open a section (TOC entries, hover previews).

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| `section`  | The `Section` (live status). Throws if the id doesn't exist.                       |
| `status`   | `"unwritten"`, `"writing"` or `"written"`. Same as `section.status`.               |
| `text`     | Markdown to render: `""` until the first words arrive, then the streamed text (already repaired, safe to render), then the full body. Formula fences are separated in both (`formula-fences.ts`). |
| `progress` | 0–1: how much of the body has streamed in (exact for the fake writer; estimated for Claude, capped at 0.99). |
| `failure`  | `"budget"` or `"error"` when the server couldn't write the section; otherwise absent. |

A section moves through these states:

| State      | `status`    | `text`        | `failure` | What to show                                 |
| ---------- | ----------- | ------------- | --------- | -------------------------------------------- |
| unwritten  | `unwritten` | `""`          | —         | Never painted (writing starts first); treat it like waiting. |
| waiting    | `writing`   | `""`          | —         | Title and summary (never a blank page).      |
| streaming  | `writing`   | partial       | —         | `<Markdown source={text} />` in the final layout. |
| written    | `written`   | full body     | —         | `<Markdown source={text} />`.                |
| failed     | `unwritten` | `""` or partial | set     | Why it wasn't written (`src/reader/DESIGN.md` › When a section can’t be written). |

The stream:

- `append` puts its text at its offset (a joining tab's first `append` carries everything so far);
  `written` keeps the text and marks the section written; `frozen` leaves it writing.
- `failed`, or an `error` on the `EventSource`, records the failure and marks the section
  `unwritten`. After an `error`, `api.ts` first asks the section's URL through `apiFetch`, since
  the `EventSource` hides the answer's status: a `401` shows the passcode screen instead, and the
  error is never handed on (`src/passcode/README.md`). The text that arrived stays in `text`, although the server kept none of it.
- An `append` whose `at` isn't the length of the text so far counts as `failure: "error"`: the
  store never rewrites text already shown, and never leaves a gap.
- The source is closed after `written`, `frozen`, `failed`, `error` or a mismatched `append`, and
  never reconnects: reconnecting would pay for a second run. **A failure sticks** until
  `retrySection` is called.
- **At most 3 streams are open at once** across all manuals (`MAX_OPEN_STREAMS`, the server's
  `maxConcurrentRuns`, which also counts every manual). Sections opened beyond that wait as
  `writing` with `text` `""`, and their streams open in the order they were opened as others end.
- A section streams once per page load and keeps streaming if the reader navigates away, at the
  writer's pace (`README.md` › The models).

### `retrySection(manualId: string, id: string): void`

Writes a failed section again, in place: it clears the failure and the text, marks the section
`writing` and opens its stream (or queues it). It does nothing for a section that hasn't failed.

## Navigation helpers

All take the manual from `useManual(manualId)`. Reading order is every chapter, then every appendix.

| Function                              | Returns                                          |
| ------------------------------------- | ------------------------------------------------ |
| `findSection(manual, id)`             | The `Section`, or `undefined`.                   |
| `chapterOf(manual, sectionId)`        | The `Chapter` (or appendix) containing it, or `undefined`. |
| `previousSection(manual, id)`         | The section before it, or `undefined` at the start. |
| `nextSection(manual, id)`             | The section after it, or `undefined` at the end. |
| `sectionsInReadingOrder(manual)`      | Every section, in reading order.                 |
| `chaptersInReadingOrder(manual)`      | Every chapter, then every appendix.              |

## `<Markdown>`

Renders markdown with GitHub-flavored extensions (tables, checklists, footnotes) and formulas in
LaTeX: `remark-math` finds them, and `Formula` typesets each with KaTeX.

| Prop          | Type                                  | Notes                                                |
| ------------- | ------------------------------------- | ---------------------------------------------------- |
| `manualId`    | `string`                              | The manual its `section:` links point into.          |
| `source`      | `string`                              | Pass `text` from `useSection` as is.                 |
| `SectionLink` | `ComponentType<SectionLinkProps>`     | Required. Renders every `[…](section:<id>)` link.    |
| `components`  | react-markdown `Components`           | Optional. Replace any element (`h2`, `table`, `sup`, `section`, …). |
| `className`   | `string`                              | Optional. Class on the wrapping `<div>`; style the content with descendant selectors (`.prose h2`). |

- `SectionLink` gets `{ section, children }`. `section.status` is live, so the link can show
  whether its target is unwritten, writing or written. A link to an unknown id renders as plain text.
- Other links (external, footnote) go to `components.a` if you pass one, else a plain `<a>`.
- Custom components (except `a`) receive a `node` prop (the syntax tree node). Drop it before
  spreading props onto a DOM element: `h2: ({ node, ...props }) => <h2 {...props} />`.
- Define `SectionLink` and `components` at module level, not inside a render function.
  Otherwise every link is remounted on each streamed chunk and loses its focus and hover state.
- Checklists render as `ul.contains-task-list > li.task-list-item`, each starting with an
  `<input type="checkbox" disabled>` (plus `checked` when ticked).
- Footnotes render as `<sup><a data-footnote-ref>` references and a final
  `<section data-footnotes class="footnotes">` with an `<ol>` of notes (each ending in a
  `data-footnote-backref` link). While a section is streaming, a note that has been referenced
  but not written yet appears as an empty `<li>`, so references never show raw `[^1]`.
- The footnotes section starts with `<h2 class="sr-only" id="footnote-label">Footnotes</h2>`.
  Nothing defines `.sr-only`: style `.footnotes h2`, or hide it visually with your own `.sr-only`.
- **Formulas** go between double dollars: `$$v = f\lambda$$` within a sentence renders inline,
  as `span.formula`. A `$$` block, with `$$` on a line by itself above and below the formula,
  renders as display math, as `div.formula-display > div.scroll-x[role=region]` (focusable and
  labelled `Formula`, so the keyboard can scroll a wide one). So do a ```` ```math ```` fence and a
  paragraph that holds only `$$…$$`, since that is how a formula standing alone is often written.
  Inside each is KaTeX's own HTML (`span.katex`, and `span.katex-display` for display math). A
  single `$` is never math (`singleDollarTextMath: false`), so `$5 and $10` stays text; the
  writer's prompt asks for double dollars to match (`server/writer/README.md`). Pass `text` from
  `useSection`, whose formula fences are already separated.
- Code that isn't a formula goes to `components.code` if you pass one, else a plain `<code>`.
- KaTeX runs with `trust` off (its default), so `\href`, `\url` and `\html…` never make links or
  attributes, and with `strict: "ignore"`, so it logs nothing. No raw HTML is enabled.
- **Formulas that could move the text around them show as their source.** `Formula` checks
  each formula before KaTeX typesets it, and shows its source instead when it uses:
  - a command that can draw outside the formula's box: `\smash`, the `\phantom`s, `\raisebox`,
    `\raise`, `\lower`, `\rule`, `\kern`, `\mkern`, `\hskip`, `\mskip`, `\hspace`, the `\llap`s
    and `\mathllap`s, `\moveleft`, `\moveright` and `\vcenter`;
  - a command that defines or builds commands, which could rename one of those: `\def` and its
    kin, `\let`, `\newcommand` and its kin, `\DeclareMathOperator`, `\csname`, `\expandafter`,
    `\noexpand`, `\global`, and any `\@…` internal;
  - a line break with a length (`\\[…]`, `\newline[…]`) outside an environment.

  TeX ends a command's name at the first character that isn't a letter, so a name can't be split
  by a comment or braces, and `\rule` doesn't catch `\ruler`. The fixed spaces (`\quad`,
  `\qquad`, `\,`, `\;`, `\:`, `\!`, `\ `) stay allowed.
- **A formula taller than 80em shows as its source.** Each base's `span.katex-strut` in KaTeX's
  output is as tall as the base's height and depth together, so `Formula` shows the source of a
  formula with a strut taller than 80em (`MAX_FORMULA_HEIGHT_EM`). That covers a line break's
  length inside an environment, which `maxSize` caps only when it is positive. A 40-row
  `aligned` block is about 60em. A test pins the `katex-strut` class, so a KaTeX upgrade that
  renames it fails.
- **An inline formula with a piece wider than its line scrolls sideways.** KaTeX lets a line
  break only between the pieces of an inline formula (`span.katex-base`, ending after a
  top-level relation or operator), so one piece can be wider than the line: forty subscripts in
  a row, or anything inside `\left(…\right)`. `useWiderThanLine` compares the widest piece with
  the content width of the nearest block around the formula, before the first paint and again
  whenever either changes size (a narrower window, KaTeX's fonts arriving). Only such a formula
  becomes `span.formula.formula-wide.scroll-x[role=region]`, focusable and labelled `Formula`
  like display math, which the reader sets on a line of its own (`src/reader/DESIGN.md` ›
  Formulas). Every other inline formula stays a plain `span.formula`. A piece in a table cell
  widens the cell instead, and the table scrolls. `scripts/wide-formula.test.ts` checks all of
  this in Chromium at phone width, so a KaTeX upgrade that renames `katex-base` fails it.
- Not covered: many `\!` in a row still pull the following glyphs left, over earlier words.
- A formula KaTeX can't read, or one held back by either check, shows its source in a
  `span.katex-error`, colored `--ink-muted` instead of KaTeX's red. An empty formula renders
  nothing.
- **Each formula is typeset once** per page load, cached by its LaTeX and whether it is display
  math, and React leaves its HTML alone while it is unchanged, so a streamed chunk costs only its
  new formulas.
- `Formula.tsx` imports KaTeX's stylesheet and fonts, so they load with whatever chunk imports
  the renderer: the reader's `Prose` chunk, never the landing page or the start page.
- `package.json` overrides `katex` with its own pinned version, because `remark-math`'s
  `micromark-extension-math` asks for `katex ^0.16`: without it npm would install a second,
  older KaTeX, one `npm audit` flags.
- Footnote ids (`user-content-fn-1`, …) are global. Two `<Markdown>` instances with footnotes on
  one page (a hover preview next to the section, say) will have colliding ids.

## Example

A minimal reader, using the same patterns as `src/reader/`.

```tsx
import { Link, useParams } from "react-router";
import {
  chaptersInReadingOrder, nextSection, previousSection, useManual, useSection,
  type SectionLinkProps,
} from "../manual";
import { Markdown } from "../manual/Markdown";

const useManualId = () => useParams().manualId!;
const sectionPath = (manualId: string, id: string) => `/read/${manualId}/${id}`;

function SectionLink({ section, children }: SectionLinkProps) {
  return (
    <Link to={sectionPath(useManualId(), section.id)} data-status={section.status}>
      {children}
    </Link>
  );
}

function Toc({ currentId }: { currentId?: string }) {
  const manual = useManual(useManualId());
  return (
    <nav>
      {chaptersInReadingOrder(manual).map((chapter) => (
        <section key={chapter.id}>
          <h2>{chapter.label}. {chapter.title}</h2>
          {chapter.sections.map((section) => (
            <Link
              key={section.id}
              to={sectionPath(manual.id, section.id)}
              data-status={section.status}
              aria-current={section.id === currentId ? "page" : undefined}
            >
              {section.label} {section.title}
            </Link>
          ))}
        </section>
      ))}
    </nav>
  );
}

function SectionPage({ id }: { id: string }) {
  const manualId = useManualId();
  const manual = useManual(manualId);
  const { section, status, text } = useSection(manualId, id);
  const previous = previousSection(manual, id);
  const next = nextSection(manual, id);

  return (
    <article data-status={status}>
      <h1>{section.label} {section.title}</h1>
      <p>{section.summary}</p>
      {text !== "" && (
        <Markdown manualId={manualId} source={text} SectionLink={SectionLink} className="prose" />
      )}
      {previous && <Link to={sectionPath(manualId, previous.id)}>{previous.title}</Link>}
      {next && <Link to={sectionPath(manualId, next.id)}>{next.title}</Link>}
    </article>
  );
}

export default function Reader() {
  const { sectionId } = useParams();
  return (
    <>
      <Toc currentId={sectionId} />
      {sectionId && <SectionPage key={sectionId} id={sectionId} />}
    </>
  );
}
```

## URL options

For screenshots. The store passes them from the page's URL to the stream's, and the server
answers them without writing, storing or billing anything. They apply to a section that isn't
written, opened while the option is in the URL; written sections are unaffected.

| Option          | Effect                                                              |
| --------------- | ------------------------------------------------------------------- |
| `?freeze=0`     | The section stays in the waiting state (`writing`, `text` is `""`). |
| `?freeze=0.5`   | The section jumps straight to 50% and stays `writing`. Any fraction 0–1 works. |
| `?fail=budget`  | The section fails at once with `failure: "budget"`.                 |
| `?fail=error`   | The section fails at once with `failure: "error"`.                  |
