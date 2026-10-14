import type { ManualStore, StoredManual } from "../storage/types.ts";
import { sectionsInReadingOrder } from "../storage/manual.ts";
import { wantsEmptyLibrary } from "./preview.ts";
import type { Route } from "./route.ts";
import type { ManualSummary } from "./types.ts";

export const libraryRoute: Route = {
  method: "GET",
  pattern: "/api/manuals",
  async handle({ query, library }) {
    if (wantsEmptyLibrary(query)) return { status: 200, body: [] };
    return { status: 200, body: await librarySummaries(library.store) };
  },
};

/** Every stored manual's summary, sorted by title. */
export async function librarySummaries(store: ManualStore): Promise<ManualSummary[]> {
  const manuals = await store.listManuals();
  const summaries = await Promise.all(manuals.map((manual) => summaryOf(store, manual)));
  return summaries.sort((a, b) => a.title.localeCompare(b.title, "en"));
}

async function summaryOf(store: ManualStore, manual: StoredManual): Promise<ManualSummary> {
  const sections = sectionsInReadingOrder(manual);
  const writtenIds = new Set(await store.writtenSectionIds(manual.id));
  return {
    id: manual.id,
    title: manual.title,
    subtitle: manual.subtitle,
    chapterCount: manual.chapters.length + manual.appendices.length,
    sectionCount: sections.length,
    writtenCount: sections.filter((section) => writtenIds.has(section.id)).length,
  };
}
