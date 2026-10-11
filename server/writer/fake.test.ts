import { describe, expect, it } from "vitest";
import type { StoredManual } from "../storage/types.ts";
import { fastFakeWriter, SAMPLE_ID, UNWRITTEN_ID } from "../testing.ts";
import { chunkEnds, createFakeWriter, fakeBody } from "./fake.ts";
import type { WrittenChunk } from "./types.ts";

const manual = { id: SAMPLE_ID } as StoredManual;

async function collect(chunks: AsyncIterable<WrittenChunk>): Promise<WrittenChunk[]> {
  const collected: WrittenChunk[] = [];
  for await (const chunk of chunks) collected.push(chunk);
  return collected;
}

describe("chunkEnds", () => {
  it("cuts after whole words once a chunk reaches 20 characters", () => {
    const body = "The quick brown fox jumps over the lazy dog, twice.";
    expect(chunkEnds(body)).toEqual([20, 40, body.length]);
  });
});

describe("the fake writer", () => {
  it("plays the seed body in whole-word chunks with exact progress", async () => {
    const chunks = await collect(fastFakeWriter().write(manual, UNWRITTEN_ID, new AbortController().signal));
    const body = await fakeBody(SAMPLE_ID, UNWRITTEN_ID);

    expect(chunks.map((chunk) => chunk.text).join("")).toBe(body);
    expect(chunks.slice(0, -1).every((chunk) => chunk.text.length >= 20 && /\s$/.test(chunk.text))).toBe(true);
    expect(chunks.at(-1)!.progress).toBe(1);
    let written = 0;
    for (const chunk of chunks) {
      written += chunk.text.length;
      expect(chunk.progress).toBe(written / body.length);
    }
  });

  it("waits before the first chunk", async () => {
    const writer = createFakeWriter({ firstChunkDelayMs: 60, chunkIntervalMs: 0 });
    const startedAt = Date.now();
    await writer.write(manual, UNWRITTEN_ID, new AbortController().signal)[Symbol.asyncIterator]().next();
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(55);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    const chunks = createFakeWriter()
      .write(manual, UNWRITTEN_ID, controller.signal)
      [Symbol.asyncIterator]();
    const next = chunks.next();
    controller.abort();
    await expect(next).rejects.toThrow(/abort/i);
  });

  it("writes a placeholder for a section with no seed body", async () => {
    const chunks = await collect(fastFakeWriter().write(manual, "no-such-section", new AbortController().signal));
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(await fakeBody(SAMPLE_ID, "no-such-section"));
  });
});
