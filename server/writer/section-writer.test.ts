import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fakeModel } from "../agent/fake-model.ts";
import { scriptedClient, textTurn } from "../agent/scripted-client.ts";
import type { SectionEvent } from "../api/types.ts";
import { killSwitchPath } from "../gateway/file-spending-ledger.ts";
import { silentLogger } from "../logging/logger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { ManualStore } from "../storage/types.ts";
import { collect, FAST_PACE, inPieces, SAMPLE_ID, tempDataDir, testGateway, UNWRITTEN_ID, waitUntil } from "../testing.ts";
import { createBedrockWriter } from "./bedrock.ts";
import { createFakeWriter } from "./fake.ts";
import { createRuns } from "./runs.ts";
import { WriteFailed, type WrittenChunk } from "./types.ts";

const CLAUDES_BODY = "Every room has a small, dull brain.\n\n## A room, in states\n\nIt waits, it plays, it stops.\n";

async function fakeWriter(dataDir: string) {
  const { gateway, ledgerEntries } = await testGateway(fakeModel(FAST_PACE), dataDir);
  return { writer: createFakeWriter(gateway), ledgerEntries };
}

async function bedrockWriter(dataDir: string, store: ManualStore) {
  const { client } = scriptedClient([textTurn(...inPieces(CLAUDES_BODY))]);
  const { gateway, ledgerEntries } = await testGateway(client, dataDir);
  return { writer: createBedrockWriter({ gateway, store, wordsRequested: 650, expectedCharacters: 100 }), ledgerEntries };
}

/** Both writers call their model through the real gateway. */
const WRITERS = [
  { name: "the fake writer", make: fakeWriter },
  { name: "the Bedrock writer", make: bedrockWriter },
];

describe.each(WRITERS)("$name, as a SectionWriter", ({ make }) => {
  async function setUp() {
    const dataDir = await tempDataDir();
    const store = createFileManualStore(dataDir, silentLogger);
    await seedStore(store);
    const manual = (await store.getManual(SAMPLE_ID))!;
    return { dataDir, store, manual, ...(await make(dataDir, store)) };
  }

  it("streams the section in whole-word chunks, with progress rising to at most 1", async () => {
    const { writer, manual } = await setUp();
    const chunks = await collect(writer.write(manual, UNWRITTEN_ID, new AbortController().signal));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text !== "")).toBe(true);
    expect(chunks.slice(0, -1).every((chunk) => /\s$/.test(chunk.text))).toBe(true);
    const progress = chunks.map((chunk) => chunk.progress);
    expect(progress).toEqual(progress.toSorted((a, b) => a - b));
    expect(progress.every((fraction) => fraction > 0 && fraction <= 1)).toBe(true);
  });

  it("is saved by its run exactly as it streamed, and reported written", async () => {
    const { writer, manual, store } = await setUp();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const events: SectionEvent[] = [];
    await runs.join(manual, UNWRITTEN_ID, (event) => events.push(event));
    await waitUntil(() => events.some((event) => event.event !== "append"));

    expect(events.at(-1)).toEqual({ event: "written", data: {} });
    const streamed = events.flatMap((event) => (event.event === "append" ? [event.data.text] : [])).join("");
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe(streamed);
  });

  it("refuses a section the manual doesn't have", async () => {
    const { writer, manual } = await setUp();
    await expect(collect(writer.write(manual, "no-such-section", new AbortController().signal))).rejects.toThrow(
      'The manual has no section "no-such-section"',
    );
  });

  it("fails as budget while the kill switch is on, before any call or charge", async () => {
    const { writer, manual, dataDir, ledgerEntries } = await setUp();
    await writeFile(killSwitchPath(dataDir), "");
    await expect(collect(writer.write(manual, UNWRITTEN_ID, new AbortController().signal))).rejects.toEqual(
      new WriteFailed("budget"),
    );
    expect(await ledgerEntries()).toEqual([]);
  });

  it("records its call in the ledger, settled complete", async () => {
    const { writer, manual, ledgerEntries } = await setUp();
    await collect(writer.write(manual, UNWRITTEN_ID, new AbortController().signal));
    const entries = await ledgerEntries();
    expect(entries.map(({ kind }) => kind)).toEqual(["reserve", "settle"]);
    expect(entries[1]).toMatchObject({ job: "write-section", outcome: "complete", estimated: false });
  });

  it("refuses a signal that has already aborted, before any chunk", async () => {
    const { writer, manual } = await setUp();
    const controller = new AbortController();
    controller.abort();
    const chunks: WrittenChunk[] = [];
    await expect(async () => {
      for await (const chunk of writer.write(manual, UNWRITTEN_ID, controller.signal)) chunks.push(chunk);
    }).rejects.toThrow(/abort/i);
    expect(chunks).toEqual([]);
  });

  it("stops with an abort, sending no more chunks, once its signal aborts part-way", async () => {
    const { writer, manual } = await setUp();
    const controller = new AbortController();
    const chunks = writer.write(manual, UNWRITTEN_ID, controller.signal)[Symbol.asyncIterator]();
    expect((await chunks.next()).done).toBe(false);
    controller.abort();
    await expect(chunks.next()).rejects.toThrow(/abort/i);
  });
});
