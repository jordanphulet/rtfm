import type { FailureReason, PageAction } from "../../server/api/types";

export type { FailureReason, LibrarianEvent, LibrarianMessage } from "../../server/api/types";
export { LIBRARIAN_LIMITS } from "../../server/api/types";

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  failure?: FailureReason;
}

export type AgentStatus = "idle" | "thinking" | "streaming";

export type AgentAction = PageAction;
