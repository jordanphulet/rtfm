import type { Chapter, Manual, Section } from "../../shared";

export function allSections(manual: Manual): Section[] {
  return [...manual.chapters, ...manual.appendices].flatMap((chapter) => chapter.sections);
}

function isAppendix(manual: Manual, chapter: Chapter): boolean {
  return manual.appendices.includes(chapter);
}

export function chapterName(manual: Manual, chapter: Chapter): string {
  return `${isAppendix(manual, chapter) ? "Appendix" : "Chapter"} ${chapter.label}`;
}

export const CONTENTS_PATH = "/a";

export function sectionPath(id: string): string {
  return `${CONTENTS_PATH}/${id}`;
}

export function chapterAnchor(chapter: Chapter): string {
  return `chapter-${chapter.id}`;
}

export function chapterPath(chapter: Chapter): string {
  return `${CONTENTS_PATH}#${chapterAnchor(chapter)}`;
}
