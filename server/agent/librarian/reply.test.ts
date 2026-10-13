import { describe, expect, it } from "vitest";
import type { LibrarianEvent } from "../../api/types.ts";
import { silentLogger } from "../../logging/logger.ts";
import { createFileManualStore } from "../../storage/file-manual-store.ts";
import { seedStore } from "../../storage/seed.ts";
import { capturingLogger, tempDataDir, testGateway } from "../../testing.ts";
import { scriptedClient, toolUseTurn } from "../scripted-client.ts";
import { INSTANT_PACE, unrecordedFakeModel } from "../fake-model.ts";
import { sendReply } from "./reply.ts";

describe("a librarian reply", () => {
  it("fails with error after 8 model calls, each settled, when the model keeps calling tools", async () => {
    const dataDir = await tempDataDir();
    const store = createFileManualStore(dataDir, silentLogger);
    await seedStore(store);
    const listingTurn = (turn: number) => toolUseTurn([{ id: `call-${turn}`, name: "list_manuals" }]);
    const turns = Array.from({ length: 20 }, (_, turn) => listingTurn(turn));
    const { client, prompts } = scriptedClient(turns);
    const { gateway, ledgerEntries } = await testGateway(client, dataDir);
    const events: LibrarianEvent[] = [];
    const { logger, entries: logged } = capturingLogger();

    await sendReply({
      gateway,
      store,
      conversation: [{ role: "user", text: "What do I have?" }],
      signal: new AbortController().signal,
      logger,
      send: (event) => events.push(event),
    });

    expect(prompts).toHaveLength(8);
    expect(events.at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
    const entries = await ledgerEntries();
    expect(entries.filter((entry) => entry.kind === "reserve")).toHaveLength(8);
    const settles = entries.filter((entry) => entry.kind === "settle");
    expect(settles.map(({ outcome }) => outcome)).toEqual(Array(8).fill("complete"));
    expect(logged.at(-1)).toMatchObject({
      level: "ERROR",
      event: "librarian.reply",
      outcome: "error",
      turns: 8,
      error: expect.objectContaining({ message: "The model was still calling tools after 8 turns" }),
    });
  });

  it("logs a finished reply's turns, the tools the model called and its outcome, without the conversation", async () => {
    const store = createFileManualStore(await tempDataDir(), silentLogger);
    await seedStore(store);
    const { logger, entries } = capturingLogger();
    const question = "What do I have in the library?";

    await sendReply({
      gateway: unrecordedFakeModel(INSTANT_PACE),
      store,
      conversation: [{ role: "user", text: question }],
      signal: new AbortController().signal,
      logger,
      send: () => {},
    });

    expect(entries).toEqual([
      expect.objectContaining({
        level: "INFO",
        event: "librarian.reply",
        outcome: "done",
        messages: 1,
        turns: 2,
        tools: "list_manuals",
        durationMs: expect.any(Number),
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain(question);
  });
});
