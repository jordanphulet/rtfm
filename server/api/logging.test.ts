import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { INSTANT_PACE, unrecordedFakeModel } from "../agent/fake-model.ts";
import { startServer, type Replaced, type RunningServer } from "../app.ts";
import { config } from "../config.ts";
import { logsDir } from "../logging/log-file.ts";
import { DataFolderInUse } from "../storage/lock.ts";
import { capturingLogger, collect, fastFakeWriter, readEvents, SAMPLE_ID, tempDataDir, UNWRITTEN_ID } from "../testing.ts";
import { fakeBody } from "../writer/fake.ts";

const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const STREAM_PATH = `/api/manuals/${SAMPLE_ID}/sections/${UNWRITTEN_ID}/stream`;

async function start(dataDir?: string, replaced: Replaced = {}) {
  const server = await startServer(
    { ...config, port: 0, dataDir: dataDir ?? (await tempDataDir()), models: "fake", passcode: undefined },
    { writer: fastFakeWriter(), librarian: unrecordedFakeModel(INSTANT_PACE), ...replaced },
  );
  servers.push(server);
  return { server, base: `http://127.0.0.1:${server.port}` };
}

async function startCapturing() {
  const { logger, entries } = capturingLogger();
  return { ...(await start(undefined, { logger })), entries };
}

describe("the server's logs", () => {
  it("record the server starting and stopping, and a second server refused the data folder", async () => {
    const dataDir = await tempDataDir();
    const { logger, entries } = capturingLogger();
    const { server } = await start(dataDir, { logger });

    await expect(start(dataDir, { logger })).rejects.toThrow(DataFolderInUse);
    await server.close();

    expect(entries.map(({ level, event }) => `${level} ${event}`)).toEqual([
      "INFO server.started",
      "WARN server.refused",
      "INFO server.stopped",
    ]);
    expect(entries[0]).toMatchObject({ port: server.port, models: "fake", dataDir });
    expect(entries[1]).toMatchObject({ pid: process.pid, dataDir });
  });

  it("record each request once it ends: its id, method, path without the query, status and duration", async () => {
    const { base, entries } = await startCapturing();

    await fetch(`${base}/api/manuals?library=empty`);
    await fetch(`${base}/api/nowhere`);
    await collect(readEvents(await fetch(`${base}${STREAM_PATH}`)));

    const requests = entries.filter(({ event }) => event === "request");
    expect(requests).toEqual([
      expect.objectContaining({ level: "INFO", method: "GET", path: "/api/manuals", status: 200, message: "GET /api/manuals 200" }),
      expect.objectContaining({ level: "INFO", method: "GET", path: "/api/nowhere", status: 404 }),
      expect.objectContaining({ level: "INFO", method: "GET", path: STREAM_PATH, status: 200 }),
    ]);
    for (const request of requests) {
      expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(request.durationMs).toBeGreaterThanOrEqual(0);
      expect(request.clientClosed).toBeUndefined();
    }
    expect(new Set(requests.map(({ requestId }) => requestId)).size).toBe(3);
  });

  it("record a section's run and a librarian reply alongside their requests", async () => {
    const { base, entries } = await startCapturing();

    await collect(readEvents(await fetch(`${base}${STREAM_PATH}`)));
    const reply = await fetch(`${base}/api/librarian`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", text: "What do I have?" }] }),
    });
    await collect(readEvents(reply));

    expect(entries.map(({ event }) => event).filter((event) => event !== "server.started")).toEqual([
      "section.started",
      "section.finished",
      "request",
      "librarian.reply",
      "request",
    ]);
  });

  it("record a request the local-only checks refuse, with the Host or Origin it named", async () => {
    const { base, entries } = await startCapturing();

    const refused = await fetch(`${base}/api/manuals`, { headers: { origin: "https://evil.example" } });

    expect(refused.status).toBe(403);
    expect(entries.filter(({ event }) => event.startsWith("request"))).toEqual([
      expect.objectContaining({
        level: "WARN",
        event: "request.refused",
        message: "Origin not allowed",
        status: 403,
        origin: "https://evil.example",
      }),
      expect.objectContaining({ level: "INFO", event: "request", status: 403 }),
    ]);
  });

  it("never hold a credential, a cookie, a query, the conversation or a manual's text", async () => {
    const dataDir = await tempDataDir();
    const { base } = await start(dataDir);
    const secrets = { authorization: "Bearer secret-token-1", cookie: "session=secret-cookie-2" };

    await fetch(`${base}/api/manuals?token=secret-query-3`, { headers: secrets });
    await fetch(`${base}/api/manuals`, { headers: { ...secrets, origin: "https://evil.example" } });
    await collect(readEvents(await fetch(`${base}${STREAM_PATH}`, { headers: secrets })));
    const reply = await fetch(`${base}/api/librarian`, {
      method: "POST",
      headers: { ...secrets, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", text: "Which manual covers secret-message-4?" }] }),
    });
    await collect(readEvents(reply));
    await servers.pop()!.close();

    const dir = logsDir(dataDir);
    const logged = (await Promise.all((await readdir(dir)).map((file) => readFile(path.join(dir, file), "utf8")))).join("");
    expect(logged).toContain('"event":"section.finished"');
    expect(logged).toContain('"event":"librarian.reply"');
    for (const secret of ["secret-token-1", "secret-cookie-2", "secret-query-3", "secret-message-4"]) {
      expect(logged).not.toContain(secret);
    }
    const body = await fakeBody(SAMPLE_ID, UNWRITTEN_ID);
    expect(logged).not.toContain(body.slice(0, 40));
  });
});
