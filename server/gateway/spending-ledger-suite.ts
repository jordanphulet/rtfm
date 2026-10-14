import { describe, expect, it } from "vitest";
import { ADMIN_LIBRARY_ID } from "../storage/library.ts";
import type { SettleEntry } from "../storage/types.ts";
import type { Caps, LibraryReservation, SpendingLedger } from "./spending-ledger.ts";
import { SpendingRefused } from "./types.ts";

/** Within the suite's month, for an implementation that replays the month when it opens. */
export const SUITE_NOW = new Date("2026-10-15T12:00:00.000Z");

/** Amounts a binary fraction can hold exactly, so every implementation adds them up the same. */
const CAPS: Caps = { dailyUsd: 1, monthlyUsd: 2, libraryDailyUsd: 0.5 };
const ACME = "acme";
const GLOBEX = "globex";

export interface SpendingStorage {
  /** A spending ledger on this storage, which a server opens when it starts. */
  open(): Promise<SpendingLedger>;
  /**
   * Ledgers that race for the same caps: two servers' on one table, or the one server's twice,
   * since only one server may use a data folder.
   */
  openRacing(): Promise<SpendingLedger[]>;
  setKillSwitch(on: boolean): Promise<void>;
}

let calls = 0;

function reservation(reservedAt: string, worstCaseUsd: number, libraryId = ADMIN_LIBRARY_ID): LibraryReservation {
  calls++;
  const call = { callId: `call-${calls}`, reservedAt, libraryId };
  return { kind: "reserve", ...call, job: "write-section", model: "test-model", worstCaseUsd };
}

function settlement({ callId, reservedAt, job, model }: LibraryReservation, usd: number, at = reservedAt): SettleEntry {
  return {
    kind: "settle",
    callId,
    reservedAt,
    at,
    job,
    model,
    inputTokens: 100,
    outputTokens: 200,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    usd,
    outcome: "complete",
    estimated: false,
  };
}

