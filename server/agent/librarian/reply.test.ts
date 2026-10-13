import { describe, expect, it } from "vitest";
import type { LibrarianEvent } from "../../api/types.ts";
import { createGateway } from "../../gateway/gateway.ts";
import { createFileLedger, monthOf } from "../../storage/file-ledger.ts";
import { createFileManualStore } from "../../storage/file-manual-store.ts";
import { seedStore } from "../../storage/seed.ts";
import { tempDataDir, TEST_PRICES, testGatewayConfig } from "../../testing.ts";
import { scriptedClient, toolUseTurn } from "../scripted-client.ts";
import { sendReply } from "./reply.ts";

describe("a librarian reply", () => {
  it("fails with error after 8 model calls, each settled, when the model keeps calling tools", async () => {
    const dataDir = await tempDataDir();
    const store = createFileManualStore(dataDir);
    await seedStore(store);
    const ledger = createFileLedger(dataDir);
    const listingTurn = (turn: number) => toolUseTurn([{ id: `call-${turn}`, name: "list_manuals" }]);
    const turns = Array.from({ length: 20 }, (_, turn) => listingTurn(turn));
    const { client, prompts } = scriptedClient(turns);
    const gateway = await createGateway({
      createClient: () => client,
      ledger,
      config: testGatewayConfig(),
      prices: TEST_PRICES,
      dataDir,
    });
    const events: LibrarianEvent[] = [];

    await sendReply({
      gateway,
      store,
      conversation: [{ role: "user", text: "What do I have?" }],
      signal: new AbortController().signal,
      send: (event) => events.push(event),
    });

    expect(prompts).toHaveLength(8);
    expect(events.at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
    const entries = await ledger.entriesForMonth(monthOf(new Date().toISOString()));
    expect(entries.filter((entry) => entry.kind === "reserve")).toHaveLength(8);
    const settles = entries.filter((entry) => entry.kind === "settle");
    expect(settles.map(({ outcome }) => outcome)).toEqual(Array(8).fill("complete"));
  });
});
