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
  /**
   * Never replaces a manual: "exists" if a different manual has its id, and "created", changing
   * nothing, if this very manual is already stored.
   */
  createManual(manual: StoredManual): Promise<"created" | "exists">;
  /**
   * "writing", changing nothing, if a section of it holds a writer's live lease, which only a
   * store that keeps leases on its items can see; otherwise "deleted", as for a manual that isn't there.
   */
  deleteManual(manualId: string): Promise<"deleted" | "writing">;
  getBody(manualId: string, sectionId: string): Promise<string | undefined>;
  saveBody(manualId: string, sectionId: string, body: string): Promise<"saved" | "already-written">;
  writtenSectionIds(manualId: string): Promise<string[]>;
  seededManualIds(): Promise<string[]>;
  markSeeded(manualId: string): Promise<void>;
}

/**
 * One writer per section across every environment that shares a store
 * (`server/storage/README.md` › Section leases).
 */
export interface SectionLeases {
  /** The section's lease, or undefined while another writer holds it or its body is stored. */
  take(manualId: string, sectionId: string): Promise<SectionLease | undefined>;
  /**
   * The ids of a manual's sections whose lease another environment holds, unexpired by this
   * environment's clock: the sections being written elsewhere.
   */
  heldElsewhere(manualId: string): Promise<string[]>;
  /** A section's stored body, and whether another environment holds its live lease, from one read. */
  readSection(manualId: string, sectionId: string): Promise<{ body: string | undefined; heldElsewhere: boolean }>;
}

/** A section's lease, renewed until it is released or its body is saved. */
export interface SectionLease {
  /**
   * Aborts, with the reason, once the holder may no longer write: the lease is gone from storage,
   * or it couldn't be renewed and is about to expire, before another writer can take it.
   */
  lost: AbortSignal;
  /** Saves the body as `ManualStore.saveBody` does, and throws if the lease was lost. */
  saveBody(body: string): Promise<"saved" | "already-written">;
  release(): Promise<void>;
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
