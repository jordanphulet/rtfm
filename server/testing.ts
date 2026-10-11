import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StoredManual } from "./storage/types.ts";
import { createFakeWriter } from "./writer/fake.ts";
import type { SectionWriter } from "./writer/types.ts";

export const SAMPLE_ID = "the-haunt-that-listens";
export const UNWRITTEN_ID = "the-room-controller";
export const OTHER_UNWRITTEN_ID = "anatomy-of-a-scare";
export const WRITTEN_ID = "sensing-the-guest";

export function tempDataDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "rtfm-test-"));
}

export function fastFakeWriter(): SectionWriter {
  return createFakeWriter({ firstChunkDelayMs: 0, chunkIntervalMs: 2 });
}

export function recordingWriter(writer: SectionWriter = fastFakeWriter()) {
  const signals: AbortSignal[] = [];
  return {
    signals,
    write(manual: StoredManual, sectionId: string, signal: AbortSignal) {
      signals.push(signal);
      return writer.write(manual, sectionId, signal);
    },
  };
}

export async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for a condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
