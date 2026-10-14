import { describe, expect, it, onTestFinished, vi } from "vitest";
import { config, httpEndpointFromEnv, tableWith, webFunctionAwsFromEnv } from "./config.ts";
import { GatewayBusy, type Job, type ModelClient, type Prompt } from "./gateway/types.ts";
import { collect, tempDataDir, testGateway, waitUntil } from "./testing.ts";

const PROMPT: Prompt = { system: "", messages: [{ role: "user", content: "" }] };

describe("a Web Function's address, from AWS_LAMBDA_HTTP_ENDPOINT", () => {
  it("is the host and port Lambda gives", () => {
    expect(httpEndpointFromEnv("127.0.0.1:8080")).toEqual({ host: "127.0.0.1", port: 8080 });
    expect(httpEndpointFromEnv("::1:0")).toEqual({ host: "::1", port: 0 });
  });

  it("must be given, as host:port with a port from 0 to 65535", () => {
    for (const value of [undefined, "", "127.0.0.1", ":8080", "127.0.0.1:", "127.0.0.1:http", "127.0.0.1:65536"]) {
      expect(() => httpEndpointFromEnv(value), String(value)).toThrow("AWS_LAMBDA_HTTP_ENDPOINT must be");
    }
  });
});

describe("how the Web Function reaches AWS, from the environment Lambda and RtfmApp give it", () => {
  const ROLE_VARIABLES = [
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_CREDENTIAL_EXPIRATION",
  ];

  function stubEnvironment(values: Record<string, string>) {
    onTestFinished(() => void vi.unstubAllEnvs());
    for (const name of [...ROLE_VARIABLES, "RTFM_DYNAMODB_ENDPOINT", "RTFM_BEDROCK_ENDPOINT"]) vi.stubEnv(name, undefined);
    vi.stubEnv("RTFM_APP_TABLE", "rtfm-app");
    vi.stubEnv("RTFM_USAGE_TABLE", "rtfm-usage");
    vi.stubEnv("AWS_REGION", "us-west-2");
    for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
  }

  const environmentKeys = { AWS_ACCESS_KEY_ID: "AKIAROLE", AWS_SECRET_ACCESS_KEY: "secret", AWS_SESSION_TOKEN: "token" };

  it("reaches both tables and Bedrock as the execution role, through the container credentials endpoint when Lambda gives one", () => {
    stubEnvironment({
      AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://127.0.0.1:9001/credentials",
      AWS_CONTAINER_AUTHORIZATION_TOKEN: "the-token",
      ...environmentKeys,
    });
    const aws = webFunctionAwsFromEnv();
    expect(aws).toEqual({
      access: {
        region: "us-west-2",
        credentials: { kind: "container-endpoint", fullUri: "http://127.0.0.1:9001/credentials", authorizationToken: "the-token" },
      },
      appTable: { name: "rtfm-app", endpoint: undefined },
      usageTable: { name: "rtfm-usage", endpoint: undefined },
      bedrockEndpoint: undefined,
    });
    expect(tableWith(aws.appTable, aws.access)).toEqual({
      name: "rtfm-app",
      region: "us-west-2",
      endpoint: "https://dynamodb.us-west-2.amazonaws.com",
      credentials: aws.access.credentials,
    });
  });

  it("reaches them through the environment's keys, read by name only", () => {
    stubEnvironment(environmentKeys);
    expect(webFunctionAwsFromEnv().access.credentials).toEqual({ kind: "environment", expiresAt: undefined });
  });

  it("reaches DynamoDB Local and a stand-in for Bedrock, when its test names them", () => {
    stubEnvironment({ ...environmentKeys, RTFM_DYNAMODB_ENDPOINT: "http://127.0.0.1:8000", RTFM_BEDROCK_ENDPOINT: "http://127.0.0.1:9000" });
    expect(webFunctionAwsFromEnv()).toMatchObject({
      appTable: { endpoint: "http://127.0.0.1:8000" },
      usageTable: { endpoint: "http://127.0.0.1:8000" },
      bedrockEndpoint: "http://127.0.0.1:9000",
    });
  });

  it("knows when the environment's keys expire, when Lambda sets AWS_CREDENTIAL_EXPIRATION", () => {
    stubEnvironment({ ...environmentKeys, AWS_CREDENTIAL_EXPIRATION: "2026-10-13T21:30:00Z" });
    expect(webFunctionAwsFromEnv().access.credentials).toEqual({
      kind: "environment",
      expiresAt: new Date("2026-10-13T21:30:00.000Z"),
    });
    for (const value of ["soon", "1", "9999-12-31", "2026-10-13T21:30:00", "2026-13-45T99:00:00Z"]) {
      stubEnvironment({ ...environmentKeys, AWS_CREDENTIAL_EXPIRATION: value });
      expect(() => webFunctionAwsFromEnv(), value).toThrow(`AWS_CREDENTIAL_EXPIRATION must be an ISO 8601 time, not "${value}"`);
    }
  });

  it("refuses to choose without the role's credentials or either table", () => {
    stubEnvironment({ AWS_ACCESS_KEY_ID: "AKIAROLE", AWS_SECRET_ACCESS_KEY: "secret" });
    expect(() => webFunctionAwsFromEnv()).toThrow(
      "needs its execution role's credentials: AWS_CONTAINER_CREDENTIALS_FULL_URI, or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN",
    );
    stubEnvironment({ ...environmentKeys, RTFM_APP_TABLE: "" });
    expect(() => webFunctionAwsFromEnv()).toThrow("needs RTFM_APP_TABLE");
    stubEnvironment({ ...environmentKeys, RTFM_USAGE_TABLE: "" });
    expect(() => webFunctionAwsFromEnv()).toThrow("needs RTFM_USAGE_TABLE");
  });
});

describe("committed config", () => {
  it("leaves room for a librarian turn and a plan while every section run is writing", async () => {
    const dataDir = await tempDataDir();
    let calls = 0;
    const answersOnlyAnAbort: ModelClient = {
      async *stream({ signal }) {
        calls++;
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
      },
    };
    const { gateway } = await testGateway(answersOnlyAnAbort, dataDir, { config });
    const controller = new AbortController();
    const start = (job: Job) => collect(gateway.stream(job, PROMPT, controller.signal));

    const running = [
      ...Array.from({ length: config.maxConcurrentRuns }, () => start("write-section")),
      start("librarian"),
      start("plan-manual"),
    ];
    await waitUntil(() => calls === config.maxConcurrentRuns + 2);
    await expect(start("librarian")).rejects.toThrow(GatewayBusy);

    controller.abort();
    await Promise.allSettled(running);
    await gateway.idle();
  });
});
