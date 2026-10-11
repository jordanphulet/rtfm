import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { EventStreamCodec } from "@smithy/eventstream-codec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileLedger, monthOf } from "../storage/file-ledger.ts";
import type { SettleEntry } from "../storage/types.ts";
import { tempDataDir, waitUntil } from "../testing.ts";
import { createBedrockClient, CREDENTIAL_CHAIN_REFUSED } from "./bedrock-client.ts";
import type { AwsCredentials } from "./credentials.ts";
import { createGateway } from "./gateway.ts";
import { prices } from "./prices.ts";
import { ModelStreamIncomplete, type GatewayConfig, type ModelClient, type ModelEvent, type ModelRequest } from "./types.ts";

const MODEL = "global.anthropic.claude-haiku-4-5-20251001-v1:0";
const MAX_TOKENS = 2048;
const FAKE_CREDENTIALS: AwsCredentials = {
  accessKeyId: "AKIAFAKEFORTESTSONLY",
  secretAccessKey: "fake-secret-for-tests-only",
  region: "us-west-2",
};

interface ReceivedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
  closed: boolean;
}

const MESSAGE_START = {
  type: "message_start",
  message: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 42, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  },
};
const OPENING = [
  MESSAGE_START,
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "My dear builder, " } },
];
const MESSAGE_EVENTS = [
  ...OPENING,
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "listen." } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9 } },
  { type: "message_stop" },
];

const codec = new EventStreamCodec(
  (bytes) => new TextDecoder().decode(bytes),
  (text) => new TextEncoder().encode(text),
);

function stringHeader(value: string) {
  return { type: "string" as const, value };
}

function chunkFrame(event: object): Uint8Array {
  const bytes = Buffer.from(JSON.stringify(event)).toString("base64");
  return codec.encode({
    headers: {
      ":event-type": stringHeader("chunk"),
      ":content-type": stringHeader("application/json"),
      ":message-type": stringHeader("event"),
    },
    body: new TextEncoder().encode(JSON.stringify({ bytes })),
  });
}

function exceptionFrame(exceptionType: string, message: string): Uint8Array {
  return codec.encode({
    headers: {
      ":exception-type": stringHeader(exceptionType),
      ":content-type": stringHeader("application/json"),
      ":message-type": stringHeader("exception"),
    },
    body: new TextEncoder().encode(JSON.stringify({ message })),
  });
}

function startEventStream(response: ServerResponse, events: object[]) {
  response.writeHead(200, { "content-type": "application/vnd.amazon.eventstream" });
  for (const event of events) response.write(chunkFrame(event));
}

