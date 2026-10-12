import type { Chapter, Manual, Section } from "./types";

export function chaptersInReadingOrder(manual: Manual): Chapter[] {
  return [...manual.chapters, ...manual.appendices];
}

export function sectionsInReadingOrder(manual: Manual): Section[] {
  return chaptersInReadingOrder(manual).flatMap((chapter) => chapter.sections);
}

export function findSection(manual: Manual, id: string): Section | undefined {
  return sectionsInReadingOrder(manual).find((section) => section.id === id);
}

export function chapterOf(manual: Manual, sectionId: string): Chapter | undefined {
  return chaptersInReadingOrder(manual).find((chapter) =>
    chapter.sections.some((section) => section.id === sectionId),
  );
}

export function previousSection(manual: Manual, id: string): Section | undefined {
  const sections = sectionsInReadingOrder(manual);
  const index = sections.findIndex((section) => section.id === id);
  return index > 0 ? sections[index - 1] : undefined;
}

export function nextSection(manual: Manual, id: string): Section | undefined {
  const sections = sectionsInReadingOrder(manual);
  const index = sections.findIndex((section) => section.id === id);
  return index === -1 ? undefined : sections[index + 1];
}
