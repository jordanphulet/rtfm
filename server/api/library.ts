import type { ManualStore, StoredManual } from "../storage/types.ts";
import { sectionsInReadingOrder } from "../storage/manual.ts";
import { wantsEmptyLibrary } from "./preview.ts";
import type { Route } from "./route.ts";
import type { ManualSummary } from "./types.ts";

export function libraryRoute(store: ManualStore): Route {
  return {
    method: "GET",
    pattern: "/api/manuals",
    async handle({ query }) {
      if (wantsEmptyLibrary(query)) return { status: 200, body: [] };

      const manuals = await store.listManuals();
      const summaries = await Promise.all(manuals.map((manual) => summaryOf(store, manual)));
      summaries.sort((a, b) => a.title.localeCompare(b.title, "en"));
      return { status: 200, body: summaries };
    },
  };
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
