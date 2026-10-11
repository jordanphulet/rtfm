import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ManualSummary } from "../library";
import { DeleteConfirmation, type DeleteStage } from "./DeleteConfirmation";

const PARTY: ManualSummary = {
  id: "the-birthday-party-field-manual",
  title: "The Birthday Party Field Manual",
  subtitle: "Planning, hosting and surviving a party for twelve seven-year-olds",
  chapterCount: 4,
  sectionCount: 14,
  writtenCount: 3,
};

function render(stage: DeleteStage) {
  return renderToStaticMarkup(
    <DeleteConfirmation manual={PARTY} stage={stage} findRow={() => null} onKeep={() => {}} onDelete={() => {}} />,
  );
}

describe("DeleteConfirmation", () => {
  it("asks first", () => {
    const html = render("confirming");
    expect(html).toContain("Delete “The Birthday Party Field Manual”?");
    expect(html).toContain("It leaves your library with its 3 written sections.");
    expect(html).toMatch(/<button[^>]*class="confirm-delete"[^>]*>Delete manual</);
  });

  it("holds both buttons while the server answers", () => {
    const html = render("deleting");
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Deleting…</);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Keep it</);
  });

  it("says a manual being written stays, and offers to try again", () => {
    const html = render("being-written");
    expect(html).toContain("Couldn’t delete “The Birthday Party Field Manual”");
    expect(html).toContain("One of its sections is being written right now, so it stays in your library.");
    expect(html).toMatch(/class="confirm-delete"[^>]*>Try again</);
    expect(html).toContain("Keep it");
  });

  it("says the delete wasn't confirmed when the server didn't answer", () => {
    expect(render("failed")).toContain("Your library didn’t confirm the delete. Try again in a moment.");
  });
});
