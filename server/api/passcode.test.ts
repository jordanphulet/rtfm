import { timingSafeEqual } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTANT_PACE, unrecordedFakeModel } from "../agent/fake-model.ts";
import { fakePlan } from "../agent/planner/fake-planner.ts";
import { startServer, type RunningServer } from "../app.ts";
import { config, fixedPasscode, type ManualStorage, type PasscodeSource } from "../config.ts";
import { writePasscodeDigest } from "../storage/dynamodb-manual-store.ts";
import { testAppTable } from "../storage/dynamodb-testing.ts";
import { capturingLogger, collect, readEvents, recordingWriter, SAMPLE_ID, tempDataDir, UNWRITTEN_ID } from "../testing.ts";
import { setCookieHeader } from "./node-adapter.ts";
import { cachedDigest, isDigest, passcodeDigest, STORED_DIGEST_MAX_AGE_MS } from "./passcode.ts";
import type { ClientErrorReport } from "./types.ts";

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, timingSafeEqual: vi.fn(crypto.timingSafeEqual) };
});

const DYNAMODB_TIMEOUT_MS = 30_000;
/** A few words, with characters a cookie can't carry as they are. */
const PASSCODE = "copper lantern; tidal=owl";
const DIGEST = passcodeDigest(PASSCODE);
const PASSCODE_COOKIE = `rtfm_passcode=${DIGEST}`;
const NEW_PASSCODE = "brass kettle mossy heron";
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
  vi.mocked(timingSafeEqual).mockClear();
});

interface Settings {
  passcode: PasscodeSource | undefined;
  dataDir?: string;
  manualStorage?: ManualStorage;
  now?: () => number;
}

