# src/library

The manuals on the landing page (`src/home/`): seven seed manuals in an in-memory store.
Deleting is real but only lasts until the page reloads. There is no create or rename.

Import everything from `src/library`:

```ts
import { deleteManual, formatLastOpened, useLibrary, type LibraryManual } from "../library";
```

## `LibraryManual`

A summary of a manual, not the manual itself. It holds what a library entry shows.

| Field          | Type     | Meaning                                                        |
| -------------- | -------- | -------------------------------------------------------------- |
| `id`           | `string` | Stable slug, e.g. `"negotiating-with-geese"`                   |
| `title`        | `string` | e.g. `"Negotiating With Geese"`                                |
| `subtitle`     | `string` | One sentence, from short to quite long                         |
| `chapterCount` | `number` | Chapters, counting appendices                                  |
| `sectionCount` | `number` | Sections in the table of contents (the *m* in "n of m written") |
| `writtenCount` | `number` | Sections written so far (the *n*); from 0 up to `sectionCount` |
| `lastOpenedAt` | `number` | Millisecond timestamp; format it with `formatLastOpened`       |

## `useLibrary(): LibraryManual[]`

The manuals, most recently opened first. Re-renders when one is deleted. The array is a new one
after each delete and the same one otherwise, so it is safe to use as a dependency.

## `deleteManual(id: string): void`

Removes a manual from the list, in memory. A reload restores every manual. Deleting an id that
isn't there does nothing. The store asks for no confirmation; the landing page does.

## `formatLastOpened(time: number): string`

Formats a `lastOpenedAt` for display. The library's "now" is fixed at **4:00pm on Saturday,
October 10, 2026, local time**, not the real clock, so screenshots never change.

| Opened                                  | Shows          |
| --------------------------------------- | -------------- |
| the same calendar day as "now"          | `today`        |
| the calendar day before                 | `yesterday`    |
| 2 to 6 calendar days before             | `3 days ago`   |
| earlier the same year                   | `Mar 2`        |
| an earlier year                         | `Dec 28, 2025` |

Callers add any wording around it (the landing page's "Opened yesterday").

## The seed manuals

As shown by `useLibrary()`:

| Title                                                 | Written  | Last opened  |
| ----------------------------------------------------- | -------- | ------------ |
| The Haunt That Listens                                | 7 of 18  | today        |
| The Birthday Party Field Manual                       | 3 of 14  | yesterday    |
| Negotiating With Geese                                | 1 of 6   | 3 days ago   |
| Keeping a Sourdough Starter Alive                     | 9 of 9   | 5 days ago   |
| Running Your Own Mail Server Without Losing Your Mind | 12 of 31 | Sep 21       |
| Moving House Without Losing the Cat                   | 0 of 17  | Aug 2        |
| Building a Backyard Observatory                       | 15 of 22 | Dec 28, 2025 |

Open a manual by going to `/read`. The reader's URL has no manual id; it always shows the sample
manual, *The Haunt That Listens*, which the API server serves from `server/seed/`. Its entry here
is a literal with the seed's counts (7 of 18 written), so it doesn't follow what the reader
writes.

## URL options

| Option           | Effect                                     |
| ---------------- | ------------------------------------------ |
| `?library=empty` | The library starts with no manuals, for the empty state. |

## Example

```tsx
import { deleteManual, formatLastOpened, useLibrary } from "../library";

function Shelf() {
  const manuals = useLibrary();
  if (manuals.length === 0) return <p>No manuals yet.</p>;

  return (
    <ul>
      {manuals.map((manual) => (
        <li key={manual.id}>
          <h2>{manual.title}</h2>
          <p>{manual.subtitle}</p>
          <p>
            {manual.writtenCount} of {manual.sectionCount} sections written · opened{" "}
            {formatLastOpened(manual.lastOpenedAt)}
          </p>
          <button onClick={() => deleteManual(manual.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

## Files

- `types.ts`: `LibraryManual`.
- `seed.ts`: the seed manuals.
- `store.ts`: `useLibrary` and `deleteManual`.
- `time.ts`: the fixed "now" and `formatLastOpened`.
