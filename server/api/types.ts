export type SectionStatus = "unwritten" | "writing" | "written";

export interface ManualSummary {
  id: string;
  title: string;
  subtitle: string;
  chapterCount: number;
  sectionCount: number;
  writtenCount: number;
}

export interface Manual {
  id: string;
  title: string;
  subtitle: string;
  chapters: Chapter[];
  appendices: Chapter[];
}

export interface Chapter {
  id: string;
  label: string;
  title: string;
  sections: Section[];
}

export interface Section {
  id: string;
  label: string;
  title: string;
  summary: string;
  status: SectionStatus;
}

export interface SectionState {
  status: SectionStatus;
  body?: string;
}

export type FailureReason = "budget" | "error";

type NoData = Record<string, never>;

export type SectionEvent =
  | { event: "append"; data: { at: number; text: string; progress: number } }
  | { event: "written"; data: NoData }
  | { event: "frozen"; data: NoData }
  | { event: "failed"; data: { reason: FailureReason } };
