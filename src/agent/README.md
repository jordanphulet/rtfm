# src/agent

The librarian's conversation on the landing page (`src/home/`). You send a message; the store
sends the conversation to the server's librarian (`POST /api/librarian`, `ARCHITECTURE.md` › The
librarian) and streams the reply back: what the librarian is doing while it works, then its text.
A reply can end with a page action, opening a manual or proposing a delete, which the store hands
to the page, and a reply that creates a manual tells the page so as soon as it is saved. The
conversation lives in memory for the life of the page (it survives route changes, not reloads),
and only the browser keeps it.

Import everything from `src/agent`:

```ts
import {
  LIBRARIAN_LIMITS, useAgent, useAgentActions,
  type AgentAction, type AgentMessage, type AgentStatus, type DeleteOutcome, type FailureReason,
  type UseAgentResult,
} from "../agent";
```

## `useAgent(): UseAgentResult`

```ts
interface UseAgentResult {
  messages: AgentMessage[];
  status: AgentStatus;
  activity: string;       // while thinking: "Thinking…", or the running tool's line
  send: (text: string) => void;
  reportDeleteOutcome: (outcome: DeleteOutcome) => void;
}

interface AgentMessage {
  id: string;             // unique and stable; use it as the React key
  role: "user" | "agent";
  text: string;           // markdown, always safe to render as-is; "" for a reply that failed first
  failure?: FailureReason;  // "budget" | "error": set on a reply that didn't finish
  deleteOutcome?: DeleteOutcome;  // "kept" | "deleted": on a reply whose proposed delete has ended
}

type AgentStatus = "idle" | "thinking" | "streaming";
```

Every component that calls `useAgent()` sees the same conversation.

### `send(text)`

1. Trims `text`. Ignores it if it is blank, or if `status` isn't `"idle"`. Sends are **ignored,
   not queued**, while a reply is in progress, so disable or relabel your send control then.
2. Appends the user message, sets `status` to `"thinking"` and `activity` to `"Thinking…"`, and
   sends the server the latest `LIBRARIAN_LIMITS.earlierExchanges` (10) finished exchanges (a
   user message and the reply that finished after it), then the new message. Exchanges whose
   reply failed, or with a message longer than `LIBRARIAN_LIMITS.messageCharacters` (4,000), are
   left out. The new message must fit that limit too, or the reply fails with `"error"`: put it
   on your field's `maxLength`. A reply's `deleteOutcome` is sent with it, so the librarian knows
   how the delete it proposed ended.
3. As the reply streams:
   - text appends to the agent message (created with the first text) and sets `status` to
     `"streaming"`;
   - a running tool sets `status` to `"thinking"` and `activity` to its line, such as
     `"Searching the shelves…"`. Text the librarian wrote before calling it stays in the agent
     message meanwhile;
   - when the librarian writes more text after a tool, that text replaces what it wrote before
     the tool, in the same agent message (same `id`). If it writes nothing more, the earlier text
     is the reply.
4. When the reply is done, sets `status` back to `"idle"` and hands its page action, if any, to
   the handler (below). A reply that ends with no text at all adds no agent message. A `created` action is handed over as soon as it arrives instead.
5. If the reply fails, sets `failure` on the agent message (keeping any text that arrived) and
   `status` to `"idle"`:
   - `"budget"`: a spending cap would be crossed, or the kill switch is on;
   - `"error"`: anything else, including a stream that ends early and a server that can't be
     reached.

### Rendering a reply mid-stream

- While `status` is `"thinking"`, show your thinking indicator with `activity` after the last
  message: the user's, or the text the librarian wrote before the tool that is running.
- While `status` is `"streaming"`, the **last message** is the reply being streamed. Its `text`
  is already repaired (unfinished bold closed, half-typed links held back, and so on), so render
  it with `ReplyMarkdown` from `src/ui` like any other message. Mark the live edge on the last
  message only, by wrapping it in a `.write-head` with `data-live` (see The write head in
  `src/ui/README.md`).
- Every other message is complete, or has a `failure`.

The text is markdown for `ReplyMarkdown` (`src/ui/README.md`), and only the last text the
librarian wrote: what it wrote after its last tool, or before it when nothing followed.

## `useAgentActions(handler)`

```ts
type AgentAction =
  | { type: "open"; manualId: string }
  | { type: "propose-delete"; manualId: string }
  | { type: "created"; manualId: string };

useAgentActions((action) => { /* navigate, or open the delete confirmation */ });
```

Hands each `open` or `propose-delete` action to `handler` once its reply is **done**, while the
calling component is mounted. A reply carries at most one of those that counts: the last one. One
from a reply that failed, or any action that arrives while no component is handling actions, is
dropped. A `created` action is handed over **as soon as it arrives**, even if the reply then
fails: it reports a manual the server has already saved. The latest
`handler` is always used, so it can be an inline function. Only one component should call it at
a time.