async function start({ passcode, dataDir, manualStorage = { kind: "files" }, now }: Settings) {
  const writer = recordingWriter();
  const { logger, entries } = capturingLogger();
  dataDir ??= await tempDataDir();
  const server = await startServer(
    { ...config, port: 0, dataDir, manualStorage, models: "fake", passcode },
    { writer, librarian: unrecordedFakeModel(INSTANT_PACE), logger, now },
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
  const status = async (cookie?: string) => (await send({ method: "GET", path: "/api/manuals" }, cookie)).status;

  return { server, dataDir, writer, entries, send, enter, manualIds, status };
}

/** A server whose passcode's digest is stored in a table of its own, read by a clock the test moves. */
async function startWithStoredPasscode(digest: string | undefined) {
  const table = await testAppTable();
  if (digest !== undefined) await writePasscodeDigest(table, digest);
  let nowMs = 0;
  const started = await start({
    passcode: { kind: "stored" },
    manualStorage: { kind: "dynamodb", table },
    now: () => nowMs,
  });
  return { ...started, table, wait: (ms: number) => (nowMs += ms) };
}

async function expectEveryRouteRefused(send: (call: ApiCall, cookie?: string) => Promise<Response>, cookie?: string) {
  for (const call of EVERY_ROUTE) {
    const response = await send(call, cookie);
    expect(response.status, `${call.method} ${call.path}`).toBe(401);
    if (call.method !== "HEAD") expect(await response.json()).toEqual({ error: "Passcode required" });
  }
}

describe("the passcode's digest", () => {
  it("is SHA-256 in lowercase hex", () => {
    expect(passcodeDigest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is compared in constant time: always 32 bytes against 32, with timingSafeEqual", () => {
    const compared = vi.mocked(timingSafeEqual);
    const lastComparison = () => compared.mock.calls.at(-1)!.map((bytes) => Buffer.from(bytes as Uint8Array).toString("hex"));

    expect(isDigest(DIGEST, DIGEST)).toBe(true);
    expect(lastComparison()).toEqual([DIGEST, DIGEST]);
    const nearlyRight = `${DIGEST.slice(0, 63)}${DIGEST.at(-1) === "0" ? "1" : "0"}`;
    expect(isDigest(nearlyRight, DIGEST)).toBe(false);
    expect(lastComparison()).toEqual([nearlyRight, DIGEST]);
    expect(isDigest(passcodeDigest(NEW_PASSCODE), DIGEST)).toBe(false);
    expect(compared).toHaveBeenCalledTimes(3);
    for (const [given, digest] of compared.mock.calls) {
      expect((given as Buffer).length).toBe(32);
      expect((digest as Buffer).length).toBe(32);
    }
  });

  it("refuses anything that isn't a digest before comparing, by its own form alone", () => {
    for (const given of ["", PASSCODE, DIGEST.toUpperCase(), DIGEST.slice(1), `${DIGEST}0`, `${DIGEST.slice(0, 62)}zz`]) {
      expect(isDigest(given, DIGEST), given).toBe(false);
    }
    expect(timingSafeEqual).not.toHaveBeenCalled();
  });

  it("is what the gate and POST /api/passcode compare, with timingSafeEqual", async () => {
    const { enter, status } = await start({ passcode: fixedPasscode(PASSCODE) });
    expect((await enter(PASSCODE)).status).toBe(204);
    expect(await status(PASSCODE_COOKIE)).toBe(200);
    expect(await status(`rtfm_passcode=${passcodeDigest(NEW_PASSCODE)}`)).toBe(401);
    expect(timingSafeEqual).toHaveBeenCalledTimes(3);
  });
});

describe("a stored digest's cache", () => {
  it("reads again only once the last read is a minute old, and never keeps a failed read", async () => {
    const stored: (string | Error | undefined)[] = [undefined, DIGEST, new Error("DynamoDB is down"), "rotated"];
    const read = vi.fn(async () => {
      const next = stored.shift();
      if (next instanceof Error) throw next;
      return next;
    });
    let nowMs = 1_000;
    const current = cachedDigest(read, () => nowMs);

    expect(await current()).toBeUndefined();
    nowMs += STORED_DIGEST_MAX_AGE_MS - 1;
    expect(await current()).toBeUndefined();
    nowMs += 1;
    expect(await current()).toBe(DIGEST);
    nowMs += STORED_DIGEST_MAX_AGE_MS;
    await expect(current()).rejects.toThrow("DynamoDB is down");
    expect(await current()).toBe("rotated");
    expect(read).toHaveBeenCalledTimes(4);
  });
});

describe("with a passcode set", () => {
  it("refuses every route with 401 without the cookie, before any route runs", async () => {
    const { send, writer, manualIds } = await start({ passcode: fixedPasscode(PASSCODE) });

    await expectEveryRouteRefused(send);

    expect(writer.signals).toHaveLength(0);
    expect(await manualIds(PASSCODE_COOKIE)).toContain(SAMPLE_ID);
    expect(await manualIds(PASSCODE_COOKIE)).not.toContain(TREEHOUSE_ID);
  });

  it("refuses every route with a wrong cookie, the passcode itself, or the digest under another name", async () => {
    const { send, writer } = await start({ passcode: fixedPasscode(PASSCODE) });

    await expectEveryRouteRefused(send, `rtfm_passcode=${passcodeDigest("copper lantern")}`);
    await expectEveryRouteRefused(send, `rtfm_passcode=${passcodeDigest(`${PASSCODE} `)}`);
    await expectEveryRouteRefused(send, `rtfm_passcode=${encodeURIComponent(PASSCODE)}`);
    await expectEveryRouteRefused(send, `rtfm_passcode=${DIGEST.toUpperCase()}`);
    await expectEveryRouteRefused(send, "rtfm_passcode=%E0%A4%A");
    await expectEveryRouteRefused(send, `session=${DIGEST}`);
    expect(writer.signals).toHaveLength(0);
  });

  it("answers a wrong passcode with 401 and no cookie", async () => {
    const { enter } = await start({ passcode: fixedPasscode(PASSCODE) });

    for (const given of ["copper lantern", PASSCODE.toUpperCase(), "", DIGEST]) {
      const response = await enter(given);
      expect(response.status, given).toBe(401);
      expect(await response.json()).toEqual({ error: "Wrong passcode" });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect((await enter(42)).status).toBe(400);
  });

  it("sets the cookie to the passcode's digest, and every route answers with it", async () => {
    const { enter, send, writer, manualIds } = await start({ passcode: fixedPasscode(PASSCODE) });

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
    const { send, writer } = await start({ passcode: fixedPasscode(PASSCODE) });

    const events = await collect(readEvents<{ event: string }>(await send({ method: "GET", path: STREAM_PATH }, PASSCODE_COOKIE)));

    expect(events[0].event).toBe("append");
    expect(events.at(-1)?.event).toBe("written");
    expect(writer.signals).toHaveLength(1);
  });

  it("locks out every browser once the passcode changes", async () => {
    const first = await start({ passcode: fixedPasscode(PASSCODE) });
    await servers.pop()!.close();
    const { send, enter } = await start({ passcode: fixedPasscode(NEW_PASSCODE), dataDir: first.dataDir });

    await expectEveryRouteRefused(send, PASSCODE_COOKIE);
    expect((await enter(PASSCODE)).status).toBe(401);
  });

  it("logs refusals and wrong passcodes, but never the passcode, its digest or the cookie", async () => {
    const { send, enter, entries } = await start({ passcode: fixedPasscode(PASSCODE) });

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
    for (const secret of [PASSCODE, encodeURIComponent(PASSCODE), "copper", DIGEST, "wrong-cookie-1", "wrong-passcode-2"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("with the passcode's digest stored in the table", () => {
  it("opens with the stored digest, and logs neither it nor the passcode", { timeout: DYNAMODB_TIMEOUT_MS }, async () => {
    const { enter, status, entries } = await startWithStoredPasscode(DIGEST);

    expect(await status()).toBe(401);
    const entered = await enter(PASSCODE);
    expect(entered.status).toBe(204);
    expect(entered.headers.get("set-cookie")?.split(";")[0]).toBe(PASSCODE_COOKIE);
    expect(await status(PASSCODE_COOKIE)).toBe(200);
    await servers.pop()!.close();

    expect(entries[0]).toMatchObject({ event: "server.started", manualStorage: "dynamodb", passcodeGate: true });
    const logged = JSON.stringify(entries);
    for (const secret of [PASSCODE, DIGEST]) expect(logged).not.toContain(secret);
  });

  it("refuses the old cookie once a rotated digest is read, within a minute", { timeout: DYNAMODB_TIMEOUT_MS }, async () => {
    const { enter, status, table, wait } = await startWithStoredPasscode(DIGEST);
    expect((await enter(PASSCODE)).status).toBe(204);
    const newCookie = `rtfm_passcode=${passcodeDigest(NEW_PASSCODE)}`;

    await writePasscodeDigest(table, passcodeDigest(NEW_PASSCODE));
    wait(STORED_DIGEST_MAX_AGE_MS - 1_000);
    expect(await status(PASSCODE_COOKIE)).toBe(200);
    expect(await status(newCookie)).toBe(401);

    wait(1_000);
    expect(await status(PASSCODE_COOKIE)).toBe(401);
    expect((await enter(PASSCODE)).status).toBe(401);
    expect((await enter(NEW_PASSCODE)).status).toBe(204);
    expect(await status(newCookie)).toBe(200);
  });

  it("refuses every request, and every passcode, while no digest is stored", { timeout: DYNAMODB_TIMEOUT_MS }, async () => {
    const { send, enter, status, entries, table, wait, writer } = await startWithStoredPasscode(undefined);

    await expectEveryRouteRefused(send);
    await expectEveryRouteRefused(send, PASSCODE_COOKIE);
    for (const given of [PASSCODE, "", DIGEST]) {
      const response = await enter(given);
      expect(response.status, given).toBe(401);
      expect(await response.json()).toEqual({ error: "Wrong passcode" });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(writer.signals).toHaveLength(0);
    expect(entries.filter(({ event }) => event === "passcode.unset")).toHaveLength(3);
    expect(entries.map(({ event }) => event)).not.toContain("passcode.accepted");

    await writePasscodeDigest(table, DIGEST);
    wait(STORED_DIGEST_MAX_AGE_MS);
    expect((await enter(PASSCODE)).status).toBe(204);
    expect(await status(PASSCODE_COOKIE)).toBe(200);
  });

  it("won't start without the manuals in DynamoDB, where the digest is stored", async () => {
    await expect(start({ passcode: { kind: "stored" } })).rejects.toThrow("A stored passcode needs the manuals in DynamoDB");
  });
});

describe("with no passcode set", () => {
  it("answers every route without a cookie, and has no passcode route", async () => {
    const { send, enter, entries } = await start({ passcode: undefined });

    expect((await send({ method: "GET", path: "/api/manuals" })).status).toBe(200);
    expect((await send({ method: "GET", path: SAMPLE_PATH })).status).toBe(200);
    expect((await send({ method: "POST", path: "/api/client-errors", body: REPORT })).status).toBe(204);
    expect((await collect(readEvents<{ event: string }>(await send({ method: "GET", path: STREAM_PATH })))).at(-1)?.event).toBe(
      "written",
    );
    expect((await enter(PASSCODE)).status).toBe(404);
    expect(entries[0]).toMatchObject({ event: "server.started", passcodeGate: false });
  });

  it("is what an empty or unset RTFM_PASSCODE gives; a set one is kept as its digest alone", () => {
    expect(fixedPasscode("")).toBeUndefined();
    expect(fixedPasscode(undefined)).toBeUndefined();
    expect(fixedPasscode(PASSCODE)).toEqual({ kind: "digest", digest: DIGEST });
  });
});

describe("the passcode cookie", () => {
  it("is Secure unless the request's host is this machine", () => {
    const cookie = { name: "rtfm_passcode", value: DIGEST };
    for (const host of ["localhost:5173", "127.0.0.1:8787", "[::1]:8787", "localhost"]) {
      expect(setCookieHeader(cookie, host), host).not.toContain("Secure");
    }
    for (const host of ["rtfm.example.com", "localhost.example.com", undefined]) {
      expect(setCookieHeader(cookie, host), host).toBe(`${PASSCODE_COOKIE}; HttpOnly; SameSite=Strict; Path=/api; Secure`);
    }
  });
});
