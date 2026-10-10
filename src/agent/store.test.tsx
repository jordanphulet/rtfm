import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replyTo } from "./replies";
import type { UseAgentResult } from "./store";

async function loadAgent(search = "") {
  vi.stubGlobal("window", { location: { search } });
  vi.resetModules();
  const { useAgent } = await import("./store");

  return () => {
    let agent: UseAgentResult | undefined;
    function Probe() {
      agent = useAgent();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    return agent!;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAgent", () => {
  it("starts with an empty, idle conversation", async () => {
    const readAgent = await loadAgent();
    expect(readAgent()).toMatchObject({ messages: [], status: "idle" });
  });

  it("thinks for 600ms, then streams the reply to completion", async () => {
    const readAgent = await loadAgent();
    readAgent().send("  What do I have?  ");
    expect(readAgent().status).toBe("thinking");
    expect(readAgent().messages).toEqual([
      { id: expect.any(String), role: "user", text: "What do I have?" },
    ]);

    vi.advanceTimersByTime(599);
    expect(readAgent().status).toBe("thinking");

    vi.advanceTimersByTime(1);
    const streaming = readAgent();
    const reply = replyTo("What do I have?");
    expect(streaming.status).toBe("streaming");
    expect(streaming.messages).toHaveLength(2);
    expect(streaming.messages[1].role).toBe("agent");
    expect(streaming.messages[1].text.length).toBeGreaterThan(0);
    expect(streaming.messages[1].text.length).toBeLessThan(reply.length);

    vi.runAllTimers();
    const done = readAgent();
    expect(done.status).toBe("idle");
    expect(done.messages[1]).toEqual({ id: streaming.messages[1].id, role: "agent", text: reply });
  });

  it("shows repaired markdown mid-stream", async () => {
    const readAgent = await loadAgent();
    readAgent().send("help");
    vi.advanceTimersByTime(600);
    while (readAgent().status === "streaming") {
      const text = readAgent().messages[1].text;
      expect((text.match(/\*\*/g) ?? []).length % 2).toBe(0);
      vi.advanceTimersByTime(85);
    }
  });

  it("ignores sends while a reply is in progress, and blank sends", async () => {
    const readAgent = await loadAgent();
    readAgent().send("   ");
    expect(readAgent().messages).toEqual([]);

    readAgent().send("help");
    readAgent().send("list");
    vi.advanceTimersByTime(700);
    readAgent().send("list");
    vi.runAllTimers();
    expect(readAgent().messages.map((message) => message.role)).toEqual(["user", "agent"]);

    readAgent().send("list");
    expect(readAgent().messages).toHaveLength(3);
  });
});

describe("URL options", () => {
  it("?conversation=demo preloads three finished exchanges ending in the fallback", async () => {
    const { messages, status } = (await loadAgent("?conversation=demo"))();
    expect(status).toBe("idle");
    expect(messages.map((message) => message.role)).toEqual([
      "user", "agent", "user", "agent", "user", "agent",
    ]);
    expect(messages[1].text).toBe(replyTo("list"));
    expect(messages[3].text).toBe(replyTo("open"));
    expect(messages[5].text).toBe(replyTo("anything else"));
    expect(new Set(messages.map((message) => message.id)).size).toBe(6);
  });

  it("?agentFreeze=thinking adds a user message whose reply never arrives", async () => {
    const readAgent = await loadAgent("?agentFreeze=thinking");
    vi.runAllTimers();
    const { messages, status } = readAgent();
    expect(status).toBe("thinking");
    expect(messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("?agentFreeze=0.5 holds the reply half-streamed, with repaired markdown", async () => {
    const readAgent = await loadAgent("?agentFreeze=0.5");
    vi.runAllTimers();
    const { messages, status } = readAgent();
    const reply = replyTo(messages[0].text);
    expect(status).toBe("streaming");
    expect(messages.map((message) => message.role)).toEqual(["user", "agent"]);
    expect(messages[1].text.length).toBeGreaterThan(reply.length * 0.4);
    expect(messages[1].text.length).toBeLessThan(reply.length * 0.6);
    expect((messages[1].text.match(/\*\*/g) ?? []).length % 2).toBe(0);
  });

  it("combines ?agentFreeze with ?conversation=demo", async () => {
    const readAgent = await loadAgent("?conversation=demo&agentFreeze=thinking");
    const { messages, status } = readAgent();
    expect(status).toBe("thinking");
    expect(messages).toHaveLength(7);
    expect(messages[6].role).toBe("user");
  });

  it("ignores sends while a reply is frozen", async () => {
    const readAgent = await loadAgent("?agentFreeze=0.5");
    readAgent().send("help");
    vi.runAllTimers();
    expect(readAgent().messages).toHaveLength(2);
  });

  it.each(["?agentFreeze=later", "?agentFreeze=", "?agentFreeze=2"])(
    "ignores %s",
    async (search) => {
      const { messages, status } = (await loadAgent(search))();
      expect(status).toBe("idle");
      expect(messages).toEqual([]);
    },
  );
});
