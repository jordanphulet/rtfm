import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { SectionEvent } from "../api/types.ts";
import { createGateway, killSwitchPath } from "../gateway/gateway.ts";
import type { PriceTable } from "../gateway/prices.ts";
import type { GatewayConfig, ModelClient, ModelEvent, ModelRequest } from "../gateway/types.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { LedgerEntry, StoredManual } from "../storage/types.ts";
import { SAMPLE_ID, tempDataDir, UNWRITTEN_ID, waitUntil } from "../testing.ts";
import { createBedrockWriter, SectionRejected } from "./bedrock.ts";
import { createRuns } from "./runs.ts";
import { WriteFailed, type WrittenChunk } from "./types.ts";

const MODEL = "test-model";
const PRICES: PriceTable = {
  checkedOn: "2026-10-11",
  models: { [MODEL]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1, toolUseSystemPromptTokens: 588 } },
};
const WORDS_REQUESTED = 650;
const EXPECTED_CHARACTERS = 100;

const GOOD_BODY =
  "Every room has a small, dull brain.[^dull]\n\n## A room, in states\n\nSee [The Show Must Stop](section:the-show-must-stop).\n\n[^dull]: Dull is good.\n";

function gatewayConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    caps: { dailyUsd: 2, monthlyUsd: 20 },
    maxConcurrentCalls: 3,
    idleTimeoutMs: 1000,
    jobs: {
      "write-section": { model: MODEL, maxTokens: 2048 },
      librarian: { model: MODEL, maxTokens: 1024 },
    },
    ...overrides,
  };
}

function inPieces(text: string, size = 7): string[] {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += size) pieces.push(text.slice(start, start + size));
  return pieces;
}

function modelClient(pieces: string[], stopReason = "end_turn") {
  const requests: ModelRequest[] = [];
  const client: ModelClient = {
    async *stream(request) {
      requests.push(request);
      yield { type: "usage", inputTokens: 1000 } satisfies ModelEvent;
      for (const text of pieces) yield { type: "text", text } satisfies ModelEvent;
      yield { type: "usage", outputTokens: 200 };
      yield { type: "stop", reason: stopReason };
    },
  };
  return { client, requests };
}

async function setUp({ pieces = inPieces(GOOD_BODY), stopReason = "end_turn", config = gatewayConfig() } = {}) {
  const dataDir = await tempDataDir();
  const store = createFileManualStore(dataDir);
  await seedStore(store);
  const manual = (await store.getManual(SAMPLE_ID))!;
  const ledgerEntries: LedgerEntry[] = [];
  const { client, requests } = modelClient(pieces, stopReason);
  const gateway = await createGateway({
    client,
    ledger: { append: async (entry) => void ledgerEntries.push(entry), entriesForMonth: async () => [] },
    config,
    prices: PRICES,
    dataDir,
  });
  const writer = createBedrockWriter({
    gateway,
    store,
    wordsRequested: WORDS_REQUESTED,
    expectedCharacters: EXPECTED_CHARACTERS,
  });
  return { dataDir, store, manual, writer, requests, ledgerEntries };
}

async function collect(chunks: AsyncIterable<WrittenChunk>): Promise<WrittenChunk[]> {
  const collected: WrittenChunk[] = [];
  for await (const chunk of chunks) collected.push(chunk);
  return collected;
}

function write(writer: ReturnType<typeof createBedrockWriter>, manual: StoredManual) {
  return collect(writer.write(manual, UNWRITTEN_ID, new AbortController().signal));
}

