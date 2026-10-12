import { describe, expect, it } from "vitest";
import { headingsOf, sectionIdsLinkedFrom, wordCount } from "./markdownScan";

describe("headingsOf", () => {
  it("gives each H2–H4 an id from its plain text, with its level and line", () => {
    const markdown = ["Intro.", "", "## The *Half* Second", "", "### Why [it](section:x) matters", "#### Notes ##"].join("\n");
    expect(headingsOf(markdown)).toEqual([
      { id: "the-half-second", level: 2, text: "The Half Second", line: 3, clause: 1 },
      { id: "why-it-matters", level: 3, text: "Why it matters", line: 5, clause: undefined },
      { id: "notes", level: 4, text: "Notes", line: 6, clause: undefined },
    ]);
  });

  it("drops apostrophes and keeps letters beyond ASCII", () => {
    expect(headingsOf("## Don’t Panic\n## Café Rules").map((heading) => heading.id)).toEqual([
      "dont-panic",
      "café-rules",
    ]);
  });

  it("numbers repeated ids from 2", () => {
    const ids = headingsOf("## Setup\n### Setup\n## Setup").map((heading) => heading.id);
    expect(ids).toEqual(["setup", "setup-2", "setup-3"]);
  });

  it("ignores headings inside code fences, of either kind", () => {
    const markdown = ["## Before", "```sh", "## not a heading", "```", "~~~", "### nor this", "~~~", "## After"].join("\n");
    expect(headingsOf(markdown).map((heading) => heading.text)).toEqual(["Before", "After"]);
  });

  it("numbers clauses by H2 only, counting on past H3s", () => {
    const clauses = headingsOf("## One\n### One a\n## Two\n#### Two a\n## Three").map((heading) => heading.clause);
    expect(clauses).toEqual([1, undefined, 2, undefined, 3]);
  });

  it("skips H1, H5 and lines that only look like headings", () => {
    expect(headingsOf("# Title\n##### Deep\n##NoSpace\n####### Seven")).toEqual([]);
  });
});

describe("sectionIdsLinkedFrom", () => {
  it("lists each linked section once, in order of appearance", () => {
    const markdown = "See [4.2](section:b), then [1.1](section:a) and [4.2 again](section:b). [Web](https://x.test)";
    expect(sectionIdsLinkedFrom(markdown)).toEqual(["b", "a"]);
  });
});

describe("wordCount", () => {
  it("counts words, not markdown syntax or link targets", () => {
    expect(wordCount("## A heading\n\nSome **bold** and `code`, [a link](https://example.com/long/path).")).toBe(8);
  });

  it("keeps contractions, hyphenated words and numbers whole", () => {
    expect(wordCount("It’s a well-known 2-step fix, isn't it? 42")).toBe(8);
  });

  it("is zero for empty text", () => {
    expect(wordCount("")).toBe(0);
  });
});
