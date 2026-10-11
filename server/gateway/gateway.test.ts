import { rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileLedger } from "../storage/file-ledger.ts";
import type { LedgerEntry, SettleEntry, UsageLedger } from "../storage/types.ts";
import { tempDataDir, waitUntil } from "../testing.ts";
import { createGateway, killSwitchPath, type Gateway } from "./gateway.ts";
import type { PriceTable } from "./prices.ts";
import {
  GatewayBusy,
  ModelNotPriced,
  ModelStalled,
  ModelStreamIncomplete,
  SpendingRefused,
  type GatewayConfig,
  type ModelClient,
  type ModelEvent,
  type ModelRequest,
  type Prompt,
} from "./types.ts";

const MODEL = "test-model";
const MAX_TOKENS = 100_000;
const PRICES: PriceTable = {
  checkedOn: "2026-10-11",
  models: { [MODEL]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
};
const EMPTY_PROMPT: Prompt = { system: "", messages: [{ role: "user", content: "" }] };
const EMPTY_PROMPT_BOUND = 100 + 10;
const WORST_CASE_USD = (EMPTY_PROMPT_BOUND * 1.25 + MAX_TOKENS * 5) / 1_000_000;
const NOW = new Date("2026-10-11T12:00:00.000Z");

const COMPLETE_EVENTS: ModelEvent[] = [
  { type: "usage", inputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0 },
  { type: "text", text: "My dear builder, " },
  { type: "text", text: "the room listens." },
  { type: "usage", outputTokens: 20 },
  { type: "stop", reason: "end_turn" },
];

function gatewayConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    caps: { dailyUsd: 2, monthlyUsd: 20 },
    maxConcurrentCalls: 3,
    idleTimeoutMs: 1000,
    jobs: { "write-section": { model: MODEL, maxTokens: MAX_TOKENS } },
    ...overrides,
  };
}

type Ending = "end" | "hang" | "end-quietly-on-abort";

