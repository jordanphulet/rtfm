import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../agent";
import type { ManualSummary } from "../library";
import { namedManuals } from "./references";
import { Turn } from "./Turn";

const HAUNT = libraryManual(
  "haunt",
  "The Haunt That Listens",
  "Building haunted houses with rooms that notice you, and scares that learn as you walk through",
);
const CAT = libraryManual(
  "cat",
  "Moving House Without Losing the Cat",
  "Boxes, timelines and feline diplomacy",
);

function libraryManual(id: string, title: string, subtitle: string): ManualSummary {
  return { id, title, subtitle, chapterCount: 1, sectionCount: 1, writtenCount: 0 };
}

function render(message: AgentMessage, manuals: ManualSummary[]) {
  return renderToStaticMarkup(
    <Turn message={message} live={false} manuals={manuals} onJump={() => {}} onHover={() => {}} />,
  );
}

describe("Turn", () => {
  it("keeps naming the manual a message named when it was sent, after that manual is deleted", () => {
    const message: AgentMessage = {
      id: "haunted-houses",
      role: "user",
      text: "Open the one about haunted houses",
    };
    expect(namedManuals(message.text, [CAT])).toEqual([CAT]);

    const sent = render(message, [HAUNT, CAT]);
    expect(sent).toContain("In your library:");
    expect(sent).toMatch(/<button[^>]*>The Haunt That Listens<\/button>/);

    const afterDelete = render(message, [CAT]);
    expect(afterDelete).toContain("The Haunt That Listens — no longer in your library");
    expect(afterDelete).not.toContain("<button");
    expect(afterDelete).not.toContain("In your library:");
    expect(afterDelete).not.toContain(CAT.title);
  });

  it("keeps linking the named manuals that are left when one of them is deleted", () => {
    const message: AgentMessage = {
      id: "listens-and-cat",
      role: "user",
      text: "Open Listens or the Cat",
    };

    const sent = render(message, [HAUNT, CAT]);
    expect(sent).toMatch(/In your library: <button[^>]*>The Haunt That Listens<\/button>, <button/);

    const afterDelete = render(message, [HAUNT]);
    expect(afterDelete).toMatch(/In your library: <button[^>]*>The Haunt That Listens<\/button><\/p>/);
    expect(afterDelete).toContain("Moving House Without Losing the Cat — no longer in your library");
    expect(afterDelete).not.toMatch(/<button[^>]*>Moving House/);
  });

  it("shows a failed reply's note under any text that arrived, and no empty reply", () => {
    const partial = render({ id: "reply", role: "agent", text: "You have", failure: "budget" }, []);
    expect(partial).toMatch(/You have[\s\S]*<strong>Budget reached\.<\/strong> The librarian’s budget is used up/);

    const empty = render({ id: "reply", role: "agent", text: "", failure: "error" }, []);
    expect(empty).toContain("<strong>This reply failed.</strong>");
    expect(empty).not.toContain("reply-markdown");
  });
});
