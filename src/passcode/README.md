# src/passcode

The passcode screen, and the switch that shows it. When the server has a passcode
(`server/api/README.md` › The passcode), any API request from a browser that hasn't entered it gets
`401`, and the screen takes the page's place. Its design is in `DESIGN.md` › The passcode screen.

```tsx
import { PasscodeScreen, usePasscodeRequired } from "./passcode";

export default function App() {
  if (usePasscodeRequired()) return <PasscodeScreen />;
  return <Routes>…</Routes>;
}
```

## How it works

- **`requirePasscode()`** (`required.ts`) flips a module-level flag, once, and
  **`usePasscodeRequired()`** reads it, so `App.tsx` renders the screen in place of the routes.
- **`apiFetch`** (`src/reportErrors.ts`), which every store uses, calls it on any `401`, and then
  never settles. The page that asked is replaced, so no store sees the `401`, and no page shows it
  as a failure (`Couldn’t open your library`, a failed reply). A `401` is never reported to the
  log: the server has already logged its refusal. `reportErrors.ts` imports `required.ts` straight
  from the file, so the stores never load the screen.
- **`enterPasscode(passcode)`** (`api.ts`) posts `{ passcode }` to `/api/passcode` with plain
  `fetch`, since its `401` means a wrong passcode, not a missing one. It answers `accepted`,
  `wrong`, or `unanswered` (no answer within 10 seconds, or any other answer). A `404` counts as
  `accepted`: the server no longer has a passcode, so a reload opens the page.
- **On `accepted`** the server has set the `HttpOnly` cookie, which the page never sees, and the
  screen calls `location.reload()`. The reload asks the server again with the cookie, from the
  same URL.
- **Section streams** are `EventSource`s, not `apiFetch`, and an `EventSource` error hides the
  answer's status. So after an error the stream asks the section's own URL once through
  `apiFetch` (`src/manual/api.ts`): a `401` there shows the screen, and the section is never marked
  failed. This covers every stream, a retried section's and a queued one's included.

## Files

- `index.ts`: exports `PasscodeScreen` and `usePasscodeRequired`.
- `required.ts`: the flag, `requirePasscode` and `usePasscodeRequired`.
- `api.ts`: `enterPasscode`.
- `PasscodeScreen.tsx`, `PasscodeScreen.css`: the screen.
- `PasscodeScreen.test.tsx`: the screen in the app's place on either page, and entering a right,
  wrong or unanswered passcode.