async function collect(events: AsyncIterable<ModelEvent>): Promise<ModelEvent[]> {
  const collected: ModelEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe("Bedrock client", () => {
  let server: Server;
  let baseURL: string;
  let received: ReceivedRequest[];
  let respond: (response: ServerResponse) => void;

  beforeEach(async () => {
    received = [];
    respond = (response) => {
      startEventStream(response, MESSAGE_EVENTS);
      response.end();
    };
    server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        const entry: ReceivedRequest = {
          method: request.method!,
          url: request.url!,
          headers: request.headers,
          body: JSON.parse(body),
          closed: false,
        };
        received.push(entry);
        response.on("close", () => (entry.closed = true));
        respond(response);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    vi.stubEnv("AWS_PROFILE", "rtfm-test-profile-that-must-not-be-used");
    vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "bearer-token-that-must-not-be-used");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAENVKEYMUSTNOTBEUSED");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "env-secret-that-must-not-be-used");
    vi.stubEnv("AWS_REGION", "eu-west-1");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key-that-must-not-be-used");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "anthropic-token-that-must-not-be-used");
    vi.stubEnv("ANTHROPIC_BEDROCK_BASE_URL", "http://127.0.0.1:9");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  function bedrockClient(credentials = FAKE_CREDENTIALS): ModelClient {
    return createBedrockClient(credentials, { timeoutMs: 5000, baseURL });
  }

  function request(signal = new AbortController().signal): ModelRequest {
    return {
      model: MODEL,
      maxTokens: MAX_TOKENS,
      prompt: { system: "You write manuals.", messages: [{ role: "user", content: "Write the section." }] },
      signal,
    };
  }

  it("signs with the explicit keys, never a bearer token, profile or environment key", async () => {
    await collect(bedrockClient().stream(request()));

    expect(received).toHaveLength(1);
    const { headers } = received[0]!;
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAFAKEFORTESTSONLY\/\d{8}\/us-west-2\/bedrock\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/,
    );
    expect(headers["x-amz-date"]).toBeDefined();
    expect(headers["x-api-key"]).toBeUndefined();
    expect(JSON.stringify(headers)).not.toMatch(/Bearer|must-not-be-used|MUSTNOTBEUSED/);
  });

  it("refuses the default credential chain when a key is empty, before any request is sent", async () => {
    const client = bedrockClient({ ...FAKE_CREDENTIALS, secretAccessKey: "" });
    await expect(collect(client.stream(request()))).rejects.toThrow(CREDENTIAL_CHAIN_REFUSED);
    expect(received).toHaveLength(0);
  });

  it("streams the model's response endpoint and maps its events", async () => {
    const events = await collect(bedrockClient().stream(request()));

    const { method, url, body } = received[0]!;
    expect(method).toBe("POST");
    expect(url).toBe(`/model/${MODEL}/invoke-with-response-stream`);
    expect(body).toMatchObject({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: MAX_TOKENS,
      system: "You write manuals.",
      messages: [{ role: "user", content: "Write the section." }],
    });
    expect(body).not.toHaveProperty("model");

    expect(events).toEqual([
      { type: "usage", inputTokens: 42, cacheWriteTokens: 0, cacheReadTokens: 0 },
      { type: "text", text: "My dear builder, " },
      { type: "text", text: "listen." },
      { type: "usage", outputTokens: 9 },
      { type: "stop", reason: "end_turn" },
    ]);
  });

  it("closes the HTTP request when the signal aborts mid-stream", async () => {
    respond = (response) => startEventStream(response, OPENING);
    const controller = new AbortController();

    const reading = (async () => {
      for await (const event of bedrockClient().stream(request(controller.signal))) {
        if (event.type === "text") controller.abort();
      }
    })();

    await expect(reading).rejects.toThrow();
    await waitUntil(() => received[0]?.closed === true);
  });

  it("makes one HTTP attempt when the request fails, with no retries", async () => {
    respond = (response) => {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "ServiceUnavailableException" }));
    };

    await expect(collect(bedrockClient().stream(request()))).rejects.toThrow();
    expect(received).toHaveLength(1);
  });

  describe("through the gateway", () => {
    const config: GatewayConfig = {
      caps: { dailyUsd: 2, monthlyUsd: 20 },
      maxConcurrentCalls: 3,
      idleTimeoutMs: 5000,
      jobs: { "write-section": { model: MODEL, maxTokens: MAX_TOKENS } },
    };

    async function streamThroughGateway(): Promise<{ result: Promise<ModelEvent[]>; settles: () => Promise<SettleEntry[]> }> {
      const dataDir = await tempDataDir();
      const ledger = createFileLedger(dataDir);
      const gateway = await createGateway({ client: bedrockClient(), ledger, config, prices, dataDir });
      const result = collect(gateway.stream("write-section", request().prompt, new AbortController().signal));
      const month = monthOf(new Date().toISOString());
      const settles = async () =>
        (await ledger.entriesForMonth(month)).filter((entry): entry is SettleEntry => entry.kind === "settle");
      return { result, settles };
    }

    function chargedAtFullOutput(settle: SettleEntry | undefined) {
      expect(settle).toMatchObject({ outcome: "failed", inputTokens: 42, outputTokens: MAX_TOKENS, estimated: true });
    }

    it("settles a complete stream at the usage Bedrock reported", async () => {
      const { result, settles } = await streamThroughGateway();
      await result;
      expect(await settles()).toMatchObject([{ outcome: "complete", inputTokens: 42, outputTokens: 9, estimated: false }]);
    });

    it("fails a stream that sends an exception frame partway, charged at its full output", async () => {
      respond = (response) => {
        startEventStream(response, OPENING);
        response.end(exceptionFrame("modelStreamErrorException", "The model stream failed"));
      };
      const { result, settles } = await streamThroughGateway();

      await expect(result).rejects.toThrow(/modelStreamErrorException|The model stream failed/);
      chargedAtFullOutput((await settles())[0]);
    });

    it("fails a stream whose body is cut off mid-frame, charged at its full output", async () => {
      respond = (response) => {
        startEventStream(response, OPENING);
        const next = chunkFrame(MESSAGE_EVENTS[3]!);
        response.end(next.subarray(0, next.length / 2));
      };
      const { result, settles } = await streamThroughGateway();

      await expect(result).rejects.toThrow();
      chargedAtFullOutput((await settles())[0]);
    });

    it("fails a stream whose body ends between frames without a stop reason", async () => {
      respond = (response) => {
        startEventStream(response, OPENING);
        response.end();
      };
      const { result, settles } = await streamThroughGateway();

      await expect(result).rejects.toThrow(ModelStreamIncomplete);
      chargedAtFullOutput((await settles())[0]);
    });
  });
});
