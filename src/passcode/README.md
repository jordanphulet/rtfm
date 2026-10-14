# src/passcode

The passcode screen, and the switch that shows it. When the server has a passcode
(`server/api/README.md` › The passcode), any API request from a browser that hasn't entered it gets
`401`, and the screen takes the page's place. A request whose library's link is closed gets
`401 { error: "Link closed" }`, and the screen says so above the form. Its design is in
`DESIGN.md` › The passcode screen.

```tsx
import { PasscodeScreen, usePasscodeReason } from "./passcode";

export default function App() {
  const passcodeReason = usePasscodeReason();
  if (passcodeReason) return <PasscodeScreen linkClosed={passcodeReason === "link-closed"} />;
  return <Routes>…</Routes>;
}
```

## How it works

- **`requirePasscode(reason)`** (`required.ts`) sets a module-level reason, once:
  `passcode-required` or `link-closed`. **`usePasscodeReason()`** reads it, so `App.tsx` renders
  the screen in place of the routes, with the closed line for `link-closed`.
- **`apiFetch`** (`src/reportErrors.ts`), which every store uses, calls it on any `401`, with
  `link-closed` when the body's `error` is `Link closed`, and then never settles. The page that
  asked is replaced, so no store sees the `401`, and no page shows it as a failure (`Couldn’t
  open your library`, a failed reply). A `401` is never reported to the log: the server has
  already logged its refusal. `reportErrors.ts` imports `required.ts` straight from the file, so
  the stores never load the screen.
- **The link page** (`src/link/`) calls it with `link-closed` when `POST /api/link` answers `401`.
- **`enterPasscode(passcode)`** (`api.ts`) posts `{ passcode }` to `/api/passcode` with plain
  `fetch`, since its `401` means a wrong passcode, not a missing one. It answers `accepted`,
  `wrong`, or `unanswered` (no answer within 10 seconds, or any other answer). A `404` counts as
  `accepted`: the server no longer has a passcode, so a reload opens the page.
- **On `accepted`** the server has set the `HttpOnly` cookie, which the page never sees, and
  cleared any library's cookie, and the screen calls `location.reload()`. The reload asks the
  server again with the cookie, from the same URL.
- **Section streams** are `EventSource`s, not `apiFetch`, and an `EventSource` error hides the
  answer's status. So after an error the stream asks the section's own URL once through
  `apiFetch` (`src/manual/api.ts`): a `401` there shows the screen, and the section is never marked
  failed. This covers every stream, a retried section's and a queued one's included.

## Files

- `index.ts`: exports `PasscodeScreen`, `requirePasscode` and `usePasscodeReason`.
- `required.ts`: the reason, `requirePasscode` and `usePasscodeReason`.
- `api.ts`: `enterPasscode`.
- `PasscodeScreen.tsx`, `PasscodeScreen.css`: the screen.
- `PasscodeScreen.test.tsx`: the screen in the app's place on either page, with the closed line
  when a library's link closes mid-visit, and entering a right, wrong or unanswered passcode.
