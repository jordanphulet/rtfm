import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, onTestFinished } from "vitest";
import type { PriceTable } from "./gateway/prices.ts";
import type { GatewayConfig } from "./gateway/types.ts";
import type { StoredManual } from "./storage/types.ts";
import { createFakeWriter } from "./writer/fake.ts";
import type { SectionWriter } from "./writer/types.ts";

export const SAMPLE_ID = "the-haunt-that-listens";
export const UNWRITTEN_ID = "the-room-controller";
export const OTHER_UNWRITTEN_ID = "anatomy-of-a-scare";
export const WRITTEN_ID = "sensing-the-guest";

export const TEST_MODEL = "test-model";
export const TEST_PRICES: PriceTable = {
  checkedOn: "2026-10-11",
  models: { [TEST_MODEL]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1, toolUseSystemPromptTokens: 588 } },
};

/** A gateway config for the test model, with the committed caps and room for 3 calls. */
export function testGatewayConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    caps: { dailyUsd: 2, monthlyUsd: 20 },
    maxConcurrentCalls: 3,
    idleTimeoutMs: 1000,
    jobs: {
      "write-section": { model: TEST_MODEL, maxTokens: 2048 },
      librarian: { model: TEST_MODEL, maxTokens: 1024 },
      "plan-manual": { model: TEST_MODEL, maxTokens: 4096 },
    },
    ...overrides,
  };
}

export async function tempDataDir(): Promise<string> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "rtfm-test-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true, maxRetries: 3 }));
  return dataDir;
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

export async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

/** The server-sent events of a response, each as it arrives. */
export async function* readEvents<Event>(response: Response): AsyncGenerator<Event> {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  let buffer = "";
  for await (const chunk of response.body!.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const [, event] = block.match(/^event: (.*)$/m)!;
      const [, data] = block.match(/^data: (.*)$/m)!;
      yield { event, data: JSON.parse(data) } as Event;
    }
  }
}

export async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for a condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
