import type { Gateway } from "../gateway/gateway.ts";
import type { Prompt } from "../gateway/types.ts";
import { readSeedBody } from "../storage/seed.ts";
import type { StoredManual } from "../storage/types.ts";
import { refusalAsBudget, sectionToWrite, type SectionWriter, type WrittenChunk } from "./types.ts";

const CHUNK_LENGTH = 20;
const PLACEHOLDER_BODY =
  "The fake writer has no sample text for this section. Only the sample manual's sections have a body to play.\n";

/**
 * Plays a section's sample text, or a placeholder, through the gateway: the fake model repeats it
 * back at its own pace. The fake model can't write a section from the Bedrock writer's prompt,
 * which holds the manual's contents but not the sample text.
 */
export function createFakeWriter(gateway: Gateway): SectionWriter {
  async function* playSection(manual: StoredManual, sectionId: string, signal: AbortSignal): AsyncGenerator<WrittenChunk> {
    const body = await fakeBody(manual.id, sectionToWrite(manual, sectionId).id);
    const placeholder = body === PLACEHOLDER_BODY;
    let written = 0;
    for await (const event of gateway.stream("write-section", repeatPrompt(body), signal)) {
      if (event.type !== "text") continue;
      written += event.text.length;
      yield { text: event.text, progress: written / body.length, placeholder };
    }
  }

  return { write: (manual, sectionId, signal) => refusalAsBudget(playSection(manual, sectionId, signal)) };
}

function repeatPrompt(body: string): Prompt {
  return { system: "Repeat the user's message exactly.", messages: [{ role: "user", content: body }] };
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
