# Manual runtime

Everything the app needs to read a manual: the data model, a live store, the fake streamer that
writes sections, and the markdown renderer. The reader in `src/reader/` is built on it. The
librarian in `src/agent/` streams its replies with the same streamer and repair, imported straight
from `streamer.ts` and `repair.ts` (they aren't part of the API below).

```ts
import {
  useManual, useSection, Markdown,
  findSection, chapterOf, previousSection, nextSection,
  type Manual, type Chapter, type Section,
  type UseSectionResult, type SectionLinkProps, type MarkdownProps,
} from "../manual";
```

The data model (`Manual`, `Chapter`, `Section`) is defined in `types.ts` and described in
`DESIGN.md`. The sample manual lives in `sample/` (its structure in `sample/index.ts`, one `.md`
file per section body under `sample/sections/`). UI code never imports it directly:
`useManual()` returns it with live statuses. `sample/index.ts` also exports `SHOT_SECTIONS`, the
sections `npm run shot` and the tests use.

## Hooks

### `useManual(): Manual`

The whole manual, with live section statuses. Components re-render when any section changes
status, so a TOC built from it is always current. It does not re-render on every streamed chunk.

### `useSection(id: string): UseSectionResult`

`UseSectionResult` is `{ section, status, text, progress }`.

For the section page. **Calling it opens the section**: an `unwritten` section starts writing
immediately. Use `useManual()` + `findSection()` for anything that should not open a section
(TOC entries, hover previews).

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| `section`  | The `Section` (live status). Throws if the id doesn't exist.                       |
| `status`   | `"unwritten"`, `"writing"` or `"written"`. Same as `section.status`.               |
| `text`     | Markdown to render: `""` until the first words arrive, then the streamed text (already repaired, safe to render), then the full body. |
| `progress` | 0–1: how much of the body has streamed in.                                         |

A section moves through these states:

| State      | `status`    | `text`        | What to show                                 |
| ---------- | ----------- | ------------- | -------------------------------------------- |
| unwritten  | `unwritten` | `""`          | Never painted (writing starts first); treat it like waiting. |
| waiting    | `writing`   | `""`          | Title and summary (never a blank page).      |
| streaming  | `writing`   | partial       | `<Markdown source={text} />` in the final layout. |
| written    | `written`   | full body     | `<Markdown source={text} />`.                |

Timing: about 1.2s of waiting, then about 20 characters every 85ms, split at word boundaries.
A section streams once per page load and keeps streaming if the reader navigates away.

## Navigation helpers

All take the manual from `useManual()`. Reading order is every chapter, then every appendix.

| Function                              | Returns                                          |
| ------------------------------------- | ------------------------------------------------ |
| `findSection(manual, id)`             | The `Section`, or `undefined`.                   |
| `chapterOf(manual, sectionId)`        | The `Chapter` (or appendix) containing it, or `undefined`. |
| `previousSection(manual, id)`         | The section before it, or `undefined` at the start. |
| `nextSection(manual, id)`             | The section after it, or `undefined` at the end. |

## `<Markdown>`

Renders markdown with GitHub-flavored extensions (tables, checklists, footnotes).

| Prop          | Type                                  | Notes                                                |
| ------------- | ------------------------------------- | ---------------------------------------------------- |
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
- Footnote ids (`user-content-fn-1`, …) are global. Two `<Markdown>` instances with footnotes on
  one page (a hover preview next to the section, say) will have colliding ids.

## Example

A minimal reader, using the same patterns as `src/reader/`.

```tsx
import { Link, useParams } from "react-router";
import {
  Markdown, nextSection, previousSection, useManual, useSection, type SectionLinkProps,
} from "../manual";

const sectionPath = (id: string) => `/read/${id}`;

function SectionLink({ section, children }: SectionLinkProps) {
  return (
    <Link to={sectionPath(section.id)} data-status={section.status}>
      {children}
    </Link>
  );
}

function Toc({ currentId }: { currentId?: string }) {
  const manual = useManual();
  return (
    <nav>
      {[...manual.chapters, ...manual.appendices].map((chapter) => (
        <section key={chapter.id}>
          <h2>{chapter.label}. {chapter.title}</h2>
          {chapter.sections.map((section) => (
            <Link
              key={section.id}
              to={sectionPath(section.id)}
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
  const manual = useManual();
  const { section, status, text } = useSection(id);
  const previous = previousSection(manual, id);
  const next = nextSection(manual, id);

  return (
    <article data-status={status}>
      <h1>{section.label} {section.title}</h1>
      <p>{section.summary}</p>
      {text !== "" && <Markdown source={text} SectionLink={SectionLink} className="prose" />}
      {previous && <Link to={sectionPath(previous.id)}>{previous.title}</Link>}
      {next && <Link to={sectionPath(next.id)}>{next.title}</Link>}
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

For screenshots. They apply to an `unwritten` section opened while the option is in the URL;
written sections are unaffected.

| Option        | Effect                                                              |
| ------------- | ------------------------------------------------------------------- |
| `?freeze=0`   | The section stays in the waiting state (`writing`, `text` is `""`). |
| `?freeze=0.5` | The section jumps straight to 50% and stays `writing`. Any fraction 0–1 works. |
