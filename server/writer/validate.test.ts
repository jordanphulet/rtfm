import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readSeedBody } from "../storage/seed.ts";
import { SAMPLE_ID } from "../testing.ts";
import { sectionsInReadingOrder } from "../storage/manual.ts";
import { sectionProblems } from "./validate.ts";

const CONTEXT = { sectionId: "the-room-controller", sectionIds: new Set(["the-room-controller", "the-show-must-stop"]) };

function problems(body: string): string[] {
  return sectionProblems(body, CONTEXT);
}

describe("sectionProblems", () => {
  it("accepts a section with defined footnotes and links to real sections", () => {
    expect(problems("A room.[^dull] See [The Show Must Stop](section:the-show-must-stop).\n\n[^dull]: It is dull.\n")).toEqual([]);
  });

  it("accepts every sample section", async () => {
    const seed = JSON.parse(await readFile(new URL(`../seed/${SAMPLE_ID}/manual.json`, import.meta.url), "utf8"));
    const sections = sectionsInReadingOrder(seed.manual);
    const sectionIds = new Set(sections.map((section) => section.id));
    for (const { id } of sections) {
      expect(sectionProblems((await readSeedBody(SAMPLE_ID, id))!, { sectionId: id, sectionIds }), id).toEqual([]);
    }
  });

  it("finds a footnote reference without a definition", () => {
    expect(problems("A room.[^dull] Another.[^loud]\n\n[^dull]: It is dull.\n")).toEqual([
      "footnote [^loud] has no definition",
    ]);
  });

  it("matches footnote labels without regard to case, and accepts definitions indented up to three spaces", () => {
    expect(problems("A room.[^Dull] Another.[^loud]\n\n[^dull]: It is dull.\n   [^LOUD]: It is loud.\n")).toEqual([]);
  });

  it("checks every form of section link", () => {
    expect(
      problems(
        [
          "See [fog](section:the-fog-machine), [it](section:the-show-must-stop \"5.1\"), [lamps](<section:the-lamps>)",
          "and [the bus][bus].",
          "",
          "[bus]: section:the-cue-bus",
        ].join("\n"),
      ),
    ).toEqual([
      "it links to section:the-fog-machine, which doesn't exist",
      "it links to section:the-lamps, which doesn't exist",
      "it links to section:the-cue-bus, which doesn't exist",
    ]);
  });

  it("finds a link to the section being written", () => {
    expect(problems("See [this very page](section:the-room-controller).")).toEqual(["it links to itself"]);
  });

  it("finds an H1 anywhere, but not a comment inside a code block", () => {
    expect(problems("A room.\n\n# Later\n")).toEqual(["it has an H1"]);
    expect(problems("A room.\n\n```yaml\n# a comment\n[^x]\n```\n")).toEqual([]);
  });

  it("closes a fence only with a matching one at least as long", () => {
    const prompt = ["````text", "# Role", "```json", "{}", "```", "# Rules", "````", "", "Done."].join("\n");
    expect(problems(prompt)).toEqual([]);
    expect(problems(`${prompt}\n\n# Late\n`)).toEqual(["it has an H1"]);
    expect(problems("~~~\n```\n# still code\n~~~\n")).toEqual([]);
  });

  it("finds an empty section, but accepts one that is only a code block", () => {
    expect(problems(" \n")).toEqual(["the section is empty"]);
    expect(problems("```yaml\nroom: parlour\n```\n")).toEqual([]);
  });
});
