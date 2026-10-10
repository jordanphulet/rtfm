import type { Chapter, Manual, Section } from "../../shared";

export const contentsPath = "/b";

export function sectionPath(id: string): string {
  return `${contentsPath}/${id}`;
}

export function isBackMatter(manual: Manual, chapter: Chapter): boolean {
  return manual.appendices.includes(chapter);
}

export function chapterLine(manual: Manual, chapter: Chapter): string {
  const kind = isBackMatter(manual, chapter) ? "Appendix" : "Chapter";
  return `${kind} ${chapter.label} · ${chapter.title}`;
}

export function allSections(manual: Manual): Section[] {
  return [...manual.chapters, ...manual.appendices].flatMap((chapter) => chapter.sections);
}

const STATE_WORDS: Record<Section["status"], string> = {
  written: "written",
  writing: "being written",
  unwritten: "not yet written",
};

export function stateWord(status: Section["status"]): string {
  return STATE_WORDS[status];
}
