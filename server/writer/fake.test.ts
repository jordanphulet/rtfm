import { describe, expect, it } from "vitest";
import { readSeedManual } from "../storage/seed.ts";
import { collect, fastFakeWriter, SAMPLE_ID, UNWRITTEN_ID } from "../testing.ts";
import { chunkEnds, createFakeWriter, fakeBody } from "./fake.ts";

const GEESE_ID = "negotiating-with-geese";

describe("chunkEnds", () => {
  it("cuts after whole words once a chunk reaches 20 characters", () => {
    const body = "The quick brown fox jumps over the lazy dog, twice.";
    expect(chunkEnds(body)).toEqual([20, 40, body.length]);
  });
});

describe("the fake writer", () => {
  it("plays the seed body in chunks of 20 characters or more, with exact progress", async () => {
    const manual = await readSeedManual(SAMPLE_ID);
    const chunks = await collect(fastFakeWriter().write(manual, UNWRITTEN_ID, new AbortController().signal));
    const body = await fakeBody(SAMPLE_ID, UNWRITTEN_ID);

    expect(chunks.map((chunk) => chunk.text).join("")).toBe(body);
    expect(chunks.slice(0, -1).every((chunk) => chunk.text.length >= 20)).toBe(true);
    expect(chunks.at(-1)!.progress).toBe(1);
    expect(chunks.some((chunk) => chunk.placeholder)).toBe(false);
    let written = 0;
    for (const chunk of chunks) {
      written += chunk.text.length;
      expect(chunk.progress).toBe(written / body.length);
    }
  });

  it("waits before the first chunk", async () => {
    const manual = await readSeedManual(SAMPLE_ID);
    const writer = createFakeWriter({ firstChunkDelayMs: 60, chunkIntervalMs: 0 });
    const startedAt = Date.now();
    await writer.write(manual, UNWRITTEN_ID, new AbortController().signal)[Symbol.asyncIterator]().next();
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(55);
  });

  it("writes a placeholder, marked as one, for a section with no seed body", async () => {
    const manual = await readSeedManual(GEESE_ID);
    const sectionId = manual.chapters[0]!.sections[0]!.id;
    const chunks = await collect(fastFakeWriter().write(manual, sectionId, new AbortController().signal));
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(await fakeBody(GEESE_ID, sectionId));
    expect(chunks.every((chunk) => chunk.placeholder)).toBe(true);
  });
});
