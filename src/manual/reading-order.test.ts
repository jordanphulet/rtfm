import { describe, expect, it } from "vitest";
import { chapterOf, findSection, nextSection, previousSection } from "./reading-order";
import type { Chapter, Manual } from "./types";

function chapter(id: string, sectionIds: string[]): Chapter {
  return {
    id,
    label: id,
    title: id,
    sections: sectionIds.map((sectionId) => ({
      id: sectionId,
      label: sectionId,
      title: sectionId,
      summary: "",
      status: "unwritten",
    })),
  };
}

const manual: Manual = {
  id: "fixture",
  title: "Fixture",
  subtitle: "",
  chapters: [chapter("1", ["1.1", "1.2"]), chapter("2", ["2.1"])],
  appendices: [chapter("A", ["A.1", "A.2"])],
};

describe("reading order", () => {
  it("steps forward through chapters, then appendices", () => {
    const order = ["1.1"];
    for (let next = nextSection(manual, "1.1"); next; next = nextSection(manual, next.id)) {
      order.push(next.id);
    }
    expect(order).toEqual(["1.1", "1.2", "2.1", "A.1", "A.2"]);
  });

  it("steps backward across chapter and appendix boundaries", () => {
    expect(previousSection(manual, "A.1")?.id).toBe("2.1");
    expect(previousSection(manual, "2.1")?.id).toBe("1.2");
  });

  it("has no previous section before the first and no next after the last", () => {
    expect(previousSection(manual, "1.1")).toBeUndefined();
    expect(nextSection(manual, "A.2")).toBeUndefined();
  });

  it("has no neighbours for an unknown id", () => {
    expect(previousSection(manual, "nope")).toBeUndefined();
    expect(nextSection(manual, "nope")).toBeUndefined();
  });

  it("finds sections and their chapters by id, including appendices", () => {
    expect(findSection(manual, "A.2")?.id).toBe("A.2");
    expect(findSection(manual, "nope")).toBeUndefined();
    expect(chapterOf(manual, "1.2")?.id).toBe("1");
    expect(chapterOf(manual, "A.1")?.id).toBe("A");
  });
});
