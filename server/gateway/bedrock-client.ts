import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { AwsCredentials } from "./credentials.ts";
import type { ModelClient, ModelEvent, ModelRequest } from "./types.ts";

export const CREDENTIAL_CHAIN_REFUSED = "The AWS default credential chain is never used";

export function createBedrockClient(
  credentials: AwsCredentials,
  { timeoutMs, baseURL = regionalURL(credentials.region) }: { timeoutMs: number; baseURL?: string },
): ModelClient {
  const client = new AnthropicBedrock({
    awsAccessKey: credentials.accessKeyId,
    awsSecretKey: credentials.secretAccessKey,
    awsRegion: credentials.region,
    baseURL,
    // Typed string | undefined, but null stops the SDK from reading AWS_BEARER_TOKEN_BEDROCK,
    // which would replace SigV4 signing.
    apiKey: null as unknown as undefined,
    providerChainResolver: async () => {
      throw new Error(CREDENTIAL_CHAIN_REFUSED);
    },
    maxRetries: 0,
    timeout: timeoutMs,
  });

  return {
    async *stream(request: ModelRequest): AsyncGenerator<ModelEvent> {
      try {
        yield* streamEvents(client, request);
      } catch (error) {
        throw withoutKeys(error, credentials);
      }
    },
  };
}

async function* streamEvents(
  client: AnthropicBedrock,
  { model, maxTokens, prompt: { system, tools = [], messages }, signal }: ModelRequest,
): AsyncGenerator<ModelEvent> {
  const events = client.messages.stream(
    { model, max_tokens: maxTokens, system, messages, tools: tools.length > 0 ? tools : undefined },
    { signal },
  );
  const toolUses = new Map<number, StreamedToolUse>();
  for await (const event of events) {
    switch (event.type) {
      case "message_start":
        // Its output_tokens is a placeholder; only message_delta reports output.
        yield inputUsageEvent(event.message.usage);
        break;
      case "content_block_start":
        if (event.content_block.type === "tool_use") {
          const { id, name } = event.content_block;
          toolUses.set(event.index, { id, name, json: "" });
        }
        break;
      case "content_block_delta":
        if (event.delta.type === "text_delta") yield { type: "text", text: event.delta.text };
        if (event.delta.type === "input_json_delta") {
          toolUses.get(event.index)!.json += event.delta.partial_json;
          yield { type: "tool-input", json: event.delta.partial_json };
        }
        break;
      case "content_block_stop": {
        const toolUse = toolUses.get(event.index);
        const toolUseEvent = toolUse && wholeToolUseEvent(toolUse);
        if (toolUseEvent) yield toolUseEvent;
        break;
      }
      case "message_delta":
        yield { ...inputUsageEvent(event.usage), outputTokens: event.usage.output_tokens };
        if (event.delta.stop_reason) yield { type: "stop", reason: event.delta.stop_reason };
        break;
    }
  }
}

/**
 * The error with the AWS keys written out of its message and stack: a signature error from AWS
 * quotes the access key ID, and errors are logged.
 */
function withoutKeys(error: unknown, { accessKeyId, secretAccessKey }: AwsCredentials): unknown {
  if (!(error instanceof Error)) return error;
  for (const key of [accessKeyId, secretAccessKey].filter((key) => key !== "")) {
    error.message = error.message.replaceAll(key, "[redacted]");
    if (error.stack) error.stack = error.stack.replaceAll(key, "[redacted]");
  }
  return error;
}

interface StreamedToolUse {
  id: string;
  name: string;
  json: string;
}

// Undefined when the input is cut off (at max_tokens), so the stop reason decides what happens.
function wholeToolUseEvent({ id, name, json }: StreamedToolUse): ModelEvent | undefined {
  try {
    return { type: "tool-use", id, name, input: json === "" ? {} : JSON.parse(json) };
  } catch {
    return undefined;
  }
}

function inputUsageEvent(usage: {
  input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}): Extract<ModelEvent, { type: "usage" }> {
  return {
    type: "usage",
    inputTokens: usage.input_tokens ?? undefined,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? undefined,
    cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
  };
}

function regionalURL(region: string): string {
  return `https://bedrock-runtime.${region}.amazonaws.com`;
}
