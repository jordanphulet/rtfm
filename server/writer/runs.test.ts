import { rm } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionEvent } from "../api/types.ts";
import { silentLogger, type LogEntry } from "../logging/logger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { ManualStore, StoredManual } from "../storage/types.ts";
import {
  capturingLogger, OTHER_UNWRITTEN_ID, recordingWriter, SAMPLE_ID, tempDataDir, UNWRITTEN_ID, waitUntil, WRITTEN_ID,
} from "../testing.ts";
import { fakeBody } from "./fake.ts";
import { createRuns } from "./runs.ts";
import { WriteFailed, type SectionWriter } from "./types.ts";

const GEESE_ID = "negotiating-with-geese";

function recorder() {
  const events: SectionEvent[] = [];
  return {
    events,
    listener: (event: SectionEvent) => events.push(event),
    text: () => events.map((event) => (event.event === "append" ? event.data.text : "")).join(""),
    last: () => events.at(-1)?.event,
  };
}

const failingWriter: SectionWriter = {
  async *write() {
    throw new WriteFailed("budget");
  },
};

function signalIgnoringWriter() {
  let carryOn = () => {};
  const carriedOn = new Promise<void>((resolve) => (carryOn = resolve));
  let finish = () => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const writer: SectionWriter = {
    async *write() {
      try {
        yield { text: "One ", progress: 0.25 };
        await carriedOn;
        yield { text: "two ", progress: 0.5 };
        yield { text: "three.", progress: 1 };
      } finally {
        finish();
      }
    },
  };
  return { ...writer, carryOn, finished };
}

