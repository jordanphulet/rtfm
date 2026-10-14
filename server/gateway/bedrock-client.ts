import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { executionRoleProvider, type AwsCredentials } from "../storage/dynamodb-manual-store.ts";
import type { AwsAccess } from "./credentials.ts";
import type { ModelClient, ModelEvent, ModelRequest } from "./types.ts";

export const KEYS_MISSING = "A Bedrock client needs an access key ID and a secret access key";
/** What Bedrock answers, with status 403, when the keys have expired or it doesn't know them, as DynamoDB does. */
const KEYS_REFUSED = ["ExpiredTokenException", "UnrecognizedClientException"];

interface ClientOptions {
  timeoutMs: number;
  /** Bedrock's endpoint in the region unless given: a stand-in's, in tests. */
  baseURL?: string;
  /** Called with a call's error each time Bedrock refuses the keys (`KEYS_REFUSED`). */
  onKeysRefused?: (error: Error) => void;
}

export function createBedrockClient(
  { region, credentials }: AwsAccess,
  { timeoutMs, baseURL = regionalURL(region), onKeysRefused }: ClientOptions,
): ModelClient {
  const signedWith = new Set<string>();
  const client = new AnthropicBedrock({
    awsRegion: region,
    baseURL,
    // Typed string | undefined, but null stops the SDK from reading AWS_BEARER_TOKEN_BEDROCK,
    // which would replace SigV4 signing.
    apiKey: null as unknown as undefined,
    // Called before each request, in place of the SDK's own chain: the environment, profiles, IMDS.
    providerChainResolver: async () => credentialProvider(credentials, signedWith),
    maxRetries: 0,
    timeout: timeoutMs,
  });

  return {
    async *stream(request: ModelRequest): AsyncGenerator<ModelEvent> {
      try {
        yield* streamEvents(client, request);
      } catch (error) {
        const redacted = withoutKeys(error, signedWith);
        if (onKeysRefused && keysRefused(redacted)) onKeysRefused(redacted);
        throw redacted;
      }
    },
  };
}

/**
 * The credentials a request is signed with: fixed keys as they are, or the execution role's, asked
 * of their source for each request. Every key and session token signed with is added to
 * `signedWith`, to be written out of errors.
 */
function credentialProvider(credentials: AwsCredentials, signedWith: Set<string>) {
  const provider = credentials.kind === "keys" ? fixedKeys(credentials) : executionRoleProvider(credentials);
  return async () => {
    const identity = await provider();
    signedWith.add(identity.accessKeyId).add(identity.secretAccessKey).add(identity.sessionToken ?? "");
    return identity;
  };
}

function fixedKeys({ accessKeyId, secretAccessKey, sessionToken }: Extract<AwsCredentials, { kind: "keys" }>) {
  if (!accessKeyId || !secretAccessKey) throw new Error(KEYS_MISSING);
  return async () => ({ accessKeyId, secretAccessKey, sessionToken });
}

/**
 * Whether Bedrock refused the keys. The SDK turns an error response into an `APIError` with its
 * headers and JSON body; AWS names the error in the `x-amzn-errortype` header, or else in the
 * body's `code` or `__type`, as the AWS SDK reads a REST JSON error (`loadRestJsonErrorCode`).
 */
function keysRefused(error: unknown): error is Error {
  if (!(error instanceof AnthropicBedrock.APIError) || error.headers === undefined) return false;
  const body = (error.error ?? {}) as { code?: unknown; __type?: unknown };
  const errorType = error.headers.get("x-amzn-errortype") ?? body.code ?? body.__type;
  return typeof errorType === "string" && KEYS_REFUSED.includes(awsErrorName(errorType));
}

/** `ExpiredTokenException` from `ExpiredTokenException:http://…` or `com.amazon.coral.service#ExpiredTokenException`. */
function awsErrorName(errorType: string): string {
  return errorType.split(/[,:]/)[0]!.split("#").at(-1)!;
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
 * The error with the AWS keys and session token written out of its message and stack: a signature
 * error from AWS quotes the access key ID, and errors are logged.
 */
function withoutKeys(error: unknown, keys: Set<string>): unknown {
  if (!(error instanceof Error)) return error;
  for (const key of [...keys].filter((key) => key !== "")) {
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
