import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionEvent } from "../api/types.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { seedStore } from "../storage/seed.ts";
import type { ManualStore, StoredManual } from "../storage/types.ts";
import {
  OTHER_UNWRITTEN_ID, recordingWriter, SAMPLE_ID, tempDataDir, UNWRITTEN_ID, waitUntil, WRITTEN_ID,
} from "../testing.ts";
import { fakeBody } from "./fake.ts";
import { createRuns } from "./runs.ts";
import { WriteFailed, type SectionWriter } from "./types.ts";

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
  let store: ManualStore;
  let manual: StoredManual;

  beforeEach(async () => {
    store = createFileManualStore(await tempDataDir());
    await seedStore(store);
    manual = (await store.getManual(SAMPLE_ID))!;
  });

  it("writes an unwritten section, saves it and reports it written", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3 });
    const reader = recorder();

    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("writing");
    await waitUntil(() => reader.last() === "written");

    const body = await fakeBody(SAMPLE_ID, UNWRITTEN_ID);
    expect(reader.text()).toBe(body);
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe(body);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("written");
  });

  it("sends a written section whole, without starting a writer", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3 });
    const reader = recorder();

    await runs.join(manual, WRITTEN_ID, reader.listener);

    expect(reader.events.map((event) => event.event)).toEqual(["append", "written"]);
    expect(reader.text()).toBe(await store.getBody(SAMPLE_ID, WRITTEN_ID));
    expect(writer.signals).toHaveLength(0);
  });

  it("starts one writer when two readers open a section at the same moment", async () => {
    const writer = recordingWriter();
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3 });
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

  it("gives a reader who joins mid-run the text so far, then the same events", async () => {
    const runs = createRuns({ store, writer: recordingWriter(), maxConcurrentRuns: 3 });
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
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3 });
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
    const runs = createRuns({ store, writer, maxConcurrentRuns: 3 });
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
    const runs = createRuns({ store, writer: failingWriter, maxConcurrentRuns: 3 });
    const reader = recorder();

    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    await waitUntil(() => reader.last() === "failed");

    expect(reader.events).toEqual([{ event: "failed", data: { reason: "budget" } }]);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("unwritten");
  });

  it("refuses a run beyond the limit with an error", async () => {
    const runs = createRuns({ store, writer: recordingWriter(), maxConcurrentRuns: 1 });
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
    const runs = createRuns({ store, writer, maxConcurrentRuns: 1 });
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
});
