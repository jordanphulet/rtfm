import { setTimeout as sleep } from "node:timers/promises";
import { readSeedBody } from "../storage/seed.ts";
import type { SectionWriter } from "./types.ts";

export interface FakePace {
  firstChunkDelayMs: number;
  chunkIntervalMs: number;
}

const READER_PACE: FakePace = { firstChunkDelayMs: 1200, chunkIntervalMs: 85 };
const CHUNK_LENGTH = 20;
const PLACEHOLDER_BODY =
  "The fake writer has no sample text for this section. Only the sample manual's sections have a body to play.\n";

export function createFakeWriter(pace: FakePace = READER_PACE): SectionWriter {
  return {
    async *write(manual, sectionId, signal) {
      const body = await fakeBody(manual.id, sectionId);
      const placeholder = body === PLACEHOLDER_BODY;
      await sleep(pace.firstChunkDelayMs, undefined, { signal });
      let start = 0;
      for (const end of chunkEnds(body)) {
        if (start > 0) await sleep(pace.chunkIntervalMs, undefined, { signal });
        yield { text: body.slice(start, end), progress: end / body.length, placeholder };
        start = end;
      }
    },
  };
}

export async function fakeBody(manualId: string, sectionId: string): Promise<string> {
  return (await readSeedBody(manualId, sectionId)) ?? PLACEHOLDER_BODY;
}

export function chunkEnds(body: string): number[] {
  const ends: number[] = [];
  let chunkStart = 0;
  for (const word of body.matchAll(/\S+\s*/g)) {
    const wordEnd = word.index + word[0].length;
    if (wordEnd - chunkStart >= CHUNK_LENGTH) {
      ends.push(wordEnd);
      chunkStart = wordEnd;
    }
  }
  if (ends.at(-1) !== body.length) ends.push(body.length);
  return ends;
}
