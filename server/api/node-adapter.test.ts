import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { silentLogger, type Logger } from "../logging/logger.ts";
import { capturingLogger, tempDataDir } from "../testing.ts";
import { createRequestHandler, LOOPBACK_HOSTS, LOOPBACK_ORIGINS, type AdapterConfig } from "./node-adapter.ts";
import { cachedDigest, passcodeDigest, type CurrentDigest } from "./passcode.ts";
import type { ApiRequest, Route } from "./route.ts";

const MAX_BODY_CHARACTERS = 256 * 1024;
const EMPTY_JSON_BODY = JSON.stringify({ text: "" });
const LOOPBACK_ONLY: AdapterConfig = {
  allowedHosts: LOOPBACK_HOSTS,
  allowedOrigins: LOOPBACK_ORIGINS,
  appDir: undefined,
  eventStreamHeartbeatMs: 15_000,
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  vi.restoreAllMocks();
});

async function serve(
  route: Route,
  logger: Logger = silentLogger,
  config: Partial<AdapterConfig> = {},
  currentDigest?: CurrentDigest,
): Promise<string> {
  const server = createServer(createRequestHandler([route], logger, { ...LOOPBACK_ONLY, ...config }, currentDigest));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function postJson(url: string, body: string) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
}

describe("the Node adapter", () => {
  it("passes a body at the size limit, and refuses one over it with 400 before the route runs", async () => {
    const received: ApiRequest[] = [];
    const base = await serve({
      method: "POST",
      pattern: "/api/echo",
      handle: async (request) => {
        received.push(request);
        return { status: 200, body: { ok: true } };
      },
    });
    const textAtLimit = "x".repeat(MAX_BODY_CHARACTERS - EMPTY_JSON_BODY.length);

    expect((await postJson(`${base}/api/echo`, JSON.stringify({ text: textAtLimit }))).status).toBe(200);
    const refused = await postJson(`${base}/api/echo`, JSON.stringify({ text: `${textAtLimit}x` }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "Bad request" });
    expect(received).toHaveLength(1);
  });

  it("answers 500 when a handler throws before it responds, and logs the error", async () => {
    const { logger, entries } = capturingLogger();
    const base = await serve(
      {
        method: "GET",
        pattern: "/api/broken",
        handle: async () => {
          throw new Error("broken");
        },
      },
      logger,
    );

    const response = await fetch(`${base}/api/broken`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
    expect(entries.filter(({ event }) => event === "request.failed")).toEqual([
      expect.objectContaining({ level: "ERROR", path: "/api/broken", error: expect.objectContaining({ message: "broken" }) }),
    ]);
  });

  it("ends the stream when it throws after it has started, keeping what was sent", async () => {
    const { logger, entries } = capturingLogger();
    const base = await serve(
      {
        method: "GET",
        pattern: "/api/stream",
        handle: async () => async (sink) => {
          sink.send("append", { at: 0, text: "Every room ", progress: 0.1 });
          throw new Error("broken mid-stream");
        },
      },
      logger,
    );

    const response = await fetch(`${base}/api/stream`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe('event: append\ndata: {"at":0,"text":"Every room ","progress":0.1}\n\n');
    expect(entries.filter(({ event }) => event === "request.failed")).toHaveLength(1);
  });
});

describe("an event stream", () => {
  it("sends a comment every heartbeat while it is open, and none once it has ended", async () => {
    const heartbeatMs = 20;
    const base = await serve(
      {
        method: "GET",
        pattern: "/api/stream",
        handle: async () => async (sink) => {
          await sleep(heartbeatMs * 6);
          sink.send("written", {});
        },
      },
      silentLogger,
      { eventStreamHeartbeatMs: heartbeatMs },
    );

    const text = await (await fetch(`${base}/api/stream`)).text();
    const [beforeEnd, afterEnd] = text.split("event: written\ndata: {}\n\n");
    expect(beforeEnd).toMatch(/^(: heartbeat\n\n){2,}$/);
    expect(afterEnd).toBe("");
  });
});

describe("the built app, when the adapter serves one", () => {
  const INDEX = "<!doctype html><title>RTFM</title>";
  const SCRIPT = "console.log('rtfm');";
  const listsManuals: Route = { method: "GET", pattern: "/api/manuals", handle: async () => ({ status: 200, body: [] }) };

  async function serveApp(currentDigest?: CurrentDigest) {
    const parent = await tempDataDir();
    const appDir = path.join(parent, "dist");
    await mkdir(path.join(appDir, "assets"), { recursive: true });
    await writeFile(path.join(appDir, "index.html"), INDEX);
    await writeFile(path.join(appDir, "assets", "index-a1b2.js"), SCRIPT);
    await writeFile(path.join(parent, "secret.txt"), "not the app's");
    return serve(listsManuals, silentLogger, { appDir }, currentDigest);
  }

  it("serves index.html for the root and every page route, never cached", async () => {
    const base = await serveApp();
    for (const page of ["/", "/read/the-haunt-that-listens", "/read/the-haunt-that-listens/sensing-the-guest"]) {
      const response = await fetch(`${base}${page}`);
      expect(response.status, page).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(await response.text()).toBe(INDEX);
    }
  });

  it("serves an asset with its type, cached for good, and a missing one as 404", async () => {
    const base = await serveApp();
    const script = await fetch(`${base}/assets/index-a1b2.js`);
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(script.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await script.text()).toBe(SCRIPT);
    expect((await fetch(`${base}/assets/index-gone.js`)).status).toBe(404);
  });

  it("answers HEAD without a body, and any other method with 404", async () => {
    const base = await serveApp();
    const head = await fetch(`${base}/`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(404);
  });

  it("never serves a file outside its folder", async () => {
    const base = await serveApp();
    const response = await fetch(`${base}/..%2fsecret.txt`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("not the app's");
  });

  it("answers a path with a NUL in it with 404, not 500", async () => {
    const { logger, entries } = capturingLogger();
    const parent = await tempDataDir();
    await writeFile(path.join(parent, "index.html"), INDEX);
    const base = await serve(listsManuals, logger, { appDir: parent });
    for (const nul of ["/%00", "/index.html%00", "/assets/%00.js"]) {
      expect((await fetch(`${base}${nul}`)).status, nul).toBe(404);
    }
    expect(entries.filter(({ level }) => level === "ERROR")).toEqual([]);
  });

  it("leaves /api to the routes, and the passcode to /api alone", async () => {
    const base = await serveApp(async () => passcodeDigest("copper lantern tidal owl"));
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect((await fetch(`${base}/api/manuals`)).status).toBe(401);
    expect((await fetch(`${base}/api/elsewhere`)).status).toBe(401);
  });

  it("refuses another site's Origin, as the API does", async () => {
    const base = await serveApp();
    expect((await fetch(`${base}/`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
  });
});

describe("the passcode gate", () => {
  const DIGEST = passcodeDigest("copper lantern tidal owl");

  function countedRoute() {
    const handle = vi.fn(async () => ({ status: 200, body: [] }));
    return { route: { method: "GET", pattern: "/api/manuals", handle } satisfies Route, handle };
  }

  it("answers 500 when the digest can't be read, never runs the route, and reads again for the next request", async () => {
    const { route, handle } = countedRoute();
    const read = vi.fn<CurrentDigest>().mockRejectedValueOnce(new Error("DynamoDB is down")).mockResolvedValue(DIGEST);
    const { logger, entries } = capturingLogger();
    const base = await serve(route, logger, {}, cachedDigest(read, () => 0));
    const withCookie = { headers: { cookie: `rtfm_passcode=${DIGEST}` } };

    const failed = await fetch(`${base}/api/manuals`, withCookie);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Internal error" });
    expect(handle).not.toHaveBeenCalled();
    expect(entries.map(({ event }) => event)).toContain("request.failed");

    expect((await fetch(`${base}/api/manuals`, withCookie)).status).toBe(200);
    expect(read).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("refuses a cookie without a digest's form with 401, without reading the digest", async () => {
    const { route, handle } = countedRoute();
    const read = vi.fn<CurrentDigest>(async () => DIGEST);
    const base = await serve(route, silentLogger, {}, read);

    for (const cookie of ["rtfm_passcode=copper", `rtfm_passcode=${DIGEST.toUpperCase()}`, `rtfm_passcode=${DIGEST}0`, "other=1"]) {
      expect((await fetch(`${base}/api/manuals`, { headers: { cookie } })).status, cookie).toBe(401);
    }
    expect(read).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });
});
