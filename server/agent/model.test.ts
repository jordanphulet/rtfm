import { describe, expect, it } from "vitest";
import type { Gateway } from "../gateway/gateway.ts";
import type { ModelClient, ModelEvent, ModelPrompt } from "../gateway/types.ts";
import { silentLogger } from "../logging/logger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import { collect, tempDataDir, testGateway } from "../testing.ts";
import { fakeModel, INSTANT_PACE } from "./fake-model.ts";
import { fakePlan } from "./planner/fake-planner.ts";
import { planManual } from "./planner/plan.ts";
import { scriptedClient, streamedToolUseTurn, textTurn, toolUseTurn } from "./scripted-client.ts";

/**
 * Each test gives the turns Claude would send for its request. The fake model ignores them: it
 * reads the request itself, as it does in the app. Both are called through the real gateway.
 */
const MODELS = [
  { name: "the fake model", client: (): ModelClient => fakeModel(INSTANT_PACE) },
  { name: "Claude", client: (turns: ModelEvent[][]): ModelClient => scriptedClient(turns).client },
];

const HELP_REQUEST = "Help";
const HELP_TURN = textTurn("I look after your library. ", "I can list, find, open, ", "start and delete manuals.");
const LIST_REQUEST = "List my manuals";
const LIST_TURN = toolUseTurn([{ id: "call-1", name: "list_manuals" }]);
const PLAN_REQUEST = "A manual about building a treehouse";
const PLAN_TURN = streamedToolUseTurn({ id: "plan", name: "save_manual", input: fakePlan(PLAN_REQUEST) });

function librarianPrompt(request: string): ModelPrompt {
  return { system: "You look after a library of manuals.", messages: [{ role: "user", content: request }] };
}

async function seededStore() {
  const store = createFileManualStore(await tempDataDir(), silentLogger);
  await seedStore(store);
  return store;
}

describe.each(MODELS)("$name, through the gateway, as the librarian's and the planner's model", ({ client }) => {
  async function make(turns: ModelEvent[][]): Promise<Gateway> {
    return (await testGateway(client(turns), await tempDataDir())).gateway;
  }

  describe("a librarian turn", () => {
    async function turn(request: string, turns: ModelEvent[][]) {
      const model = await make(turns);
      return collect(model.stream("librarian", librarianPrompt(request), new AbortController().signal));
    }

    it("reports its tokens and its stop, so the call settles complete and not estimated", async () => {
      const { gateway, ledgerEntries } = await testGateway(client([HELP_TURN]), await tempDataDir());
      await collect(gateway.stream("librarian", librarianPrompt(HELP_REQUEST), new AbortController().signal));
      expect(await ledgerEntries()).toContainEqual(expect.objectContaining({ kind: "settle", outcome: "complete", estimated: false }));
    });

    it("streams its text in several events and ends with one stop, last", async () => {
      const events = await turn(HELP_REQUEST, [HELP_TURN]);
      expect(events.filter((event) => event.type === "text").length).toBeGreaterThan(1);
      expect(events.filter((event) => event.type === "stop")).toEqual([{ type: "stop", reason: "end_turn" }]);
      expect(events.at(-1)!.type).toBe("stop");
    });

    it("calls a tool with an id and an input, and stops to use it", async () => {
      const events = await turn(LIST_REQUEST, [LIST_TURN]);
      expect(events.filter((event) => event.type === "tool-use")).toEqual([
        { type: "tool-use", id: expect.stringMatching(/./), name: "list_manuals", input: {} },
      ]);
      expect(events.at(-1)).toEqual({ type: "stop", reason: "tool_use" });
    });

    it("refuses a signal that has already aborted, before any event", async () => {
      const model = await make([HELP_TURN]);
      const controller = new AbortController();
      controller.abort();
      const events: ModelEvent[] = [];
      await expect(async () => {
        for await (const event of model.stream("librarian", librarianPrompt(HELP_REQUEST), controller.signal)) events.push(event);
      }).rejects.toThrow(/abort/i);
      expect(events).toEqual([]);
    });

    it.each([
      { kind: "a text turn", request: HELP_REQUEST, script: HELP_TURN },
      { kind: "a tool call", request: LIST_REQUEST, script: LIST_TURN },
    ])("throws the abort at the next read once its signal aborts, whichever event of $kind the caller holds", async ({ request, script }) => {
      const eventCount = (await turn(request, [script])).length;
      for (let held = 1; held <= eventCount; held++) {
        const model = await make([script]);
        const controller = new AbortController();
        const events = model.stream("librarian", librarianPrompt(request), controller.signal)[Symbol.asyncIterator]();
        for (let read = 0; read < held; read++) await events.next();
        controller.abort();
        await expect(events.next(), `holding event ${held} of ${eventCount}`).rejects.toThrow(/abort/i);
      }
    });
  });

  describe("a planner turn", () => {
    it("plans a manual that passes the planner's checks, which saves it, reporting a status with its title", async () => {
      const store = await seededStore();
      const statuses: string[] = [];
      const result = await planManual({
        gateway: await make([PLAN_TURN]),
        store,
        request: PLAN_REQUEST,
        signal: new AbortController().signal,
        onStatus: (text) => statuses.push(text),
      });

      if (!("manual" in result)) throw new Error(`The plan wasn't saved: ${result.problems.join("; ")}`);
      expect(await store.getManual(result.manual.id)).toEqual(result.manual);
      expect(statuses).toEqual([`Planning “${result.manual.title}”…`]);
    });

    it("saves nothing once its signal aborts while it plans", async () => {
      const store = await seededStore();
      const manualsBefore = await store.listManuals();
      const controller = new AbortController();
      const planning = planManual({
        gateway: await make([PLAN_TURN]),
        store,
        request: PLAN_REQUEST,
        signal: controller.signal,
        onStatus: () => controller.abort(),
      });

      await expect(planning).rejects.toThrow(/abort/i);
      expect(await store.listManuals()).toEqual(manualsBefore);
    });
  });
});
