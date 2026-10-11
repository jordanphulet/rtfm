import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createWriter, startServer } from "./app.ts";
import { config } from "./config.ts";
import { CredentialsMissing } from "./gateway/credentials.ts";
import { ModelNotPriced } from "./gateway/types.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { tempDataDir } from "./testing.ts";

describe("starting with the Bedrock writer", () => {
  it("refuses a model that isn't in the price table, before reading any credentials", async () => {
    const jobs = { ...config.jobs, "write-section": { model: "anthropic.not-priced", maxTokens: 2048 } };
    await expect(
      startServer({ ...config, port: 0, dataDir: await tempDataDir(), writer: "bedrock", jobs }),
    ).rejects.toThrow(ModelNotPriced);
  });

  it("refuses to start without credentials", async () => {
    const dataDir = await tempDataDir();
    const missingFile = pathToFileURL(path.join(dataDir, ".env.local"));
    await expect(
      createWriter({ ...config, dataDir, writer: "bedrock" }, createFileManualStore(dataDir), missingFile),
    ).rejects.toThrow(CredentialsMissing);
  });
});
