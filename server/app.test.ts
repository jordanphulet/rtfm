import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createModels, startServer } from "./app.ts";
import { config } from "./config.ts";
import { CredentialsMissing } from "./gateway/credentials.ts";
import { createDynamoDbSpendingLedger, setKillSwitch } from "./gateway/dynamodb-spending-ledger.ts";
import { testUsageTable } from "./gateway/dynamodb-testing.ts";
import { killSwitchPath } from "./gateway/file-spending-ledger.ts";
import {
  FAKE_MODEL,
  ModelNotPriced,
  SpendingRefused,
  type ModelClient,
  type ModelPrompt,
  type ModelRequest,
} from "./gateway/types.ts";
import { silentLogger } from "./logging/logger.ts";
import { DYNAMODB_LOCAL_CREDENTIALS } from "./storage/dynamodb-testing.ts";
import { createFileLedger, monthOf } from "./storage/file-ledger.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { DataFolderInUse, LOCK_FILE_NAME } from "./storage/lock.ts";
import { seedStore } from "./storage/seed.ts";
import type { UsageLedger } from "./storage/types.ts";
import { collect, tempDataDir, testGateway, waitUntil } from "./testing.ts";
import { WriteFailed } from "./writer/types.ts";

/** A seed manual with no sample text, so the fake writer plays its short placeholder. */
const GEESE_ID = "negotiating-with-geese";
/** A message the fake librarian answers in one short turn, its fallback reply. */
const GREETING: ModelPrompt = { system: "", messages: [{ role: "user", content: "Good morning" }] };

describe("starting with Bedrock models", () => {
  it("refuses a model that isn't in the price table, before reading any credentials, and releases the data folder", async () => {
    const dataDir = await tempDataDir();
    const jobs = { ...config.jobs, "write-section": { model: "anthropic.not-priced", maxTokens: 2048 } };
    await expect(startServer({ ...config, port: 0, dataDir, models: "bedrock", jobs })).rejects.toThrow(
      ModelNotPriced,
    );
    expect(await readdir(dataDir)).not.toContain(LOCK_FILE_NAME);
  });

  it("keeps their spending in rtfm-usage, never in the data folder: its kill switch and caps are the table's", async () => {
    const dataDir = await tempDataDir();
    const table = await testUsageTable();
    const credentialsFile = pathToFileURL(path.join(dataDir, ".env.local"));
    const { accessKeyId, secretAccessKey } = DYNAMODB_LOCAL_CREDENTIALS;
    await writeFile(
      credentialsFile,
      `AWS_ACCESS_KEY_ID=${accessKeyId}\nAWS_SECRET_ACCESS_KEY=${secretAccessKey}\nAWS_REGION=${table.region}\n`,
    );
    const bedrockConfig = { ...config, dataDir, models: "bedrock" as const, usageTable: { name: table.name, endpoint: table.endpoint } };
    const models = await createModels(bedrockConfig, silentLogger, credentialsFile);
    const askLibrarian = () => collect(models.librarian.stream("librarian", GREETING, new AbortController().signal));

    await setKillSwitch(table, true);
    await expect(askLibrarian()).rejects.toMatchObject({ reason: "kill-switch" });
    await setKillSwitch(table, false);
    const spentToday = { callId: "spent", reservedAt: new Date().toISOString(), job: "librarian", model: config.jobs.librarian.model };
    await createDynamoDbSpendingLedger(table).importCall({ ...spentToday, worstCaseUsd: config.caps.dailyUsd });
    await expect(askLibrarian()).rejects.toMatchObject({ reason: "daily-cap" });
    expect(await readdir(dataDir)).not.toContain("ledger");
  });

  it("refuses to start without credentials", async () => {
    const dataDir = await tempDataDir();
    const missingFile = pathToFileURL(path.join(dataDir, ".env.local"));
    await expect(createModels({ ...config, dataDir, models: "bedrock" }, silentLogger, missingFile)).rejects.toThrow(
      CredentialsMissing,
    );
  });
});

describe("starting with the fake models", () => {
  it("sends their calls through the gateway: recorded at $0 under the fake model, never capped, and refused by the kill switch", async () => {
    const dataDir = await tempDataDir();
    const store = createFileManualStore(dataDir, silentLogger);
    await seedStore(store);
    const zeroCaps = { dailyUsd: 0, monthlyUsd: 0 };
    const models = await createModels({ ...config, dataDir, models: "fake", caps: zeroCaps }, silentLogger);
    const geese = (await store.getManual(GEESE_ID))!;
    const sectionId = geese.chapters[0]!.sections[0]!.id;
    const writeSection = () => collect(models.writerFor(store).write(geese, sectionId, new AbortController().signal));
    const askLibrarian = () => collect(models.librarian.stream("librarian", GREETING, new AbortController().signal));

    await Promise.all([writeSection(), askLibrarian()]);
    await models.idle();
    const entries = await createFileLedger(dataDir, silentLogger).entriesForMonth(monthOf(new Date().toISOString()));
    expect(entries.map(({ kind, job }) => `${kind} ${job}`).toSorted()).toEqual([
      "reserve librarian",
      "reserve write-section",
      "settle librarian",
      "settle write-section",
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject(entry.kind === "reserve" ? { model: FAKE_MODEL, worstCaseUsd: 0 } : { model: FAKE_MODEL, usd: 0 });
    }

    await writeFile(killSwitchPath(dataDir), "");
    await expect(writeSection()).rejects.toEqual(new WriteFailed("budget"));
    await expect(askLibrarian()).rejects.toThrow(SpendingRefused);
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
    const { gateway } = await testGateway(answersOnlyAnAbort, dataDir, { config, ledger: slowToSettle });
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
