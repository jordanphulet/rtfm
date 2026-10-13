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
      yield parseEvent(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
    }
  }
}

function parseEvent(block: string): LibrarianEvent {
  const event = block.match(/^event: (.*)$/m)?.[1];
  const data = block.match(/^data: (.*)$/m)?.[1] ?? "{}";
  return { event, data: JSON.parse(data) } as LibrarianEvent;
}