describe("the Bedrock writer", () => {
  it("streams the body in whole-word chunks with progress estimated against the expected length", async () => {
    const { writer, manual, requests } = await setUp();
    const chunks = await write(writer, manual);

    expect(chunks.map((chunk) => chunk.text).join("")).toBe(GOOD_BODY);
    expect(chunks.slice(0, -1).every((chunk) => /\s$/.test(chunk.text))).toBe(true);
    expect(chunks.every((chunk) => chunk.progress <= 0.99)).toBe(true);
    expect(chunks[0]!.progress).toBeCloseTo(chunks[0]!.text.length / EXPECTED_CHARACTERS);
    expect(requests[0]!.model).toBe(MODEL);
    expect(requests[0]!.maxTokens).toBe(2048);
  });

  it("shows the model the nearest written section of the manual", async () => {
    const { writer, manual, requests } = await setUp();
    await write(writer, manual);
    expect(requests[0]!.prompt.messages[0]!.content).toMatch(/^<written-section label="3\.1" title="Sensing the Guest">/);
  });

  it("prefers a seed section as the example over a nearer section the model wrote", async () => {
    const { writer, manual, store, requests } = await setUp();
    await store.saveBody(SAMPLE_ID, UNWRITTEN_ID, "Written by the model.\n");
    await collect(writer.write(manual, "light-sound-and-fog", new AbortController().signal));
    expect(requests[0]!.prompt.messages[0]!.content).toMatch(/^<written-section label="3\.1" title="Sensing the Guest">/);
  });

  it("drops an H1 and a preamble before showing anything", async () => {
    const opening = "Sure! Here is the section:\n\n# The Room Controller\n\n";
    const { writer, manual } = await setUp({ pieces: inPieces(opening + GOOD_BODY) });
    const chunks = await write(writer, manual);

    expect(chunks[0]!.text.startsWith("Every room")).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(GOOD_BODY);
  });

  it("rejects a footnote without a definition after streaming, and never sends the tail", async () => {
    const body = "Every room has a brain.[^dull]\n\nIt is a dull one";
    const { writer, manual } = await setUp({ pieces: inPieces(body) });
    const chunks: WrittenChunk[] = [];
    await expect(async () => {
      for await (const chunk of writer.write(manual, UNWRITTEN_ID, new AbortController().signal)) chunks.push(chunk);
    }).rejects.toThrow(/footnote \[\^dull\] has no definition/);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe("Every room has a brain.[^dull]\n\nIt is a dull ");
  });

  it("rejects a link to a section that doesn't exist, and a late H1", async () => {
    const body = "Every room.\n\n# Late\n\nSee [fog](section:the-fog-machine).\n";
    const { writer, manual } = await setUp({ pieces: [body] });
    await expect(write(writer, manual)).rejects.toThrow(
      "Section rejected: it has an H1; it links to section:the-fog-machine, which doesn't exist",
    );
  });

  it.each(["max_tokens", "refusal"])("rejects a stop reason of %s", async (stopReason) => {
    const { writer, manual } = await setUp({ stopReason });
    await expect(write(writer, manual)).rejects.toThrow(SectionRejected);
  });

  it("reports a spending cap as budget, before any call or charge", async () => {
    const { writer, manual, requests, ledgerEntries } = await setUp({
      config: gatewayConfig({ caps: { dailyUsd: 0.001, monthlyUsd: 20 } }),
    });
    await expect(write(writer, manual)).rejects.toEqual(new WriteFailed("budget"));
    expect(requests).toEqual([]);
    expect(ledgerEntries).toEqual([]);
  });

  it("reports the kill switch as budget", async () => {
    const { writer, manual, dataDir, requests } = await setUp();
    await writeFile(killSwitchPath(dataDir), "");
    await expect(write(writer, manual)).rejects.toEqual(new WriteFailed("budget"));
    expect(requests).toEqual([]);
  });

  it("records each call's cost in the ledger", async () => {
    const { writer, manual, ledgerEntries } = await setUp();
    await write(writer, manual);
    expect(ledgerEntries.map((entry) => entry.kind)).toEqual(["reserve", "settle"]);
    expect(ledgerEntries[1]).toMatchObject({ outcome: "complete", inputTokens: 1000, outputTokens: 200, usd: 0.002 });
  });
});

describe("a run with the Bedrock writer", () => {
  async function runEvents(setup: Awaited<ReturnType<typeof setUp>>, maxConcurrentRuns = 3) {
    const runs = createRuns({ store: setup.store, writer: setup.writer, maxConcurrentRuns });
    const events: SectionEvent[] = [];
    await runs.join(setup.manual, UNWRITTEN_ID, (event) => events.push(event));
    await waitUntil(() => events.some((event) => event.event !== "append"));
    return events;
  }

  it("stores exactly the streamed text", async () => {
    const setup = await setUp();
    expect((await runEvents(setup)).at(-1)).toEqual({ event: "written", data: {} });
    expect(await setup.store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe(GOOD_BODY);
  });

  it("fails with error, and stores nothing, when the output is rejected", async () => {
    const setup = await setUp({ pieces: ["Every room.[^missing]\n"] });
    expect((await runEvents(setup)).at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
    expect(await setup.store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
  });

  it("fails with error when the gateway is busy", async () => {
    const setup = await setUp({ config: gatewayConfig({ maxConcurrentCalls: 0 }) });
    expect((await runEvents(setup)).at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
  });

  it("fails with budget when a cap would be crossed", async () => {
    const setup = await setUp({ config: gatewayConfig({ caps: { dailyUsd: 2, monthlyUsd: 0.001 } }) });
    expect((await runEvents(setup)).at(-1)).toEqual({ event: "failed", data: { reason: "budget" } });
  });
});
