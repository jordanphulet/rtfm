import type { Chapter, Manual, Section } from "../../shared";

export const startPath = "/c";

export function sectionPath(id: string) {
  return `/c/${id}`;
}

export function isAppendix(manual: Manual, chapter: Chapter) {
  return manual.appendices.includes(chapter);
}

export function chapterName(manual: Manual, chapter: Chapter) {
  return `${isAppendix(manual, chapter) ? "Appendix" : "Chapter"} ${chapter.label}`;
}

export function allSections(manual: Manual): Section[] {
  return [...manual.chapters, ...manual.appendices].flatMap((chapter) => chapter.sections);
}

export function writtenCount(manual: Manual) {
  return allSections(manual).filter((section) => section.status === "written").length;
}

export const stateWord: Record<Section["status"], string> = {
  written: "Written",
  writing: "Writing",
  unwritten: "Not yet written",
};
