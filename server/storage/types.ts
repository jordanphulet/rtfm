import type { Section } from "../api/types.ts";

export interface StoredManual {
  id: string;
  title: string;
  subtitle: string;
  voice: string;
  chapters: StoredChapter[];
  appendices: StoredChapter[];
}

export interface StoredChapter {
  id: string;
  label: string;
  title: string;
  sections: StoredSection[];
}

export type StoredSection = Omit<Section, "status">;

export interface ManualStore {
  listManuals(): Promise<StoredManual[]>;
  getManual(manualId: string): Promise<StoredManual | undefined>;
  /** Never replaces a manual: "exists" if its id is already taken. */
  createManual(manual: StoredManual): Promise<"created" | "exists">;
  deleteManual(manualId: string): Promise<void>;
  getBody(manualId: string, sectionId: string): Promise<string | undefined>;
  saveBody(manualId: string, sectionId: string, body: string): Promise<"saved" | "already-written">;
  writtenSectionIds(manualId: string): Promise<string[]>;
  seededManualIds(): Promise<string[]>;
  markSeeded(manualId: string): Promise<void>;
}

export interface UsageLedger {
  append(entry: LedgerEntry): Promise<void>;
  entriesForMonth(month: string): Promise<LedgerEntry[]>;
}

export type LedgerEntry = ReserveEntry | SettleEntry;

export interface ReserveEntry {
  kind: "reserve";
  callId: string;
  reservedAt: string;
  job: string;
  model: string;
  worstCaseUsd: number;
}

export interface SettleEntry {
  kind: "settle";
  callId: string;
  reservedAt: string;
  at: string;
  job: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  usd: number;
  outcome: "complete" | "aborted" | "failed";
  estimated: boolean;
}
