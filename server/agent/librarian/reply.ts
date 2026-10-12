import type { LibrarianEvent, LibrarianMessage } from "../../api/types.ts";
import type { Gateway } from "../../gateway/gateway.ts";
import { SpendingRefused, type PromptMessage } from "../../gateway/types.ts";
import type { ManualStore } from "../../storage/types.ts";
import { runAgent } from "../loop.ts";
import { LIBRARIAN_SYSTEM_PROMPT } from "./prompt.ts";
import { librarianTools } from "./tools.ts";

/**
 * Runs the librarian on the conversation and sends its reply as it goes: statuses, text (with a
 * paragraph break where a later turn's text follows an earlier turn's), page actions, then `done`
 * or `failed`. A client that disconnects gets nothing more.
 */
export async function sendReply({ gateway, store, conversation, signal, send }: {
  gateway: Gateway;
  store: ManualStore;
  conversation: LibrarianMessage[];
  signal: AbortSignal;
  send: (event: LibrarianEvent) => void;
}): Promise<void> {
  let turn = 0;
  const countingTurns: Gateway = {
    stream(...call) {
      turn += 1;
      return gateway.stream(...call);
    },
  };
  const run = runAgent({
    gateway: countingTurns,
    job: "librarian",
    system: LIBRARIAN_SYSTEM_PROMPT,
    tools: librarianTools({
      gateway,
      store,
      onStatus: (text) => send({ event: "status", data: { text } }),
      onAction: (action) => send({ event: "action", data: action }),
    }),
    messages: conversation.map(promptMessage),
    signal,
  });
  let lastTextTurn = 0;
  try {
    for await (const event of run) {
      if (event.type === "status") {
        send({ event: "status", data: { text: event.text } });
        continue;
      }
      const startsLaterTurn = lastTextTurn !== 0 && lastTextTurn !== turn;
      lastTextTurn = turn;
      send({ event: "text", data: { text: startsLaterTurn ? `\n\n${event.text.trimStart()}` : event.text } });
    }
    send({ event: "done", data: {} });
  } catch (error) {
    if (signal.aborted) return;
    if (!(error instanceof SpendingRefused)) console.error("The librarian's reply failed:", error);
    send({ event: "failed", data: { reason: error instanceof SpendingRefused ? "budget" : "error" } });
  }
}

function promptMessage({ role, text }: LibrarianMessage): PromptMessage {
  return { role: role === "agent" ? "assistant" : "user", content: text };
}
