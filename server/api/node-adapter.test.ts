import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { silentLogger, type Logger } from "../logging/logger.ts";
import { capturingLogger } from "../testing.ts";
import { createRequestHandler } from "./node-adapter.ts";
import type { ApiRequest, Route } from "./route.ts";

const MAX_BODY_CHARACTERS = 256 * 1024;
const EMPTY_JSON_BODY = JSON.stringify({ text: "" });

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  vi.restoreAllMocks();
});

async function serve(route: Route, logger: Logger = silentLogger): Promise<string> {
  const server = createServer(createRequestHandler([route], logger));
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
