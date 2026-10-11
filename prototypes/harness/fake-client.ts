import type { ModelClient, ModelEvent, Prompt } from "./gateway/types.ts";

export interface ScriptedTurn {
  events: ModelEvent[];
  ignoresAbort?: boolean;
}

export function scriptedClient(turns: ScriptedTurn[], eventDelayMs = 0) {
  const prompts: Prompt[] = [];
  const client: ModelClient = {
    async *stream(request) {
      prompts.push(structuredClone(request.prompt));
      const turn = turns[prompts.length - 1];
      if (!turn) throw new Error(`No scripted turn for call ${prompts.length}`);
      for (const event of turn.events) {
        if (!turn.ignoresAbort) request.signal.throwIfAborted();
        if (eventDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, eventDelayMs));
        yield event;
      }
    },
  };
  return { client, prompts };
}

export function toolUseTurn(id: string, name: string, input: unknown = {}): ScriptedTurn {
  return {
    events: [
      { type: "usage", inputTokens: 400 },
      { type: "text", text: "Let me look." },
      { type: "tool-use", id, name, input },
      { type: "usage", outputTokens: 30 },
      { type: "stop", reason: "tool_use" },
    ],
  };
}

export function textTurn(...texts: string[]): ScriptedTurn {
  return {
    events: [
      { type: "usage", inputTokens: 600 },
      ...texts.map((text) => ({ type: "text" as const, text })),
      { type: "usage", outputTokens: 40 },
      { type: "stop", reason: "end_turn" },
    ],
  };
}
