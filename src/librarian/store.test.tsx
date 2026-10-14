import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UseLibrarianResult } from "./store";
import type { LibrarianAction, LibrarianEvent, LibrarianMessage } from "./types";

interface Request {
  url: string;
  messages: LibrarianMessage[];
  send: (...events: LibrarianEvent[]) => void;
  end: () => void;
  fail: (error: Error) => void;
}

/** Stands in for the server: each POST waits for the test to send its events. */
function fakeServer() {
  const requests: Request[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    const encoder = new TextEncoder();
    requests.push({
      url,
      messages: JSON.parse(String(init.body)).messages,
      send: (...events) => {
        for (const { event, data } of events) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      },
      end: () => controller.close(),
      fail: (error) => controller.error(error),
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  return { fetch, requests };
}

async function loadLibrarian(search = "", server = fakeServer()) {
  vi.stubGlobal("window", { location: { search } });
  vi.stubGlobal("fetch", server.fetch);
  vi.resetModules();
  const { useLibrarian, handleActions } = await import("./store");

  function readLibrarian() {
    let librarian: UseLibrarianResult | undefined;
    function Probe() {
      librarian = useLibrarian();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    return librarian!;
  }
  return { readLibrarian, handleActions, requests: server.requests };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function reply(request: Request, ...events: LibrarianEvent[]) {
  request.send(...events);
  request.end();
  await flush();
}

const text = (value: string): LibrarianEvent => ({ event: "text", data: { text: value } });
const status = (value: string): LibrarianEvent => ({ event: "status", data: { text: value } });
const done: LibrarianEvent = { event: "done", data: {} };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLibrarian", () => {
  it("starts with an empty, idle conversation", async () => {
    const { readLibrarian, requests } = await loadLibrarian();
    expect(readLibrarian()).toMatchObject({ messages: [], status: "idle" });
    expect(requests).toEqual([]);
  });

  it("sends the message, shows the loop's statuses, then streams the reply to completion", async () => {
    const { readLibrarian, requests } = await loadLibrarian();
    readLibrarian().send("  What do I have?  ");
    expect(readLibrarian()).toMatchObject({ status: "thinking", activity: "Thinking…" });
    expect(readLibrarian().messages).toEqual([{ id: expect.any(String), role: "user", text: "What do I have?" }]);
    await flush();
    expect(requests[0]).toMatchObject({ url: "/api/librarian", messages: [{ role: "user", text: "What do I have?" }] });

    requests[0]!.send(status("Checking the shelves…"));
    await flush();
    expect(readLibrarian()).toMatchObject({ status: "thinking", activity: "Checking the shelves…" });

    requests[0]!.send(text("You have **two"));
    await flush();
    expect(readLibrarian().status).toBe("streaming");
    expect(readLibrarian().messages[1]).toMatchObject({ role: "agent", text: "You have **two**" });

    await reply(requests[0]!, text(" manuals**."), done);
    expect(readLibrarian().status).toBe("idle");
    expect(readLibrarian().messages[1]).toEqual({ id: expect.any(String), role: "agent", text: "You have **two manuals**." });
  });

  it("keeps text written before a tool on screen while the tool runs, and replaces it with the text that follows", async () => {
    const { readLibrarian, requests } = await loadLibrarian();
    readLibrarian().send("Delete the geese one");
    await flush();
    requests[0]!.send(text("Let me get the correct id."));
    await flush();
    requests[0]!.send(status("Preparing the delete…"));
    await flush();
    expect(readLibrarian()).toMatchObject({ status: "thinking", activity: "Preparing the delete…" });
    expect(readLibrarian().messages[1]).toMatchObject({ role: "agent", text: "Let me get the correct id." });

    requests[0]!.send({ event: "withdraw", data: {} }, text("It’s waiting"));
    await flush();
    expect(readLibrarian().status).toBe("streaming");
    expect(readLibrarian().messages.map(({ text }) => text)).toEqual(["Delete the geese one", "It’s waiting"]);

    await reply(requests[0]!, text(" for you."), done);
    expect(readLibrarian().messages[1]).toMatchObject({ role: "agent", text: "It’s waiting for you." });
  });

  it("keeps text written before a tool as the reply when nothing follows it, and hands over the action", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    const actions: LibrarianAction[] = [];
    handleActions((action) => actions.push(action));
    readLibrarian().send("Delete the geese one");
    await flush();
    const proposeDelete: LibrarianEvent = { event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } };

    await reply(requests[0]!, text("I’ll ask you to confirm."), status("Preparing the delete…"), proposeDelete, done);

    expect(readLibrarian().status).toBe("idle");
    expect(readLibrarian().messages[1]).toEqual({ id: expect.any(String), role: "agent", text: "I’ll ask you to confirm." });
    expect(actions).toEqual([{ type: "propose-delete", manualId: "negotiating-with-geese" }]);
  });

  it("shows no message for a reply with no text, and still hands over its action", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    const actions: LibrarianAction[] = [];
    handleActions((action) => actions.push(action));
    readLibrarian().send("Delete the geese one");
    await flush();
    const proposeDelete: LibrarianEvent = { event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } };

    await reply(requests[0]!, status("Preparing the delete…"), proposeDelete, done);

    expect(readLibrarian().status).toBe("idle");
    expect(readLibrarian().messages).toEqual([{ id: expect.any(String), role: "user", text: "Delete the geese one" }]);
    expect(actions).toEqual([{ type: "propose-delete", manualId: "negotiating-with-geese" }]);
  });

  it("sends the finished exchanges with each new message, leaving out failed ones", async () => {
    const { readLibrarian, requests } = await loadLibrarian();
    readLibrarian().send("What do I have?");
    await flush();
    await reply(requests[0]!, text("Seven manuals."), done);
    readLibrarian().send("Open the geese one");
    await flush();
    await reply(requests[1]!, text("Open"), { event: "failed", data: { reason: "error" } });
    readLibrarian().send("Open the geese one, please");
    await flush();

    expect(requests[2]!.messages).toEqual([
      { role: "user", text: "What do I have?" },
      { role: "agent", text: "Seven manuals." },
      { role: "user", text: "Open the geese one, please" },
    ]);
  });

  it("sends only the latest exchanges, leaving out any too long to send", async () => {
    const { readLibrarian, requests } = await loadLibrarian();
    const tooLong = "x".repeat(4001);
    for (let index = 0; index < 12; index++) {
      readLibrarian().send(`Question ${index}`);
      await flush();
      await reply(requests[index]!, text(index === 11 ? tooLong : `Answer ${index}`), done);
    }
    readLibrarian().send("And now?");
    await flush();

    const sent = requests[12]!.messages;
    expect(sent).toHaveLength(21);
    expect(sent[0]).toEqual({ role: "user", text: "Question 1" });
    expect(sent.at(-2)).toEqual({ role: "agent", text: "Answer 10" });
    expect(sent.at(-1)).toEqual({ role: "user", text: "And now?" });
  });

  it.each([
    ["budget", [{ event: "failed", data: { reason: "budget" } }] as LibrarianEvent[]],
    ["error", [{ event: "failed", data: { reason: "error" } }] as LibrarianEvent[]],
    ["error", [] as LibrarianEvent[]],
  ])("marks the reply failed (%s) when the server says so or the stream ends early", async (reason, events) => {
    const { readLibrarian, requests } = await loadLibrarian();
    readLibrarian().send("What do I have?");
    await flush();
    await reply(requests[0]!, text("You have"), ...events);
    expect(readLibrarian().status).toBe("idle");
    expect(readLibrarian().messages[1]).toMatchObject({ role: "agent", text: "You have", failure: reason });
  });

  it.each([
    ["can't be reached", async () => Promise.reject(new TypeError("Failed to fetch"))],
    ["answers with an error", async () => new Response("Internal error", { status: 500 })],
  ])("marks the reply failed when the server %s, without reporting what is already logged", async (_, fetch) => {
    const { readLibrarian } = await loadLibrarian("", { fetch: vi.fn(fetch), requests: [] });
    const reportError = vi.fn();
    vi.stubGlobal("window", { location: { search: "" }, reportError });
    readLibrarian().send("What do I have?");
    await flush();
    expect(readLibrarian().status).toBe("idle");
    expect(readLibrarian().messages[1]).toMatchObject({ role: "agent", text: "", failure: "error" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("marks the reply failed when its stream throws, and reports the error once", async () => {
    const { readLibrarian, requests } = await loadLibrarian();
    const reportError = vi.fn();
    vi.stubGlobal("window", { location: { search: "" }, reportError });
    readLibrarian().send("What do I have?");
    await flush();
    requests[0]!.send(text("You have"));
    await flush();
    const streamError = new TypeError("network error");
    requests[0]!.fail(streamError);
    await flush();
    expect(readLibrarian().status).toBe("idle");
    expect(readLibrarian().messages[1]).toMatchObject({ role: "agent", text: "You have", failure: "error" });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(streamError);
  });

  it("ignores blank sends and sends while a reply is in progress", async () => {
    const { readLibrarian, requests } = await loadLibrarian();
    readLibrarian().send("   ");
    expect(readLibrarian().messages).toEqual([]);
    readLibrarian().send("help");
    readLibrarian().send("list");
    await flush();
    expect(requests).toHaveLength(1);
    expect(readLibrarian().messages).toHaveLength(1);
  });

  it("hands a page action to the handler only once the reply is done", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    const actions: LibrarianAction[] = [];
    handleActions((action) => actions.push(action));
    readLibrarian().send("Delete the geese one");
    await flush();
    requests[0]!.send({ event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } }, text("Confirm it?"));
    await flush();
    expect(actions).toEqual([]);

    await reply(requests[0]!, done);
    expect(actions).toEqual([{ type: "propose-delete", manualId: "negotiating-with-geese" }]);
  });

  it("keeps a reply finished when the page's action handler throws, and reports the error", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    const reportError = vi.fn();
    vi.stubGlobal("window", { location: { search: "" }, reportError });
    const handlerError = new Error("The page couldn't open it");
    handleActions(() => {
      throw handlerError;
    });
    readLibrarian().send("Open the haunted house one.");
    await flush();
    const open: LibrarianEvent = { event: "action", data: { type: "open", manualId: "the-haunt-that-listens" } };
    await reply(requests[0]!, open, text("Opening *The Haunt That Listens*."), done);

    expect(readLibrarian()).toMatchObject({ status: "idle" });
    expect(readLibrarian().messages[1]).toEqual({
      id: expect.any(String),
      role: "agent",
      text: "Opening *The Haunt That Listens*.",
    });
    expect(reportError).toHaveBeenCalledWith(handlerError);
  });

  it("drops a page action when the reply fails, or when nothing is handling actions", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    const actions: LibrarianAction[] = [];
    const stopHandling = handleActions((action) => actions.push(action));
    readLibrarian().send("Open the geese one");
    await flush();
    await reply(requests[0]!, { event: "action", data: { type: "open", manualId: "negotiating-with-geese" } }, {
      event: "failed",
      data: { reason: "error" },
    });
    stopHandling();
    readLibrarian().send("Open the geese one");
    await flush();
    await reply(requests[1]!, { event: "action", data: { type: "open", manualId: "negotiating-with-geese" } }, done);
    expect(actions).toEqual([]);
  });

  it("sends how a proposed delete's confirmation ended with the reply that proposed it", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    handleActions(() => {});
    const proposeDelete: LibrarianEvent = { event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } };
    readLibrarian().send("Delete the geese one");
    await flush();
    await reply(requests[0]!, proposeDelete, text("Confirm it, or keep it."), done);
    readLibrarian().reportDeleteOutcome("kept");
    readLibrarian().reportDeleteOutcome("deleted");
    readLibrarian().send("Delete the geese one");
    await flush();

    expect(readLibrarian().messages[1]).toMatchObject({ role: "agent", deleteOutcome: "kept" });
    expect(requests[1]!.messages).toEqual([
      { role: "user", text: "Delete the geese one" },
      { role: "agent", text: "Confirm it, or keep it.", deleteOutcome: "kept" },
      { role: "user", text: "Delete the geese one" },
    ]);

    await reply(requests[1]!, proposeDelete, text("Confirm it, or keep it."), done);
    readLibrarian().reportDeleteOutcome("deleted");
    expect(readLibrarian().messages.map(({ deleteOutcome }) => deleteOutcome)).toEqual([undefined, "kept", undefined, "deleted"]);
  });

  it("notes no delete outcome on a reply that proposed none", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    handleActions(() => {});
    readLibrarian().send("Open the geese one");
    await flush();
    await reply(requests[0]!, { event: "action", data: { type: "open", manualId: "negotiating-with-geese" } }, text("Opening."), done);
    readLibrarian().reportDeleteOutcome("kept");
    expect(readLibrarian().messages[1]).not.toHaveProperty("deleteOutcome");
  });

  it("hands over a created manual as soon as it arrives, even if the reply then fails", async () => {
    const { readLibrarian, requests, handleActions } = await loadLibrarian();
    const actions: LibrarianAction[] = [];
    handleActions((action) => actions.push(action));
    readLibrarian().send("Start a manual about kites");
    await flush();
    requests[0]!.send({ event: "action", data: { type: "created", manualId: "flying-kites" } });
    await flush();
    expect(actions).toEqual([{ type: "created", manualId: "flying-kites" }]);

    await reply(requests[0]!, { event: "failed", data: { reason: "budget" } });
    expect(actions).toEqual([{ type: "created", manualId: "flying-kites" }]);
  });
});

