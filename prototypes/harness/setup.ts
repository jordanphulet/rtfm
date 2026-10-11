import { createFileLedger } from "../../server/storage/file-ledger.ts";
import { createFileManualStore } from "../../server/storage/file-manual-store.ts";
import { seedStore } from "../../server/storage/seed.ts";
import type { SettleEntry } from "../../server/storage/types.ts";
import { tempDataDir } from "../../server/testing.ts";
import type { PriceTable } from "../../server/gateway/prices.ts";
import { createGateway } from "./gateway/gateway.ts";
import type { GatewayConfig, ModelClient } from "./gateway/types.ts";

const MODEL = "test-model";
const PRICES: PriceTable = {
  checkedOn: "2026-10-11",
  models: { [MODEL]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
};

export const SYSTEM = "You are the librarian of a library of manuals.";

export async function librarySetup(client: ModelClient, caps = { dailyUsd: 2, monthlyUsd: 20 }) {
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
  const gateway = await createGateway({ client, ledger, config, prices: PRICES, dataDir });

  async function settledCalls(): Promise<SettleEntry[]> {
    const entries = await ledger.entriesForMonth(new Date().toISOString().slice(0, 7));
    return entries.filter((entry) => entry.kind === "settle");
  }

  return { store, gateway, settledCalls };
}
