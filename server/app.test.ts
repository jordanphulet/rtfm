import { readdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createModels, startServer } from "./app.ts";
import { config } from "./config.ts";
import { CredentialsMissing } from "./gateway/credentials.ts";
import { createGateway } from "./gateway/gateway.ts";
import { prices } from "./gateway/prices.ts";
import { ModelNotPriced, type ModelClient, type ModelRequest } from "./gateway/types.ts";
import { silentLogger } from "./logging/logger.ts";
import { createFileLedger, monthOf } from "./storage/file-ledger.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { DataFolderInUse, LOCK_FILE_NAME } from "./storage/lock.ts";
import type { UsageLedger } from "./storage/types.ts";
import { tempDataDir, waitUntil } from "./testing.ts";

describe("starting with Bedrock models", () => {
  it("refuses a model that isn't in the price table, before reading any credentials, and releases the data folder", async () => {
    const dataDir = await tempDataDir();
    const jobs = { ...config.jobs, "write-section": { model: "anthropic.not-priced", maxTokens: 2048 } };
    await expect(startServer({ ...config, port: 0, dataDir, models: "bedrock", jobs })).rejects.toThrow(
      ModelNotPriced,
    );
    expect(await readdir(dataDir)).not.toContain(LOCK_FILE_NAME);
  });

  it("refuses to start without credentials", async () => {
    const dataDir = await tempDataDir();
    const missingFile = pathToFileURL(path.join(dataDir, ".env.local"));
    const store = createFileManualStore(dataDir, silentLogger);
    await expect(
      createModels({ ...config, dataDir, models: "bedrock" }, store, silentLogger, missingFile),
    ).rejects.toThrow(CredentialsMissing);
  });
});

describe("one server per data folder", () => {
  it("refuses a second server on the same folder, and allows one again after the first stops", async () => {
    const fakeConfig = { ...config, port: 0, dataDir: await tempDataDir(), models: "fake" as const, passcode: undefined };
    const first = await startServer(fakeConfig);
    await expect(startServer(fakeConfig)).rejects.toThrow(DataFolderInUse);

    await first.close();
    expect(await readdir(fakeConfig.dataDir)).not.toContain(LOCK_FILE_NAME);
    const second = await startServer(fakeConfig);
    await second.close();
  });
});

describe("stopping", () => {
  it("waits for running model calls to settle in the ledger before it releases the data folder", async () => {
    const dataDir = await tempDataDir();
    const fileLedger = createFileLedger(dataDir, silentLogger);
    const slowToSettle: UsageLedger = {
      async append(entry) {
        if (entry.kind === "settle") await sleep(100);
        await fileLedger.append(entry);
      },
      entriesForMonth: (month) => fileLedger.entriesForMonth(month),
    };
    const requests: ModelRequest[] = [];
    const answersOnlyAnAbort: ModelClient = {
      async *stream(request) {
        requests.push(request);
        await new Promise((_, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason)));
      },
    };
    const gateway = await createGateway({
      logger: silentLogger,
      createClient: () => answersOnlyAnAbort,
      ledger: slowToSettle,
      config,
      prices,
      dataDir,
    });
    const server = await startServer(
      { ...config, port: 0, dataDir, models: "fake", passcode: undefined },
      { librarian: gateway, idle: gateway.idle },
    );

    void fetch(`http://127.0.0.1:${server.port}/api/librarian`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", text: "What do I have?" }] }),
    })
      .then((response) => response.text())
      .catch(() => {});
    await waitUntil(() => requests.length === 1);

    await server.close();
    const entries = await fileLedger.entriesForMonth(monthOf(new Date().toISOString()));
    expect(entries.map(({ kind }) => kind)).toEqual(["reserve", "settle"]);
    expect(await readdir(dataDir)).not.toContain(LOCK_FILE_NAME);
  });
});
