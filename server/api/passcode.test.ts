import { afterEach, describe, expect, it } from "vitest";
import { INSTANT_PACE, unrecordedFakeModel } from "../agent/fake-model.ts";
import { fakePlan } from "../agent/planner/fake-planner.ts";
import { startServer, type RunningServer } from "../app.ts";
import { config } from "../config.ts";
import { capturingLogger, collect, readEvents, recordingWriter, SAMPLE_ID, tempDataDir, UNWRITTEN_ID } from "../testing.ts";
import { setCookieHeader } from "./node-adapter.ts";
import type { ClientErrorReport } from "./types.ts";

/** A few words, with the characters a cookie can't carry as they are. */
const PASSCODE = "copper lantern; tidal=owl";
const PASSCODE_COOKIE = `rtfm_passcode=${encodeURIComponent(PASSCODE)}`;
const TREEHOUSE_REQUEST = "Let’s start a new manual about building a treehouse";
const TREEHOUSE_ID = fakePlan(TREEHOUSE_REQUEST).id;
const SAMPLE_PATH = `/api/manuals/${SAMPLE_ID}`;
const STREAM_PATH = `${SAMPLE_PATH}/sections/${UNWRITTEN_ID}/stream`;
const REPORT: ClientErrorReport = { kind: "error", page: "/", message: "Something broke" };

type ApiCall = { method: string; path: string; body?: unknown };

const TREEHOUSE_REPLY: ApiCall = {
  method: "POST",
  path: "/api/librarian",
  body: { messages: [{ role: "user", text: TREEHOUSE_REQUEST }] },
};

/** One request to every route but POST /api/passcode, to paths that aren't routes, and with HEAD and OPTIONS. */
const EVERY_ROUTE: ApiCall[] = [
  { method: "GET", path: "/api/manuals" },
  { method: "GET", path: SAMPLE_PATH },
  { method: "GET", path: `${SAMPLE_PATH}/sections/${UNWRITTEN_ID}` },
  { method: "GET", path: STREAM_PATH },
  TREEHOUSE_REPLY,
  { method: "POST", path: "/api/client-errors", body: REPORT },
  { method: "DELETE", path: SAMPLE_PATH },
  { method: "GET", path: "/api/passcode" },
  { method: "HEAD", path: "/api/manuals" },
  { method: "OPTIONS", path: "/api/manuals" },
  { method: "OPTIONS", path: "/api/passcode" },
  { method: "GET", path: "/api/nowhere" },
];

