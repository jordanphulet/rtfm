# src/library-prototypes

Three variants of the library page, built and compared before one is chosen. The rules every
variant follows are under "Library prototypes" in `WORKLIST.md`.

## Layout

| Path | What it holds |
| --- | --- |
| `index.tsx` | The `/library/:variant` page: loads the variant lazily, behind its own error boundary, with the switcher |
| `PrototypeSwitcher.tsx`, `prototype-switcher.css` | The dev switcher |
| `PrototypeErrorBoundary.tsx` | Shows a variant's error instead of a blank page |
| `<a\|b\|c>/` | One variant. Its entry is `index.tsx`, with a default export |

A variant imports only from `src/ui`, `src/library` and `src/agent` (plus React and React Router),
never from another variant or from this folder's shell.

## Routes

- `/library/a`, `/library/b`, `/library/c`: the variants.
- `/library` and any unknown variant redirect to `/library/a`, keeping the query string.
- The URL options of `src/library` and `src/agent` work on every variant: `?conversation=demo`,
  `?agentFreeze=thinking`, `?agentFreeze=0.5`, `?library=empty`.

## The variant root

Put `className="ui library-<x>"` on the variant's root element, and scope every rule in its CSS
under `.library-<x>` (see "The specificity rule" in `src/ui/README.md`).

## The switcher

A slim vertical tab of `A B C` links, fixed to the **left edge**, centred vertically, about 15px
wide. Keep that strip clear of controls. It:

- appears only on `/library/*`;
- keeps the query string, and reloads the page, so every variant starts fresh (the library and
  the conversation are in memory);
- goes inert (and fades) while a modal is open: any `dialog:modal` or `[aria-modal="true"]`
  element that isn't itself inside `[inert]`. A closed `Sheet` is inert, so it doesn't count;
- is hidden in screenshots.

## Commands

| Command | What it does |
| --- | --- |
| `npm run check:library -- <x>` | Type-checks `src/library-prototypes/<x>` and everything it imports, on its own, so another variant's unfinished code can't fail it |
| `npm run shot:library -- <x>` | Screenshots every scenario at desktop (1440×900) and phone (375×812) into `shots/library/<x>/`, as `<state>-desktop.png` and `<state>-phone.png` |

`shot:library` runs its own dev server on a port per variant (a 5175, b 5176, c 5177), so the
three can run at the same time. It uses the dark scheme, waits for fonts, disables animations,
and exits non-zero if any page logs a console error or a state can't be produced.

| State | How it's produced |
| --- | --- |
| `first-visit` | `/library/<x>` |
| `typing` | Clicks `agent-input` and types a message, without sending |
| `thinking` | `?agentFreeze=thinking` |
| `streaming` | `?agentFreeze=0.5` |
| `conversation` | `?conversation=demo`, the full page |
| `delete-confirm` | Clicks the first visible `delete` |
| `fallback` | Types a message the agent can't handle into `agent-input`, presses Enter, and waits for the whole fallback reply |
| `empty` | `?library=empty` |

**The newest message must be in view** when the page loads with a conversation (the URL
options) and after a message is sent. `thinking`, `streaming` and `fallback` rely on it.

## `data-shot` hooks

The screenshot script finds these elements, at both sizes, on a fresh page. Every variant keeps
them. If a hook isn't visible, the script clicks the first visible `<hook>-opener` (for example a
button that reveals the agent on a phone, or a manual's menu) and looks again. If neither is
there, that screenshot fails and the run exits non-zero.

| Hook | Put it on |
| --- | --- |
| `data-shot="agent-input"` | The agent's text input (an `input` or `textarea`). Enter sends |
| `data-shot="agent-input-opener"` | Optional: the control that reveals the input, if it isn't always visible |
| `data-shot="delete"` | Each manual's delete control, which opens the confirmation. The first visible one is clicked |
| `data-shot="delete-opener"` | Optional: the control that reveals a manual's delete control (e.g. a per-manual menu). The first visible one is clicked |
