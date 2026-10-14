import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { SectionEvent } from "../api/types.ts";
import { silentLogger } from "../logging/logger.ts";
import {
  createDynamoDbManualStore,
  createDynamoDbSectionLeases,
  type DynamoDbTable,
  type LeaseTiming,
} from "../storage/dynamodb-manual-store.ts";
import { testAppTable } from "../storage/dynamodb-testing.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { createInProcessLeases } from "../storage/in-process-leases.ts";
import { seedStore } from "../storage/seed.ts";
import type { ManualStore, StoredManual } from "../storage/types.ts";
import { capturingLogger, recordingWriter, SAMPLE_ID, tempDataDir, UNWRITTEN_ID, waitUntil } from "../testing.ts";
import { fakeBody } from "./fake.ts";
import { createRuns, type Runs, type Waiting } from "./runs.ts";
import { WriteFailed, type SectionWriter } from "./types.ts";

const GEESE_ID = "negotiating-with-geese";
/**
 * Lease and waiting times short enough for tests, with room for DynamoDB Local to pause under a
 * full test run; the committed ones are in the modules.
 */
const SHORT_LEASE: LeaseTiming = { durationMs: 2_000, renewEveryMs: 100 };
const SHORT_WAIT: Waiting = { pollEveryMs: 10, limitMs: 5_000 };
/** How long a test waits for a run to end, with room for test runs side by side. */
const RUN_ENDS_WITHIN_MS = 10_000;
vi.setConfig({ testTimeout: 20_000 });

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

/** A writer that sends its first chunk, then waits until `finish` is called before sending the rest. */
function heldWriter() {
  let finish = () => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const writer: SectionWriter = {
    async *write(_manual, _sectionId, signal) {
      yield { text: "One ", progress: 0.5 };
      await Promise.race([finished, new Promise((resolve) => signal.addEventListener("abort", resolve))]);
      signal.throwIfAborted();
      yield { text: "two.", progress: 1 };
    },
  };
  return { writer, finish };
}

/**
 * Where the runs' rules are checked: one server alone on its store, with leases in its process, as
 * on this machine; and two environments sharing one table, each with its own leases.
 */
interface Setup {
  store: ManualStore;
  /** Whether both places are one process, so that their readers share one run. */
  oneProcess: boolean;
  /** Two places a reader's request may reach, each running the section's writer through the same `writer`. */
  environments(writer: SectionWriter): [Runs, Runs];
}

const setups: [string, () => Promise<Setup>][] = [
  [
    "one process, leases in memory",
    async () => {
      const store = createFileManualStore(await tempDataDir(), silentLogger);
      await seedStore(store);
      return {
        store,
        oneProcess: true,
        environments(writer) {
          const leases = createInProcessLeases(store);
          const runs = createRuns({ store, leases, writer, maxConcurrentRuns: 3, logger: silentLogger });
          return [runs, runs];
        },
      };
    },
  ],
  [
    "two environments, leases in DynamoDB",
    async () => {
      const table = await testAppTable();
      const store = createDynamoDbManualStore(table);
      await seedStore(store);
      return {
        store,
        oneProcess: false,
        environments: (writer) => [dynamoDbEnvironment(table, writer), dynamoDbEnvironment(table, writer)],
      };
    },
  ],
];

function dynamoDbEnvironment(
  table: DynamoDbTable,
  writer: SectionWriter,
  timing = SHORT_LEASE,
  logger = silentLogger,
): Runs {
  return createRuns({
    store: createDynamoDbManualStore(table),
    leases: createDynamoDbSectionLeases(table, timing),
    writer,
    maxConcurrentRuns: 3,
    logger,
    waiting: SHORT_WAIT,
  });
}

