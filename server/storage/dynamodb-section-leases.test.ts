import { setTimeout as sleep } from "node:timers/promises";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { waitUntil } from "../testing.ts";
import {
  createDynamoDbManualStore,
  createDynamoDbSectionLeases,
  type DynamoDbTable,
  type LeaseTiming,
} from "./dynamodb-manual-store.ts";
import { testAppTable } from "./dynamodb-testing.ts";
import { ADMIN_LIBRARY_ID } from "./library.ts";
import { manual } from "./manual-store-suite.ts";
import type { ManualStore, SectionLeases } from "./types.ts";

/**
 * Lease lengths short enough for tests, with room for DynamoDB Local to pause under a full test
 * run; the committed ones are `SECTION_LEASE_TIMING`.
 */
const SHORT: LeaseTiming = { durationMs: 2_000, renewEveryMs: 100 };
/** An environment that stops renewing after it takes a lease, as one that has crashed. */
const CRASHED: LeaseTiming = { durationMs: 1_500, renewEveryMs: 60 * 60_000 };

// Some tests outlast a lease of a few seconds, with room for test runs side by side.
vi.setConfig({ testTimeout: 20_000 });

describe("the DynamoDB section leases", () => {
  let table: DynamoDbTable;
  let store: ManualStore;

  /** Another environment on the table, whose leases are released when the test ends. */
  function environment(timing = SHORT, libraryId = ADMIN_LIBRARY_ID): SectionLeases {
    const leases = createDynamoDbSectionLeases(table, timing, libraryId);
    return {
      heldElsewhere: leases.heldElsewhere,
      readSection: leases.readSection,
      async take(manualId, sectionId) {
        const lease = await leases.take(manualId, sectionId);
        if (lease) onTestFinished(() => lease.release());
        return lease;
      },
    };
  }

  beforeEach(async () => {
    table = await testAppTable();
    store = createDynamoDbManualStore(table);
    await store.createManual(manual);
  });

  it("lets only one of two environments take a section's lease at once", async () => {
    const leases = await Promise.all([environment().take(manual.id, "s"), environment().take(manual.id, "s")]);
    expect(leases.filter((lease) => lease !== undefined)).toHaveLength(1);
  });

  it("gives no lease on a written section", async () => {
    await store.saveBody(manual.id, "s", "body");
    expect(await environment().take(manual.id, "s")).toBeUndefined();
  });

  it("keeps a lease its holder renews, long past its length", async () => {
    const lease = (await environment().take(manual.id, "s"))!;
    await sleep(SHORT.durationMs * 2 + 100);

    expect(await environment().take(manual.id, "s")).toBeUndefined();
    expect(lease.lost.aborted).toBe(false);
    expect(await lease.saveBody("body")).toBe("saved");
    expect(await store.getBody(manual.id, "s")).toBe("body");
  });

  it("fences an unrenewed holder, frees its lease once it expires, and lets only the new holder save", async () => {
    const crashed = (await environment(CRASHED).take(manual.id, "s"))!;
    expect(await environment().take(manual.id, "s")).toBeUndefined();
    await sleep(CRASHED.durationMs + 100);

    expect(crashed.lost.reason).toEqual(new Error(`Couldn't renew the lease on ${manual.id}/s before it expired`));
    const taken = (await environment().take(manual.id, "s"))!;
    expect(taken).toBeDefined();
    await expect(crashed.saveBody("late")).rejects.toThrow(`The lease on ${manual.id}/s was lost before`);
    expect(await taken.saveBody("body")).toBe("saved");
    expect(await store.getBody(manual.id, "s")).toBe("body");
    expect(await store.writtenSectionIds(manual.id)).toEqual(["s"]);
  });

  it("tells a holder whose item no longer holds its lease, at its next renewal, that the lease is lost", async () => {
    const lease = (await environment().take(manual.id, "s"))!;
    await store.saveBody(manual.id, "s", "seeded");

    await waitUntil(() => lease.lost.aborted);
    expect(lease.lost.reason).toEqual(new Error(`The lease on ${manual.id}/s is no longer this writer's`));
  });

  it("frees a released lease at once", async () => {
    const lease = (await environment().take(manual.id, "s"))!;
    await lease.release();
    expect(await environment().take(manual.id, "s")).toBeDefined();
  });

  it("keeps a saved body when its lease is released", async () => {
    const lease = (await environment().take(manual.id, "s"))!;
    await lease.saveBody("body");
    await lease.release();
    expect(await store.getBody(manual.id, "s")).toBe("body");
  });

  it("answers already-written to the holder when a body was saved without a lease, as the seed saves", async () => {
    const lease = (await environment().take(manual.id, "s"))!;
    expect(await store.saveBody(manual.id, "s", "seeded")).toBe("saved");
    expect(await lease.saveBody("written")).toBe("already-written");
    expect(await store.getBody(manual.id, "s")).toBe("seeded");
  });

  it("refuses the holder's save into a manual that doesn't exist", async () => {
    const lease = (await environment().take("not-there", "s"))!;
    await expect(lease.saveBody("body")).rejects.toThrow('There is no manual "not-there"');
  });

  it("names the sections another environment holds, until their leases expire, but not its own", async () => {
    const here = environment();
    await here.take(manual.id, "mine");
    await store.saveBody(manual.id, "w", "body");
    await environment().take(manual.id, "t");
    await environment(CRASHED).take(manual.id, "s");

    expect(await here.heldElsewhere(manual.id)).toEqual(["s", "t"]);
    await sleep(CRASHED.durationMs + 100);
    expect(await here.heldElsewhere(manual.id)).toEqual(["t"]);
    expect(await here.heldElsewhere("another-manual")).toEqual([]);
  });

  it("deletes the items of a manual's sections that hold only an expired lease", async () => {
    await environment(CRASHED).take(manual.id, "t");
    await store.saveBody(manual.id, "s", "body");
    await sleep(CRASHED.durationMs + 100);

    expect(await store.deleteManual(manual.id)).toBe("deleted");
    await store.createManual(manual);

    expect(await environment().take(manual.id, "t")).toBeDefined();
    expect(await environment().take(manual.id, "s")).toBeDefined();
  });

  it("refuses to delete a manual while a section of it holds a live lease, changing nothing", async () => {
    await environment().take(manual.id, "t");
    await store.saveBody(manual.id, "s", "body");

    expect(await store.deleteManual(manual.id)).toBe("writing");

    expect(await store.getManual(manual.id)).toEqual(manual);
    expect(await store.getBody(manual.id, "s")).toBe("body");
    expect(await environment().take(manual.id, "t")).toBeUndefined();
  });

  it("reads a section's body, and whether another environment holds its live lease", async () => {
    const here = environment();
    await here.take(manual.id, "mine");
    await store.saveBody(manual.id, "w", "body");
    await environment().take(manual.id, "t");
    await environment(CRASHED).take(manual.id, "s");

    expect(await here.readSection(manual.id, "w")).toEqual({ body: "body", heldElsewhere: false });
    expect(await here.readSection(manual.id, "t")).toEqual({ body: undefined, heldElsewhere: true });
    expect(await here.readSection(manual.id, "mine")).toEqual({ body: undefined, heldElsewhere: false });
    expect(await here.readSection(manual.id, "none")).toEqual({ body: undefined, heldElsewhere: false });
    await sleep(CRASHED.durationMs + 100);
    expect(await here.readSection(manual.id, "s")).toEqual({ body: undefined, heldElsewhere: false });
  });

  describe("in two libraries", () => {
    let recipientStore: ManualStore;

    beforeEach(async () => {
      recipientStore = createDynamoDbManualStore(table, "acme");
      await recipientStore.createManual(manual);
    });

    it("lets each library take one section id's lease at once, and saves each body in its own", async () => {
      const [inAdmin, inRecipient] = await Promise.all([
        environment().take(manual.id, "s"),
        environment(SHORT, "acme").take(manual.id, "s"),
      ]);

      expect(await inAdmin!.saveBody("the admin's")).toBe("saved");
      expect(await inRecipient!.saveBody("the recipient's")).toBe("saved");
      expect(await store.getBody(manual.id, "s")).toBe("the admin's");
      expect(await recipientStore.getBody(manual.id, "s")).toBe("the recipient's");
    });

    it("never names another library's leases as held elsewhere", async () => {
      await environment().take(manual.id, "s");
      const recipient = environment(SHORT, "acme");

      expect(await recipient.heldElsewhere(manual.id)).toEqual([]);
      expect(await recipient.readSection(manual.id, "s")).toEqual({ body: undefined, heldElsewhere: false });
      await environment(SHORT, "acme").take(manual.id, "t");
      expect(await recipient.heldElsewhere(manual.id)).toEqual(["t"]);
    });

    it("deletes a manual while another library holds a live lease on a section of its id", async () => {
      await environment().take(manual.id, "s");
      await recipientStore.saveBody(manual.id, "s", "body");

      expect(await recipientStore.deleteManual(manual.id)).toBe("deleted");
      expect(await store.getManual(manual.id)).toEqual(manual);
      expect(await environment().take(manual.id, "s")).toBeUndefined();
    });
  });
});
