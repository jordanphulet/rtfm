import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createGateway } from "../gateway/gateway.ts";
import type { PriceTable } from "../gateway/prices.ts";
import { SpendingRefused, type GatewayConfig, type ModelEvent, type PromptMessage } from "../gateway/types.ts";
import { createFileLedger, monthOf } from "../storage/file-ledger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { ManualStore } from "../storage/types.ts";
import { tempDataDir } from "../testing.ts";
import { AgentStopped, runAgent, type AgentEvent } from "./loop.ts";
import { scriptedClient, textTurn, toolUseTurn } from "./scripted-client.ts";
import { defineTool, type AgentTool } from "./tool.ts";

const MODEL = "test-model";
const PRICES: PriceTable = {
  checkedOn: "2026-10-11",
  models: { [MODEL]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1, toolUseSystemPromptTokens: 588 } },
};
const SYSTEM = "You are the librarian of a library of manuals.";
const LIBRARY_STATUS = "Looking through the library…";
const SEARCH_STATUS = "Searching the shelves…";
const QUESTION: PromptMessage = { role: "user", content: "Do you have anything about geese?" };

function libraryTools(store: ManualStore): AgentTool[] {
  return [
    defineTool({
      name: "list_manuals",
      description: "Lists every manual in the library.",
      input: {},
      status: LIBRARY_STATUS,
      run: async () => JSON.stringify((await store.listManuals()).map(({ id, title }) => ({ id, title }))),
    }),
    defineTool({
      name: "find_manuals",
      description: "Finds the manuals whose title mentions a topic.",
      input: { topic: z.string().min(1) },
      status: SEARCH_STATUS,
      run: async ({ topic }) => {
        const manuals = await store.listManuals();
        return JSON.stringify(manuals.filter(({ title }) => title.toLowerCase().includes(topic)).map(({ id }) => id));
      },
    }),
  ];
}

async function librarian(turns: ModelEvent[][], { caps = { dailyUsd: 2, monthlyUsd: 20 }, extraTools = [] as AgentTool[] } = {}) {
  const dataDir = await tempDataDir();
  const store = createFileManualStore(dataDir);
  await seedStore(store);
  const ledger = createFileLedger(dataDir);
  const config: GatewayConfig = {
    caps,
    maxConcurrentCalls: 3,
    idleTimeoutMs: 1000,
    jobs: {
      "write-section": { model: MODEL, maxTokens: 2048 },
      librarian: { model: MODEL, maxTokens: 1024 },
    },
  };
  const { client, prompts } = scriptedClient(turns);
  const gateway = await createGateway({ client, ledger, config, prices: PRICES, dataDir });
  const tools = [...libraryTools(store), ...extraTools];

  function run(signal = new AbortController().signal) {
    return runAgent({ gateway, job: "librarian", system: SYSTEM, tools, messages: [QUESTION], signal });
  }

  async function ledgerEntries() {
    return ledger.entriesForMonth(monthOf(new Date().toISOString()));
  }

  return { run, prompts, ledgerEntries };
}

async function drain(run: AsyncGenerator<AgentEvent, PromptMessage[]>, events: AgentEvent[] = []) {
  let next = await run.next();
  while (!next.done) {
    events.push(next.value);
    next = await run.next();
  }
  return { events, conversation: next.value };
}

