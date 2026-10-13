import type { DeleteOutcome } from "../librarian";
import type { DeleteStage } from "./DeleteConfirmation";

/**
 * What the librarian hears when a delete confirmation closes: nothing for one it didn't open,
 * "deleted" once the server has deleted the manual, and "kept" only when no delete was tried,
 * since a failed attempt may still have deleted it on the server.
 */
export function deleteOutcomeForLibrarian(
  closedBy: "keep" | "delete",
  stage: DeleteStage,
  proposedByLibrarian: boolean,
): DeleteOutcome | null {
  if (!proposedByLibrarian) return null;
  if (closedBy === "delete") return "deleted";
  return stage === "confirming" ? "kept" : null;
}
