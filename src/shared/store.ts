import { useLayoutEffect, useSyncExternalStore } from "react";
import { sampleManual } from "./manual";
import { findSection } from "./reading-order";
import { repairPartialMarkdown } from "./repair";
import { streamBody } from "./streamer";
import type { Chapter, Manual, Section } from "./types";

let manual: Manual = sampleManual;
const shownLengths = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setStatus(id: string, status: Section["status"]) {
  const updateChapter = (chapter: Chapter): Chapter => ({
    ...chapter,
    sections: chapter.sections.map((section) =>
      section.id === id ? { ...section, status } : section,
    ),
  });
  manual = {
    ...manual,
    chapters: manual.chapters.map(updateChapter),
    appendices: manual.appendices.map(updateChapter),
  };
  emitChange();
}

function setShownLength(id: string, length: number) {
  shownLengths.set(id, length);
  emitChange();
}

function openSection(id: string) {
  const section = findSection(manual, id);
  if (section?.status !== "unwritten") return;

  setStatus(id, "writing");
  streamBody(
    section.body,
    (length) => setShownLength(id, length),
    () => setStatus(id, "written"),
  );
}

function getManual() {
  return manual;
}

export function useManual(): Manual {
  return useSyncExternalStore(subscribe, getManual, getManual);
}

export interface UseSectionResult {
  section: Section;
  status: Section["status"];
  text: string;
  progress: number;
}

export function useSection(id: string): UseSectionResult {
  const currentManual = useManual();
  const getShownLength = () => shownLengths.get(id) ?? 0;
  const shownLength = useSyncExternalStore(subscribe, getShownLength, getShownLength);
  useLayoutEffect(() => openSection(id), [id]);

  const section = findSection(currentManual, id);
  if (!section) throw new Error(`No section with id "${id}"`);

  return { section, status: section.status, ...visibleText(section, shownLength) };
}

function visibleText(section: Section, shownLength: number) {
  switch (section.status) {
    case "unwritten":
      return { text: "", progress: 0 };
    case "writing":
      return {
        text: repairPartialMarkdown(section.body.slice(0, shownLength)),
        progress: shownLength / section.body.length,
      };
    case "written":
      return { text: section.body, progress: 1 };
  }
}
