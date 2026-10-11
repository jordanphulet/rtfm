import {
  Model,
  type BaseModelConfig,
  type ContentBlock as StrandsBlock,
  type Message,
  type ModelStreamEvent,
  type StopReason,
  type StreamOptions,
  type SystemPrompt,
  type ToolResultContent,
  type ToolSpec,
} from "@strands-agents/sdk";
import type { Gateway } from "../gateway/gateway.ts";
import type { ContentBlock, Job, ModelEvent, PromptMessage, ToolDefinition } from "../gateway/types.ts";

const STOP_REASONS: Record<string, StopReason> = {
  end_turn: "endTurn",
  tool_use: "toolUse",
  max_tokens: "maxTokens",
  refusal: "refusal",
  stop_sequence: "stopSequence",
  pause_turn: "pauseTurn",
};

export class GatewayModel extends Model<BaseModelConfig> {
  private readonly gateway: Gateway;
  private readonly job: Job;

  constructor(gateway: Gateway, job: Job) {
    super();
    this.gateway = gateway;
    this.job = job;
  }

  updateConfig(): void {
    throw new Error("The gateway's configuration chooses the model");
  }

  getConfig(): BaseModelConfig {
    return { modelId: `gateway:${this.job}` };
  }

  async *stream(messages: Message[], options: StreamOptions = {}): AsyncGenerator<ModelStreamEvent> {
    const signal = options.cancelSignal ?? new AbortController().signal;
    const prompt = {
      system: systemText(options.systemPrompt),
      tools: (options.toolSpecs ?? []).map(toolDefinition),
      messages: messages.map(promptMessage),
    };
    const events = this.gateway.stream(this.job, prompt, signal)[Symbol.asyncIterator]();
    // Strands may stop pulling without calling return() when it is cancelled, which would leave
    // the gateway's call unsettled; returning the iterator on abort settles it.
    const settleOnAbort = () => void events.return?.();
    signal.addEventListener("abort", settleOnAbort, { once: true });
    try {
      yield { type: "modelMessageStartEvent", role: "assistant" };
      yield* strandsEvents({ [Symbol.asyncIterator]: () => events });
    } finally {
      signal.removeEventListener("abort", settleOnAbort);
      await events.return?.();
    }
  }
}

async function* strandsEvents(events: AsyncIterable<ModelEvent>): AsyncGenerator<ModelStreamEvent> {
  let textOpen = false;
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const event of events) {
    if (event.type === "text") {
      if (!textOpen) yield { type: "modelContentBlockStartEvent" };
      textOpen = true;
      yield { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: event.text } };
      continue;
    }
    if (textOpen) yield { type: "modelContentBlockStopEvent" };
    textOpen = false;
    if (event.type === "tool-use") {
      yield { type: "modelContentBlockStartEvent", start: { type: "toolUseStart", name: event.name, toolUseId: event.id } };
      yield { type: "modelContentBlockDeltaEvent", delta: { type: "toolUseInputDelta", input: JSON.stringify(event.input) } };
      yield { type: "modelContentBlockStopEvent" };
    }
    if (event.type === "usage") {
      inputTokens = event.inputTokens ?? inputTokens;
      outputTokens = event.outputTokens ?? outputTokens;
    }
    if (event.type === "stop") {
      yield { type: "modelMetadataEvent", usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };
      yield { type: "modelMessageStopEvent", stopReason: STOP_REASONS[event.reason] ?? event.reason };
    }
  }
}

function toolResultText(part: ToolResultContent): string {
  if (part.type === "textBlock") return part.text;
  if (part.type === "jsonBlock") return JSON.stringify(part.json);
  throw new Error(`The gateway can't send a ${part.type} as a tool result`);
}

function systemText(systemPrompt: SystemPrompt | undefined): string {
  if (systemPrompt === undefined || typeof systemPrompt === "string") return systemPrompt ?? "";
  return systemPrompt.map((block) => (block.type === "textBlock" ? block.text : "")).join("");
}

function toolDefinition({ name, description, inputSchema }: ToolSpec): ToolDefinition {
  return { name, description, input_schema: (inputSchema ?? { type: "object" }) as ToolDefinition["input_schema"] };
}

function promptMessage(message: Message): PromptMessage {
  return { role: message.role, content: message.content.map(promptBlock) };
}

function promptBlock(block: StrandsBlock): ContentBlock {
  switch (block.type) {
    case "textBlock":
      return { type: "text", text: block.text };
    case "toolUseBlock":
      return { type: "tool_use", id: block.toolUseId, name: block.name, input: block.input };
    case "toolResultBlock":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content.map(toolResultText).join(""),
        is_error: block.status === "error",
      };
    default:
      throw new Error(`The gateway can't send a ${block.type}`);
  }
}
