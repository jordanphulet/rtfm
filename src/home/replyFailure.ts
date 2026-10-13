import type { FailureReason } from "../librarian";

/** What a failed reply says, in the conversation and to screen readers. */
export function replyFailureWords(reason: FailureReason): { title: string; text: string } {
  return reason === "budget"
    ? { title: "Budget reached.", text: "The librarian’s budget is used up for now, so this reply stops here. Try again once the budget allows." }
    : { title: "This reply failed.", text: "Something went wrong while the librarian was replying. Send your message again to retry." };
}
