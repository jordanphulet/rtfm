import type { Gateway } from "../gateway/gateway.ts";
import { SpendingRefused } from "../gateway/types.ts";
import { readSeedBody } from "../storage/seed.ts";
import type { ManualStore, StoredManual } from "../storage/types.ts";
import { sectionPrompt, sectionsInReadingOrder, sectionsNearestFirst, type WrittenExample } from "./prompt.ts";
import { createSectionText } from "./section-text.ts";
import { WriteFailed, type SectionWriter, type WrittenChunk } from "./types.ts";
import { sectionProblems } from "./validate.ts";

const MAX_ESTIMATED_PROGRESS = 0.99;

export class SectionRejected extends Error {
  constructor(problems: string[]) {
    super(`Section rejected: ${problems.join("; ")}`);
  }
}

export function createBedrockWriter({ gateway, store, targetCharacters }: {
  gateway: Gateway;
  store: ManualStore;
  targetCharacters: number;
}): SectionWriter {
  async function* writeSection(manual: StoredManual, sectionId: string, signal: AbortSignal): AsyncGenerator<WrittenChunk> {
    const sections = sectionsInReadingOrder(manual);
    const sectionIds = new Set(sections.map(({ id }) => id));
    const section = sections.find(({ id }) => id === sectionId);
    if (!section) throw new Error(`The manual has no section "${sectionId}"`);
    const example = await exampleSection(store, manual, sectionId);
    const prompt = sectionPrompt(manual, { section, targetCharacters, example });

    const text = createSectionText(section);
    const progress = () => Math.min(MAX_ESTIMATED_PROGRESS, text.shownLength() / targetCharacters);
    let stopReason: string | undefined;
    for await (const event of gateway.stream("write-section", prompt, signal)) {
      if (event.type === "stop") stopReason = event.reason;
      if (event.type !== "text") continue;
      const ready = text.readyAfter(event.text);
      if (ready !== "") yield { text: ready, progress: progress() };
    }

    if (stopReason !== "end_turn") throw new SectionRejected([`the model stopped with "${stopReason}"`]);
    const rest = text.restAtEnd();
    const problems = sectionProblems(text.body(), { sectionId, sectionIds });
    if (problems.length > 0) throw new SectionRejected(problems);
    if (rest !== "") yield { text: rest, progress: progress() };
  }

  return {
    async *write(manual, sectionId, signal) {
      try {
        yield* writeSection(manual, sectionId, signal);
      } catch (error) {
        if (error instanceof SpendingRefused) throw new WriteFailed("budget");
        throw error;
      }
    },
  };
}

async function exampleSection(
  store: ManualStore,
  manual: StoredManual,
  sectionId: string,
): Promise<WrittenExample | undefined> {
  const written: WrittenExample[] = [];
  for (const section of sectionsNearestFirst(manual, sectionId)) {
    const body = await store.getBody(manual.id, section.id);
    if (body !== undefined) written.push({ section, body });
  }
  for (const example of written) {
    if ((await readSeedBody(manual.id, example.section.id)) === example.body) return example;
  }
  return written[0];
}
