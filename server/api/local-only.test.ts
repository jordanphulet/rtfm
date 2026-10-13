import { request as httpRequest, type OutgoingHttpHeaders } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { fakeLibrarianModel, INSTANT_PACE } from "../agent/librarian/fake-model.ts";
import { fakePlan } from "../agent/planner/fake-planner.ts";
import { startServer, type RunningServer } from "../app.ts";
import { config } from "../config.ts";
import { recordingWriter, SAMPLE_ID, tempDataDir, UNWRITTEN_ID } from "../testing.ts";

const TREEHOUSE_REQUEST = "Let’s start a new manual about building a treehouse";
const TREEHOUSE_ID = fakePlan(TREEHOUSE_REQUEST).id;
const TREEHOUSE_BODY = JSON.stringify({ messages: [{ role: "user", text: TREEHOUSE_REQUEST }] });
const SAMPLE_PATH = `/api/manuals/${SAMPLE_ID}`;
const STREAM_PATH = `${SAMPLE_PATH}/sections/${UNWRITTEN_ID}/stream`;

const OTHER_SITES = [
  "https://evil.example",
  "http://evil.example:5173",
  "http://localhost.evil.example:5173",
  "https://localhost:5173",
  "null",
];

const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start() {
  const writer = recordingWriter();
  const server = await startServer(
    { ...config, port: 0, dataDir: await tempDataDir(), models: "fake", passcode: undefined },
    { writer, librarian: fakeLibrarianModel(INSTANT_PACE) },
  );
  servers.push(server);

  /** Sends exactly these headers, Host included, which fetch won't let a caller set. */
  function send(method: string, path: string, headers: OutgoingHttpHeaders = {}, body?: string) {
    return new Promise<{ status: number; contentType?: string; text: string }>((resolve, reject) => {
      const sent = httpRequest({ host: "127.0.0.1", port: server.port, method, path, headers, setHost: false });
      sent.on("error", reject);
      sent.on("response", async (response) => {
        let text = "";
        for await (const chunk of response.setEncoding("utf8")) text += chunk;
        resolve({ status: response.statusCode!, contentType: response.headers["content-type"], text });
      });
      sent.end(body);
    });
  }

  const ownHost = { host: `127.0.0.1:${server.port}` };
  const manualIds = async () =>
    (JSON.parse((await send("GET", "/api/manuals", ownHost)).text) as { id: string }[]).map(({ id }) => id);

  return { port: server.port, writer, send, ownHost, manualIds };
}

describe("the page's own requests", () => {
  it("pass with any localhost Host, as the browser or Vite's proxy sends it", async () => {
    const { port, send } = await start();
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, "localhost:5173", "localhost"];
    for (const host of hosts) expect((await send("GET", "/api/manuals", { host })).status, host).toBe(200);
  });

  it("pass with a localhost Origin", async () => {
    const { send, ownHost } = await start();
    const origins = ["http://localhost:5173", "http://127.0.0.1:5174", "http://[::1]:4173", "http://localhost"];
    for (const origin of origins) {
      expect((await send("GET", "/api/manuals", { ...ownHost, origin })).status, origin).toBe(200);
    }
  });

  it("stream a section to an EventSource, which sends no Origin on a same-origin GET", async () => {
    const { send, writer } = await start();
    const response = await send("GET", STREAM_PATH, { host: "localhost:5173", accept: "text/event-stream" });

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/event-stream");
    expect(response.text).toMatch(/event: written\ndata: \{\}\n\n$/);
    expect(writer.signals).toHaveLength(1);
  });

  it("ask the librarian with application/json, charset included", async () => {
    const { send, ownHost, manualIds } = await start();
    const headers = { ...ownHost, origin: "http://localhost:5173", "content-type": "application/json; charset=utf-8" };
    const response = await send("POST", "/api/librarian", headers, TREEHOUSE_BODY);

    expect(response.status).toBe(200);
    expect(await manualIds()).toContain(TREEHOUSE_ID);
  });

  it("delete with no body and no content type", async () => {
    const { send, ownHost } = await start();
    const response = await send("DELETE", SAMPLE_PATH, { ...ownHost, origin: "http://localhost:5173" });
    expect(response.status).toBe(204);
  });
});

describe("requests from anywhere else", () => {
  it("are refused with 403 when the Host isn't this machine, before any route runs", async () => {
    const { port, send, manualIds } = await start();
    const hosts = [`evil.example:${port}`, "localhost.evil.example", "127.0.0.1.nip.io", `192.168.1.20:${port}`];
    for (const host of hosts) {
      const response = await send("DELETE", SAMPLE_PATH, { host });
      expect(response.status, host).toBe(403);
      expect(JSON.parse(response.text)).toEqual({ error: "Host not allowed" });
    }
    expect((await send("DELETE", SAMPLE_PATH)).status, "no Host, which Node itself refuses").toBe(400);
    expect(await manualIds()).toContain(SAMPLE_ID);
  });

  it("are refused with 403 when the Origin is another site, before any route runs", async () => {
    const { send, ownHost, manualIds } = await start();
    for (const origin of OTHER_SITES) {
      const response = await send("DELETE", SAMPLE_PATH, { ...ownHost, origin });
      expect(response.status, origin).toBe(403);
      expect(JSON.parse(response.text)).toEqual({ error: "Origin not allowed" });
    }
    expect(await manualIds()).toContain(SAMPLE_ID);
  });

  it("can't start writing a section from another site's EventSource or fetch", async () => {
    const { send, ownHost, writer } = await start();
    for (const origin of OTHER_SITES) {
      expect((await send("GET", STREAM_PATH, { ...ownHost, origin })).status, origin).toBe(403);
    }
    expect(writer.signals).toHaveLength(0);
  });

  it("can't ask the librarian from another site, even with a JSON body", async () => {
    const { send, ownHost, manualIds } = await start();
    const headers = { ...ownHost, origin: "https://evil.example", "content-type": "application/json" };
    expect((await send("POST", "/api/librarian", headers, TREEHOUSE_BODY)).status).toBe(403);
    expect(await manualIds()).not.toContain(TREEHOUSE_ID);
  });
});

describe("a body that isn't JSON", () => {
  it("is refused with 415, before any route runs, so a form or text/plain POST creates nothing", async () => {
    const { send, ownHost, manualIds } = await start();
    const contentTypes = [
      "text/plain",
      "text/plain;charset=UTF-8",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      undefined,
    ];
    for (const contentType of contentTypes) {
      const headers = contentType ? { ...ownHost, "content-type": contentType } : ownHost;
      const response = await send("POST", "/api/librarian", headers, TREEHOUSE_BODY);
      expect(response.status, contentType).toBe(415);
      expect(JSON.parse(response.text)).toEqual({ error: "Body must be application/json" });
    }
    expect((await send("POST", "/api/elsewhere", { ...ownHost, "content-type": "text/plain" }, "{}")).status).toBe(415);
    expect(await manualIds()).not.toContain(TREEHOUSE_ID);
  });
});
