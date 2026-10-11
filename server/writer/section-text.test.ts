import { describe, expect, it } from "vitest";
import { createSectionText, openingLength } from "./section-text.ts";

const SECTION = { label: "3.2", title: "The Room Controller" };

function shown(pieces: string[]) {
  const text = createSectionText(SECTION);
  const ready = pieces.map((piece) => text.readyAfter(piece));
  const rest = text.restAtEnd();
  return { ready, rest, body: text.body() };
}

describe("openingLength", () => {
  it("waits for the first line to be whole before judging it", () => {
    expect(openingLength("# The Room", SECTION, false)).toBeUndefined();
    expect(openingLength("Every room in the house", SECTION, false)).toBeUndefined();
    expect(openingLength("Every room in the house\n", SECTION, false)).toBe(0);
  });

  it("drops an H1, a heading or bold line that repeats the title, a rule and blank lines", () => {
    for (const opening of [
      "# Anything at all\n\n",
      "## 3.2 The Room Controller\n\n",
      "### Section 3.2: The Room Controller\n",
      "**The Room Controller**\n\n---\n\n",
      "The Room Controller\n===\n\n",
      "\n\n",
    ]) {
      expect(openingLength(`${opening}Every room.\n`, SECTION, false)).toBe(opening.length);
    }
  });

  it("drops a short preamble addressed to the requester", () => {
    for (const opening of [
      "Sure! Here is the section.\n\n",
      "Certainly.\n",
      "Certainly! Here's what the room controller does, in the manual's voice.\n\n",
      "Here's section 3.2, written in the manual's voice:\n\n",
    ]) {
      expect(openingLength(`${opening}Every room.\n`, SECTION, false)).toBe(opening.length);
    }
  });

  it("keeps an opening that belongs to the section", () => {
    for (const opening of [
      "Here is the cruellest number in this book: **about two hundred milliseconds.**\n",
      "## Why a room needs a dull brain\n",
      "Here is the Drowned Parlour, as the stage manager sees it:\n",
      "Of course, the first thing a guest hears is the door.\n",
      "Certainly the fog is the loudest thing in the room.\n",
    ]) {
      expect(openingLength(opening, SECTION, false)).toBe(0);
    }
  });

  it("drops everything when the model ends with nothing but clutter", () => {
    expect(openingLength("# The Room Controller", SECTION, true)).toBe("# The Room Controller".length);
  });
});

describe("the section text", () => {
  it("shows nothing until the first real block has started, then drops the clutter before it", () => {
    const { ready, body } = shown(["# The Room", " Controller\n", "\nEvery room ", "has a brain.\n", "It is ", "dull."]);
    expect(ready).toEqual(["", "", "", "Every room has a brain.\n", "It is ", ""]);
    expect(body).toBe("Every room has a brain.\nIt is dull.");
  });

  it("shows only whole words, holding the rest until more arrives or the model finishes", () => {
    const { ready, rest } = shown(["It is not\n", "clever. It does", "n’t", " improvise", "."]);
    expect(ready).toEqual(["It is not\n", "clever. It ", "", "doesn’t ", ""]);
    expect(rest).toBe("improvise.");
  });

  it("never changes text already shown", () => {
    const { ready, rest, body } = shown(["Every room.\n", "\n# A late H1\n", "More."]);
    expect(ready.join("") + rest).toBe(body);
    expect(body).toBe("Every room.\n\n# A late H1\nMore.");
  });

  it("gives the whole body to finish when the model ends while the opening is still held", () => {
    const { ready, rest } = shown(["## The Room Controller\n", "Short."]);
    expect(ready).toEqual(["", ""]);
    expect(rest).toBe("Short.");
  });
});
