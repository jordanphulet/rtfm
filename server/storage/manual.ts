import type { StoredChapter, StoredManual, StoredSection } from "./types.ts";

export function chaptersInReadingOrder(manual: StoredManual): StoredChapter[] {
  return [...manual.chapters, ...manual.appendices];
}

export function sectionsInReadingOrder(manual: StoredManual): StoredSection[] {
  return chaptersInReadingOrder(manual).flatMap((chapter) => chapter.sections);
}
