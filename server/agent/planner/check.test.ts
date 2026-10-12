import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readSeedManual } from "../../storage/seed.ts";
import type { StoredManual } from "../../storage/types.ts";
import { checkPlan } from "./check.ts";
import { fakePlan } from "./fake-planner.ts";

const PLAN = fakePlan("A manual about keeping bees");

function problemsOf(plan: unknown, takenIds: string[] = []): string[] {
  const result = checkPlan(plan, takenIds);
  return "problems" in result ? result.problems : [];
}

function withChapter(plan: StoredManual, index: number, changes: Partial<StoredManual["chapters"][number]>): StoredManual {
  return { ...plan, chapters: plan.chapters.map((chapter, at) => (at === index ? { ...chapter, ...changes } : chapter)) };
}

describe("checking a plan", () => {
  it("passes every seed manual, which sets the bar, and the fake model's plan", async () => {
    const seedIds = (await readdir(new URL("../../seed/", import.meta.url))).filter((name) => !name.startsWith("."));
    for (const id of seedIds) expect(checkPlan(await readSeedManual(id), []), id).toEqual({ manual: await readSeedManual(id) });
    expect(checkPlan(PLAN, [])).toEqual({ manual: PLAN });
  });

  it("refuses an id another manual has", () => {
    expect(problemsOf(PLAN, ["keeping-bees"])).toEqual(['The id "keeping-bees" is already taken by another manual: choose another.']);
  });

  it("refuses an id used twice, across chapters and sections", () => {
    const repeated = withChapter(PLAN, 1, { id: "before-you-begin" });
    expect(problemsOf(repeated)).toEqual([
      'The id "before-you-begin" is used more than once: every chapter and section needs its own.',
    ]);
  });

  it("labels chapters, appendices and sections by their place, whatever the model wrote", () => {
    const relabelled = {
      ...PLAN,
      chapters: PLAN.chapters.map(({ label: _, sections, ...chapter }) => ({
        ...chapter,
        label: "7",
        sections: sections.map(({ label: __, ...section }) => section),
      })),
      appendices: [{ ...PLAN.appendices[0]!, label: "1" }],
    };
    expect(checkPlan(relabelled, [])).toEqual({ manual: PLAN });
  });

  it("refuses too few or too many chapters, sections in a chapter, or sections in all", () => {
    expect(problemsOf({ ...PLAN, chapters: PLAN.chapters.slice(0, 1) })[0]).toContain("expected array to have >=2 items");
    const crowded = withChapter(PLAN, 1, { sections: [...Array(6)].map((_, index) => ({ ...PLAN.chapters[1]!.sections[0]!, id: `s-${index}`, label: `2.${index + 1}` })) });
    expect(problemsOf(crowded)[0]).toMatch(/expected array to have <=5 items\n {2}→ at chapters\[1\]\.sections/);
    const small = { ...PLAN, chapters: PLAN.chapters.slice(0, 2).map((chapter) => ({ ...chapter, sections: chapter.sections.slice(0, 2) })), appendices: [] };
    expect(problemsOf(small)).toEqual(["The manual has 4 sections; it needs 6 to 32."]);
  });

  it("refuses a blank or missing summary, a short voice, an id that isn't a slug and a key it doesn't know", () => {
    const blankSummary = withChapter(PLAN, 0, {
      sections: [{ ...PLAN.chapters[0]!.sections[0]!, summary: " ".repeat(30) }, PLAN.chapters[0]!.sections[1]!],
    });
    expect(problemsOf(blankSummary)[0]).toContain("must not be blank\n  → at chapters[0].sections[0].summary");
    const { summary: _, ...noSummary } = PLAN.chapters[0]!.sections[0]!;
    expect(problemsOf(withChapter(PLAN, 0, { sections: [noSummary as never, PLAN.chapters[0]!.sections[1]!] }))[0]).toContain(
      "→ at chapters[0].sections[0].summary",
    );
    expect(problemsOf({ ...PLAN, voice: "Plain." })[0]).toContain("→ at voice");
    expect(problemsOf({ ...PLAN, id: "Keeping Bees" })[0]).toContain("must be lower-case words joined by hyphens");
    expect(problemsOf({ ...PLAN, cover: "gold" })[0]).toContain('Unrecognized key: "cover"');
  });
});
