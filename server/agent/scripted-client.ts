import type { ModelClient, ModelEvent, ModelPrompt } from "../gateway/types.ts";

export interface ScriptedToolUse {
  id: string;
  name: string;
  input?: unknown;
}

export function scriptedClient(turns: ModelEvent[][]) {
  const prompts: ModelPrompt[] = [];
  const client: ModelClient = {
    async *stream({ prompt, signal }) {
      prompts.push(structuredClone(prompt));
      const turn = turns[prompts.length - 1];
      if (!turn) throw new Error(`No scripted turn for model call ${prompts.length}`);
      for (const event of turn) {
        signal.throwIfAborted();
        yield event;
      }
    },
  };
  return { client, prompts };
}

export function textTurn(...texts: string[]): ModelEvent[] {
  return [
    { type: "usage", inputTokens: 600 },
    ...texts.map((text) => ({ type: "text" as const, text })),
    { type: "usage", outputTokens: 40 },
    { type: "stop", reason: "end_turn" },
  ];
}

export function toolUseTurn(toolUses: ScriptedToolUse[], text?: string): ModelEvent[] {
  return [
    { type: "usage", inputTokens: 400 },
    ...(text === undefined ? [] : [{ type: "text" as const, text }]),
    ...toolUses.map(({ id, name, input = {} }) => ({ type: "tool-use" as const, id, name, input })),
    { type: "usage", outputTokens: 30 },
    { type: "stop", reason: "tool_use" },
  ];
}