describe("the agent loop", () => {
  it("runs tools over several turns and answers, with one settled gateway call per turn", async () => {
    const { run, prompts, ledgerEntries } = await librarian([
      toolUseTurn([{ id: "call-1", name: "list_manuals" }], "Let me look."),
      toolUseTurn([{ id: "call-2", name: "find_manuals", input: { topic: "geese" } }]),
      textTurn("Yes: ", "Negotiating with Geese."),
    ]);

    const { events, conversation } = await drain(run());

    expect(events).toEqual([
      { type: "text", text: "Let me look." },
      { type: "status", text: LIBRARY_STATUS },
      { type: "status", text: SEARCH_STATUS },
      { type: "text", text: "Yes: " },
      { type: "text", text: "Negotiating with Geese." },
    ]);
    expect(prompts.map(({ tools }) => tools!.map(({ name }) => name))).toEqual([
      ["list_manuals", "find_manuals"],
      ["list_manuals", "find_manuals"],
      ["list_manuals", "find_manuals"],
    ]);
    expect(prompts[0]!.tools![1]!.input_schema).toMatchObject({
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
    });
    expect(prompts[0]!.tools![1]!.input_schema).not.toHaveProperty("$schema");
    expect(prompts[2]!.messages).toEqual(conversation.slice(0, -1));
    expect(conversation).toEqual([
      QUESTION,
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me look." },
          { type: "tool_use", id: "call-1", name: "list_manuals", input: {} },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-1", content: expect.stringContaining("The Haunt That Listens") }] },
      { role: "assistant", content: [{ type: "tool_use", id: "call-2", name: "find_manuals", input: { topic: "geese" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-2", content: '["negotiating-with-geese"]' }] },
      { role: "assistant", content: [{ type: "text", text: "Yes: Negotiating with Geese." }] },
    ]);

    const entries = await ledgerEntries();
    const settles = entries.filter((entry) => entry.kind === "settle");
    expect(settles.map(({ job, outcome }) => ({ job, outcome }))).toEqual([
      { job: "librarian", outcome: "complete" },
      { job: "librarian", outcome: "complete" },
      { job: "librarian", outcome: "complete" },
    ]);
    const worstCases = entries.flatMap((entry) => (entry.kind === "reserve" ? [entry.worstCaseUsd] : []));
    expect(worstCases[1]).toBeGreaterThan(worstCases[0]!);
    expect(worstCases[2]).toBeGreaterThan(worstCases[1]!);
  });

  it("answers a tool given bad input with an error result, without running it, and carries on", async () => {
    let ran = false;
    const strict = defineTool({
      name: "open_manual",
      description: "Opens a manual.",
      input: { manualId: z.string() },
      status: "Opening the manual…",
      run: async () => {
        ran = true;
        return "opened";
      },
    });
    const { run, prompts } = await librarian(
      [
        toolUseTurn([
          { id: "call-1", name: "open_manual", input: { manualId: 7 } },
          { id: "call-2", name: "find_manuals", input: {} },
          { id: "call-3", name: "burn_manuals" },
        ]),
        textTurn("Sorry."),
      ],
      { extraTools: [strict] },
    );

    await drain(run());

    expect(ran).toBe(false);
    expect(prompts[1]!.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "call-1", content: expect.stringMatching(/Invalid input[\s\S]*manualId/), is_error: true },
        { type: "tool_result", tool_use_id: "call-2", content: expect.stringMatching(/Invalid input[\s\S]*topic/), is_error: true },
        { type: "tool_result", tool_use_id: "call-3", content: 'There is no tool named "burn_manuals"', is_error: true },
      ],
    });
  });

  it("answers a tool that fails with an error result", async () => {
    const failing = defineTool({
      name: "delete_manual",
      description: "Deletes a manual.",
      input: {},
      status: "Deleting…",
      run: async () => {
        throw new Error("The shelf is locked");
      },
    });
    const { run, prompts } = await librarian([toolUseTurn([{ id: "call-1", name: "delete_manual" }]), textTurn("I couldn't.")], {
      extraTools: [failing],
    });

    await drain(run());

    expect(prompts[1]!.messages.at(-1)!.content).toEqual([
      { type: "tool_result", tool_use_id: "call-1", content: "Error: The shelf is locked", is_error: true },
    ]);
  });

  it("stops mid-run when the gateway's caps refuse the next turn", async () => {
    const turns = () => [toolUseTurn([{ id: "call-1", name: "list_manuals" }], "Let me look."), textTurn("Seven manuals.")];
    const uncapped = await librarian(turns());
    await drain(uncapped.run());
    const firstReservation = (await uncapped.ledgerEntries()).find((entry) => entry.kind === "reserve")!;
    const { run, prompts, ledgerEntries } = await librarian(turns(), {
      caps: { dailyUsd: firstReservation.worstCaseUsd, monthlyUsd: 20 },
    });
    const events: AgentEvent[] = [];

    await expect(drain(run(), events)).rejects.toThrow(SpendingRefused);

    expect(events).toEqual([
      { type: "text", text: "Let me look." },
      { type: "status", text: LIBRARY_STATUS },
    ]);
    expect(prompts).toHaveLength(1);
    const entries = await ledgerEntries();
    expect(entries.map(({ kind }) => kind)).toEqual(["reserve", "settle"]);
    expect(entries[1]).toMatchObject({ outcome: "complete" });
  });

  it("settles the model call as aborted when the run is aborted mid-stream", async () => {
    const { run, prompts, ledgerEntries } = await librarian([textTurn("We ", "have ", "seven ", "manuals.")]);
    const controller = new AbortController();
    const running = run(controller.signal);

    expect(await running.next()).toEqual({ done: false, value: { type: "text", text: "We " } });
    controller.abort();

    await expect(drain(running)).rejects.toThrow();
    expect(prompts).toHaveLength(1);
    const settles = (await ledgerEntries()).filter((entry) => entry.kind === "settle");
    expect(settles.map(({ outcome }) => outcome)).toEqual(["aborted"]);
  });

  it("runs none of the turn's remaining tools, and makes no further model call, once the run is aborted", async () => {
    const controller = new AbortController();
    let deleted = false;
    const stopping = defineTool({
      name: "stop_everything",
      description: "Aborts the run.",
      input: {},
      status: "Stopping…",
      run: async () => {
        controller.abort();
        return "stopped";
      },
    });
    const deleting = defineTool({
      name: "delete_manual",
      description: "Deletes a manual.",
      input: {},
      status: "Deleting…",
      run: async () => {
        deleted = true;
        return "deleted";
      },
    });
    const { run, prompts, ledgerEntries } = await librarian(
      [
        toolUseTurn([
          { id: "call-1", name: "stop_everything" },
          { id: "call-2", name: "delete_manual" },
        ]),
        textTurn("Done."),
      ],
      { extraTools: [stopping, deleting] },
    );
    const events: AgentEvent[] = [];

    await expect(drain(run(controller.signal), events)).rejects.toThrow();

    expect(deleted).toBe(false);
    expect(events).toEqual([{ type: "status", text: "Stopping…" }]);
    expect(prompts).toHaveLength(1);
    const settles = (await ledgerEntries()).filter((entry) => entry.kind === "settle");
    expect(settles.map(({ outcome }) => outcome)).toEqual(["complete"]);
  });

  it("fails when the model stops for any reason but a tool call or the end of its turn", async () => {
    const cutOff: ModelEvent[] = [{ type: "text", text: "We have" }, { type: "stop", reason: "max_tokens" }];
    const { run } = await librarian([cutOff]);

    await expect(drain(run())).rejects.toThrow(new AgentStopped('The model stopped with "max_tokens"'));
  });

  it("fails on a turn that ends with nothing in it, or stops to use a tool without calling one", async () => {
    const empty: ModelEvent[] = [{ type: "stop", reason: "end_turn" }];
    const noToolCall: ModelEvent[] = [{ type: "text", text: "Let me look." }, { type: "stop", reason: "tool_use" }];

    await expect(drain((await librarian([empty])).run())).rejects.toThrow(
      new AgentStopped("The model ended its turn with nothing in it"),
    );
    await expect(drain((await librarian([noToolCall])).run())).rejects.toThrow(
      new AgentStopped("The model stopped to use a tool but called none"),
    );
  });
});
