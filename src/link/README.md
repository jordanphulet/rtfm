# src/link

The two page routes for a recipient's library (`README.md` › A library's link): `/l#<secret>`
opens the library by its link, and `/admin` leaves it. The server's side is in
`server/api/README.md` › A library's link, and the page's design in `DESIGN.md` › The link page.

```tsx
import { AdminPage, LinkPage } from "./link";

<Route path="/l" element={<LinkPage />} />
<Route path="/admin" element={<AdminPage />} />
```

## How it works

- **`LinkPage`** reads the secret from the address's fragment as it first renders, and keeps it
  in state. It replaces the address with `/l` at once, so neither the address bar nor the back
  history keeps the secret, and nothing the page reports can hold it: `apiFetch`'s reports carry
  only the page's path (`src/reportErrors.ts`).
- **`openLibrary(secret)`** (`api.ts`) posts `{ secret }` to `/api/link` with plain `fetch`, since
  its `401` means a closed link, not a missing passcode. It answers `opened` (`204`: the server has
  set the library's `HttpOnly` cookie), `closed` (`401`), or `unanswered` (no answer within 10
  seconds, or any other answer, a `500` included).
  - `opened`: the page replaces the address with `/`, and the landing page loads the library.
  - `closed`: `requirePasscode("link-closed")` shows the passcode screen with its closed line, and
    the address becomes `/`, so a passcode entered there reloads into the admin's library.
  - `unanswered`: `Couldn’t open your library`, whose Try again posts the same secret again.
- **`AdminPage`** calls **`leaveLibrary()`** (`api.ts`), `DELETE /api/link` through `apiFetch`,
  which clears the library's cookie, and once it settles, whatever the answer, replaces the address
  with `/`. If the server didn't answer, the landing page says so.
- Both show the bare ground while they wait (`Opening.tsx`), with a visually hidden status.
- In development, StrictMode runs each page's effect twice, so a link is posted twice and its
  library counts two opens; the built app posts it once.

## Files

- `index.ts`: exports `LinkPage` and `AdminPage`.
- `api.ts`: `openLibrary` and `leaveLibrary`.
- `LinkPage.tsx`, `LinkPage.css`: `/l`, and its notice when the library didn't open.
- `AdminPage.tsx`: `/admin`.
- `Opening.tsx`: the bare ground both show while they wait.
- `link.test.tsx`: opening a link, the address and back history after it, a closed link, a server
  that fails, and `/admin` from a library.