const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start(passcode: string | undefined, dataDir?: string) {
  const writer = recordingWriter();
  const { logger, entries } = capturingLogger();
  dataDir ??= await tempDataDir();
  const server = await startServer(
    { ...config, port: 0, dataDir, models: "fake", passcode },
    { writer, librarian: unrecordedFakeModel(INSTANT_PACE), logger },
  );
  servers.push(server);
  const base = `http://127.0.0.1:${server.port}`;

  function send({ method, path, body }: ApiCall, cookie?: string) {
    const headers: Record<string, string> = cookie ? { cookie } : {};
    if (body !== undefined) headers["content-type"] = "application/json";
    return fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  const enter = (given: unknown) => send({ method: "POST", path: "/api/passcode", body: { passcode: given } });
  const manualIds = async (cookie?: string) =>
    ((await (await send({ method: "GET", path: "/api/manuals" }, cookie)).json()) as { id: string }[]).map(({ id }) => id);

  return { server, dataDir, writer, entries, send, enter, manualIds };
}

async function expectEveryRouteRefused(send: (call: ApiCall, cookie?: string) => Promise<Response>, cookie?: string) {
  for (const call of EVERY_ROUTE) {
    const response = await send(call, cookie);
    expect(response.status, `${call.method} ${call.path}`).toBe(401);
    if (call.method !== "HEAD") expect(await response.json()).toEqual({ error: "Passcode required" });
  }
}

describe("with a passcode set", () => {
  it("refuses every route with 401 without the cookie, before any route runs", async () => {
    const { send, writer, manualIds } = await start(PASSCODE);

    await expectEveryRouteRefused(send);

    expect(writer.signals).toHaveLength(0);
    expect(await manualIds(PASSCODE_COOKIE)).toContain(SAMPLE_ID);
    expect(await manualIds(PASSCODE_COOKIE)).not.toContain(TREEHOUSE_ID);
  });

  it("refuses every route with a wrong cookie, or the right value under another name", async () => {
    const { send, writer } = await start(PASSCODE);

    await expectEveryRouteRefused(send, "rtfm_passcode=copper%20lantern");
    await expectEveryRouteRefused(send, `rtfm_passcode=${encodeURIComponent(`${PASSCODE} `)}`);
    await expectEveryRouteRefused(send, "rtfm_passcode=%E0%A4%A");
    await expectEveryRouteRefused(send, `session=${encodeURIComponent(PASSCODE)}`);
    expect(writer.signals).toHaveLength(0);
  });

  it("answers a wrong passcode with 401 and no cookie", async () => {
    const { enter } = await start(PASSCODE);

    for (const given of ["copper lantern", PASSCODE.toUpperCase(), ""]) {
      const response = await enter(given);
      expect(response.status, given).toBe(401);
      expect(await response.json()).toEqual({ error: "Wrong passcode" });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect((await enter(42)).status).toBe(400);
  });

  it("sets the cookie for the right passcode, and every route answers with it", async () => {
    const { enter, send, writer, manualIds } = await start(PASSCODE);

    const entered = await enter(PASSCODE);
    expect(entered.status).toBe(204);
    expect(entered.headers.get("set-cookie")).toBe(`${PASSCODE_COOKIE}; HttpOnly; SameSite=Strict; Path=/api`);
    const cookie = entered.headers.get("set-cookie")!.split(";")[0];

    expect((await send({ method: "GET", path: "/api/manuals" }, cookie)).status).toBe(200);
    expect((await send({ method: "GET", path: SAMPLE_PATH }, cookie)).status).toBe(200);
    expect((await send({ method: "GET", path: `${SAMPLE_PATH}/sections/${UNWRITTEN_ID}` }, cookie)).status).toBe(200);
    expect((await send({ method: "POST", path: "/api/client-errors", body: REPORT }, cookie)).status).toBe(204);
    expect((await send({ method: "GET", path: "/api/nowhere" }, cookie)).status).toBe(404);
    const reply = await send(TREEHOUSE_REPLY, cookie);
    expect((await collect(readEvents<{ event: string }>(reply))).at(-1)?.event).toBe("done");
    expect(await manualIds(cookie)).toContain(TREEHOUSE_ID);
    expect((await send({ method: "DELETE", path: SAMPLE_PATH }, `other=1; ${cookie}`)).status).toBe(204);
    expect(writer.signals).toHaveLength(0);
  });

  it("streams a section to a reader that carries the cookie", async () => {
    const { send, writer } = await start(PASSCODE);

    const events = await collect(readEvents<{ event: string }>(await send({ method: "GET", path: STREAM_PATH }, PASSCODE_COOKIE)));

    expect(events[0].event).toBe("append");
    expect(events.at(-1)?.event).toBe("written");
    expect(writer.signals).toHaveLength(1);
  });

  it("locks out every browser once the passcode changes", async () => {
    const first = await start(PASSCODE);
    await servers.pop()!.close();
    const { send, enter } = await start("brass kettle heron", first.dataDir);

    await expectEveryRouteRefused(send, PASSCODE_COOKIE);
    expect((await enter(PASSCODE)).status).toBe(401);
  });

  it("logs refusals and wrong passcodes, but never the passcode or the cookie", async () => {
    const { send, enter, entries } = await start(PASSCODE);

    await send({ method: "GET", path: "/api/manuals" }, "rtfm_passcode=wrong-cookie-1");
    await enter("wrong-passcode-2");
    await enter(PASSCODE);
    await send({ method: "GET", path: "/api/manuals" }, PASSCODE_COOKIE);
    await collect(readEvents(await send({ method: "GET", path: STREAM_PATH }, PASSCODE_COOKIE)));
    await servers.pop()!.close();

    expect(entries.filter(({ event }) => event.startsWith("request.") || event.startsWith("passcode."))).toEqual([
      expect.objectContaining({ level: "WARN", event: "request.refused", message: "Passcode required", status: 401 }),
      expect.objectContaining({ level: "WARN", event: "passcode.wrong" }),
      expect.objectContaining({ level: "INFO", event: "passcode.accepted" }),
    ]);
    expect(entries[0]).toMatchObject({ event: "server.started", passcodeGate: true });
    const logged = JSON.stringify(entries);
    for (const secret of [PASSCODE, encodeURIComponent(PASSCODE), "copper", "wrong-cookie-1", "wrong-passcode-2"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("with no passcode set", () => {
  it("answers every route without a cookie, and has no passcode route", async () => {
    const { send, enter, entries } = await start(undefined);

    expect((await send({ method: "GET", path: "/api/manuals" })).status).toBe(200);
    expect((await send({ method: "GET", path: SAMPLE_PATH })).status).toBe(200);
    expect((await send({ method: "POST", path: "/api/client-errors", body: REPORT })).status).toBe(204);
    expect((await collect(readEvents<{ event: string }>(await send({ method: "GET", path: STREAM_PATH })))).at(-1)?.event).toBe(
      "written",
    );
    expect((await enter(PASSCODE)).status).toBe(404);
    expect(entries[0]).toMatchObject({ event: "server.started", passcodeGate: false });
  });
});

describe("the passcode cookie", () => {
  it("is Secure unless the request's host is this machine", () => {
    const cookie = { name: "rtfm_passcode", value: PASSCODE };
    for (const host of ["localhost:5173", "127.0.0.1:8787", "[::1]:8787", "localhost"]) {
      expect(setCookieHeader(cookie, host), host).not.toContain("Secure");
    }
    for (const host of ["rtfm.example.com", "localhost.example.com", undefined]) {
      expect(setCookieHeader(cookie, host), host).toBe(`${PASSCODE_COOKIE}; HttpOnly; SameSite=Strict; Path=/api; Secure`);
    }
  });
});
