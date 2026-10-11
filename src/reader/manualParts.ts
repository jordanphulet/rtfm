import type { Chapter, Manual, Section } from "../manual";

export function allSections(manual: Manual): Section[] {
  return [...manual.chapters, ...manual.appendices].flatMap((chapter) => chapter.sections);
}

function isAppendix(manual: Manual, chapter: Chapter): boolean {
  return manual.appendices.includes(chapter);
}

export function chapterName(manual: Manual, chapter: Chapter): string {
  return `${isAppendix(manual, chapter) ? "Appendix" : "Chapter"} ${chapter.label}`;
}

export function contentsPath(manualId: string): string {
  return `/read/${manualId}`;
}

export function sectionPath(manualId: string, sectionId: string): string {
  return `${contentsPath(manualId)}/${sectionId}`;
}

export function chapterAnchor(chapter: Chapter): string {
  return `chapter-${chapter.id}`;
}

export function chapterPath(manualId: string, chapter: Chapter): string {
  return `${contentsPath(manualId)}#${chapterAnchor(chapter)}`;
}
