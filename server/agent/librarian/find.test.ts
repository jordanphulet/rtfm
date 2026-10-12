import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StoredManual } from "../../storage/types.ts";
import { findManuals } from "./find.ts";

const SEED_DIR = new URL("../../seed/", import.meta.url);
const manuals: StoredManual[] = readdirSync(SEED_DIR).map(
  (id) => JSON.parse(readFileSync(new URL(`${id}/manual.json`, SEED_DIR), "utf8")).manual,
);

function titlesFor(topic: string): string[] {
  return findManuals(manuals, topic).map(({ title }) => title);
}

describe("findManuals", () => {
  it.each([
    ["geese", "Negotiating With Geese"],
    ["birthday parties", "The Birthday Party Field Manual"],
    ["the one about haunted houses", "The Haunt That Listens"],
    ["cats", "Moving House Without Losing the Cat"],
    ["telescopes", "Building a Backyard Observatory"],
  ])("puts the manual about %j first", (topic, title) => {
    expect(titlesFor(topic)[0]).toBe(title);
  });

  it("finds a manual by its table of contents, naming the sections that match", () => {
    const [match] = findManuals(manuals, "servos");
    expect(match).toMatchObject({ id: "the-haunt-that-listens", title: "The Haunt That Listens" });
    expect(match!.matchingSections).toEqual([expect.stringMatching(/^[A-Z0-9.]+ .*Servos/)]);
  });

  it("ranks a title match over a subtitle or contents match", () => {
    expect(titlesFor("house").slice(0, 2)).toEqual(["Moving House Without Losing the Cat", "The Haunt That Listens"]);
  });

  it("finds nothing for request words alone, or an unknown topic", () => {
    expect(titlesFor("How do I delete a manual?")).toEqual([]);
    expect(titlesFor("kites")).toEqual([]);
  });
});
