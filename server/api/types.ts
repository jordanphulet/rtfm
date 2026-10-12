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

/** How a delete confirmation the librarian opened ended. */
export type DeleteOutcome = "kept" | "deleted";

export interface LibrarianMessage {
  role: "user" | "agent";
  text: string;
  /** On a reply that proposed a delete: how its confirmation ended. */
  deleteOutcome?: DeleteOutcome;
}

/** What one request to the librarian may hold: the earlier exchanges, then the new message. */
export const LIBRARIAN_LIMITS = {
  earlierExchanges: 10,
  messageCharacters: 4000,
};

export type PageAction =
  | { type: "open"; manualId: string }
  | { type: "propose-delete"; manualId: string }
  | { type: "created"; manualId: string };

export type LibrarianEvent =
  | { event: "status"; data: { text: string } }
  | { event: "text"; data: { text: string } }
  | { event: "withdraw"; data: NoData }
  | { event: "action"; data: PageAction }
  | { event: "done"; data: NoData }
  | { event: "frozen"; data: NoData }
  | { event: "failed"; data: { reason: FailureReason } };
