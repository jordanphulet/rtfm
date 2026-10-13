import type { Gateway } from "../gateway/gateway.ts";
import { SpendingRefused, type ContentBlock, type Job, type ModelEvent, type PromptMessage } from "../gateway/types.ts";
import type { AgentTool } from "./tool.ts";

export type AgentEvent = { type: "status"; text: string } | { type: "text"; text: string };

type ToolUse = Extract<ContentBlock, { type: "tool_use" }>;
type ToolResult = Extract<ContentBlock, { type: "tool_result" }>;

export class AgentStopped extends Error {}

export async function* runAgent({ gateway, job, system, tools, messages, maxTurns, signal }: {
  gateway: Gateway;
  job: Job;
  system: string;
  tools: AgentTool[];
  messages: PromptMessage[];
  maxTurns: number;
  signal: AbortSignal;
}): AsyncGenerator<AgentEvent, PromptMessage[]> {
  const conversation = [...messages];
  const definitions = tools.map((tool) => tool.definition);
  for (let turn = 1; ; turn++) {
    const reply = yield* modelTurn(gateway.stream(job, { system, tools: definitions, messages: conversation }, signal));
    const toolUses = reply.content.filter((block) => block.type === "tool_use");
    if (reply.stopReason === "end_turn" && reply.content.length === 0) {
      const ranTools = conversation.length > messages.length;
      if (ranTools) return conversation;
      throw new AgentStopped("The model ended its first turn with nothing in it");
    }
    if (reply.stopReason === "tool_use" && toolUses.length === 0) {
      throw new AgentStopped("The model stopped to use a tool but called none");
    }
    conversation.push({ role: "assistant", content: reply.content });
    if (reply.stopReason === "end_turn") return conversation;
    if (reply.stopReason !== "tool_use") throw new AgentStopped(`The model stopped with "${reply.stopReason}"`);
    if (turn >= maxTurns) throw new AgentStopped(`The model was still calling tools after ${maxTurns} turns`);

    const results: ToolResult[] = [];
    for (const toolUse of toolUses) {
      signal.throwIfAborted();
      const tool = tools.find(({ definition }) => definition.name === toolUse.name);
      if (tool) yield { type: "status", text: tool.status };
      results.push(await runTool(tool, toolUse, signal));
    }
    conversation.push({ role: "user", content: results });
  }
}

async function* modelTurn(events: AsyncIterable<ModelEvent>) {
  const content: ContentBlock[] = [];
  let stopReason = "";
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

async function runTool(tool: AgentTool | undefined, toolUse: ToolUse, signal: AbortSignal): Promise<ToolResult> {
  const result = { type: "tool_result" as const, tool_use_id: toolUse.id };
  if (!tool) return { ...result, content: `There is no tool named "${toolUse.name}"`, is_error: true };
  try {
    const { content, isError } = await tool.run(toolUse.input, signal);
    return isError ? { ...result, content, is_error: true } : { ...result, content };
  } catch (error) {
    if (error instanceof SpendingRefused) throw error;
    signal.throwIfAborted();
    return { ...result, content: String(error), is_error: true };
  }
}
