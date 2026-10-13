import type { DeleteOutcome, FailureReason, PageAction } from "../../server/api/types";

export type { DeleteOutcome, FailureReason, LibrarianEvent, LibrarianMessage } from "../../server/api/types";
export { LIBRARIAN_LIMITS } from "../../server/api/types";

export interface ConversationMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  failure?: FailureReason;
  deleteOutcome?: DeleteOutcome;
}

export type LibrarianStatus = "idle" | "thinking" | "streaming";

export type LibrarianAction = PageAction;