function fakeClient({ events = COMPLETE_EVENTS, ending = "end" }: { events?: ModelEvent[]; ending?: Ending } = {}) {
  const requests: ModelRequest[] = [];
  const client: ModelClient = {
    async *stream(request) {
      requests.push(request);
      for (const event of events) {
        request.signal.throwIfAborted();
        yield event;
      }
      if (ending === "hang") await untilAborted(request.signal);
      if (ending === "end-quietly-on-abort") await untilAborted(request.signal).catch(() => {});
    },
  };
  return { client, requests };
}

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function collect(events: AsyncIterable<ModelEvent>): Promise<ModelEvent[]> {
  const collected: ModelEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function settledSpend(callId: string, reservedAt: string, usd: number): LedgerEntry[] {
  const call = { callId, reservedAt, job: "write-section", model: MODEL };
  return [
    { kind: "reserve", ...call, worstCaseUsd: usd },
    {
      kind: "settle",
      ...call,
      at: reservedAt,
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      usd,
      outcome: "complete",
      estimated: false,
    },
  ];
}

describe("model gateway", () => {
  let dataDir: string;
  let ledger: UsageLedger;
  const controllers: AbortController[] = [];

  beforeEach(async () => {
    dataDir = await tempDataDir();
    ledger = createFileLedger(dataDir);
  });

  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.abort();
  });

  function signal(): AbortSignal {
    const controller = new AbortController();
    controllers.push(controller);
    return controller.signal;
  }

  function lastController(): AbortController {
    return controllers.at(-1)!;
  }

  async function gateway(
    client: ModelClient,
    { config = gatewayConfig(), now = () => NOW }: { config?: GatewayConfig; now?: () => Date } = {},
  ): Promise<Gateway> {
    return createGateway({ client, ledger, config, prices: PRICES, dataDir, now });
  }

  async function seedLedger(entries: LedgerEntry[]) {
    for (const entry of entries) await ledger.append(entry);
  }

  async function settleEntries(month = "2026-10"): Promise<SettleEntry[]> {
    return (await ledger.entriesForMonth(month)).filter((entry) => entry.kind === "settle");
  }

  it("refuses at start-up a job whose model is not in the price table", async () => {
    const config = gatewayConfig({ jobs: { "write-section": { model: "unpriced-model", maxTokens: 10 } } });
    await expect(gateway(fakeClient().client, { config })).rejects.toThrow(ModelNotPriced);
  });

  it("streams the client's events and settles a complete call at its reported usage", async () => {
    const { client, requests } = fakeClient();
    const events = await collect((await gateway(client)).stream("write-section", EMPTY_PROMPT, signal()));

    expect(events).toEqual(COMPLETE_EVENTS);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ model: MODEL, maxTokens: MAX_TOKENS, prompt: EMPTY_PROMPT });

    const [reserve, settle] = await ledger.entriesForMonth("2026-10");
    expect(reserve).toMatchObject({ kind: "reserve", job: "write-section", model: MODEL, worstCaseUsd: WORST_CASE_USD });
    expect(settle).toMatchObject({
      kind: "settle",
      callId: reserve!.callId,
      reservedAt: reserve!.reservedAt,
      inputTokens: 50,
      outputTokens: 20,
      outcome: "complete",
      estimated: false,
    });
    expect((settle as SettleEntry).usd).toBeCloseTo((50 * 1 + 20 * 5) / 1_000_000, 12);
  });

  it("bounds the input by the prompt's UTF-8 bytes plus message framing", async () => {
    const prompt: Prompt = { system: "ab", messages: [{ role: "user", content: "é" }] };
    await collect((await gateway(fakeClient().client)).stream("write-section", prompt, signal()));
    const [reserve] = await ledger.entriesForMonth("2026-10");
    const inputBound = 2 + 2 + 100 + 10;
    expect(reserve).toMatchObject({ worstCaseUsd: (inputBound * 1.25 + MAX_TOKENS * 5) / 1_000_000 });
  });

  describe("caps", () => {
    it("allows a call whose worst case stays at or under the daily cap", async () => {
      await seedLedger(settledSpend("earlier", "2026-10-11T08:00:00.000Z", 1.4));
      const events = await collect((await gateway(fakeClient().client)).stream("write-section", EMPTY_PROMPT, signal()));
      expect(events).toEqual(COMPLETE_EVENTS);
    });

    it("refuses a call whose worst case would cross the daily cap, without calling the model", async () => {
      await seedLedger(settledSpend("earlier", "2026-10-11T08:00:00.000Z", 1.6));
      const { client, requests } = fakeClient();
      const stream = (await gateway(client)).stream("write-section", EMPTY_PROMPT, signal());

      await expect(collect(stream)).rejects.toMatchObject({ reason: "daily-cap" });
      expect(requests).toHaveLength(0);
      expect(await ledger.entriesForMonth("2026-10")).toHaveLength(2);
    });

    it("refuses a call whose worst case would cross the monthly cap", async () => {
      await seedLedger(settledSpend("earlier", "2026-10-02T08:00:00.000Z", 19.6));
      const stream = (await gateway(fakeClient().client)).stream("write-section", EMPTY_PROMPT, signal());
      await expect(collect(stream)).rejects.toMatchObject({ reason: "monthly-cap" });
    });

    it("ignores last month's spend", async () => {
      await seedLedger(settledSpend("last-month", "2026-09-30T23:00:00.000Z", 19.9));
      const events = await collect((await gateway(fakeClient().client)).stream("write-section", EMPTY_PROMPT, signal()));
      expect(events).toEqual(COMPLETE_EVENTS);
    });

    it("counts running calls at their worst case", async () => {
      const config = gatewayConfig({ caps: { dailyUsd: 1.2, monthlyUsd: 20 } });
      const { client, requests } = fakeClient({ events: [], ending: "hang" });
      const running = await gateway(client, { config });

      void collect(running.stream("write-section", EMPTY_PROMPT, signal())).catch(() => {});
      void collect(running.stream("write-section", EMPTY_PROMPT, signal())).catch(() => {});
      await waitUntil(() => requests.length === 2);

      const third = running.stream("write-section", EMPTY_PROMPT, signal());
      await expect(collect(third)).rejects.toMatchObject({ reason: "daily-cap" });
    });

    it("counts a reservation left unsettled by a crash at its worst case", async () => {
      await seedLedger([
        { kind: "reserve", callId: "crashed", reservedAt: "2026-10-11T08:00:00.000Z", job: "write-section", model: MODEL, worstCaseUsd: 1.8 },
      ]);
      const stream = (await gateway(fakeClient().client)).stream("write-section", EMPTY_PROMPT, signal());
      await expect(collect(stream)).rejects.toThrow(SpendingRefused);
    });

    it("frees the unused part of a reservation once the call settles", async () => {
      const config = gatewayConfig({ caps: { dailyUsd: 0.6, monthlyUsd: 20 } });
      const running = await gateway(fakeClient().client, { config });
      await collect(running.stream("write-section", EMPTY_PROMPT, signal()));
      const events = await collect(running.stream("write-section", EMPTY_PROMPT, signal()));
      expect(events).toEqual(COMPLETE_EVENTS);
    });
  });

  it("settles a call that crosses midnight UTC into the day and month it was reserved in", async () => {
    let clock = new Date("2026-10-31T23:59:59.000Z");
    const config = gatewayConfig({ caps: { dailyUsd: 0.6, monthlyUsd: 0.6 } });
    const fullOutput: ModelEvent[] = [
      ...COMPLETE_EVENTS.slice(0, -2),
      { type: "usage", outputTokens: MAX_TOKENS },
      { type: "stop", reason: "max_tokens" },
    ];
    const running = await gateway(fakeClient({ events: fullOutput }).client, { config, now: () => clock });

    for await (const _event of running.stream("write-section", EMPTY_PROMPT, signal())) {
      clock = new Date("2026-11-01T00:00:01.000Z");
    }

    const [october] = await settleEntries("2026-10");
    expect(october).toMatchObject({
      reservedAt: "2026-10-31T23:59:59.000Z",
      at: "2026-11-01T00:00:01.000Z",
      outcome: "complete",
    });
    expect(await ledger.entriesForMonth("2026-11")).toEqual([]);

    const events = await collect(running.stream("write-section", EMPTY_PROMPT, signal()));
    expect(events).toEqual(fullOutput);
  });

  it("refuses a call while too many are running, and accepts one once a call ends", async () => {
    const config = gatewayConfig({ maxConcurrentCalls: 2 });
    const { client, requests } = fakeClient({ events: [], ending: "hang" });
    const running = await gateway(client, { config });

    const first = collect(running.stream("write-section", EMPTY_PROMPT, signal()));
    const firstController = lastController();
    void collect(running.stream("write-section", EMPTY_PROMPT, signal())).catch(() => {});
    await waitUntil(() => requests.length === 2);

    await expect(collect(running.stream("write-section", EMPTY_PROMPT, signal()))).rejects.toThrow(GatewayBusy);
    expect(requests).toHaveLength(2);

    firstController.abort();
    await expect(first).rejects.toThrow();
    void collect(running.stream("write-section", EMPTY_PROMPT, signal())).catch(() => {});
    await waitUntil(() => requests.length === 3);
  });

  it("refuses calls while the kill switch file exists, and resumes when it is deleted", async () => {
    const { client, requests } = fakeClient();
    const running = await gateway(client);

    await writeFile(killSwitchPath(dataDir), "");
    await expect(collect(running.stream("write-section", EMPTY_PROMPT, signal()))).rejects.toMatchObject({
      reason: "kill-switch",
    });
    expect(requests).toHaveLength(0);
    expect(await ledger.entriesForMonth("2026-10")).toEqual([]);

    await rm(killSwitchPath(dataDir));
    expect(await collect(running.stream("write-section", EMPTY_PROMPT, signal()))).toEqual(COMPLETE_EVENTS);
  });

  it("stops a call that goes quiet for the idle timeout, and charges its full reserved output", async () => {
    const config = gatewayConfig({ idleTimeoutMs: 30 });
    const { client, requests } = fakeClient({ events: COMPLETE_EVENTS.slice(0, 2), ending: "hang" });
    const running = await gateway(client, { config });

    await expect(collect(running.stream("write-section", EMPTY_PROMPT, signal()))).rejects.toThrow(ModelStalled);
    expect(requests[0]!.signal.aborted).toBe(true);
    const [settle] = await settleEntries();
    expect(settle).toMatchObject({ outcome: "failed", inputTokens: 50, outputTokens: MAX_TOKENS, estimated: true });
  });

  it("stops a call that never sends its first event", async () => {
    const config = gatewayConfig({ idleTimeoutMs: 30 });
    const running = await gateway(fakeClient({ events: [], ending: "hang" }).client, { config });

    await expect(collect(running.stream("write-section", EMPTY_PROMPT, signal()))).rejects.toThrow(ModelStalled);
    const [settle] = await settleEntries();
    expect(settle).toMatchObject({
      outcome: "failed",
      inputTokens: EMPTY_PROMPT_BOUND,
      outputTokens: MAX_TOKENS,
      estimated: true,
    });
  });

  it("stops a call whose reader holds an event past the idle timeout, even if the client then ends quietly", async () => {
    const config = gatewayConfig({ idleTimeoutMs: 30 });
    const client = fakeClient({ events: COMPLETE_EVENTS.slice(0, 2), ending: "end-quietly-on-abort" }).client;
    const running = await gateway(client, { config });

    const reading = (async () => {
      for await (const event of running.stream("write-section", EMPTY_PROMPT, signal())) {
        if (event.type === "text") await new Promise((resolve) => setTimeout(resolve, 80));
      }
    })();

    await expect(reading).rejects.toThrow(ModelStalled);
    expect(await settleEntries()).toMatchObject([{ outcome: "failed", outputTokens: MAX_TOKENS, estimated: true }]);
  });

  it("fails a stream that ends without a stop reason, at its full reserved output", async () => {
    const running = await gateway(fakeClient({ events: COMPLETE_EVENTS.slice(0, 3) }).client);

    await expect(collect(running.stream("write-section", EMPTY_PROMPT, signal()))).rejects.toThrow(ModelStreamIncomplete);
    expect(await settleEntries()).toMatchObject([
      { outcome: "failed", inputTokens: 50, outputTokens: MAX_TOKENS, estimated: true },
    ]);
  });

  it("records a call as aborted when the client ends quietly after the caller's signal aborts", async () => {
    const client = fakeClient({ events: COMPLETE_EVENTS.slice(0, 2), ending: "end-quietly-on-abort" }).client;
    const running = await gateway(client);
    const stream = running.stream("write-section", EMPTY_PROMPT, signal());
    const controller = lastController();

    const reading = (async () => {
      for await (const event of stream) {
        if (event.type === "text") controller.abort();
      }
    })();

    await expect(reading).rejects.toThrow();
    expect(await settleEntries()).toMatchObject([
      { outcome: "aborted", inputTokens: 50, outputTokens: MAX_TOKENS, estimated: true },
    ]);
  });

  it("releases the reservation when the ledger can't record it", async () => {
    const config = gatewayConfig({ maxConcurrentCalls: 1, caps: { dailyUsd: 0.6, monthlyUsd: 20 } });
    const fileLedger = ledger;
    let failNextAppend = true;
    ledger = {
      async append(entry) {
        if (failNextAppend) {
          failNextAppend = false;
          throw new Error("disk full");
        }
        await fileLedger.append(entry);
      },
      entriesForMonth: (month) => fileLedger.entriesForMonth(month),
    };
    const { client, requests } = fakeClient();
    const running = await gateway(client, { config });

    await expect(collect(running.stream("write-section", EMPTY_PROMPT, signal()))).rejects.toThrow("disk full");
    expect(requests).toHaveLength(0);
    expect(await collect(running.stream("write-section", EMPTY_PROMPT, signal()))).toEqual(COMPLETE_EVENTS);
  });

  it("records a stream aborted partway at its full reserved output", async () => {
    const { client, requests } = fakeClient({ events: COMPLETE_EVENTS.slice(0, 2), ending: "hang" });
    const running = await gateway(client);
    const stream = running.stream("write-section", EMPTY_PROMPT, signal());
    const controller = lastController();

    const received: ModelEvent[] = [];
    await expect(
      (async () => {
        for await (const event of stream) {
          received.push(event);
          if (event.type === "text") controller.abort();
        }
      })(),
    ).rejects.toThrow();

    expect(received.map((event) => event.type)).toEqual(["usage", "text"]);
    expect(requests[0]!.signal.aborted).toBe(true);
    const [settle] = await settleEntries();
    expect(settle).toMatchObject({ outcome: "aborted", inputTokens: 50, outputTokens: MAX_TOKENS, estimated: true });
    expect(settle!.usd).toBeCloseTo((50 * 1 + MAX_TOKENS * 5) / 1_000_000, 12);
  });

  it("aborts the model call and records it as aborted when the caller stops reading", async () => {
    const { client, requests } = fakeClient({ events: COMPLETE_EVENTS.slice(0, 2), ending: "hang" });
    const running = await gateway(client);

    for await (const event of running.stream("write-section", EMPTY_PROMPT, signal())) {
      if (event.type === "text") break;
    }

    expect(requests[0]!.signal.aborted).toBe(true);
    expect(await settleEntries()).toMatchObject([{ outcome: "aborted", estimated: true }]);
  });

  it("records a call the client fails as failed, charged at the input bound and full output", async () => {
    const client: ModelClient = {
      async *stream() {
        throw new Error("AccessDeniedException");
      },
    };
    const running = await gateway(client);

    await expect(collect(running.stream("write-section", EMPTY_PROMPT, signal()))).rejects.toThrow("AccessDeniedException");
    const [settle] = await settleEntries();
    expect(settle).toMatchObject({ outcome: "failed", inputTokens: EMPTY_PROMPT_BOUND, outputTokens: MAX_TOKENS, estimated: true });
    expect(settle!.usd).toBeCloseTo((EMPTY_PROMPT_BOUND * 1 + MAX_TOKENS * 5) / 1_000_000, 12);
  });

  it("refuses a call whose signal is already aborted, without reserving", async () => {
    const { client, requests } = fakeClient();
    const running = await gateway(client);
    const aborted = AbortSignal.abort();

    await expect(collect(running.stream("write-section", EMPTY_PROMPT, aborted))).rejects.toThrow();
    expect(requests).toHaveLength(0);
    expect(await ledger.entriesForMonth("2026-10")).toEqual([]);
  });
});
