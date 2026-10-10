import type { AgentMessage } from "../../agent";

export interface ExchangeData {
  id: string;
  question: AgentMessage;
  reply?: AgentMessage;
}

export function toExchanges(messages: AgentMessage[]): ExchangeData[] {
  const exchanges: ExchangeData[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      exchanges.push({ id: `exchange-${message.id}`, question: message });
    } else if (exchanges.length > 0) {
      exchanges[exchanges.length - 1].reply = message;
    }
  }
  return exchanges;
}
