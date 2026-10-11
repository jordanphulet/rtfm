import type { AgentResult } from "@strands-agents/sdk";
import { describe, expect, it } from "vitest";
import { SpendingRefused } from "../../../server/gateway/types.ts";
import { scriptedClient, textTurn, toolUseTurn, type ScriptedTurn } from "../fake-client.ts";
import { LIST_MANUALS, LIST_MANUALS_STATUS } from "../library-tool.ts";
import { librarySetup, SYSTEM } from "../setup.ts";
import { GatewayModel } from "./gateway-model.ts";
import { createLibrarian, librarianEvent, type LibrarianEvent } from "./librarian.ts";

async function librarian(turns: ScriptedTurn[], { eventDelayMs = 0, caps = { dailyUsd: 2, monthlyUsd: 20 } } = {}) {
  const { client, prompts } = scriptedClient(turns, eventDelayMs);
  const setup = await librarySetup(client, caps);
  const agent = createLibrarian({ gateway: setup.gateway, store: setup.store, system: SYSTEM });
  return { ...setup, prompts, agent };
}

async function drain(stream: AsyncGenerator<Parameters<typeof librarianEvent>[0], AgentResult>, onEvent = () => {}) {
  const events: LibrarianEvent[] = [];
  let next = await stream.next();
  while (!next.done) {
    const event = librarianEvent(next.value);
    if (event) events.push(event);
    if (event) onEvent();
    next = await stream.next();
  }
  return { events, result: next.value };
}

describe("Strands Agents with a gateway model provider", () => {
  it("uses the gateway model, never a default Bedrock model", async () => {
    const { agent } = await librarian([]);
    expect(agent.model).toBeInstanceOf(GatewayModel);
  });

  it("runs the tool and answers, with one settled gateway call per turn", async () => {
    const { agent, prompts, settledCalls } = await librarian([
      toolUseTurn("call-1", "list_manuals"),
      textTurn("We have ", "seven manuals."),
    ]);

    const { events, result } = await drain(agent.stream("What manuals do you have?"));

    expect(events).toEqual([
      { type: "text", text: "Let me look." },
      { type: "status", text: LIST_MANUALS_STATUS },
      { type: "text", text: "We have " },
      { type: "text", text: "seven manuals." },
    ]);
    expect(prompts[0]!.system).toBe(SYSTEM);
    expect(prompts[0]!.tools).toEqual([LIST_MANUALS]);
    expect(JSON.stringify(prompts[1]!.messages.at(-1))).toContain("The Haunt That Listens");
    expect(result.stopReason).toBe("endTurn");
    expect(result.toString()).toBe("We have seven manuals.");
    const calls = await settledCalls();
    expect(calls.map(({ job, outcome }) => ({ job, outcome }))).toEqual([
      { job: "librarian", outcome: "complete" },
      { job: "librarian", outcome: "complete" },
    ]);
  });

  it("stops mid-run when a cap refuses the next call", async () => {
    const { agent, settledCalls } = await librarian([toolUseTurn("call-1", "list_manuals"), textTurn("Seven.")], {
      caps: { dailyUsd: 0.007, monthlyUsd: 20 },
    });
    const error = await agent.invoke("What manuals do you have?").catch((error: unknown) => error);
    expect((error as Error).cause).toBeInstanceOf(SpendingRefused);
    expect(await settledCalls()).toHaveLength(1);
  });

  it("settles the call as aborted when the run is cancelled mid-stream", async () => {
    const { agent, settledCalls } = await librarian([
      { ...textTurn("We ", "have ", "seven ", "manuals."), ignoresAbort: true },
    ], { eventDelayMs: 10 });

    const { result } = await drain(agent.stream("What manuals do you have?"), () => agent.cancel());

    expect(result.stopReason).toBe("cancelled");
    expect((await settledCalls()).map(({ outcome }) => outcome)).toEqual(["aborted"]);
  });
});
