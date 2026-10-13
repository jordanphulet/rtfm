import { afterEach, describe, expect, it, vi } from "vitest";
import { streamReply } from "./api";
import type { LibrarianEvent } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A response whose body arrives in these pieces, as the server writes them. */
function streamed(...pieces: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("streamReply", () => {
  it("yields the reply's events and passes over the server's heartbeat comments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamed(
          ": heartbeat\n\n",
          'event: text\ndata: {"text":"Good "}\n\n: heart',
          'beat\n\nevent: text\ndata: {"text":"morning"}\n\n',
          ": heartbeat\n\nevent: done\ndata: {}\n\n",
        ),
      ),
    );

    const events: LibrarianEvent[] = [];
    for await (const event of streamReply([{ role: "user", text: "Good morning" }])) events.push(event);

    expect(events).toEqual([
      { event: "text", data: { text: "Good " } },
      { event: "text", data: { text: "morning" } },
      { event: "done", data: {} },
    ]);
  });
});