describe.each(setups)("runs in %s", (_name, newSetup) => {
  let setup: Setup;
  let manual: StoredManual;

  beforeEach(async () => {
    setup = await newSetup();
    manual = (await setup.store.getManual(SAMPLE_ID))!;
  });

  it("starts one writer when two runs race for one section, and both readers get its body", async () => {
    const writer = recordingWriter();
    const [one, other] = setup.environments(writer);
    const first = recorder();
    const second = recorder();

    await Promise.all([
      one.join(manual, UNWRITTEN_ID, first.listener),
      other.join(manual, UNWRITTEN_ID, second.listener),
    ]);
    await waitUntil(() => first.last() === "written" && second.last() === "written", RUN_ENDS_WITHIN_MS);

    const body = await fakeBody(SAMPLE_ID, UNWRITTEN_ID);
    expect(writer.signals).toHaveLength(1);
    expect(first.text()).toBe(body);
    expect(second.text()).toBe(body);
    expect(await setup.store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe(body);
  });

  it("writes the section for the reader who stays when the other reader's run is aborted", async () => {
    const held = heldWriter();
    const writer = recordingWriter(held.writer);
    const [one, other] = setup.environments(writer);
    const leaving = recorder();
    const staying = recorder();

    const leave = await one.join(manual, UNWRITTEN_ID, leaving.listener);
    await waitUntil(() => leaving.events.length > 0);
    await other.join(manual, UNWRITTEN_ID, staying.listener);
    leave();
    held.finish();
    await waitUntil(() => staying.last() === "written", RUN_ENDS_WITHIN_MS);

    // In one process the reader who stays keeps the run going; across environments the leaving
    // reader's run is aborted, and the other environment's takes the section over.
    expect(writer.signals.map(({ aborted }) => aborted)).toEqual(setup.oneProcess ? [false] : [true, false]);
    expect(staying.text()).toBe("One two.");
    expect(await setup.store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe("One two.");
  });

  it("streams a placeholder to both readers and stores it for neither", async () => {
    const [one, other] = setup.environments(recordingWriter());
    const geese = (await setup.store.getManual(GEESE_ID))!;
    const sectionId = geese.chapters[0].sections[0].id;
    const first = recorder();
    const second = recorder();

    await Promise.all([one.join(geese, sectionId, first.listener), other.join(geese, sectionId, second.listener)]);
    await waitUntil(() => first.last() === "written" && second.last() === "written", RUN_ENDS_WITHIN_MS);

    expect(first.text()).toBe(await fakeBody(GEESE_ID, sectionId));
    expect(second.text()).toBe(first.text());
    expect(await setup.store.getBody(GEESE_ID, sectionId)).toBeUndefined();
  });

  it("fails both readers when the writer fails, storing nothing", async () => {
    const [one, other] = setup.environments(failingWriter);
    const first = recorder();
    const second = recorder();

    await Promise.all([
      one.join(manual, UNWRITTEN_ID, first.listener),
      other.join(manual, UNWRITTEN_ID, second.listener),
    ]);
    await waitUntil(() => first.last() === "failed" && second.last() === "failed", RUN_ENDS_WITHIN_MS);

    expect(first.events.at(-1)).toEqual({ event: "failed", data: { reason: "budget" } });
    expect(second.events.at(-1)).toEqual({ event: "failed", data: { reason: "budget" } });
    expect(await setup.store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
  });
});

describe("runs in two environments", () => {
  let table: DynamoDbTable;
  let manual: StoredManual;

  beforeEach(async () => {
    table = await testAppTable();
    const store = createDynamoDbManualStore(table);
    await seedStore(store);
    manual = (await store.getManual(SAMPLE_ID))!;
  });

  /** A lease taken by an environment that then stopped renewing it, as one that crashed. */
  async function crashedEnvironmentsLease(durationMs: number) {
    const leases = createDynamoDbSectionLeases(table, { durationMs, renewEveryMs: 60 * 60_000 });
    const lease = await leases.take(SAMPLE_ID, UNWRITTEN_ID);
    onTestFinished(() => lease?.release());
    expect(lease).toBeDefined();
  }

  it("sends a reader waiting on another environment the stored body as one append, then written", async () => {
    const held = heldWriter();
    const writing = recorder();
    const waiting = recorder();
    const { logger, entries } = capturingLogger();

    await dynamoDbEnvironment(table, held.writer).join(manual, UNWRITTEN_ID, writing.listener);
    await waitUntil(() => writing.events.length > 0);
    const waitingEnvironment = dynamoDbEnvironment(table, recordingWriter(), SHORT_LEASE, logger);
    await waitingEnvironment.join(manual, UNWRITTEN_ID, waiting.listener);
    await waitUntil(() => entries.some(({ event }) => event === "section.waiting"));
    expect(await waitingEnvironment.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("writing");
    held.finish();
    await waitUntil(() => waiting.last() === "written", RUN_ENDS_WITHIN_MS);

    expect(waiting.events).toEqual([
      { event: "append", data: { at: 0, text: "One two.", progress: 1 } },
      { event: "written", data: {} },
    ]);
    expect(entries.map(({ event }) => event)).toEqual(["section.started", "section.waiting", "section.finished"]);
    expect(entries.at(-1)).toMatchObject({ elsewhere: true });
  });

  it("takes over a section whose lease expires unrenewed, as a crashed environment's does", async () => {
    await crashedEnvironmentsLease(500);
    const writer = recordingWriter();
    const reader = recorder();
    const { logger, entries } = capturingLogger();

    await dynamoDbEnvironment(table, writer, SHORT_LEASE, logger).join(manual, UNWRITTEN_ID, reader.listener);
    await waitUntil(() => reader.last() === "written", RUN_ENDS_WITHIN_MS);

    expect(writer.signals).toHaveLength(1);
    expect(reader.text()).toBe(await fakeBody(SAMPLE_ID, UNWRITTEN_ID));
    expect(entries.map(({ event }) => event)).toEqual([
      "section.started",
      "section.waiting",
      "section.taken-over",
      "section.finished",
    ]);
  });

  it("fails a reader who waits longer than the limit", async () => {
    await crashedEnvironmentsLease(60_000);
    const reader = recorder();
    const runs = createRuns({
      store: createDynamoDbManualStore(table),
      leases: createDynamoDbSectionLeases(table, SHORT_LEASE),
      writer: recordingWriter(),
      maxConcurrentRuns: 3,
      logger: silentLogger,
      waiting: { pollEveryMs: 10, limitMs: 100 },
    });

    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    await waitUntil(() => reader.last() === "failed", RUN_ENDS_WITHIN_MS);

    expect(reader.events).toEqual([{ event: "failed", data: { reason: "error" } }]);
    expect(await runs.statusOf(SAMPLE_ID, UNWRITTEN_ID)).toBe("unwritten");
  });

  it("fails the run whose lease it couldn't renew in time, and stores nothing from it", async () => {
    const reader = recorder();
    const { logger, entries } = capturingLogger();
    const store = createDynamoDbManualStore(table);
    const neverRenewed = { durationMs: 1_000, renewEveryMs: 60 * 60_000 };

    const runs = dynamoDbEnvironment(table, heldWriter().writer, neverRenewed, logger);
    await runs.join(manual, UNWRITTEN_ID, reader.listener);
    await waitUntil(() => reader.last() === "failed", RUN_ENDS_WITHIN_MS);

    expect(reader.events.at(-1)).toEqual({ event: "failed", data: { reason: "error" } });
    expect(entries.at(-1)).toMatchObject({
      level: "ERROR",
      event: "section.failed",
      error: { message: `Couldn't renew the lease on ${SAMPLE_ID}/${UNWRITTEN_ID} before it expired` },
    });
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
  });

  it("releases the lease when a run's last reader leaves, so another environment can write at once", async () => {
    const reader = recorder();
    const longLease = { durationMs: 60_000, renewEveryMs: 60_000 };
    const runs = dynamoDbEnvironment(table, heldWriter().writer, longLease);
    const leave = await runs.join(manual, UNWRITTEN_ID, reader.listener);
    await waitUntil(() => reader.events.length > 0);
    leave();

    expect(await leaseWithin(table, 500)).toBeDefined();
  });
});

/** A lease on the section from another environment, taken as soon as it is free, within `timeoutMs`. */
async function leaseWithin(table: DynamoDbTable, timeoutMs: number) {
  const leases = createDynamoDbSectionLeases(table, SHORT_LEASE);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lease = await leases.take(SAMPLE_ID, UNWRITTEN_ID);
    if (lease) {
      onTestFinished(() => lease.release());
      return lease;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return undefined;
}
