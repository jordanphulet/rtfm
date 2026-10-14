import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, onTestFinished } from "vitest";
import { INSTANT_PACE, unrecordedFakeModel, type FakeModelPace } from "./agent/fake-model.ts";
import { openFileSpendingLedger } from "./gateway/file-spending-ledger.ts";
import { createGateway } from "./gateway/gateway.ts";
import { prices, type PriceTable } from "./gateway/prices.ts";
import type { GatewayConfig, ModelClient } from "./gateway/types.ts";
import { createLogger, silentLogger, type LogEntry } from "./logging/logger.ts";
import { createFileLedger, monthOf } from "./storage/file-ledger.ts";
import type { StoredManual, UsageLedger } from "./storage/types.ts";
import { createFakeWriter } from "./writer/fake.ts";
import type { SectionWriter } from "./writer/types.ts";

export const SAMPLE_ID = "the-haunt-that-listens";
export const UNWRITTEN_ID = "the-room-controller";
export const OTHER_UNWRITTEN_ID = "anatomy-of-a-scare";
export const WRITTEN_ID = "sensing-the-guest";

export const TEST_MODEL = "test-model";
/** The committed price table, so the committed config's models are priced too, and the test model. */
export const TEST_PRICES: PriceTable = {
  checkedOn: "2026-10-11",
  models: {
    ...prices.models,
    [TEST_MODEL]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1, toolUseSystemPromptTokens: 588 },
  },
};

/** The fake model at a pace quick enough for tests, with a section still taking a few milliseconds a chunk. */
export const FAST_PACE: FakeModelPace = { ...INSTANT_PACE, chunkIntervalMs: 2 };

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

interface TestGatewayOptions {
  config?: GatewayConfig;
  ledger?: UsageLedger;
}

/**
 * The real gateway, with its caps, kill switch and the data folder's spending ledger (on a file
 * ledger in the data folder, unless one is given), calling a fake model client.
 */
export async function testGateway(
  client: ModelClient,
  dataDir: string,
  { config = testGatewayConfig(), ledger = createFileLedger(dataDir, silentLogger) }: TestGatewayOptions = {},
) {
  const gateway = await createGateway({
    logger: silentLogger,
    createClient: () => client,
    openSpendingLedger: () => openFileSpendingLedger({ ledger, dataDir }),
    config,
    prices: TEST_PRICES,
  });
  const ledgerEntries = () => ledger.entriesForMonth(monthOf(new Date().toISOString()));
  return { gateway, ledgerEntries };
}

/** A logger that keeps its entries, for a test to read, and writes nowhere. */
export function capturingLogger() {
  const entries: LogEntry[] = [];
  return { logger: createLogger([(_line, entry) => entries.push(entry)]), entries };
}

export async function tempDataDir(): Promise<string> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "rtfm-test-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true, maxRetries: 3 }));
  return dataDir;
}

/** The fake writer at `FAST_PACE`, calling the fake model directly rather than through a gateway. */
export function fastFakeWriter(): SectionWriter {
  return createFakeWriter(unrecordedFakeModel(FAST_PACE));
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

/** The text cut into pieces a few characters long, as a model streams it. */
export function inPieces(text: string, size = 7): string[] {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += size) pieces.push(text.slice(start, start + size));
  return pieces;
}

export async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

/** The server-sent events of a response, each as it arrives, passing over comments such as the heartbeat. */
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
      const event = block.match(/^event: (.*)$/m)?.[1];
      if (event === undefined) continue;
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