describe("runs", () => {
  let dataDir: string;
  let store: ManualStore;
  let manual: StoredManual;

  beforeEach(async () => {
    dataDir = await tempDataDir();
    store = createFileManualStore(dataDir, silentLogger);
    await seedStore(store);
    manual = (await store.getManual(SAMPLE_ID))!;
  });

  it("writes an unwritten section, saves it and reports it written", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const reader = recorder();

    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("writing");
    await waitUntil(() => reader.last() === "written");

    const body = await fakeBody(SAMPLE_ID, UNWRITTEN_ID);
    expect(reader.text()).toBe(body);
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe(body);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("written");
  });

  it("streams a placeholder to the end but stores nothing, so the section stays unwritten", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const geese = (await store.getManual(GEESE_ID))!;
    const sectionId = geese.chapters[0].sections[0].id;
    const first = recorder();
    const second = recorder();

    await Promise.all([
      runs.join(geese, sectionId, first.listener),
      runs.join(geese, sectionId, second.listener),
    ]);
    await waitUntil(() => first.last() === "written" && second.last() === "written");

    expect(writer.signals).toHaveLength(1);
    expect(first.text()).toBe(await fakeBody(GEESE_ID, sectionId));
    expect(second.text()).toBe(first.text());
    expect(await store.getBody(GEESE_ID, sectionId)).toBeUndefined();
    expect(await store.writtenSectionIds(GEESE_ID)).toEqual([]);
    expect(await runs.statusOf(GEESE_ID, sectionId)).toBe("unwritten");
    expect(runs.isWriting(GEESE_ID)).toBe(false);

    const returning = recorder();
    await runs.join(geese, sectionId, returning.listener);
    await waitUntil(() => returning.last() === "written");
    expect(writer.signals).toHaveLength(2);
    expect(returning.text()).toBe(first.text());
  });

  it("knows which sections of a manual are being written", async () => {
    const runs = createRuns({ store, writer: recordingWriter(), maxConcurrentRuns: 3, logger: silentLogger });
    const reader = recorder();
    expect(runs.isWriting(SAMPLE_ID)).toBe(false);

    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    expect(runs.isWriting(SAMPLE_ID)).toBe(true);
    expect(runs.writingSectionIds(SAMPLE_ID)).toEqual(new Set([UNWRITTEN_ID]));
    expect(runs.isWriting("the-haunt")).toBe(false);

    await waitUntil(() => reader.last() === "written");
    expect(runs.isWriting(SAMPLE_ID)).toBe(false);
    expect(runs.writingSectionIds(SAMPLE_ID)).toEqual(new Set());
  });

  it("fails a run whose manual is deleted before it finishes, and stores nothing", async () => {
    const writer = signalIgnoringWriter();
    const { logger, entries } = capturingLogger();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger });
    const reader = recorder();

    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    await store.deleteManual(SAMPLE_ID);
    writer.carryOn();
    await waitUntil(() => reader.last() === "failed");

    expect(reader.events.at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
    expect(await store.listManuals()).not.toContainEqual(expect.objectContaining({ id: SAMPLE_ID }));
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
    expect(entries.at(-1)).toMatchObject({ level: "ERROR", event: "section.failed", reason: "error" });
  });

  it("writes a section again when its body file was deleted after it was written", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const first = recorder();
    await runs.join(manual, UNWRITTEN_ID, first.listener);
    await waitUntil(() => first.last() === "written");

    await rm(path.join(dataDir, "manuals", SAMPLE_ID, "sections", `${UNWRITTEN_ID}.md`));
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("unwritten");

    const second = recorder();
    await runs.join(manual, UNWRITTEN_ID, second.listener);
    await waitUntil(() => second.last() === "written");
    expect(writer.signals).toHaveLength(2);
    expect(second.text()).toBe(await fakeBody(SAMPLE_ID, UNWRITTEN_ID));
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe(second.text());
  });

  it("sends a written section whole, without starting a writer", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const reader = recorder();

    await runs.join(manual, WRITTEN_ID, reader.listener);

    expect(reader.events.map((event) => event.event)).toEqual(["append", "written"]);
    expect(reader.text()).toBe(await store.getBody(SAMPLE_ID, WRITTEN_ID));
    expect(writer.signals).toHaveLength(0);
  });

  it("starts one writer when two readers open a section at the same moment", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const first = recorder();
    const second = recorder();

    await Promise.all([
      runs.join(manual, UNWRITTEN_ID, first.listener),
      runs.join(manual, UNWRITTEN_ID, second.listener),
    ]);
    await waitUntil(() => first.last() === "written" && second.last() === "written");

    expect(writer.signals).toHaveLength(1);
    expect(second.text()).toBe(first.text());
  });

  it("sends the stored body, not a second run, to a reader whose storage read began before the run finished", async () => {
    let releaseLateRead = () => {};
    const lateReadReleased = new Promise<void>((resolve) => (releaseLateRead = resolve));
    let reads = 0;
    const secondReadIsLate: ManualStore = {
      ...store,
      async getBody(manualId, sectionId) {
        const read = ++reads;
        const body = await store.getBody(manualId, sectionId);
        if (read === 2) await lateReadReleased;
        return body;
      },
    };
    const writer = recordingWriter();
    const runs = createRuns({ store: secondReadIsLate, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const first = recorder();
    const late = recorder();

    const firstJoined = runs.join(manual, UNWRITTEN_ID, first.listener);
    const lateJoined = runs.join(manual, UNWRITTEN_ID, late.listener);
    await firstJoined;
    await waitUntil(() => first.last() === "written");
    releaseLateRead();
    await lateJoined;

    expect(writer.signals).toHaveLength(1);
    expect(late.events.map((event) => event.event)).toEqual(["append", "written"]);
    expect(late.text()).toBe(first.text());
  });

  it("gives a reader who joins mid-run the text so far, then the same events", async () => {
    const runs = createRuns({ store, writer: recordingWriter(), maxConcurrentRuns: 3, logger: silentLogger });
    const first = recorder();
    const joiner = recorder();

    await runs.join(manual, UNWRITTEN_ID, first.listener);
    await waitUntil(() => first.events.length >= 3);
    await runs.join(manual, UNWRITTEN_ID, joiner.listener);
    await waitUntil(() => joiner.last() === "written");

    expect(joiner.events[0]).toMatchObject({ event: "append", data: { at: 0 } });
    expect(joiner.text()).toBe(first.text());
  });

  it("aborts the writer and stores nothing when the last reader leaves", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const first = recorder();
    const second = recorder();

    const firstLeaves = await runs.join(manual, UNWRITTEN_ID, first.listener);
    const secondLeaves = await runs.join(manual, UNWRITTEN_ID, second.listener);
    await waitUntil(() => first.events.length >= 2);
    firstLeaves();
    expect(writer.signals[0].aborted).toBe(false);
    secondLeaves();

    expect(writer.signals[0].aborted).toBe(true);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("unwritten");

    const returning = recorder();
    await runs.join(manual, UNWRITTEN_ID, returning.listener);
    await waitUntil(() => returning.last() === "written");
    expect(writer.signals).toHaveLength(2);
  });

  it("stores nothing when the last reader leaves and the writer finishes anyway", async () => {
    const writer = signalIgnoringWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3, logger: silentLogger });
    const reader = recorder();
    const saveBody = vi.spyOn(store, "saveBody");

    const leave = await runs.join(manual, UNWRITTEN_ID, reader.listener);
    await waitUntil(() => reader.events.length === 1);
    leave();
    writer.carryOn();
    await writer.finished;
    await new Promise((resolve) => setImmediate(resolve));
    await Promise.all(saveBody.mock.results.map((result) => result.value));

    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("unwritten");
  });

  it("reports a failed writer and leaves the section unwritten", async () => {
    const runs = createRuns({ store, writer: failingWriter, maxConcurrentRuns: 3, logger: silentLogger });
    const reader = recorder();

    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    await waitUntil(() => reader.last() === "failed");

    expect(reader.events).toEqual([{ event: "failed", data: { reason: "budget" } }]);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("unwritten");
  });

  it("refuses a run beyond the limit with an error", async () => {
    const runs = createRuns({ store, writer: recordingWriter(), maxConcurrentRuns: 1, logger: silentLogger });
    const first = recorder();
    const second = recorder();

    const firstLeaves = await runs.join(manual, UNWRITTEN_ID, first.listener);
    await runs.join(manual, OTHER_UNWRITTEN_ID, second.listener);

    expect(second.events).toEqual([{ event: "failed", data: { reason: "error" } }]);
    expect(await runs.statusOf(SAMPLE_ID, OTHER_UNWRITTEN_ID)).toBe("unwritten");
    firstLeaves();
  });

  it("frees a run's slot once it is aborted or written", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 1, logger: silentLogger });
    const aborted = recorder();
    const written = recorder();
    const last = recorder();

    const leave = await runs.join(manual, UNWRITTEN_ID, aborted.listener);
    leave();
    await runs.join(manual, OTHER_UNWRITTEN_ID, written.listener);
    await waitUntil(() => written.last() === "written");
    await runs.join(manual, "bodies-that-move", last.listener);
    await waitUntil(() => last.last() === "written");

    expect(writer.signals).toHaveLength(3);
  });

  describe("logging", () => {
    const summary = (entries: LogEntry[]) => entries.map(({ level, event, sectionId }) => ({ level, event, sectionId }));

    it("logs a run starting, a reader joining it and the run finishing, with its size and duration", async () => {
      const { logger, entries } = capturingLogger();
      const runs = createRuns({ store, writer: recordingWriter(), maxConcurrentRuns: 3, logger });
      const first = recorder();
      const second = recorder();

      await runs.join(manual, UNWRITTEN_ID, first.listener);
      await runs.join(manual, UNWRITTEN_ID, second.listener);
      await waitUntil(() => second.last() === "written");

      expect(summary(entries)).toEqual([
        { level: "INFO", event: "section.started", sectionId: UNWRITTEN_ID },
        { level: "INFO", event: "section.joined", sectionId: UNWRITTEN_ID },
        { level: "INFO", event: "section.finished", sectionId: UNWRITTEN_ID },
      ]);
      expect(entries[1]).toMatchObject({ manualId: SAMPLE_ID, listeners: 2 });
      expect(entries[2]).toMatchObject({
        manualId: SAMPLE_ID,
        characters: (await fakeBody(SAMPLE_ID, UNWRITTEN_ID)).length,
        durationMs: expect.any(Number),
        placeholder: false,
      });
    });

    it("logs a run aborted when its last reader leaves, a refused run, and a budget failure", async () => {
      const { logger, entries } = capturingLogger();
      const writer = signalIgnoringWriter();
      const runs = createRuns({ store, writer, maxConcurrentRuns: 1, logger });

      const leave = await runs.join(manual, UNWRITTEN_ID, recorder().listener);
      await runs.join(manual, OTHER_UNWRITTEN_ID, recorder().listener);
      leave();
      writer.carryOn();
      await writer.finished;
      await waitUntil(() => entries.some(({ event }) => event === "section.aborted"));
      const budget = recorder();
      const budgetRuns = createRuns({ store, writer: failingWriter, maxConcurrentRuns: 1, logger });
      await budgetRuns.join(manual, UNWRITTEN_ID, budget.listener);
      await waitUntil(() => budget.last() === "failed");

      expect(summary(entries)).toEqual([
        { level: "INFO", event: "section.started", sectionId: UNWRITTEN_ID },
        { level: "WARN", event: "section.refused", sectionId: OTHER_UNWRITTEN_ID },
        { level: "INFO", event: "section.aborted", sectionId: UNWRITTEN_ID },
        { level: "INFO", event: "section.started", sectionId: UNWRITTEN_ID },
        { level: "WARN", event: "section.failed", sectionId: UNWRITTEN_ID },
      ]);
      expect(entries.at(-1)).toMatchObject({ reason: "budget" });
      expect(entries.at(-1)).not.toHaveProperty("error");
    });
  });
});
