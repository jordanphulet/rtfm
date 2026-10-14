import { describe, expect, it, onTestFinished, vi } from "vitest";
import { startServer, type RunningServer } from "./app.ts";
import { config } from "./config.ts";
import type { ModelClient } from "./gateway/types.ts";
import { EXIT_BEFORE_EXPIRY_MS, OPEN_REQUESTS_GRACE_MS, environmentReplacement } from "./replacement.ts";
import { keyRefusingDynamoDb, testAppTable } from "./storage/dynamodb-testing.ts";
import { capturingLogger, collect, readEvents, tempDataDir, testGateway, waitUntil } from "./testing.ts";

type Event = { event: string; data: unknown };

/** A server that stays open until the test lets it close. */
function standInServer() {
  let closed = () => {};
  const closing = new Promise<void>((resolve) => (closed = resolve));
  const server: RunningServer = { port: 0, close: vi.fn(() => closing) };
  return { server, closed: () => closed() };
}

/** A librarian model that answers "Good ", then holds its reply until released, or until aborted. */
function heldModel() {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  const client: ModelClient = {
    async *stream({ signal }) {
      yield { type: "text", text: "Good " };
      await new Promise<void>((resolve, reject) => {
        void released.then(resolve);
        signal.addEventListener("abort", () => reject(signal.reason));
      });
      yield { type: "text", text: "morning" };
      yield { type: "stop", reason: "end_turn" };
    },
  };
  return { client, release: () => release() };
}

/**
 * The server with its manuals in a table reached through a stand-in for DynamoDB that refuses the
 * keys when told to, wired to a replacement whose exit the test sees, and the librarian held.
 */
async function serverOnRefusableKeys(graceMs?: number) {
  const dataDir = await tempDataDir();
  const { logger, entries } = capturingLogger();
  const exit = vi.fn();
  const replacement = environmentReplacement(logger, exit, graceMs);
  const table = await testAppTable();
  const dynamoDb = await keyRefusingDynamoDb(table);
  const model = heldModel();
  const { gateway, ledgerEntries } = await testGateway(model.client, dataDir, { config });
  const onKeysRefused = (error: Error) => replacement.keysRefused("DynamoDB", error);
  const manualStorage = { kind: "dynamodb" as const, table: { ...table, endpoint: dynamoDb.endpoint, onKeysRefused } };
  const server = await startServer(
    { ...config, port: 0, dataDir, models: "fake", passcode: undefined, manualStorage },
    { librarian: gateway, idle: gateway.idle, logger },
  );
  onTestFinished(() => server.close());
  replacement.serving(server, undefined);
  const url = (path: string) => `http://127.0.0.1:${server.port}${path}`;
  return { server, entries, exit, dynamoDb, model, ledgerEntries, url };
}

/** Asks the librarian, and reads its reply up to the first text, which the held model sends at once. */
async function openReply(url: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", text: "Good morning" }] }),
  });
  const events = readEvents<Event>(response);
  expect((await events.next()).value).toMatchObject({ event: "text" });
  return events;
}

describe("replacing the environment", { timeout: 30_000 }, () => {
  it("exits once DynamoDB refuses the keys, after the open requests end, taking no new ones", async () => {
    const { entries, exit, dynamoDb, model, url } = await serverOnRefusableKeys();
    const reply = await openReply(url("/api/librarian"));

    dynamoDb.refuseKeys();
    expect((await fetch(url("/api/manuals"))).status).toBe(500);
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: "WARN",
        event: "server.keys-refused",
        message: "DynamoDB refused this environment's keys: exiting for a new one",
        service: "DynamoDB",
        graceMs: OPEN_REQUESTS_GRACE_MS,
        error: expect.objectContaining({ name: "ExpiredTokenException" }),
      }),
    );
    await expect(fetch(url("/api/manuals"))).rejects.toThrow();
    expect(exit).not.toHaveBeenCalled();

    model.release();
    expect((await collect(reply)).at(-1)).toEqual({ event: "done", data: {} });
    await waitUntil(() => exit.mock.calls.length > 0, 5000);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(entries.filter(({ event }) => event === "server.keys-refused")).toHaveLength(1);
  });

  it("cuts the requests still open once the grace runs out, and still settles their model calls", async () => {
    const { exit, dynamoDb, ledgerEntries, url } = await serverOnRefusableKeys(200);
    const reply = await openReply(url("/api/librarian"));

    dynamoDb.refuseKeys();
    await fetch(url("/api/manuals"));
    await expect(collect(reply)).rejects.toThrow();
    await waitUntil(() => exit.mock.calls.length > 0, 5000);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect((await ledgerEntries()).map(({ kind }) => kind)).toEqual(["reserve", "settle"]);
  });

  it(`exits ${EXIT_BEFORE_EXPIRY_MS / 60_000} minutes before known keys expire, once the open requests end`, async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") });
    onTestFinished(() => void vi.useRealTimers());
    const { logger, entries } = capturingLogger();
    const exit = vi.fn();
    const { server, closed } = standInServer();
    const keysExpireAt = new Date("2026-10-13T14:00:00Z");

    environmentReplacement(logger, exit).serving(server, keysExpireAt);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000 - EXIT_BEFORE_EXPIRY_MS - 1);
    expect(server.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(server.close).toHaveBeenCalledExactlyOnceWith(OPEN_REQUESTS_GRACE_MS);
    expect(entries).toEqual([
      expect.objectContaining({
        level: "WARN",
        event: "server.keys-expiring",
        credentialsExpireAt: "2026-10-13T14:00:00.000Z",
        plannedExitAt: "2026-10-13T13:54:00.000Z",
        msUntilExpiry: EXIT_BEFORE_EXPIRY_MS,
      }),
    ]);
    expect(exit).not.toHaveBeenCalled();

    closed();
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("exits at once when the keys arrive with less than that left, saying how little", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") });
    onTestFinished(() => void vi.useRealTimers());
    const { logger, entries } = capturingLogger();
    const { server } = standInServer();

    environmentReplacement(logger, vi.fn()).serving(server, new Date("2026-10-13T12:02:00Z"));
    await vi.advanceTimersByTimeAsync(0);

    expect(server.close).toHaveBeenCalledOnce();
    expect(entries).toEqual([
      expect.objectContaining({ event: "server.keys-expiring", plannedExitAt: "2026-10-13T11:56:00.000Z", msUntilExpiry: 120_000 }),
    ]);
  });

  it("sets no timer for an expiry further away than a timer can wait", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") });
    onTestFinished(() => void vi.useRealTimers());
    const { logger, entries } = capturingLogger();
    const { server } = standInServer();

    environmentReplacement(logger, vi.fn()).serving(server, new Date("2026-12-31T00:00:00Z"));
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(server.close).not.toHaveBeenCalled();
    expect(entries).toEqual([]);
  });

  it("starts its exit only once, whether the keys are refused again or their expiry comes", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") });
    onTestFinished(() => void vi.useRealTimers());
    const { logger, entries } = capturingLogger();
    const { server } = standInServer();
    const replacement = environmentReplacement(logger, vi.fn());

    replacement.serving(server, new Date("2026-10-13T13:00:00Z"));
    replacement.keysRefused("DynamoDB", new Error("ExpiredTokenException"));
    replacement.keysRefused("DynamoDB", new Error("ExpiredTokenException"));
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(server.close).toHaveBeenCalledOnce();
    expect(entries.map(({ event }) => event)).toEqual(["server.keys-refused"]);
  });
});
