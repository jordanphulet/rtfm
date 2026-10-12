import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createModels, startServer } from "./app.ts";
import { config } from "./config.ts";
import { CredentialsMissing } from "./gateway/credentials.ts";
import { ModelNotPriced } from "./gateway/types.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { DataFolderInUse, LOCK_FILE_NAME } from "./storage/lock.ts";
import { tempDataDir } from "./testing.ts";

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
    await expect(
      createModels({ ...config, dataDir, models: "bedrock" }, createFileManualStore(dataDir), missingFile),
    ).rejects.toThrow(CredentialsMissing);
  });
});

describe("one server per data folder", () => {
  it("refuses a second server on the same folder, and allows one again after the first stops", async () => {
    const fakeConfig = { ...config, port: 0, dataDir: await tempDataDir(), models: "fake" as const };
    const first = await startServer(fakeConfig);
    await expect(startServer(fakeConfig)).rejects.toThrow(DataFolderInUse);

    await first.close();
    expect(await readdir(fakeConfig.dataDir)).not.toContain(LOCK_FILE_NAME);
    const second = await startServer(fakeConfig);
    await second.close();
  });
});
