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

  it("reads the stream in a browser that can't iterate streams, as Safari before 27 can't", async () => {
    const { prototype } = ReadableStream as unknown as { prototype: Record<symbol | string, unknown> };
    const iterate = { asyncIterator: prototype[Symbol.asyncIterator], values: prototype.values };
    delete prototype[Symbol.asyncIterator];
    delete prototype.values;
    try {
      vi.stubGlobal("fetch", vi.fn(async () => streamed('event: text\ndata: {"text":"Opening."}\n\n', "event: done\ndata: {}\n\n")));

      const events: LibrarianEvent[] = [];
      for await (const event of streamReply([{ role: "user", text: "Open the haunted house one." }])) events.push(event);

      expect(events).toEqual([
        { event: "text", data: { text: "Opening." } },
        { event: "done", data: {} },
      ]);
    } finally {
      prototype[Symbol.asyncIterator] = iterate.asyncIterator;
      prototype.values = iterate.values;
    }
  });

  it("ignores the stream failing after the event the caller stops at", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));

    const events: LibrarianEvent[] = [];
    for await (const event of streamReply([{ role: "user", text: "Open the haunted house one." }])) {
      events.push(event);
      controller.error(new TypeError("The network connection was lost."));
      await new Promise((resolve) => setTimeout(resolve, 0));
      break;
    }

    expect(events).toEqual([{ event: "done", data: {} }]);
  });
});
