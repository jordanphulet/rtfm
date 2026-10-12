import type { StoredChapter, StoredManual, StoredSection } from "./types.ts";

/** A manual's, chapter's or section's id: lower-case words joined by hyphens. */
export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function chaptersInReadingOrder(manual: StoredManual): StoredChapter[] {
  return [...manual.chapters, ...manual.appendices];
}

export function sectionsInReadingOrder(manual: StoredManual): StoredSection[] {
  return chaptersInReadingOrder(manual).flatMap((chapter) => chapter.sections);
}
