import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SpendingRefused, type ModelEvent, type PromptMessage } from "../gateway/types.ts";
import { silentLogger } from "../logging/logger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { ManualStore } from "../storage/types.ts";
import { tempDataDir, testGateway, testGatewayConfig } from "../testing.ts";
import { AgentStopped, runAgent, type AgentEvent } from "./loop.ts";
import { scriptedClient, textTurn, toolUseTurn } from "./scripted-client.ts";
import { defineTool, type AgentTool } from "./tool.ts";

const SYSTEM = "You are the librarian of a library of manuals.";
const LIBRARY_STATUS = "Looking through the library…";
const SEARCH_STATUS = "Searching the shelves…";
const QUESTION: PromptMessage = { role: "user", content: "Do you have anything about geese?" };
const MAX_TURNS = 4;

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
  const store = createFileManualStore(dataDir, silentLogger);
  await seedStore(store);
  const { client, prompts } = scriptedClient(turns);
  const { gateway, ledgerEntries } = await testGateway(client, dataDir, testGatewayConfig({ caps }));
  const tools = [...libraryTools(store), ...extraTools];

  function run(signal = new AbortController().signal) {
    return runAgent({
      gateway,
      job: "librarian",
      system: SYSTEM,
      tools,
      messages: [QUESTION],
      maxTurns: MAX_TURNS,
      signal,
      logger: silentLogger,
    });
  }

  return { run, prompts, ledgerEntries };
}

function listingTurn(turn: number): ModelEvent[] {
  return toolUseTurn([{ id: `call-${turn}`, name: "list_manuals" }]);
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

  it("lets a tool's own refusal by the caps, or its abort, end the run instead of answering the model", async () => {
    const refusing = defineTool({
      name: "plan_manual",
      description: "Plans a manual with its own model call.",
      input: {},
      status: "Planning…",
      run: async () => {
        throw new SpendingRefused("daily-cap");
      },
    });
    const refused = await librarian([toolUseTurn([{ id: "call-1", name: "plan_manual" }]), textTurn("Unused.")], {
      extraTools: [refusing],
    });
    await expect(drain(refused.run())).rejects.toThrow(SpendingRefused);
    expect(refused.prompts).toHaveLength(1);

    const controller = new AbortController();
    const aborting = defineTool({
      name: "plan_manual",
      description: "Plans a manual with its own model call.",
      input: {},
      status: "Planning…",
      run: async (_input, signal) => {
        controller.abort();
        signal.throwIfAborted();
        return "unreachable";
      },
    });
    const aborted = await librarian([toolUseTurn([{ id: "call-1", name: "plan_manual" }]), textTurn("Unused.")], {
      extraTools: [aborting],
    });
    await expect(drain(aborted.run(controller.signal))).rejects.toThrow(/abort/i);
    expect(aborted.prompts).toHaveLength(1);
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

  it("stops a run still calling tools on its last allowed turn, running none of them", async () => {
    const turns = Array.from({ length: MAX_TURNS + 1 }, (_, turn) => listingTurn(turn));
    const { run, prompts, ledgerEntries } = await librarian(turns);
    const events: AgentEvent[] = [];

    await expect(drain(run(), events)).rejects.toThrow(
      new AgentStopped(`The model was still calling tools after ${MAX_TURNS} turns`),
    );

    expect(prompts).toHaveLength(MAX_TURNS);
    expect(events).toEqual(Array(MAX_TURNS - 1).fill({ type: "status", text: LIBRARY_STATUS }));
    const entries = await ledgerEntries();
    expect(entries.filter((entry) => entry.kind === "reserve")).toHaveLength(MAX_TURNS);
    const settles = entries.filter((entry) => entry.kind === "settle");
    expect(settles.map(({ outcome }) => outcome)).toEqual(Array(MAX_TURNS).fill("complete"));
  });

  it("answers on its last allowed turn as on any other", async () => {
    const { run, prompts } = await librarian([
      ...Array.from({ length: MAX_TURNS - 1 }, (_, turn) => listingTurn(turn)),
      textTurn("Seven manuals."),
    ]);

    const { conversation } = await drain(run());

    expect(prompts).toHaveLength(MAX_TURNS);
    expect(conversation.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "Seven manuals." }] });
  });

  it("fails when the model stops for any reason but a tool call or the end of its turn", async () => {
    const cutOff: ModelEvent[] = [{ type: "text", text: "We have" }, { type: "stop", reason: "max_tokens" }];
    const { run } = await librarian([cutOff]);

    await expect(drain(run())).rejects.toThrow(new AgentStopped('The model stopped with "max_tokens"'));
  });

  it("ends the run normally when a turn after tools ends with nothing in it, adding no empty message", async () => {
    const empty: ModelEvent[] = [{ type: "stop", reason: "end_turn" }];
    const { run, ledgerEntries } = await librarian([toolUseTurn([{ id: "call-1", name: "list_manuals" }], "Let me look."), empty]);

    const { events, conversation } = await drain(run());

    expect(events).toEqual([
      { type: "text", text: "Let me look." },
      { type: "status", text: LIBRARY_STATUS },
    ]);
    expect(conversation.map(({ role }) => role)).toEqual(["user", "assistant", "user"]);
    expect(conversation.at(-1)!.content).toEqual([
      { type: "tool_result", tool_use_id: "call-1", content: expect.stringContaining("The Haunt That Listens") },
    ]);
    const settles = (await ledgerEntries()).filter((entry) => entry.kind === "settle");
    expect(settles.map(({ outcome }) => outcome)).toEqual(["complete", "complete"]);
  });

  it("fails on a first turn that ends with nothing in it, or a turn that stops to use a tool without calling one", async () => {
    const empty: ModelEvent[] = [{ type: "stop", reason: "end_turn" }];
    const noToolCall: ModelEvent[] = [{ type: "text", text: "Let me look." }, { type: "stop", reason: "tool_use" }];

    await expect(drain((await librarian([empty])).run())).rejects.toThrow(
      new AgentStopped("The model ended its first turn with nothing in it"),
    );
    await expect(drain((await librarian([noToolCall])).run())).rejects.toThrow(
      new AgentStopped("The model stopped to use a tool but called none"),
    );
  });
});
