import { z } from "zod";
import { chaptersInReadingOrder, ID_PATTERN, sectionsInReadingOrder } from "../../storage/manual.ts";
import type { StoredChapter, StoredManual } from "../../storage/types.ts";

export const PLAN_LIMITS = {
  chapters: { min: 2, max: 7 },
  appendices: { min: 0, max: 2 },
  sectionsInChapter: { min: 2, max: 5 },
  sections: { min: 6, max: 32 },
  voiceCharacters: { min: 300, max: 1500 },
  summaryCharacters: { min: 20, max: 200 },
};

const slug = z.string().max(80).regex(ID_PATTERN, "must be lower-case words joined by hyphens");

function text(maxCharacters: number) {
  return z.string().max(maxCharacters).regex(/\S/, "must not be blank");
}

const label = z.string().optional();

const sectionSchema = z.strictObject({
  id: slug,
  label,
  title: text(80),
  summary: text(PLAN_LIMITS.summaryCharacters.max).min(PLAN_LIMITS.summaryCharacters.min),
});

function chapterSchema({ min, max }: { min: number; max: number }) {
  return z.strictObject({
    id: slug,
    label,
    title: text(80),
    sections: z.array(sectionSchema).min(PLAN_LIMITS.sectionsInChapter.min).max(PLAN_LIMITS.sectionsInChapter.max),
  }).array().min(min).max(max);
}

/** A manual's plan, as the planner saves it: the stored manual's own format. */
export const planSchema = z.strictObject({
  id: slug,
  title: text(80),
  subtitle: text(160),
  voice: text(PLAN_LIMITS.voiceCharacters.max).min(PLAN_LIMITS.voiceCharacters.min),
  chapters: chapterSchema(PLAN_LIMITS.chapters),
  appendices: chapterSchema(PLAN_LIMITS.appendices),
});

export type PlanResult = { manual: StoredManual } | { problems: string[] };

type Plan = z.infer<typeof planSchema>;

/**
 * The plan as a manual ready to save, or what is wrong with it in words the model can act on.
 * Labels come from each chapter's and section's place, whatever the model wrote, so they never
 * cost a retry.
 */
export function checkPlan(input: unknown, takenIds: string[]): PlanResult {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { problems: [z.prettifyError(parsed.error)] };
  const manual = labelled(parsed.data);
  const problems = [...idProblems(manual, takenIds), ...sizeProblems(manual)];
  return problems.length > 0 ? { problems } : { manual };
}

function labelled(plan: Plan): StoredManual {
  return {
    ...plan,
    chapters: plan.chapters.map((chapter, index) => labelledChapter(chapter, String(index + 1))),
    appendices: plan.appendices.map((chapter, index) => labelledChapter(chapter, String.fromCharCode(65 + index))),
  };
}

function labelledChapter({ id, title, sections }: Plan["chapters"][number], label: string): StoredChapter {
  return {
    id,
    label,
    title,
    sections: sections.map(({ id, title, summary }, index) => ({ id, label: `${label}.${index + 1}`, title, summary })),
  };
}

function idProblems(manual: StoredManual, takenIds: string[]): string[] {
  const problems = takenIds.includes(manual.id) ? [takenIdProblem(manual.id)] : [];
  const ids = [...chaptersInReadingOrder(manual), ...sectionsInReadingOrder(manual)].map(({ id }) => id);
  const repeated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  for (const id of repeated) problems.push(`The id "${id}" is used more than once: every chapter and section needs its own.`);
  return problems;
}

export function takenIdProblem(manualId: string): string {
  return `The id "${manualId}" is already taken by another manual: choose another.`;
}

function sizeProblems(manual: StoredManual): string[] {
  const count = sectionsInReadingOrder(manual).length;
  const { min, max } = PLAN_LIMITS.sections;
  return count >= min && count <= max ? [] : [`The manual has ${count} sections; it needs ${min} to ${max}.`];
}
