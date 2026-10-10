# src/agent

A scripted stand-in for the librarian agent. You send a message; it thinks for 600ms, then streams
a canned markdown reply at the same pace as the reader's fake streamer. Replies **change
nothing**: the agent never touches the library. The conversation lives in memory for the life of
the page (it survives route changes, not reloads).

Import everything from `src/agent`:

```ts
import { useAgent, type AgentMessage, type AgentStatus, type UseAgentResult } from "../../agent";
```

## `useAgent(): UseAgentResult`

```ts
interface UseAgentResult {
  messages: AgentMessage[];
  status: AgentStatus;
  send: (text: string) => void;
}

interface AgentMessage {
  id: string;             // unique and stable; use it as the React key
  role: "user" | "agent";
  text: string;           // markdown, always safe to render as-is
}

type AgentStatus = "idle" | "thinking" | "streaming";
```

Every component that calls `useAgent()` sees the same conversation.

### `send(text)`

1. Trims `text`. Ignores it if it is blank, or if `status` isn't `"idle"`. Sends are **ignored,
   not queued**, while a reply is in progress, so disable or relabel your send control then.
2. Appends the user message and sets `status` to `"thinking"`.
3. After 600ms, appends the agent message with its first chunk of text and sets `status` to
   `"streaming"`. A chunk of roughly 20 characters (whole words) follows every 85ms.
4. When the reply is complete, sets `status` back to `"idle"`.

### Rendering a reply mid-stream

- While `status` is `"thinking"`, the last message is the user's. There is no agent message yet,
  so show your thinking indicator after it.
- While `status` is `"streaming"`, the **last message** is the reply being streamed. Its `text`
  is already repaired (unfinished bold closed, half-typed links held back, and so on), so render
  it with `ReplyMarkdown` from `src/ui` like any other message. Add a cursor or other streaming
  treatment to the last message only.
- Every other message is complete.

The text is GitHub-flavoured markdown: paragraphs, **bold**, bulleted and numbered lists.

## Canned replies

The reply depends on keywords in the message. Matching ignores case and punctuation, and only
matches whole words (`renew` doesn't match `new`, `reader` doesn't match `read`). The **first
intent in this order** with a matching keyword wins:

| Order | Intent   | Keywords                                          | The reply                                              |
| ----- | -------- | ------------------------------------------------- | ------------------------------------------------------ |
| 1     | delete   | delete, remove                                    | It would ask for a clear **yes** first; deleting from the conversation isn't wired up yet |
| 2     | create   | create, new                                       | A numbered list of what it would ask (topic, audience, tone); creating isn't wired up yet |
| 3     | open     | open, read                                        | Choose a manual in the library; opening from the conversation isn't wired up yet |
| 4     | list     | list, library, manuals, the phrase "what do I have" | A bulleted list of what each manual in the library shows |
| 5     | help     | help                                              | A bulleted list of what it understands                 |
| —     | fallback | anything else                                     | "I can't do that yet, I'm afraid…" and what it can do  |

So "Delete the new manual" is a delete, and "Help me create a manual" is a create.

## URL options

These set up the conversation when the page loads, so a single page load shows each screenshot
state. They combine.

| Option                  | Starting conversation                                                                 | `status`      |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------- |
| *(none)*                | Empty                                                                                 | `"idle"`      |
| `?conversation=demo`    | Three finished exchanges: "What do I have?" (list), "Open the one about haunted houses" (open), "Can you translate the sourdough manual into Klingon?" (fallback) | `"idle"` |
| `?agentFreeze=thinking` | Adds the user message "Let's start a new manual about building a treehouse" with no reply | `"thinking"`, forever |
| `?agentFreeze=0.5`      | Adds the same user message and its (create) reply, cut at the last chunk at or before 50% of its length, repaired | `"streaming"`, forever |

- `agentFreeze` takes `thinking` or any number from 0 to 1. Any other value is ignored.
- The frozen message comes after the demo turns, so `?conversation=demo&agentFreeze=0.5` shows a
  long conversation with a reply half-streamed at the bottom.
- A frozen reply never finishes, so `send` is ignored for the rest of that page load.
- These are separate from the reader's `?freeze`, which doesn't affect the agent.

## Example

```tsx
import { useState } from "react";
import { useAgent } from "../../agent";
import { ReplyMarkdown } from "../../ui";

function Conversation() {
  const { messages, status, send } = useAgent();
  const [draft, setDraft] = useState("");

  return (
    <section>
      {messages.map((message, index) => (
        <article key={message.id} data-role={message.role}>
          <ReplyMarkdown>{message.text}</ReplyMarkdown>
          {status === "streaming" && index === messages.length - 1 && <span>▍</span>}
        </article>
      ))}
      {status === "thinking" && <p>Thinking…</p>}
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

- `types.ts`: `AgentMessage` and `AgentStatus`.
- `replies.ts`: the intents, their keywords and the canned replies.
- `store.ts`: the conversation, `send`, the URL options and `useAgent`. Replies stream with
  `streamChunks` and are frozen with `frozenLength`, both from `src/manual/streamer.ts`.
