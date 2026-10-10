import type { AgentMessage } from "../../agent";

export interface Exchange {
  number: number;
  ask: AgentMessage;
  reply: AgentMessage | null;
}

export function exchangesOf(messages: AgentMessage[]): Exchange[] {
  const exchanges: Exchange[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      exchanges.push({ number: exchanges.length + 1, ask: message, reply: null });
    } else if (exchanges.length > 0) {
      exchanges[exchanges.length - 1].reply = message;
    }
  }
  return exchanges;
}

export function plainText(markdown: string): string {
  return markdown.replaceAll(/[*_`]/g, "");
}
