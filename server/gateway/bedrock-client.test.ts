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
import {
  ModelStalled,
  ModelStreamIncomplete,
  type GatewayConfig,
  type Job,
  type ModelClient,
  type ModelEvent,
  type ModelPrompt,
  type ModelRequest,
  type ToolDefinition,
} from "./types.ts";

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

const TOOLS: ToolDefinition[] = [
  {
    name: "find_manuals",
    description: "Finds manuals about a topic.",
    input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
  },
  { name: "list_manuals", description: "Lists the manuals.", input_schema: { type: "object", properties: {} } },
];
const TOOL_PROMPT: ModelPrompt = {
  system: "You are the librarian.",
  tools: TOOLS,
  messages: [
    { role: "user", content: "Anything about geese?" },
    { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "list_manuals", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: '["negotiating-with-geese"]' }] },
  ],
};
const TOOL_USE_EVENTS = [
  MESSAGE_START,
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let me look." } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_2", name: "find_manuals", input: {} } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "" } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"topic": "ge' } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'ese"}' } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_3", name: "list_manuals", input: {} } },
  { type: "content_block_stop", index: 2 },
  { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 31 } },
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
    expect(body).not.toHaveProperty("tools");

    expect(events).toEqual([
      { type: "usage", inputTokens: 42, cacheWriteTokens: 0, cacheReadTokens: 0 },
      { type: "text", text: "My dear builder, " },
      { type: "text", text: "listen." },
      { type: "usage", outputTokens: 9 },
      { type: "stop", reason: "end_turn" },
    ]);
  });

  it("sends tools and block content, and turns each streamed tool_use block into one tool-use event", async () => {
    respond = (response) => {
      startEventStream(response, TOOL_USE_EVENTS);
      response.end();
    };

    const events = await collect(bedrockClient().stream({ ...request(), prompt: TOOL_PROMPT }));

    expect(received[0]!.body).toMatchObject({ system: TOOL_PROMPT.system, tools: TOOLS, messages: TOOL_PROMPT.messages });
    expect(received[0]!.body).not.toHaveProperty("eager_input_streaming");
    expect(JSON.stringify(received[0]!.body.tools)).not.toContain("eager_input_streaming");
    expect(events).toEqual([
      { type: "usage", inputTokens: 42, cacheWriteTokens: 0, cacheReadTokens: 0 },
      { type: "text", text: "Let me look." },
      { type: "tool-input", json: "" },
      { type: "tool-input", json: '{"topic": "ge' },
      { type: "tool-input", json: 'ese"}' },
      { type: "tool-use", id: "toolu_2", name: "find_manuals", input: { topic: "geese" } },
      { type: "tool-use", id: "toolu_3", name: "list_manuals", input: {} },
      { type: "usage", outputTokens: 31 },
      { type: "stop", reason: "tool_use" },
    ]);
  });

  it("leaves out a tool_use block whose input is cut off at max_tokens, so the stop reason decides", async () => {
    respond = (response) => {
      startEventStream(response, [
        ...TOOL_USE_EVENTS.slice(0, 7),
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", delta: { stop_reason: "max_tokens", stop_sequence: null }, usage: { output_tokens: 1024 } },
        { type: "message_stop" },
      ]);
      response.end();
    };

    const events = await collect(bedrockClient().stream({ ...request(), prompt: TOOL_PROMPT }));

    expect(events.filter(({ type }) => type !== "tool-input")).toEqual([
      { type: "usage", inputTokens: 42, cacheWriteTokens: 0, cacheReadTokens: 0 },
      { type: "text", text: "Let me look." },
      { type: "usage", outputTokens: 1024 },
      { type: "stop", reason: "max_tokens" },
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
      jobs: {
        "write-section": { model: MODEL, maxTokens: MAX_TOKENS },
        librarian: { model: MODEL, maxTokens: MAX_TOKENS },
        "plan-manual": { model: MODEL, maxTokens: MAX_TOKENS },
      },
    };

    async function streamThroughGateway(
      job: Job = "write-section",
      prompt: ModelPrompt = request().prompt,
    ): Promise<{ result: Promise<ModelEvent[]>; settles: () => Promise<SettleEntry[]> }> {
      const dataDir = await tempDataDir();
      const ledger = createFileLedger(dataDir);
      const gateway = await createGateway({ client: bedrockClient(), ledger, config, prices, dataDir });
      const result = collect(gateway.stream(job, prompt, new AbortController().signal));
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

    it("settles a librarian turn that ends in tool calls at the usage Bedrock reported", async () => {
      respond = (response) => {
        startEventStream(response, TOOL_USE_EVENTS);
        response.end();
      };
      const { result, settles } = await streamThroughGateway("librarian", TOOL_PROMPT);
      expect((await result).filter(({ type }) => type === "tool-use")).toHaveLength(2);
      expect(await settles()).toMatchObject([
        { job: "librarian", outcome: "complete", inputTokens: 42, outputTokens: 31, estimated: false },
      ]);
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

    describe("a long tool input under a short idle timeout", () => {
      const IDLE_TIMEOUT_MS = 1000;
      const FRAGMENTS = 6;
      const FRAGMENT_PAUSE_MS = 250;
      const PLAN_JSON = JSON.stringify({ id: "a-plan", chapters: [...Array(40)].map((_, index) => `chapter ${index}`) });
      const SAVE_TOOL: ToolDefinition = { name: "save_manual", description: "Saves a plan.", input_schema: { type: "object" } };
      const PLAN_PROMPT: ModelPrompt = { system: "You plan manuals.", tools: [SAVE_TOOL], messages: [{ role: "user", content: "Plan one." }] };
      const TOOL_START = { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_plan", name: "save_manual", input: {} } };
      const TOOL_END = [
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 900 } },
        { type: "message_stop" },
      ];

      /** Sends the input in `FRAGMENTS` fragments `pauseMs` apart, after `silentMs` with nothing at all. */
      function respondWithPlan({ silentMs, pauseMs }: { silentMs: number; pauseMs: number }) {
        respond = async (response) => {
          startEventStream(response, [MESSAGE_START, TOOL_START]);
          await new Promise((resolve) => setTimeout(resolve, silentMs));
          const size = Math.ceil(PLAN_JSON.length / FRAGMENTS);
          for (let start = 0; start < PLAN_JSON.length; start += size) {
            await new Promise((resolve) => setTimeout(resolve, pauseMs));
            const partial_json = PLAN_JSON.slice(start, start + size);
            response.write(chunkFrame({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json } }));
          }
          for (const event of TOOL_END) response.write(chunkFrame(event));
          response.end();
        };
      }

      async function planThroughGateway() {
        const dataDir = await tempDataDir();
        const ledger = createFileLedger(dataDir);
        const shortTimeout = { ...config, idleTimeoutMs: IDLE_TIMEOUT_MS };
        const gateway = await createGateway({ client: bedrockClient(), ledger, config: shortTimeout, prices, dataDir });
        const result = collect(gateway.stream("plan-manual", PLAN_PROMPT, new AbortController().signal));
        const settles = async () =>
          (await ledger.entriesForMonth(monthOf(new Date().toISOString()))).filter((entry) => entry.kind === "settle");
        return { result, settles };
      }

      it("counts each input fragment as activity, so a tool input longer than the timeout completes", async () => {
        respondWithPlan({ silentMs: 0, pauseMs: FRAGMENT_PAUSE_MS });
        const started = Date.now();
        const { result, settles } = await planThroughGateway();

        const events = await result;
        expect(Date.now() - started).toBeGreaterThan(IDLE_TIMEOUT_MS);
        expect(events.filter(({ type }) => type === "tool-input")).toHaveLength(FRAGMENTS);
        expect(events).toContainEqual({ type: "tool-use", id: "toolu_plan", name: "save_manual", input: JSON.parse(PLAN_JSON) });
        expect(await settles()).toMatchObject([{ job: "plan-manual", outcome: "complete", outputTokens: 900 }]);
      });

      it("still stops a stream that sends nothing for longer than the timeout", async () => {
        respondWithPlan({ silentMs: IDLE_TIMEOUT_MS * 2, pauseMs: 0 });
        const { result, settles } = await planThroughGateway();

        await expect(result).rejects.toThrow(ModelStalled);
        expect(await settles()).toMatchObject([{ job: "plan-manual", outcome: "failed", estimated: true }]);
      });
    });
  });
});