describe("URL options", () => {
  it("?conversation=demo asks for each demo reply whole, in turn, and ends idle", async () => {
    const { readLibrarian, requests } = await loadLibrarian("?conversation=demo");
    expect(readLibrarian().messages.map(({ role }) => role)).toEqual(["user"]);
    for (const index of [0, 1, 2]) {
      await flush();
      expect(requests[index]!.url).toBe("/api/librarian?freeze=1");
      expect(requests[index]!.messages).toHaveLength(index * 2 + 1);
      await reply(requests[index]!, text(`Reply ${index + 1}.`), done);
    }
    const { messages, status } = readLibrarian();
    expect(status).toBe("idle");
    expect(messages.map(({ role }) => role)).toEqual(["user", "agent", "user", "agent", "user", "agent"]);
    expect(messages[5]!.text).toBe("Reply 3.");
    expect(new Set(messages.map(({ id }) => id)).size).toBe(6);
  });

  it("?librarianFreeze=thinking adds a user message whose reply is never asked for", async () => {
    const { readLibrarian, requests } = await loadLibrarian("?librarianFreeze=thinking");
    await flush();
    expect(readLibrarian()).toMatchObject({ status: "thinking", activity: "Thinking…" });
    expect(readLibrarian().messages.map(({ role }) => role)).toEqual(["user"]);
    expect(requests).toEqual([]);
  });

  it("?librarianFreeze=0.5 asks for the reply cut in half, which then stays as it is", async () => {
    const { readLibrarian, requests } = await loadLibrarian("?librarianFreeze=0.5");
    await flush();
    expect(requests[0]!.url).toBe("/api/librarian?freeze=0.5");
    await reply(requests[0]!, status("Planning a manual…"), text("*Building a Treehouse* is on your **shel"), {
      event: "frozen",
      data: {},
    });
    expect(readLibrarian().status).toBe("streaming");
    expect(readLibrarian().messages[1]!.text).toBe("*Building a Treehouse* is on your **shel**");
    readLibrarian().send("help");
    expect(requests).toHaveLength(1);
  });

  it("?librarianFreeze=0 holds the loop's status", async () => {
    const { readLibrarian, requests } = await loadLibrarian("?librarianFreeze=0");
    await flush();
    await reply(requests[0]!, status("Planning a manual…"), status("Planning “Building a Treehouse”…"), {
      event: "frozen",
      data: {},
    });
    expect(readLibrarian()).toMatchObject({ status: "thinking", activity: "Planning “Building a Treehouse”…" });
    expect(readLibrarian().messages).toHaveLength(1);
  });

  it("combines ?librarianFreeze with ?conversation=demo", async () => {
    const { readLibrarian, requests } = await loadLibrarian("?conversation=demo&librarianFreeze=thinking");
    for (const index of [0, 1, 2]) {
      await flush();
      await reply(requests[index]!, text("Reply."), done);
    }
    expect(readLibrarian().status).toBe("thinking");
    expect(readLibrarian().messages).toHaveLength(7);
  });

  it.each(["?librarianFreeze=later", "?librarianFreeze=", "?librarianFreeze=2"])("ignores %s", async (search) => {
    const { readLibrarian, requests } = await loadLibrarian(search);
    await flush();
    expect(readLibrarian()).toMatchObject({ status: "idle", messages: [] });
    expect(requests).toEqual([]);
  });
});
