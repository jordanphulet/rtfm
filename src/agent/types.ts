import type { DeleteOutcome, FailureReason, PageAction } from "../../server/api/types";

export type { DeleteOutcome, FailureReason, LibrarianEvent, LibrarianMessage } from "../../server/api/types";
export { LIBRARIAN_LIMITS } from "../../server/api/types";

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  failure?: FailureReason;
  deleteOutcome?: DeleteOutcome;
}

export type AgentStatus = "idle" | "thinking" | "streaming";

export type AgentAction = PageAction;
