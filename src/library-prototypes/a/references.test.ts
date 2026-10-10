import { describe, expect, it } from "vitest";
import type { LibraryManual } from "../../library";
import { namedManuals } from "./references";

const MANUALS: LibraryManual[] = [
  [
    "haunt",
    "The Haunt That Listens",
    "Building haunted houses with rooms that notice you, and scares that learn as you walk through",
  ],
  [
    "party",
    "The Birthday Party Field Manual",
    "Planning, hosting and surviving a party for twelve seven-year-olds",
  ],
  [
    "geese",
    "Negotiating With Geese",
    "Field tactics for parks, golf courses and office campuses",
  ],
  [
    "sourdough",
    "Keeping a Sourdough Starter Alive",
    "Feeding schedules, rescue protocols, and who looks after it while you’re on holiday",
  ],
  [
    "mail",
    "Running Your Own Mail Server Without Losing Your Mind",
    "DNS records, deliverability, and the long war with spam filters",
  ],
  [
    "cat",
    "Moving House Without Losing the Cat",
    "Boxes, timelines and feline diplomacy",
  ],
  [
    "observatory",
    "Building a Backyard Observatory",
    "From a concrete pier to your first photograph of Saturn",
  ],
].map(([id, title, subtitle]) => ({
  id,
  title,
  subtitle,
  chapterCount: 1,
  sectionCount: 1,
  writtenCount: 0,
  lastOpenedAt: 0,
}));

function idsNamedBy(message: string) {
  return namedManuals(message, MANUALS).map((manual) => manual.id);
}

describe("namedManuals", () => {
  it.each([
    ["Delete the manual about birthday parties", ["party"]],
    ["delete the one about parties", ["party"]],
    ["Open the one about haunted houses", ["haunt"]],
    ["Open The Haunt That Listens", ["haunt"]],
    ["Open the cat one", ["cat"]],
    ["Open the cat’s manual", ["cat"]],
    ["Can you translate the sourdough manual into Klingon?", ["sourdough"]],
    ["Sing me a sea shanty about geese", ["geese"]],
  ])("%s names %j", (message, ids) => {
    expect(idsNamedBy(message)).toEqual(ids);
  });

  it.each([
    "Let’s start a new manual about building a treehouse",
    "Let's start a new manual about building a treehouse",
    "What do I have?",
    "Which one should I read first?",
    "Can you walk me through it?",
    "How long will this take?",
    "Tell me about your rescue dog",
    "Start a manual about planning a wedding",
    "",
  ])("%s names nothing", (message) => {
    expect(idsNamedBy(message)).toEqual([]);
  });

  it("names nothing when the library is empty", () => {
    expect(namedManuals("birthday", [])).toEqual([]);
  });
});
