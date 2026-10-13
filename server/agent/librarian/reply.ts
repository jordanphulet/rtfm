import type { LibrarianEvent, LibrarianMessage } from "../../api/types.ts";
import type { Gateway } from "../../gateway/gateway.ts";
import { SpendingRefused, type PromptMessage } from "../../gateway/types.ts";
import type { ManualStore } from "../../storage/types.ts";
import { runAgent } from "../loop.ts";
import { DELETE_OUTCOME_NOTES, LIBRARIAN_SYSTEM_PROMPT } from "./prompt.ts";
import { librarianTools } from "./tools.ts";

/**
 * Runs the librarian on the conversation and sends its reply as it goes: statuses, text, page
 * actions, then `done` or `failed`. Text the model writes before calling a tool stays while the
 * tool runs, and is withdrawn just before the model writes more text after it, so the reply is
 * the last text the model wrote. A client that disconnects gets nothing more.
 */
export async function sendReply({ gateway, store, conversation, signal, send }: {
  gateway: Gateway;
  store: ManualStore;
  conversation: LibrarianMessage[];
  signal: AbortSignal;
  send: (event: LibrarianEvent) => void;
}): Promise<void> {
  let textSent = false;
  let toolCalledSinceText = false;
  const withdrawingTextBeforeTools: Gateway = {
    async *stream(...call) {
      for await (const event of gateway.stream(...call)) {
        if (event.type === "tool-input" || event.type === "tool-use") toolCalledSinceText = textSent;
        if (event.type === "text") {
          if (toolCalledSinceText) send({ event: "withdraw", data: {} });
          toolCalledSinceText = false;
          textSent = true;
        }
        yield event;
      }
    },
  };
  const run = runAgent({
    gateway: withdrawingTextBeforeTools,
    job: "librarian",
    system: LIBRARIAN_SYSTEM_PROMPT,
    tools: librarianTools({
      gateway,
      store,
      onStatus: (text) => send({ event: "status", data: { text } }),
      onAction: (action) => send({ event: "action", data: action }),
    }),
    messages: promptMessages(conversation),
    signal,
  });
  try {
    for await (const event of run) {
      if (event.type === "status") {
        send({ event: "status", data: { text: event.text } });
        continue;
      }
      send({ event: "text", data: { text: event.text } });
    }
    send({ event: "done", data: {} });
  } catch (error) {
    if (signal.aborted) return;
    if (!(error instanceof SpendingRefused)) console.error("The librarian's reply failed:", error);
    send({ event: "failed", data: { reason: error instanceof SpendingRefused ? "budget" : "error" } });
  }
}

/**
 * The conversation as plain text. A user message that follows a reply which proposed a delete
 * starts with the page's note of how that delete's confirmation ended.
 */
function promptMessages(conversation: LibrarianMessage[]): PromptMessage[] {
  return conversation.map(({ role, text }, index) => {
    if (role === "agent") return { role: "assistant", content: text };
    const deleteOutcome = conversation[index - 1]?.deleteOutcome;
    return { role: "user", content: deleteOutcome ? `${DELETE_OUTCOME_NOTES[deleteOutcome]}\n\n${text}` : text };
  });
}