/** The rules every `SpendingLedger` keeps, run against each implementation. */
export function describeSpendingLedger(name: string, newStorage: () => Promise<SpendingStorage>) {
  describe(name, () => {
    async function openLedger() {
      const storage = await newStorage();
      return { storage, ledger: await storage.open() };
    }

    /** Whose call, the admin's unless named, and the caps it is reserved against. */
    interface Call {
      libraryId?: string;
      caps?: Caps;
    }

    async function reserved(ledger: SpendingLedger, reservedAt: string, worstCaseUsd: number, call: Call = {}) {
      const entry = reservation(reservedAt, worstCaseUsd, call.libraryId);
      await ledger.reserve(entry, call.caps ?? CAPS);
      return entry;
    }

    function refusal(ledger: SpendingLedger, reservedAt: string, worstCaseUsd: number, call: Call = {}) {
      return ledger.reserve(reservation(reservedAt, worstCaseUsd, call.libraryId), call.caps ?? CAPS).then(
        () => "allowed",
        (error: unknown) => {
          if (error instanceof SpendingRefused) return error.reason;
          throw error;
        },
      );
    }

    it("records each reservation, with its library, and its settlement as the month's entries", async () => {
      const { ledger } = await openLedger();
      const first = await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.5);
      const second = await reserved(ledger, "2026-10-11T09:00:00.000Z", 0.25, { libraryId: ACME });
      await ledger.settle(settlement(first, 0.125), first);

      const entries = await ledger.entriesForMonth("2026-10");
      expect(entries).toHaveLength(3);
      expect(entries).toEqual(expect.arrayContaining([first, settlement(first, 0.125), second]));
      const firstEntries = entries.filter(({ callId }) => callId === first.callId).map(({ kind }) => kind);
      expect(firstEntries).toEqual(["reserve", "settle"]);
      expect(await ledger.entriesForMonth("2026-11")).toEqual([]);
    });

    it("allows reservations up to each cap and refuses the one that would cross it, recording nothing for it", async () => {
      const { ledger } = await openLedger();
      for (const worstCaseUsd of [0.5, 0.25, 0.25]) await reserved(ledger, "2026-10-11T08:00:00.000Z", worstCaseUsd);

      expect(await refusal(ledger, "2026-10-11T09:00:00.000Z", 0.125)).toBe("daily-cap");
      expect(await ledger.entriesForMonth("2026-10")).toHaveLength(3);
    });

    it("refuses a reservation whose worst case alone is over a cap", async () => {
      const { ledger } = await openLedger();
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 1.5)).toBe("daily-cap");
      const smallMonth = { ...CAPS, dailyUsd: 5, monthlyUsd: 1 };
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 1.5, { caps: smallMonth })).toBe("monthly-cap");
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.75, { libraryId: ACME })).toBe("library-cap");
      expect(await ledger.entriesForMonth("2026-10")).toEqual([]);
    });

    it("counts every day of the month toward the monthly cap, and only today toward the daily one", async () => {
      const { ledger } = await openLedger();
      await reserved(ledger, "2026-10-01T08:00:00.000Z", 0.75);
      await reserved(ledger, "2026-10-02T08:00:00.000Z", 0.75);

      expect(await refusal(ledger, "2026-10-03T08:00:00.000Z", 0.75)).toBe("monthly-cap");
      expect(await refusal(ledger, "2026-10-03T08:00:00.000Z", 0.5)).toBe("allowed");
    });

    it("leaves last month's spend out of this month's cap", async () => {
      const { ledger } = await openLedger();
      await reserved(ledger, "2026-09-29T08:00:00.000Z", 1);
      await reserved(ledger, "2026-09-30T08:00:00.000Z", 1);
      expect(await refusal(ledger, "2026-10-01T08:00:00.000Z", 1)).toBe("allowed");
    });

    it("counts a reservation at its worst case until it settles, then at what it cost", async () => {
      const { ledger } = await openLedger();
      const first = await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.75);
      expect(await refusal(ledger, "2026-10-11T08:00:01.000Z", 0.5)).toBe("daily-cap");

      await ledger.settle(settlement(first, 0.25), first);
      expect(await refusal(ledger, "2026-10-11T08:00:02.000Z", 0.75)).toBe("allowed");
    });

    it("charges a call settled after midnight to the day and month it was reserved in", async () => {
      const { ledger } = await openLedger();
      const caps = { ...CAPS, dailyUsd: 1, monthlyUsd: 1 };
      const late = await reserved(ledger, "2026-10-31T23:59:59.000Z", 0.5, { caps });
      await ledger.settle(settlement(late, 0.75, "2026-11-01T00:00:01.000Z"), late);

      expect(await refusal(ledger, "2026-10-31T23:59:59.500Z", 0.5, { caps })).toBe("daily-cap");
      expect(await refusal(ledger, "2026-11-01T00:00:02.000Z", 1, { caps })).toBe("allowed");
      expect(await ledger.entriesForMonth("2026-10")).toEqual([late, settlement(late, 0.75, "2026-11-01T00:00:01.000Z")]);
    });

    it("keeps counting a reservation never settled, as a crash leaves it, at its worst case once the server starts again", async () => {
      const { storage, ledger } = await openLedger();
      await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.75);
      await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.25, { libraryId: ACME });

      const restarted = await storage.open();
      expect(await refusal(restarted, "2026-10-11T09:00:00.000Z", 0.375, { libraryId: GLOBEX })).toBe("daily-cap");
      const roomyDay = { ...CAPS, dailyUsd: 2 };
      expect(await refusal(restarted, "2026-10-11T09:00:00.000Z", 0.375, { libraryId: ACME, caps: roomyDay })).toBe(
        "library-cap",
      );
    });

    it("refuses every reservation while the kill switch is on, recording none, and allows them once it is off", async () => {
      const { storage, ledger } = await openLedger();
      expect(await ledger.killSwitchOn()).toBe(false);

      await storage.setKillSwitch(true);
      expect(await ledger.killSwitchOn()).toBe(true);
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.25)).toBe("kill-switch");
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 1.5)).toBe("kill-switch");
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.25, { libraryId: ACME })).toBe("kill-switch");
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.75, { libraryId: ACME })).toBe("kill-switch");
      expect(await ledger.entriesForMonth("2026-10")).toEqual([]);

      await storage.setKillSwitch(false);
      expect(await ledger.killSwitchOn()).toBe(false);
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.25)).toBe("allowed");
      expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.25, { libraryId: ACME })).toBe("allowed");
    });

    it("lets racing reservations take a cap only once", async () => {
      const storage = await newStorage();
      const racers = await storage.openRacing();
      const outcomes = await Promise.all(
        Array.from({ length: 20 }, (_, index) => refusal(racers[index % racers.length]!, "2026-10-11T08:00:00.000Z", 0.125)),
      );

      expect(outcomes.filter((outcome) => outcome === "allowed")).toHaveLength(8);
      expect(outcomes.filter((outcome) => outcome === "daily-cap")).toHaveLength(12);
      expect(await racers[0]!.entriesForMonth("2026-10")).toHaveLength(8);
    });

    describe("a recipient library's daily cap", () => {
      it("refuses a library at its cap while another library and the admin's still reserve", async () => {
        const { ledger } = await openLedger();
        await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.25, { libraryId: ACME });
        await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.25, { libraryId: ACME });

        expect(await refusal(ledger, "2026-10-11T09:00:00.000Z", 0.125, { libraryId: ACME })).toBe("library-cap");
        expect(await refusal(ledger, "2026-10-11T09:00:00.000Z", 0.25, { libraryId: GLOBEX })).toBe("allowed");
        expect(await refusal(ledger, "2026-10-11T09:00:00.000Z", 0.25)).toBe("allowed");
        expect(await ledger.entriesForMonth("2026-10")).toHaveLength(4);
      });

      it("gives the admin's library none: it reserves past a library's cap, up to the central ones", async () => {
        const { ledger } = await openLedger();
        await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.75);
        expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.25)).toBe("allowed");
        expect(await refusal(ledger, "2026-10-11T08:00:00.000Z", 0.125)).toBe("daily-cap");
      });

      it("is checked after the central caps, which refuse every library once they are reached", async () => {
        const { ledger } = await openLedger();
        await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.75);
        await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.25, { libraryId: GLOBEX });

        expect(await refusal(ledger, "2026-10-11T09:00:00.000Z", 0.125, { libraryId: ACME })).toBe("daily-cap");
        expect(await refusal(ledger, "2026-10-11T09:00:00.000Z", 0.375, { libraryId: GLOBEX })).toBe("daily-cap");
        expect(await refusal(ledger, "2026-10-11T09:00:00.000Z", 0.125)).toBe("daily-cap");
        const spentMonth = { ...CAPS, dailyUsd: 5, monthlyUsd: 1 };
        for (const libraryId of [ACME, GLOBEX, ADMIN_LIBRARY_ID]) {
          expect(await refusal(ledger, "2026-10-12T09:00:00.000Z", 0.125, { libraryId, caps: spentMonth })).toBe("monthly-cap");
        }
      });

      it("counts the library's own day only, settled at what each call cost", async () => {
        const { ledger } = await openLedger();
        const first = await reserved(ledger, "2026-10-11T08:00:00.000Z", 0.5, { libraryId: ACME });
        expect(await refusal(ledger, "2026-10-11T08:00:01.000Z", 0.125, { libraryId: ACME })).toBe("library-cap");
        expect(await refusal(ledger, "2026-10-12T08:00:00.000Z", 0.5, { libraryId: ACME })).toBe("allowed");

        await ledger.settle(settlement(first, 0.125), first);
        expect(await refusal(ledger, "2026-10-11T08:00:02.000Z", 0.375, { libraryId: ACME })).toBe("allowed");
        expect(await refusal(ledger, "2026-10-11T08:00:03.000Z", 0.125, { libraryId: ACME })).toBe("library-cap");
      });

      it("lets racing reservations take a library's cap only once, while another library's still reserve", async () => {
        const storage = await newStorage();
        const racers = await storage.openRacing();
        const race = (libraryId: string, index: number) =>
          refusal(racers[index % racers.length]!, "2026-10-11T08:00:00.000Z", 0.0625, { libraryId });
        const acmeRacers = Array.from({ length: 12 }, (_, index) => race(ACME, index));
        const [others, outcomes] = await Promise.all([
          Promise.all([race(GLOBEX, 0), race(ADMIN_LIBRARY_ID, 1)]),
          Promise.all(acmeRacers),
        ]);

        expect(outcomes.filter((outcome) => outcome === "allowed")).toHaveLength(8);
        expect(outcomes.filter((outcome) => outcome === "library-cap")).toHaveLength(4);
        expect(others).toEqual(["allowed", "allowed"]);
        expect(await racers[0]!.entriesForMonth("2026-10")).toHaveLength(10);
      });
    });
  });
}
