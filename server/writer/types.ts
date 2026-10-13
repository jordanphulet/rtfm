import type { FailureReason } from "../api/types.ts";
import { SpendingRefused } from "../gateway/types.ts";
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

/** The chunks, failing with `WriteFailed("budget")` when the gateway refuses the call for a cap or the kill switch. */
export async function* refusalAsBudget(chunks: AsyncIterable<WrittenChunk>): AsyncGenerator<WrittenChunk> {
  try {
    yield* chunks;
  } catch (error) {
    if (error instanceof SpendingRefused) throw new WriteFailed("budget");
    throw error;
  }
}

export function sectionToWrite(manual: StoredManual, sectionId: string): StoredSection {
  const section = sectionsInReadingOrder(manual).find(({ id }) => id === sectionId);
  if (!section) throw new Error(`The manual has no section "${sectionId}"`);
  return section;
}
