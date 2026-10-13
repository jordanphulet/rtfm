import { apiFetch } from "../reportErrors";
import type { LibrarianEvent, LibrarianMessage } from "./types";

const LIBRARIAN_URL = "/api/librarian";

/**
 * Sends the conversation and yields the reply's events as they arrive. Throws if the server
 * can't be reached or answers with an error.
 */
export async function* streamReply(messages: LibrarianMessage[], freeze?: number): AsyncGenerator<LibrarianEvent> {
  const url = freeze === undefined ? LIBRARIAN_URL : `${LIBRARIAN_URL}?freeze=${freeze}`;
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok || !response.body) throw new Error(`POST ${url} answered ${response.status}`);

  let buffer = "";
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const event = parseEvent(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (event) yield event;
    }
  }
}

/** The block's event, or undefined for a block with none, such as the server's heartbeat comment. */
function parseEvent(block: string): LibrarianEvent | undefined {
  const event = block.match(/^event: (.*)$/m)?.[1];
  if (event === undefined) return undefined;
  const data = block.match(/^data: (.*)$/m)?.[1] ?? "{}";
  return { event, data: JSON.parse(data) } as LibrarianEvent;
}
