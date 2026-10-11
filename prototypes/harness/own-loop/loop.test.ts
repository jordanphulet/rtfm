import { describe, expect, it } from "vitest";
import { SpendingRefused } from "../../../server/gateway/types.ts";
import { scriptedClient, textTurn, toolUseTurn, type ScriptedTurn } from "../fake-client.ts";
import { inputTokenBound } from "../gateway/gateway.ts";
import type { PromptMessage } from "../gateway/types.ts";
import { LIST_MANUALS, LIST_MANUALS_STATUS, listManuals } from "../library-tool.ts";
import { librarySetup, SYSTEM } from "../setup.ts";
import { runLoop, type LoopEvent, type LoopTool } from "./loop.ts";

async function librarian(turns: ScriptedTurn[], { eventDelayMs = 0, caps = { dailyUsd: 2, monthlyUsd: 20 } } = {}) {
  const { client, prompts } = scriptedClient(turns, eventDelayMs);
  const setup = await librarySetup(client, caps);
  const tools: LoopTool[] = [
    { definition: LIST_MANUALS, status: LIST_MANUALS_STATUS, run: () => listManuals(setup.store) },
  ];
  function run(signal = new AbortController().signal) {
    const messages: PromptMessage[] = [{ role: "user", content: "What manuals do you have?" }];
    return runLoop({ gateway: setup.gateway, job: "librarian", system: SYSTEM, tools, messages, signal, maxTurns: 5 });
  }
  return { ...setup, prompts, run };
}

async function drain(loop: AsyncGenerator<LoopEvent, PromptMessage[]>) {
  const events: LoopEvent[] = [];
  let next = await loop.next();
  while (!next.done) {
    events.push(next.value);
    next = await loop.next();
  }
  return { events, conversation: next.value };
}

describe("our own loop on the gateway", () => {
  it("runs the tool and answers, with one settled gateway call per turn", async () => {
    const { run, prompts, settledCalls } = await librarian([
      toolUseTurn("call-1", "list_manuals"),
      textTurn("We have ", "seven manuals."),
    ]);

    const { events, conversation } = await drain(run());

    expect(events).toEqual([
      { type: "text", text: "Let me look." },
      { type: "status", text: LIST_MANUALS_STATUS },
      { type: "text", text: "We have " },
      { type: "text", text: "seven manuals." },
    ]);
    expect(prompts[0]!.tools).toEqual([LIST_MANUALS]);
    const toolResult = prompts[1]!.messages.at(-1)!;
    expect(toolResult.role).toBe("user");
    expect(JSON.stringify(toolResult.content)).toContain("The Haunt That Listens");
    expect(conversation.at(-1)).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "We have seven manuals." }],
    });
    const calls = await settledCalls();
    expect(calls.map(({ job, outcome }) => ({ job, outcome }))).toEqual([
      { job: "librarian", outcome: "complete" },
      { job: "librarian", outcome: "complete" },
    ]);
  });

  it("reserves for the tools and the whole conversation on every call", async () => {
    const { run, prompts } = await librarian([toolUseTurn("call-1", "list_manuals"), textTurn("Seven.")]);
    await drain(run());
    expect(inputTokenBound(prompts[1]!)).toBeGreaterThan(inputTokenBound(prompts[0]!) + 1000);
    expect(inputTokenBound(prompts[0]!)).toBeGreaterThan(inputTokenBound({ ...prompts[0]!, tools: [] }) + 588);
  });

  it("returns an error result for an unknown tool and carries on", async () => {
    const { run, prompts } = await librarian([toolUseTurn("call-1", "burn_manuals"), textTurn("I can't.")]);
    await drain(run());
    expect(prompts[1]!.messages.at(-1)!.content).toEqual([
      { type: "tool_result", tool_use_id: "call-1", content: 'No tool named "burn_manuals"', is_error: true },
    ]);
  });

  it("stops mid-run when a cap refuses the next call", async () => {
    const { run, settledCalls } = await librarian([toolUseTurn("call-1", "list_manuals"), textTurn("Seven.")], {
      caps: { dailyUsd: 0.007, monthlyUsd: 20 },
    });
    await expect(drain(run())).rejects.toThrow(SpendingRefused);
    expect(await settledCalls()).toHaveLength(1);
  });

  it("settles the call as aborted when the run is aborted mid-stream", async () => {
    const { run, settledCalls } = await librarian([textTurn("We ", "have ", "seven ", "manuals.")], { eventDelayMs: 10 });
    const controller = new AbortController();
    const loop = run(controller.signal);
    await loop.next();
    controller.abort();
    await expect(drain(loop)).rejects.toThrow();
    expect((await settledCalls()).map(({ outcome }) => outcome)).toEqual(["aborted"]);
  });
});
