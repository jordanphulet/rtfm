import { describe, expect, it, vi } from "vitest";
import { silentLogger } from "../logging/logger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { ManualStore } from "../storage/types.ts";
import { SAMPLE_ID, tempDataDir, testLibrary, UNWRITTEN_ID, waitUntil } from "../testing.ts";
import { createRuns } from "../writer/runs.ts";
import type { SectionWriter } from "../writer/types.ts";
import { manualRoute } from "./manual.ts";
import type { Manual } from "./types.ts";

const writesUntilAborted: SectionWriter = {
  async *write(_manual, _sectionId, signal) {
    yield { text: "Every room ", progress: 0.1 };
    await new Promise((resolve) => signal.addEventListener("abort", resolve));
  },
};

describe("GET /api/manuals/:manualId", () => {
  it("reads the written sections once, never a body, and reports a section being written as writing", async () => {
    const seeded = createFileManualStore(await tempDataDir(), silentLogger);
    await seedStore(seeded);
    const store: ManualStore = {
      ...seeded,
      getBody: vi.fn(seeded.getBody),
      writtenSectionIds: vi.fn(seeded.writtenSectionIds),
    };
    const runs = createRuns({ store: seeded, writer: writesUntilAborted, maxConcurrentRuns: 3, logger: silentLogger });
    const events: string[] = [];
    const leave = await runs.join((await seeded.getManual(SAMPLE_ID))!, UNWRITTEN_ID, ({ event }) => events.push(event));
    await waitUntil(() => events.includes("append"));

    const response = await manualRoute.handle({
      params: { manualId: SAMPLE_ID },
      query: new URLSearchParams(),
      body: undefined,
      signal: new AbortController().signal,
      library: testLibrary({ store, runs }),
    });
    leave();

    const manual = (response as { body: Manual }).body;
    const statuses = [...manual.chapters, ...manual.appendices].flatMap(({ sections }) => sections.map(({ status }) => status));
    expect(statuses.filter((status) => status === "written")).toHaveLength(7);
    expect(statuses.filter((status) => status === "writing")).toHaveLength(1);
    expect(manual.chapters.flatMap(({ sections }) => sections).find(({ id }) => id === UNWRITTEN_ID)?.status).toBe("writing");
    expect(store.writtenSectionIds).toHaveBeenCalledOnce();
    expect(store.getBody).not.toHaveBeenCalled();
  });
});
