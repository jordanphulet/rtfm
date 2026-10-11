import type { ManualStore, StoredChapter } from "../storage/types.ts";
import type { Runs } from "../writer/runs.ts";
import { notFound, type Route } from "./route.ts";
import type { Chapter, Manual } from "./types.ts";

export function manualRoute(store: ManualStore, runs: Runs): Route {
  return {
    pattern: "/api/manuals/:manualId",
    async handle({ params }) {
      const stored = await store.getManual(params.manualId);
      if (!stored) return notFound;

      const withStatuses = (chapter: StoredChapter) => chapterWithStatuses(chapter, stored.id, runs);
      const manual: Manual = {
        id: stored.id,
        title: stored.title,
        subtitle: stored.subtitle,
        chapters: await Promise.all(stored.chapters.map(withStatuses)),
        appendices: await Promise.all(stored.appendices.map(withStatuses)),
      };
      return { status: 200, body: manual };
    },
  };
}

async function chapterWithStatuses(chapter: StoredChapter, manualId: string, runs: Runs): Promise<Chapter> {
  const sections = await Promise.all(
    chapter.sections.map(async (section) => ({ ...section, status: await runs.statusOf(manualId, section.id) })),
  );
  return { ...chapter, sections };
}
