import { apiFetch } from "../reportErrors";
import type { LibrarianEvent, LibrarianMessage } from "./types";

const LIBRARIAN_URL = "/api/librarian";

/**
 * Sends the conversation and yields the reply's events as they arrive. Throws if the server
 * can't be reached or answers with an error. Once the caller stops early, as it does at `done`,
 * the rest of the stream is cancelled and anything it then fails with is ignored. It reads
 * through a reader, since Safari before 27 can't iterate a stream with `for await`.
 */
export async function* streamReply(messages: LibrarianMessage[], freeze?: number): AsyncGenerator<LibrarianEvent> {
  const url = freeze === undefined ? LIBRARIAN_URL : `${LIBRARIAN_URL}?freeze=${freeze}`;
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok || !response.body) throw new Error(`POST ${url} answered ${response.status}`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    let buffer = "";
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      buffer += read.value;
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const event = parseEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event) yield event;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** The block's event, or undefined for a block with none, such as the server's heartbeat comment. */
function parseEvent(block: string): LibrarianEvent | undefined {
  const event = block.match(/^event: (.*)$/m)?.[1];
  if (event === undefined) return undefined;
  const data = block.match(/^data: (.*)$/m)?.[1] ?? "{}";
  return { event, data: JSON.parse(data) } as LibrarianEvent;
}
