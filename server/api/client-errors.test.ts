import { afterEach, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../app.ts";
import { config } from "../config.ts";
import type { LogEntry } from "../logging/logger.ts";
import { capturingLogger, tempDataDir } from "../testing.ts";
import { CLIENT_ERRORS_PER_HOUR, clientErrorsRoute } from "./client-errors.ts";
import type { ClientErrorReport } from "./types.ts";

const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const UNCAUGHT: ClientErrorReport = {
  kind: "error",
  page: "/read/the-haunt-that-listens",
  name: "TypeError",
  message: "Cannot read properties of undefined (reading 'id')",
  stack: "TypeError: Cannot read properties of undefined (reading 'id')\n    at SectionPage (SectionPage.tsx:12:7)",
};

async function start() {
  const { logger, entries } = capturingLogger();
  const server = await startServer(
    { ...config, port: 0, dataDir: await tempDataDir(), models: "fake", passcode: undefined },
    { logger },
  );
  servers.push(server);
  const url = `http://127.0.0.1:${server.port}/api/client-errors`;
  const report = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const clientErrors = () => entries.filter(({ event }) => event === "client.error");
  return { report, entries, clientErrors };
}

describe("POST /api/client-errors", () => {
  it("logs an uncaught error or an unhandled rejection with the browser's name, message and stack", async () => {
    const { report, clientErrors } = await start();

    expect((await report(UNCAUGHT)).status).toBe(204);
    expect((await report({ kind: "rejection", page: "/", message: "Failed to fetch" })).status).toBe(204);

    expect(clientErrors()).toEqual([
      expect.objectContaining({
        level: "ERROR",
        kind: "error",
        page: UNCAUGHT.page,
        error: { name: "TypeError", message: UNCAUGHT.message, stack: UNCAUGHT.stack },
      }),
      expect.objectContaining({ level: "ERROR", kind: "rejection", error: { name: "Error", message: "Failed to fetch" } }),
    ]);
  });

  it("logs a failed API request as a warning, with its method, path without the query, and status", async () => {
    const { report, clientErrors } = await start();
    const failed = { kind: "request", page: "/", method: "GET", path: "/api/manuals?library=empty", status: 502 };

    expect((await report(failed)).status).toBe(204);
    expect((await report({ ...failed, status: undefined })).status).toBe(204);

    expect(clientErrors()).toEqual([
      expect.objectContaining({
        level: "WARN",
        message: "GET /api/manuals answered 502 in the browser",
        path: "/api/manuals",
        status: 502,
      }),
      expect.objectContaining({ level: "WARN", message: "GET /api/manuals got no answer in the browser" }),
    ]);
  });

  it("is subject to the local-only checks", async () => {
    const { report, clientErrors } = await start();

    expect((await report(UNCAUGHT, { origin: "https://evil.example" })).status).toBe(403);
    expect((await report(UNCAUGHT, { "content-type": "text/plain" })).status).toBe(415);
    expect(clientErrors()).toEqual([]);
  });

  it("refuses a report with a field it doesn't define, a value it doesn't allow, or a field missing, and logs nothing", async () => {
    const { report, clientErrors } = await start();

    expect((await report({ ...UNCAUGHT, cookie: "session=1" })).status).toBe(400);
    expect((await report({ kind: "error", page: "/" })).status).toBe(400);
    expect((await report({ ...UNCAUGHT, kind: "warning" })).status).toBe(400);
    const failed = { kind: "request", page: "/", method: "GET", path: "/api/manuals" };
    expect((await report({ ...failed, status: "502" })).status).toBe(400);
    expect((await report({ ...failed, method: "PATCH" })).status).toBe(400);
    expect((await report({ ...failed, path: "/elsewhere" })).status).toBe(400);
    expect((await report({ ...failed, path: "/api/x\n2026-10-12T08:00:00.000Z INFO forged" })).status).toBe(400);
    expect((await report("not json")).status).toBe(400);
    expect(clientErrors()).toEqual([]);
  });

  it("cuts long strings short rather than refusing them", async () => {
    const { report, clientErrors } = await start();

    await report({ ...UNCAUGHT, page: "/".repeat(1000), message: "m".repeat(5000), stack: "s".repeat(50_000) });

    const [logged] = clientErrors() as (LogEntry & { error: { message: string; stack: string } })[];
    expect(logged.page).toHaveLength(300);
    expect(logged.error.message).toHaveLength(1000);
    expect(logged.error.stack).toHaveLength(4000);
  });

  it(`logs at most ${CLIENT_ERRORS_PER_HOUR} reports an hour, says once that it is dropping the rest, and starts again the next hour`, async () => {
    const { logger, entries } = capturingLogger();
    let now = new Date("2026-10-12T08:00:00.000Z");
    const route = clientErrorsRoute(logger, () => now);
    const report = () =>
      route.handle({ params: {}, query: new URLSearchParams(), body: UNCAUGHT, signal: new AbortController().signal });

    const statuses = [];
    for (let count = 0; count < CLIENT_ERRORS_PER_HOUR + 3; count++) statuses.push(((await report()) as { status: number }).status);
    now = new Date("2026-10-12T09:00:00.000Z");
    statuses.push(((await report()) as { status: number }).status);

    expect(statuses).toEqual([...Array(CLIENT_ERRORS_PER_HOUR).fill(204), 429, 429, 429, 204]);
    expect(entries.filter(({ event }) => event === "client.error")).toHaveLength(CLIENT_ERRORS_PER_HOUR + 1);
    expect(entries.filter(({ event }) => event === "client.limited")).toEqual([expect.objectContaining({ level: "WARN" })]);
  });
});
