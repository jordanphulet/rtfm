import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UseAgentResult } from "./store";
import type { AgentAction, LibrarianEvent, LibrarianMessage } from "./types";

interface Request {
  url: string;
  messages: LibrarianMessage[];
  send: (...events: LibrarianEvent[]) => void;
  end: () => void;
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
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  return { fetch, requests };
}

async function loadAgent(search = "", server = fakeServer()) {
  vi.stubGlobal("window", { location: { search } });
  vi.stubGlobal("fetch", server.fetch);
  vi.resetModules();
  const { useAgent, handleActions } = await import("./store");

  function readAgent() {
    let agent: UseAgentResult | undefined;
    function Probe() {
      agent = useAgent();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    return agent!;
  }
  return { readAgent, handleActions, requests: server.requests };
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

describe("useAgent", () => {
  it("starts with an empty, idle conversation", async () => {
    const { readAgent, requests } = await loadAgent();
    expect(readAgent()).toMatchObject({ messages: [], status: "idle" });
    expect(requests).toEqual([]);
  });

  it("sends the message, shows the loop's statuses, then streams the reply to completion", async () => {
    const { readAgent, requests } = await loadAgent();
    readAgent().send("  What do I have?  ");
    expect(readAgent()).toMatchObject({ status: "thinking", activity: "Thinking…" });
    expect(readAgent().messages).toEqual([{ id: expect.any(String), role: "user", text: "What do I have?" }]);
    await flush();
    expect(requests[0]).toMatchObject({ url: "/api/librarian", messages: [{ role: "user", text: "What do I have?" }] });

    requests[0]!.send(status("Checking the shelves…"));
    await flush();
    expect(readAgent()).toMatchObject({ status: "thinking", activity: "Checking the shelves…" });

    requests[0]!.send(text("You have **two"));
    await flush();
    expect(readAgent().status).toBe("streaming");
    expect(readAgent().messages[1]).toMatchObject({ role: "agent", text: "You have **two**" });

    await reply(requests[0]!, text(" manuals**."), done);
    expect(readAgent().status).toBe("idle");
    expect(readAgent().messages[1]).toEqual({ id: expect.any(String), role: "agent", text: "You have **two manuals**." });
  });

  it("keeps text written before a tool on screen while the tool runs, and replaces it with the text that follows", async () => {
    const { readAgent, requests } = await loadAgent();
    readAgent().send("Delete the geese one");
    await flush();
    requests[0]!.send(text("Let me get the correct id."));
    await flush();
    requests[0]!.send(status("Preparing the delete…"));
    await flush();
    expect(readAgent()).toMatchObject({ status: "thinking", activity: "Preparing the delete…" });
    expect(readAgent().messages[1]).toMatchObject({ role: "agent", text: "Let me get the correct id." });

    requests[0]!.send({ event: "withdraw", data: {} }, text("It’s waiting"));
    await flush();
    expect(readAgent().status).toBe("streaming");
    expect(readAgent().messages.map(({ text }) => text)).toEqual(["Delete the geese one", "It’s waiting"]);

    await reply(requests[0]!, text(" for you."), done);
    expect(readAgent().messages[1]).toMatchObject({ role: "agent", text: "It’s waiting for you." });
  });

  it("keeps text written before a tool as the reply when nothing follows it, and hands over the action", async () => {
    const { readAgent, requests, handleActions } = await loadAgent();
    const actions: AgentAction[] = [];
    handleActions((action) => actions.push(action));
    readAgent().send("Delete the geese one");
    await flush();
    const proposeDelete: LibrarianEvent = { event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } };

    await reply(requests[0]!, text("I’ll ask you to confirm."), status("Preparing the delete…"), proposeDelete, done);

    expect(readAgent().status).toBe("idle");
    expect(readAgent().messages[1]).toEqual({ id: expect.any(String), role: "agent", text: "I’ll ask you to confirm." });
    expect(actions).toEqual([{ type: "propose-delete", manualId: "negotiating-with-geese" }]);
  });

  it("shows no message for a reply with no text, and still hands over its action", async () => {
    const { readAgent, requests, handleActions } = await loadAgent();
    const actions: AgentAction[] = [];
    handleActions((action) => actions.push(action));
    readAgent().send("Delete the geese one");
    await flush();
    const proposeDelete: LibrarianEvent = { event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } };

    await reply(requests[0]!, status("Preparing the delete…"), proposeDelete, done);

    expect(readAgent().status).toBe("idle");
    expect(readAgent().messages).toEqual([{ id: expect.any(String), role: "user", text: "Delete the geese one" }]);
    expect(actions).toEqual([{ type: "propose-delete", manualId: "negotiating-with-geese" }]);
  });

  it("sends the finished exchanges with each new message, leaving out failed ones", async () => {
    const { readAgent, requests } = await loadAgent();
    readAgent().send("What do I have?");
    await flush();
    await reply(requests[0]!, text("Seven manuals."), done);
    readAgent().send("Open the geese one");
    await flush();
    await reply(requests[1]!, text("Open"), { event: "failed", data: { reason: "error" } });
    readAgent().send("Open the geese one, please");
    await flush();

    expect(requests[2]!.messages).toEqual([
      { role: "user", text: "What do I have?" },
      { role: "agent", text: "Seven manuals." },
      { role: "user", text: "Open the geese one, please" },
    ]);
  });

  it("sends only the latest exchanges, leaving out any too long to send", async () => {
    const { readAgent, requests } = await loadAgent();
    const tooLong = "x".repeat(4001);
    for (let index = 0; index < 12; index++) {
      readAgent().send(`Question ${index}`);
      await flush();
      await reply(requests[index]!, text(index === 11 ? tooLong : `Answer ${index}`), done);
    }
    readAgent().send("And now?");
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
    const { readAgent, requests } = await loadAgent();
    readAgent().send("What do I have?");
    await flush();
    await reply(requests[0]!, text("You have"), ...events);
    expect(readAgent().status).toBe("idle");
    expect(readAgent().messages[1]).toMatchObject({ role: "agent", text: "You have", failure: reason });
  });

  it("marks the reply failed when the server can't be reached", async () => {
    const server = { fetch: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))), requests: [] };
    const { readAgent } = await loadAgent("", server);
    readAgent().send("What do I have?");
    await flush();
    expect(readAgent().status).toBe("idle");
    expect(readAgent().messages[1]).toMatchObject({ role: "agent", text: "", failure: "error" });
  });

  it("ignores blank sends and sends while a reply is in progress", async () => {
    const { readAgent, requests } = await loadAgent();
    readAgent().send("   ");
    expect(readAgent().messages).toEqual([]);
    readAgent().send("help");
    readAgent().send("list");
    await flush();
    expect(requests).toHaveLength(1);
    expect(readAgent().messages).toHaveLength(1);
  });

  it("hands a page action to the handler only once the reply is done", async () => {
    const { readAgent, requests, handleActions } = await loadAgent();
    const actions: AgentAction[] = [];
    handleActions((action) => actions.push(action));
    readAgent().send("Delete the geese one");
    await flush();
    requests[0]!.send({ event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } }, text("Confirm it?"));
    await flush();
    expect(actions).toEqual([]);

    await reply(requests[0]!, done);
    expect(actions).toEqual([{ type: "propose-delete", manualId: "negotiating-with-geese" }]);
  });

  it("drops a page action when the reply fails, or when nothing is handling actions", async () => {
    const { readAgent, requests, handleActions } = await loadAgent();
    const actions: AgentAction[] = [];
    const stopHandling = handleActions((action) => actions.push(action));
    readAgent().send("Open the geese one");
    await flush();
    await reply(requests[0]!, { event: "action", data: { type: "open", manualId: "negotiating-with-geese" } }, {
      event: "failed",
      data: { reason: "error" },
    });
    stopHandling();
    readAgent().send("Open the geese one");
    await flush();
    await reply(requests[1]!, { event: "action", data: { type: "open", manualId: "negotiating-with-geese" } }, done);
    expect(actions).toEqual([]);
  });

  it("sends how a proposed delete's confirmation ended with the reply that proposed it", async () => {
    const { readAgent, requests, handleActions } = await loadAgent();
    handleActions(() => {});
    const proposeDelete: LibrarianEvent = { event: "action", data: { type: "propose-delete", manualId: "negotiating-with-geese" } };
    readAgent().send("Delete the geese one");
    await flush();
    await reply(requests[0]!, proposeDelete, text("Confirm it, or keep it."), done);
    readAgent().reportDeleteOutcome("kept");
    readAgent().reportDeleteOutcome("deleted");
    readAgent().send("Delete the geese one");
    await flush();

    expect(readAgent().messages[1]).toMatchObject({ role: "agent", deleteOutcome: "kept" });
    expect(requests[1]!.messages).toEqual([
      { role: "user", text: "Delete the geese one" },
      { role: "agent", text: "Confirm it, or keep it.", deleteOutcome: "kept" },
      { role: "user", text: "Delete the geese one" },
    ]);

    await reply(requests[1]!, proposeDelete, text("Confirm it, or keep it."), done);
    readAgent().reportDeleteOutcome("deleted");
    expect(readAgent().messages.map(({ deleteOutcome }) => deleteOutcome)).toEqual([undefined, "kept", undefined, "deleted"]);
  });

  it("notes no delete outcome on a reply that proposed none", async () => {
    const { readAgent, requests, handleActions } = await loadAgent();
    handleActions(() => {});
    readAgent().send("Open the geese one");
    await flush();
    await reply(requests[0]!, { event: "action", data: { type: "open", manualId: "negotiating-with-geese" } }, text("Opening."), done);
    readAgent().reportDeleteOutcome("kept");
    expect(readAgent().messages[1]).not.toHaveProperty("deleteOutcome");
  });

  it("hands over a created manual as soon as it arrives, even if the reply then fails", async () => {
    const { readAgent, requests, handleActions } = await loadAgent();
    const actions: AgentAction[] = [];
    handleActions((action) => actions.push(action));
    readAgent().send("Start a manual about kites");
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
    const { readAgent, requests } = await loadAgent("?conversation=demo");
    expect(readAgent().messages.map(({ role }) => role)).toEqual(["user"]);
    for (const index of [0, 1, 2]) {
      await flush();
      expect(requests[index]!.url).toBe("/api/librarian?freeze=1");
      expect(requests[index]!.messages).toHaveLength(index * 2 + 1);
      await reply(requests[index]!, text(`Reply ${index + 1}.`), done);
    }
    const { messages, status } = readAgent();
    expect(status).toBe("idle");
    expect(messages.map(({ role }) => role)).toEqual(["user", "agent", "user", "agent", "user", "agent"]);
    expect(messages[5]!.text).toBe("Reply 3.");
    expect(new Set(messages.map(({ id }) => id)).size).toBe(6);
  });

  it("?agentFreeze=thinking adds a user message whose reply is never asked for", async () => {
    const { readAgent, requests } = await loadAgent("?agentFreeze=thinking");
    await flush();
    expect(readAgent()).toMatchObject({ status: "thinking", activity: "Thinking…" });
    expect(readAgent().messages.map(({ role }) => role)).toEqual(["user"]);
    expect(requests).toEqual([]);
  });

  it("?agentFreeze=0.5 asks for the reply cut in half, which then stays as it is", async () => {
    const { readAgent, requests } = await loadAgent("?agentFreeze=0.5");
    await flush();
    expect(requests[0]!.url).toBe("/api/librarian?freeze=0.5");
    await reply(requests[0]!, status("Planning a manual…"), text("*Building a Treehouse* is on your **shel"), {
      event: "frozen",
      data: {},
    });
    expect(readAgent().status).toBe("streaming");
    expect(readAgent().messages[1]!.text).toBe("*Building a Treehouse* is on your **shel**");
    readAgent().send("help");
    expect(requests).toHaveLength(1);
  });

  it("?agentFreeze=0 holds the loop's status", async () => {
    const { readAgent, requests } = await loadAgent("?agentFreeze=0");
    await flush();
    await reply(requests[0]!, status("Planning a manual…"), status("Planning “Building a Treehouse”…"), {
      event: "frozen",
      data: {},
    });
    expect(readAgent()).toMatchObject({ status: "thinking", activity: "Planning “Building a Treehouse”…" });
    expect(readAgent().messages).toHaveLength(1);
  });

  it("combines ?agentFreeze with ?conversation=demo", async () => {
    const { readAgent, requests } = await loadAgent("?conversation=demo&agentFreeze=thinking");
    for (const index of [0, 1, 2]) {
      await flush();
      await reply(requests[index]!, text("Reply."), done);
    }
    expect(readAgent().status).toBe("thinking");
    expect(readAgent().messages).toHaveLength(7);
  });

  it.each(["?agentFreeze=later", "?agentFreeze=", "?agentFreeze=2"])("ignores %s", async (search) => {
    const { readAgent, requests } = await loadAgent(search);
    await flush();
    expect(readAgent()).toMatchObject({ status: "idle", messages: [] });
    expect(requests).toEqual([]);
  });
});
