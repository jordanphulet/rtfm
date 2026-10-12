// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ManualSummary } from "../library";
import { render as mount } from "../testing";
import { DeleteConfirmation, type DeleteStage } from "./DeleteConfirmation";
import { fakeWidth } from "./fakeWidth";

const PARTY: ManualSummary = {
  id: "the-birthday-party-field-manual",
  title: "The Birthday Party Field Manual",
  subtitle: "Planning, hosting and surviving a party for twelve seven-year-olds",
  chapterCount: 4,
  sectionCount: 14,
  writtenCount: 3,
};

function render(stage: DeleteStage, manual: ManualSummary | null = PARTY) {
  mount(<DeleteConfirmation manual={manual} stage={stage} findRow={() => null} onKeep={() => {}} onDelete={() => {}} />);
  return document.body.innerHTML;
}

describe("DeleteConfirmation", () => {
  it("has no title before a manual is chosen", () => {
    const html = render("confirming", null);
    expect(html).not.toContain('id="delete-title"');
    expect(html).not.toContain("undefined");
  });

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

describe("DeleteConfirmation's place beside its row", () => {
  const VIEWPORT_HEIGHT = 812;
  let height: number;
  let row: HTMLElement;
  let scrollBy: MockInstance;
  let setWidth: (width: number) => void;

  beforeEach(() => {
    setWidth = fakeWidth(1440);
    height = 177;
    row = document.body.appendChild(document.createElement("li"));
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
    scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function show(rowBottom: number, stage: DeleteStage = "confirming", manual: ManualSummary | null = PARTY) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === row) return new DOMRect(0, rowBottom - 120, 375, 120);
      if (this.classList.contains("confirm-anchor")) return new DOMRect(0, VIEWPORT_HEIGHT - height, 375, height);
      return new DOMRect();
    });
    mount(<DeleteConfirmation manual={manual} stage={stage} findRow={() => row} onKeep={() => {}} onDelete={() => {}} />);
  }

  function confirmHeight(): string {
    return document.documentElement.style.getPropertyValue("--confirm-height");
  }

  function confirmTop(): string {
    return document.querySelector<HTMLElement>(".confirm-anchor")!.style.getPropertyValue("--confirm-top");
  }

  it("on phone, scrolls a row it would cover until the row ends 8px above it, and sets its height", () => {
    setWidth(375);
    show(675);
    expect(scrollBy).toHaveBeenCalledWith({ top: 675 + 8 - (VIEWPORT_HEIGHT - 177), behavior: "instant" });
    expect(confirmHeight()).toBe("177px");
  });

  it("on phone, leaves a row it doesn't cover where it is", () => {
    setWidth(375);
    show(600);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("on phone, measures again when a failed delete makes it taller", () => {
    setWidth(375);
    show(600);
    height = 245;
    show(600, "failed");
    expect(confirmHeight()).toBe("245px");
    expect(scrollBy).toHaveBeenCalledWith({ top: 600 + 8 - (VIEWPORT_HEIGHT - 245), behavior: "instant" });
  });

  it("clears its height when it closes, and when it unmounts", () => {
    setWidth(375);
    show(675);
    show(675, "confirming", null);
    expect(confirmHeight()).toBe("");

    show(675);
    mount(null);
    expect(confirmHeight()).toBe("");
  });

  it("at 768px and up, places itself by the row and scrolls nothing", () => {
    setWidth(768);
    show(675);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(confirmTop()).not.toBe("");
    expect(confirmHeight()).toBe("");
  });

  describe("in a window too short for it below or above the row", () => {
    const SHORT_HEIGHT = 375;
    const LOWEST_TOP = SHORT_HEIGHT - 16 - 177;

    beforeEach(() => {
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(SHORT_HEIGHT);
    });

    it("sits 16px above the bottom edge and scrolls the row until it ends 8px above it", () => {
      show(250);
      expect(confirmTop()).toBe(`${LOWEST_TOP}px`);
      expect(scrollBy).toHaveBeenCalledWith({ top: 250 + 8 - LOWEST_TOP, behavior: "instant" });
      expect(confirmHeight()).toBe("177px");
    });

    it("clears its height when it closes", () => {
      show(250);
      show(250, "confirming", null);
      expect(confirmHeight()).toBe("");
    });

    it("still sits below a row it fits under, and scrolls nothing", () => {
      show(150);
      expect(confirmTop()).toBe("158px");
      expect(scrollBy).not.toHaveBeenCalled();
      expect(confirmHeight()).toBe("");
    });
  });

  it("places itself by the row once the page widens past 768px while it's open", () => {
    setWidth(375);
    show(675);
    expect(confirmTop()).toBe("");

    setWidth(1024);

    expect(confirmTop()).not.toBe("");
    expect(confirmHeight()).toBe("");
  });

  it("scrolls the row clear once the page narrows below 768px while it's open", () => {
    setWidth(1440);
    show(675);
    expect(scrollBy).not.toHaveBeenCalled();

    setWidth(375);

    expect(scrollBy).toHaveBeenCalledWith({ top: 675 + 8 - (VIEWPORT_HEIGHT - 177), behavior: "instant" });
    expect(confirmHeight()).toBe("177px");
  });
});
