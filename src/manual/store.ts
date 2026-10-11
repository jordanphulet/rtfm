import { use, useLayoutEffect, useSyncExternalStore } from "react";
import { fetchManual, fetchSectionState, streamSection, type StreamEvent } from "./api";
import { findSection } from "./reading-order";
import { repairPartialMarkdown } from "./repair";
import type { Chapter, FailureReason, Manual, Section, SectionStatus } from "./types";

interface SectionText {
  raw: string;
  progress: number;
  failure?: FailureReason;
}

const NO_TEXT: SectionText = { raw: "", progress: 0 };
const MAX_OPEN_STREAMS = 3;

let manual: Manual | undefined;
let manualRequest: Promise<Manual> | undefined;
const sectionRequests = new Map<string, Promise<void>>();
const sectionTexts = new Map<string, SectionText>();
const openedSections = new Set<string>();
const queuedStreams: string[] = [];
const openStreams = new Map<string, () => void>();
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

function loadManual(): Promise<Manual> {
  manualRequest ??= fetchManual().then((fetched) => (manual = fetched));
  return manualRequest;
}

function loadSection(id: string): Promise<void> {
  let request = sectionRequests.get(id);
  if (!request) {
    request = fetchSectionState(id).then(({ status, body }) => {
      if (body !== undefined) setText(id, { raw: body, progress: 1 });
      setStatus(id, status);
    });
    sectionRequests.set(id, request);
  }
  return request;
}

function getManual(): Manual {
  return manual!;
}

function setStatus(id: string, status: SectionStatus) {
  const current = getManual();
  if (findSection(current, id)?.status === status) return;
  const updateChapter = (chapter: Chapter): Chapter => ({
    ...chapter,
    sections: chapter.sections.map((section) => (section.id === id ? { ...section, status } : section)),
  });
  manual = {
    ...current,
    chapters: current.chapters.map(updateChapter),
    appendices: current.appendices.map(updateChapter),
  };
  emitChange();
}

function setText(id: string, text: SectionText) {
  sectionTexts.set(id, text);
  emitChange();
}

export function openSection(id: string) {
  if (openedSections.has(id) || findSection(getManual(), id)?.status === "written") return;
  openedSections.add(id);
  startWriting(id);
}

export function retrySection(id: string) {
  if (!sectionTexts.get(id)?.failure) return;
  setText(id, NO_TEXT);
  startWriting(id);
}

function startWriting(id: string) {
  setStatus(id, "writing");
  queuedStreams.push(id);
  openQueuedStreams();
}

function openQueuedStreams() {
  while (openStreams.size < MAX_OPEN_STREAMS && queuedStreams.length > 0) {
    const id = queuedStreams.shift()!;
    openStreams.set(id, streamSection(id, (event) => applyEvent(id, event)));
  }
}

function endStream(id: string) {
  openStreams.get(id)?.();
  openStreams.delete(id);
  openQueuedStreams();
}

function applyEvent(id: string, event: StreamEvent) {
  const current = sectionTexts.get(id) ?? NO_TEXT;
  switch (event.event) {
    case "append":
      if (event.data.at === current.raw.length) {
        setText(id, { raw: current.raw + event.data.text, progress: event.data.progress });
      } else {
        fail(id, current, "error");
      }
      return;
    case "written":
      endStream(id);
      setStatus(id, "written");
      return;
    case "frozen":
      endStream(id);
      return;
    case "failed":
      fail(id, current, event.data.reason);
      return;
    case "error":
      fail(id, current, "error");
      return;
  }
}

function fail(id: string, current: SectionText, failure: FailureReason) {
  endStream(id);
  setText(id, { ...current, failure });
  setStatus(id, "unwritten");
}

export function useManual(): Manual {
  use(loadManual());
  return useSyncExternalStore(subscribe, getManual, getManual);
}

export interface UseSectionResult {
  section: Section;
  status: SectionStatus;
  text: string;
  progress: number;
  failure?: FailureReason;
}

export function useSection(id: string): UseSectionResult {
  const currentManual = useManual();
  const section = findSection(currentManual, id);
  if (!section) throw new Error(`No section with id "${id}"`);

  use(loadSection(id));
  const getText = () => sectionTexts.get(id) ?? NO_TEXT;
  const { raw, progress, failure } = useSyncExternalStore(subscribe, getText, getText);
  useLayoutEffect(() => openSection(id), [id]);

  if (section.status === "written") return { section, status: section.status, text: raw, progress: 1 };
  return { section, status: section.status, text: repairPartialMarkdown(raw), progress, failure };
}
