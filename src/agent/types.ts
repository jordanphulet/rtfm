export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}

export type AgentStatus = "idle" | "thinking" | "streaming";
