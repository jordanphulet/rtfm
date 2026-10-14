import { use, useLayoutEffect, useSyncExternalStore } from "react";
import { fetchManual, fetchSectionState, streamSection, type StreamEvent } from "./api";
import { separateFormulaFences } from "./formula-fences";
import { findSection } from "./reading-order";
import { repairPartialMarkdown } from "./repair";
import type { Chapter, FailureReason, Manual, Section, SectionStatus } from "./types";

interface SectionText {
  raw: string;
  progress: number;
  failure?: FailureReason;
}

interface ManualState {
  id: string;
  manual?: Manual;
  manualRequest?: Promise<Manual>;
  sectionRequests: Map<string, Promise<void>>;
  sectionTexts: Map<string, SectionText>;
  openedSections: Set<string>;
  openStreams: Map<string, () => void>;
}

interface QueuedStream {
  state: ManualState;
  id: string;
}

const NO_TEXT: SectionText = { raw: "", progress: 0 };
const MAX_OPEN_STREAMS = 3;

const manualStates = new Map<string, ManualState>();
const queuedStreams: QueuedStream[] = [];
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

function stateOf(manualId: string): ManualState {
  let state = manualStates.get(manualId);
  if (!state) {
    state = {
      id: manualId,
      sectionRequests: new Map(),
      sectionTexts: new Map(),
      openedSections: new Set(),
      openStreams: new Map(),
    };
    manualStates.set(manualId, state);
  }
  return state;
}

function loadManual(state: ManualState): Promise<Manual> {
  state.manualRequest ??= fetchManual(state.id).then((fetched) => (state.manual = fetched));
  return state.manualRequest;
}

function loadSection(state: ManualState, id: string): Promise<void> {
  let request = state.sectionRequests.get(id);
  if (!request) {
    request = fetchSectionState(state.id, id).then(({ status, body }) => {
      if (body !== undefined) setText(state, id, { raw: body, progress: 1 });
      setStatus(state, id, status);
    });
    state.sectionRequests.set(id, request);
  }
  return request;
}

function setStatus(state: ManualState, id: string, status: SectionStatus) {
  const current = state.manual!;
  if (findSection(current, id)?.status === status) return;
  const updateChapter = (chapter: Chapter): Chapter => ({
    ...chapter,
    sections: chapter.sections.map((section) => (section.id === id ? { ...section, status } : section)),
  });
  state.manual = {
    ...current,
    chapters: current.chapters.map(updateChapter),
    appendices: current.appendices.map(updateChapter),
  };
  emitChange();
}

function setText(state: ManualState, id: string, text: SectionText) {
  state.sectionTexts.set(id, text);
  emitChange();
}

export function openSection(manualId: string, id: string) {
  const state = stateOf(manualId);
  if (state.openedSections.has(id) || findSection(state.manual!, id)?.status === "written") return;
  state.openedSections.add(id);
  startWriting(state, id);
}

export function retrySection(manualId: string, id: string) {
  const state = stateOf(manualId);
  if (!state.sectionTexts.get(id)?.failure) return;
  setText(state, id, NO_TEXT);
  startWriting(state, id);
}

function startWriting(state: ManualState, id: string) {
  setStatus(state, id, "writing");
  queuedStreams.push({ state, id });
  openQueuedStreams();
}

function openQueuedStreams() {
  while (openStreamCount() < MAX_OPEN_STREAMS && queuedStreams.length > 0) {
    const { state, id } = queuedStreams.shift()!;
    state.openStreams.set(id, streamSection(state.id, id, (event) => applyEvent(state, id, event)));
  }
}

function openStreamCount(): number {
  let count = 0;
  for (const state of manualStates.values()) count += state.openStreams.size;
  return count;
}

function endStream(state: ManualState, id: string) {
  state.openStreams.get(id)?.();
  state.openStreams.delete(id);
  openQueuedStreams();
}

function applyEvent(state: ManualState, id: string, event: StreamEvent) {
  const current = state.sectionTexts.get(id) ?? NO_TEXT;
  switch (event.event) {
    case "append":
      if (event.data.at === current.raw.length) {
        setText(state, id, { raw: current.raw + event.data.text, progress: event.data.progress });
      } else {
        fail(state, id, current, "error");
      }
      return;
    case "written":
      endStream(state, id);
      setStatus(state, id, "written");
      return;
    case "frozen":
      endStream(state, id);
      return;
    case "failed":
      fail(state, id, current, event.data.reason);
      return;
    case "error":
      fail(state, id, current, "error");
      return;
  }
}

function fail(state: ManualState, id: string, current: SectionText, failure: FailureReason) {
  endStream(state, id);
  setText(state, id, { ...current, failure });
  setStatus(state, id, "unwritten");
}

export function useManual(manualId: string): Manual {
  const state = stateOf(manualId);
  use(loadManual(state));
  const getManual = () => state.manual!;
  return useSyncExternalStore(subscribe, getManual, getManual);
}

export interface UseSectionResult {
  section: Section;
  status: SectionStatus;
  text: string;
  progress: number;
  failure?: FailureReason;
}

export function useSection(manualId: string, id: string): UseSectionResult {
  const currentManual = useManual(manualId);
  const section = findSection(currentManual, id);
  if (!section) throw new Error(`No section with id "${id}" in manual "${manualId}"`);

  const state = stateOf(manualId);
  use(loadSection(state, id));
  const getText = () => state.sectionTexts.get(id) ?? NO_TEXT;
  const { raw, progress, failure } = useSyncExternalStore(subscribe, getText, getText);
  useLayoutEffect(() => openSection(manualId, id), [manualId, id]);

  if (section.status === "written") {
    return { section, status: section.status, text: separateFormulaFences(raw), progress: 1 };
  }
  return { section, status: section.status, text: repairPartialMarkdown(raw), progress, failure };
}
