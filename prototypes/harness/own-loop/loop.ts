import type { Gateway } from "../gateway/gateway.ts";
import type { ContentBlock, Job, ModelEvent, PromptMessage, ToolDefinition } from "../gateway/types.ts";

export interface LoopTool {
  definition: ToolDefinition;
  status: string;
  run(input: unknown, signal: AbortSignal): Promise<string>;
}

export type LoopEvent = { type: "status"; text: string } | { type: "text"; text: string };

type ToolUse = Extract<ContentBlock, { type: "tool_use" }>;
type ToolResult = Extract<ContentBlock, { type: "tool_result" }>;

export class LoopFailed extends Error {}

export async function* runLoop({ gateway, job, system, tools, messages, signal, maxTurns }: {
  gateway: Gateway;
  job: Job;
  system: string;
  tools: LoopTool[];
  messages: PromptMessage[];
  signal: AbortSignal;
  maxTurns: number;
}): AsyncGenerator<LoopEvent, PromptMessage[]> {
  const conversation = [...messages];
  const definitions = tools.map((tool) => tool.definition);
  for (let turn = 0; turn < maxTurns; turn++) {
    const reply = yield* modelTurn(gateway.stream(job, { system, tools: definitions, messages: conversation }, signal));
    conversation.push({ role: "assistant", content: reply.content });
    if (reply.stopReason === "end_turn") return conversation;
    if (reply.stopReason !== "tool_use") throw new LoopFailed(`The model stopped with "${reply.stopReason}"`);

    const results: ToolResult[] = [];
    for (const call of reply.content.filter((block) => block.type === "tool_use")) {
      const tool = tools.find(({ definition }) => definition.name === call.name);
      if (tool) yield { type: "status", text: tool.status };
      results.push(await runTool(tool, call, signal));
    }
    conversation.push({ role: "user", content: results });
  }
  throw new LoopFailed(`No answer after ${maxTurns} turns`);
}

async function* modelTurn(events: AsyncIterable<ModelEvent>) {
  const content: ContentBlock[] = [];
  let stopReason: string | undefined;
  for await (const event of events) {
    if (event.type === "text") {
      const last = content.at(-1);
      if (last?.type === "text") last.text += event.text;
      else content.push({ type: "text", text: event.text });
      yield { type: "text" as const, text: event.text };
    }
    if (event.type === "tool-use") content.push({ type: "tool_use", id: event.id, name: event.name, input: event.input });
    if (event.type === "stop") stopReason = event.reason;
  }
  return { content, stopReason };
}

async function runTool(tool: LoopTool | undefined, call: ToolUse, signal: AbortSignal): Promise<ToolResult> {
  if (!tool) return { type: "tool_result", tool_use_id: call.id, content: `No tool named "${call.name}"`, is_error: true };
  try {
    return { type: "tool_result", tool_use_id: call.id, content: await tool.run(call.input, signal) };
  } catch (error) {
    signal.throwIfAborted();
    return { type: "tool_result", tool_use_id: call.id, content: String(error), is_error: true };
  }
}
