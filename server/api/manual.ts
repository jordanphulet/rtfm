import type { ManualStore, StoredChapter } from "../storage/types.ts";
import type { Runs } from "../writer/runs.ts";
import { notFound, type Route } from "./route.ts";
import type { Chapter, Manual, SectionStatus } from "./types.ts";

export function manualRoute(store: ManualStore, runs: Runs): Route {
  return {
    method: "GET",
    pattern: "/api/manuals/:manualId",
    async handle({ params }) {
      const stored = await store.getManual(params.manualId);
      if (!stored) return notFound;

      const writingIds = await runs.writingSectionIds(stored.id);
      const writtenIds = new Set(await store.writtenSectionIds(stored.id));
      const statusOf = (sectionId: string): SectionStatus => {
        if (writingIds.has(sectionId)) return "writing";
        return writtenIds.has(sectionId) ? "written" : "unwritten";
      };
      const withStatuses = (chapter: StoredChapter): Chapter => ({
        ...chapter,
        sections: chapter.sections.map((section) => ({ ...section, status: statusOf(section.id) })),
      });
      const manual: Manual = {
        id: stored.id,
        title: stored.title,
        subtitle: stored.subtitle,
        chapters: stored.chapters.map(withStatuses),
        appendices: stored.appendices.map(withStatuses),
      };
      return { status: 200, body: manual };
    },
  };
}
