import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDataDir } from "../testing.ts";
import { CredentialsMissing, readAwsCredentials } from "./credentials.ts";

const FAKE_KEY_ID = "AKIAFAKEFORTESTSONLY";
const FAKE_SECRET = "fake-secret-for-tests-only";

describe("AWS credentials", () => {
  let envFile: URL;

  beforeEach(async () => {
    envFile = pathToFileURL(path.join(await tempDataDir(), ".env.local"));
    vi.stubEnv("AWS_ACCESS_KEY_ID", undefined);
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", undefined);
    vi.stubEnv("AWS_REGION", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function writeEnv(text: string) {
    await writeFile(envFile, text);
  }

  it("reads exactly the three keys from the file, without touching process.env", async () => {
    await writeEnv(
      [
        `AWS_ACCESS_KEY_ID=${FAKE_KEY_ID}`,
        `AWS_SECRET_ACCESS_KEY="${FAKE_SECRET}"`,
        "AWS_REGION=us-west-2",
        "AWS_PROFILE=some-profile",
        "BEDROCK_MODEL_ID=ignored",
      ].join("\n"),
    );

    expect(readAwsCredentials(envFile)).toEqual({
      accessKeyId: FAKE_KEY_ID,
      secretAccessKey: FAKE_SECRET,
      region: "us-west-2",
    });
    expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("refuses when a key is missing or empty, naming the variables and every model that needs them, but never the values", async () => {
    await writeEnv(`AWS_ACCESS_KEY_ID=${FAKE_KEY_ID}\nAWS_SECRET_ACCESS_KEY=\nAWS_REGION="  "\n`);

    let error: unknown;
    try {
      readAwsCredentials(envFile);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CredentialsMissing);
    const message = (error as Error).message;
    expect(message).toContain("AWS_SECRET_ACCESS_KEY, AWS_REGION");
    expect(message).toContain("the section writer, the librarian and the planner");
    expect(message).not.toContain("AWS_ACCESS_KEY_ID");
    expect(message).not.toContain(FAKE_KEY_ID);
  });

  it("refuses when the file doesn't exist, even if the keys are in process.env", () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", FAKE_KEY_ID);
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", FAKE_SECRET);
    vi.stubEnv("AWS_REGION", "us-west-2");

    expect(() => readAwsCredentials(envFile)).toThrow(
      /AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION/,
    );
  });
});
