import type { FailureReason } from "../api/types.ts";
import { sectionsInReadingOrder } from "../storage/manual.ts";
import type { StoredManual, StoredSection } from "../storage/types.ts";

export interface WrittenChunk {
  text: string;
  progress: number;
  placeholder?: boolean;
}

export interface SectionWriter {
  write(manual: StoredManual, sectionId: string, signal: AbortSignal): AsyncIterable<WrittenChunk>;
}

export class WriteFailed extends Error {
  reason: FailureReason;

  constructor(reason: FailureReason) {
    super(reason);
    this.reason = reason;
  }
}

export function sectionToWrite(manual: StoredManual, sectionId: string): StoredSection {
  const section = sectionsInReadingOrder(manual).find(({ id }) => id === sectionId);
  if (!section) throw new Error(`The manual has no section "${sectionId}"`);
  return section;
}
