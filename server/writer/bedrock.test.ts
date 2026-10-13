import { describe, expect, it } from "vitest";
import type { SectionEvent } from "../api/types.ts";
import type { ModelClient, ModelEvent, ModelRequest } from "../gateway/types.ts";
import { silentLogger } from "../logging/logger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { StoredManual } from "../storage/types.ts";
import {
  collect, inPieces, SAMPLE_ID, tempDataDir, TEST_MODEL, testGateway, testGatewayConfig, UNWRITTEN_ID, waitUntil,
} from "../testing.ts";
import { createBedrockWriter, SectionRejected } from "./bedrock.ts";
import { createRuns } from "./runs.ts";
import { WriteFailed, type WrittenChunk } from "./types.ts";

const WORDS_REQUESTED = 650;
const EXPECTED_CHARACTERS = 100;

const GOOD_BODY =
  "Every room has a small, dull brain.[^dull]\n\n## A room, in states\n\nSee [The Show Must Stop](section:the-show-must-stop).\n\n[^dull]: Dull is good.\n";

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

async function setUp({ pieces = inPieces(GOOD_BODY), stopReason = "end_turn", config = testGatewayConfig() } = {}) {
  const dataDir = await tempDataDir();
  const store = createFileManualStore(dataDir, silentLogger);
  await seedStore(store);
  const manual = (await store.getManual(SAMPLE_ID))!;
  const { client, requests } = modelClient(pieces, stopReason);
  const { gateway, ledgerEntries } = await testGateway(client, dataDir, { config });
  const writer = createBedrockWriter({
    gateway,
    store,
    wordsRequested: WORDS_REQUESTED,
    expectedCharacters: EXPECTED_CHARACTERS,
  });
  return { store, manual, writer, requests, ledgerEntries };
}

function write(writer: ReturnType<typeof createBedrockWriter>, manual: StoredManual) {
  return collect(writer.write(manual, UNWRITTEN_ID, new AbortController().signal));
}

describe("the Bedrock writer", () => {
  it("streams the body with progress estimated against the expected length, from the job's model", async () => {
    const { writer, manual, requests } = await setUp();
    const chunks = await write(writer, manual);

    expect(chunks.map((chunk) => chunk.text).join("")).toBe(GOOD_BODY);
    expect(chunks.every((chunk) => chunk.progress <= 0.99)).toBe(true);
    expect(chunks[0]!.progress).toBeCloseTo(chunks[0]!.text.length / EXPECTED_CHARACTERS);
    expect(requests[0]!.model).toBe(TEST_MODEL);
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
      config: testGatewayConfig({ caps: { dailyUsd: 0.001, monthlyUsd: 20 } }),
    });
    await expect(write(writer, manual)).rejects.toEqual(new WriteFailed("budget"));
    expect(requests).toEqual([]);
    expect(await ledgerEntries()).toEqual([]);
  });

  it("records each call's cost in the ledger", async () => {
    const { writer, manual, ledgerEntries } = await setUp();
    await write(writer, manual);
    const entries = await ledgerEntries();
    expect(entries.map((entry) => entry.kind)).toEqual(["reserve", "settle"]);
    expect(entries[1]).toMatchObject({ outcome: "complete", inputTokens: 1000, outputTokens: 200, usd: 0.002 });
  });
});

describe("a run with the Bedrock writer", () => {
  async function runEvents(setup: Awaited<ReturnType<typeof setUp>>, maxConcurrentRuns = 3) {
    const runs = createRuns({ store: setup.store, writer: setup.writer, maxConcurrentRuns, logger: silentLogger });
    const events: SectionEvent[] = [];
    await runs.join(setup.manual, UNWRITTEN_ID, (event) => events.push(event));
    await waitUntil(() => events.some((event) => event.event !== "append"));
    return events;
  }

  it("makes the model's straight quotes typographic, outside code, and stores exactly what it streamed", async () => {
    const body = `The bride's line: "Don't go." See [the 'Director'](section:the-show-must-stop "It's").\n\n\`\`\`json\n{"gesture": "none"}\n\`\`\`\n`;
    const setup = await setUp({ pieces: inPieces(body, 3) });
    const events = await runEvents(setup);
    const streamed = events.flatMap((event) => (event.event === "append" ? [event.data.text] : [])).join("");
    expect(streamed).toBe(
      `The bride’s line: “Don’t go.” See [the ‘Director’](section:the-show-must-stop "It's").\n\n\`\`\`json\n{"gesture": "none"}\n\`\`\`\n`,
    );
    expect(await setup.store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe(streamed);
  });

  it("fails with error, and stores nothing, when the output is rejected", async () => {
    const setup = await setUp({ pieces: ["Every room.[^missing]\n"] });
    expect((await runEvents(setup)).at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
    expect(await setup.store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
  });

  it("fails with error when the gateway is busy", async () => {
    const setup = await setUp({ config: testGatewayConfig({ maxConcurrentCalls: 0 }) });
    expect((await runEvents(setup)).at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
  });

  it("fails with budget when a cap would be crossed", async () => {
    const setup = await setUp({ config: testGatewayConfig({ caps: { dailyUsd: 2, monthlyUsd: 0.001 } }) });
    expect((await runEvents(setup)).at(-1)).toEqual({ event: "failed", data: { reason: "budget" } });
  });
});
