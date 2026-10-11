import type { FailureReason } from "../api/types.ts";
import type { StoredManual } from "../storage/types.ts";

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
