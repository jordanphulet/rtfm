# src/library

The manuals on the landing page (`src/home/`), as the API server stores them: it loads the
library from `GET /api/manuals` and deletes through `DELETE /api/manuals/:manualId`
(`ARCHITECTURE.md` › The API). There is no create or rename.

Import everything from `src/library`:

```ts
import {
  deleteManual, removeFromLibrary, useLibrary,
  type DeleteResult, type ManualSummary,
} from "../library";
```

## `ManualSummary`

The API's summary of a manual: `types.ts` re-exports it from `server/api/types.ts` with
`export type`, so nothing from `server/` reaches the bundle. It holds what a library entry shows.

| Field          | Type     | Meaning                                                         |
| -------------- | -------- | --------------------------------------------------------------- |
| `id`           | `string` | Stable slug, e.g. `"negotiating-with-geese"`                    |
| `title`        | `string` | e.g. `"Negotiating With Geese"`                                 |
| `subtitle`     | `string` | One sentence, from short to quite long                          |
| `chapterCount` | `number` | Chapters, counting appendices                                   |
| `sectionCount` | `number` | Sections in the table of contents (the *m* in "n of m written") |
| `writtenCount` | `number` | Sections written so far (the *n*), counted from storage         |

## `useLibrary(): ManualSummary[]`

The manuals, sorted by title (the server sorts them).

- **The first call suspends** until `GET /api/manuals` answers, once per page load, so render it
  inside a `Suspense` (the lazy route's covers it). If that request fails it throws, so render it
  inside an error boundary too (the landing page's `LibraryErrorBoundary`).
- **Each later mount** (coming back to the landing page from the reader) returns the list it
  already has at once and fetches it again in the background, so new written counts appear. If
  that fetch fails, the list stays as it was. A refresh that started before a
  `removeFromLibrary` is dropped, so it can't bring a deleted manual back. In development,
  StrictMode mounts the page twice, so the first visit fetches twice too; that is harmless.
- It re-renders when the list changes. The array is a new one after each change and the same one
  otherwise, so it is safe to use as a dependency.

## `deleteManual(id: string): Promise<DeleteResult>`

Deletes a manual on the server. It never throws, and it **doesn't change the list**: call
`removeFromLibrary(id)` once it resolves to `"deleted"`, after any exit animation.

| `DeleteResult`    | When                                                          |
| ----------------- | ------------------------------------------------------------- |
| `"deleted"`       | `204`, or `404`: it was already gone                          |
| `"being-written"` | `409`: a section of it is being written; it can be tried again once that's done |
| `"failed"`        | Any other answer, no answer within 10 seconds, or no server   |

The store asks for no confirmation; the landing page does.

## `removeFromLibrary(id: string): void`

Removes a deleted manual from the list. Removing an id that isn't there does nothing.

## URL options

| Option           | Effect                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `?library=empty` | Passed on to `GET /api/manuals`, whose preview answers `[]`: the empty state, with nothing deleted. |

## Example

```tsx
import { deleteManual, removeFromLibrary, useLibrary } from "../library";

function Shelf() {
  const manuals = useLibrary();
  if (manuals.length === 0) return <p>No manuals yet.</p>;

  async function remove(id: string) {
    const result = await deleteManual(id);
    if (result === "deleted") removeFromLibrary(id);
    else alert(result === "being-written" ? "It's being written; try again soon." : "Couldn't delete it.");
  }

  return (
    <ul>
      {manuals.map((manual) => (
        <li key={manual.id}>
          <h2>{manual.title}</h2>
          <p>{manual.subtitle}</p>
          <p>
            {manual.writtenCount} of {manual.sectionCount} sections written
          </p>
          <button onClick={() => remove(manual.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

## Files

- `types.ts`: `ManualSummary` (re-exported from the server) and `DeleteResult`.
- `api.ts`: the API's URLs: `fetchLibrary` and `deleteManual`.
- `store.ts`: `useLibrary`, `removeFromLibrary`, and the background refresh.