- `open`: the librarian opened the manual; go to `/read/<manualId>`.
- `propose-delete`: the librarian asks to delete the manual. **Nothing is deleted.** Open the
  page's own delete confirmation for it; only the user's choice there deletes it, through
  `deleteManual` in `src/library`. When that confirmation closes, call `reportDeleteOutcome`
  (below).
- `created`: the librarian created the manual, and the server has saved it. Load the library
  again (`refreshLibrary` in `src/library`) so it appears.

## `reportDeleteOutcome(outcome)`

Tells the librarian how the confirmation for its latest proposed delete ended: `"kept"` (Keep it,
Escape or the scrim) or `"deleted"` (once the server has deleted it). It sets `deleteOutcome` on
the reply that proposed the delete, which `send` then passes to the server, so the next reply
knows, and asking again proposes the delete again. Call it only for a confirmation the librarian
opened, and only for a delete the server confirmed, or a Keep it before any delete was tried:
a failed attempt may still have deleted the manual, so it reports nothing. Only the first call
after a `propose-delete` is handed over counts; any other call does nothing.

## URL options

These set up the conversation when the page loads, so a single page load shows each screenshot
state. They combine. Their replies come from the server's preview (`?freeze=` on the librarian
route, `ARCHITECTURE.md` › The librarian), which always plays the **scripted fake model**,
whatever models the server runs, sends no page actions and costs nothing.

| Option                  | Starting conversation | `status` |
| ----------------------- | --------------------- | -------- |
| *(none)*                | Empty | `"idle"` |
| `?conversation=demo`    | Three finished exchanges, asked for in turn with `?freeze=1`: "What do I have?" (a list of the manuals), "Open the one about haunted houses" ("Opening *The Haunt That Listens*."), "Can you translate the sourdough manual into Klingon?" (the fake model's "I can’t do that…") | `"idle"` |
| `?agentFreeze=thinking` | Adds the user message "Let’s start a new manual about building a treehouse", and makes no request | `"thinking"`, forever |
| `?agentFreeze=<0–1>`    | Adds the same user message and its reply (the fake model's “*Building a Treehouse* is on your shelf…”, which the preview never saves), cut at the last chunk at or before that fraction, repaired. At 0 only the statuses show, ending with the planner's (`activity` `"Planning “Building a Treehouse”…"`); at 1 the reply is whole | `"thinking"` at 0, `"streaming"` above, `"idle"` at 1; frozen ones forever |

- `agentFreeze` takes `thinking` or any number from 0 to 1. Any other value is ignored.
- The frozen message comes after the demo turns, so `?conversation=demo&agentFreeze=0.5` shows a
  long conversation with a reply half-streamed at the bottom.
- A frozen reply never finishes, so `send` is ignored for the rest of that page load.
- The first demo message is added as the page loads, so the conversation is never empty on a
  page loaded with these options; the replies arrive a few milliseconds later.
- These are separate from the reader's `?freeze`, which doesn't affect the agent.

## Example

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAgent, useAgentActions } from "../agent";
import { refreshLibrary } from "../library";
import { ReplyMarkdown } from "../ui";

function Conversation({ onProposeDelete }: { onProposeDelete: (manualId: string) => void }) {
  const { messages, status, activity, send } = useAgent();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");

  useAgentActions((action) => {
    if (action.type === "created") void refreshLibrary();
    else if (action.type === "open") navigate(`/read/${action.manualId}`);
    else onProposeDelete(action.manualId);
  });

  return (
    <section>
      {messages.map((message, index) => (
        <article
          key={message.id}
          data-role={message.role}
          className="write-head"
          data-live={(status === "streaming" && index === messages.length - 1) || undefined}
        >
          <ReplyMarkdown>{message.text}</ReplyMarkdown>
          {message.failure && <p>This reply failed.</p>}
        </article>
      ))}
      {status === "thinking" && <p>{activity}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
          setDraft("");
        }}
      >
        <input value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button disabled={status !== "idle"}>Send</button>
      </form>
    </section>
  );
}
```

## Files

- `types.ts`: `AgentMessage`, `AgentStatus` and `AgentAction`, and the wire types re-exported
  from `server/api/types.ts` with `export type`, with `LIBRARIAN_LIMITS`, the one value it
  re-exports.
- `api.ts`: `streamReply`, which posts the conversation and parses the server-sent events.
- `store.ts`: the conversation, `send`, the URL options, `useAgent` and `useAgentActions`
  (`handleActions` is the same registration without the hook, for tests).
