import { describe, expect, it } from "vitest";
import { deleteOutcomeForLibrarian } from "./deleteOutcome";

describe("deleteOutcomeForLibrarian", () => {
  it("reports kept for Keep it, Escape or the scrim (all onKeep) before any delete was tried", () => {
    expect(deleteOutcomeForLibrarian("keep", "confirming", true)).toBe("kept");
  });

  it("reports deleted once the server has deleted the manual, after a retry too", () => {
    expect(deleteOutcomeForLibrarian("delete", "deleting", true)).toBe("deleted");
  });

  it.each(["failed", "being-written"] as const)("reports nothing for a keep after a delete that %s", (stage) => {
    expect(deleteOutcomeForLibrarian("keep", stage, true)).toBeNull();
  });

  it("reports nothing for a confirmation the librarian didn't open", () => {
    expect(deleteOutcomeForLibrarian("keep", "confirming", false)).toBeNull();
    expect(deleteOutcomeForLibrarian("delete", "deleting", false)).toBeNull();
  });
});
