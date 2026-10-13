import dns from "node:dns";
import { once } from "node:events";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import viteConfig from "./vite.config.ts";
import { throwIfTestReachedOutside } from "./vitest.setup.ts";

const TEST_NET_ADDRESS = "192.0.2.1";
const INVALID_NAME = "example.invalid";
const BLOCKED = /tests may reach only loopback/;

async function errorFrom(emitter: NodeJS.EventEmitter): Promise<Error> {
  const [error] = await once(emitter, "error");
  return error;
}

function expectRefused(error: unknown): void {
  expect(error).toMatchObject({ code: "ECONNREFUSED", message: expect.stringMatching(BLOCKED) });
}

function expectNotFound(error: unknown): void {
  expect(error).toMatchObject({ code: "ENOTFOUND", message: expect.stringMatching(BLOCKED) });
}

async function dnsCallbackError(call: (callback: (error: Error | null) => void) => void): Promise<unknown> {
  return new Promise((resolve) => call((error) => resolve(error)));
}

function expectBlocked(...targets: string[]): void {
  let error: unknown;
  try {
    throwIfTestReachedOutside();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(`beyond this machine: ${targets.join(", ")}.`);
}

async function withHappyDomWindow<T>(url: string, use: (window: Window) => Promise<T>): Promise<T> {
  const window = new Window({ url });
  try {
    return await use(window);
  } finally {
    await window.happyDOM.close();
  }
}

async function startServer(host: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_request, response) => response.end("ok"));
  server.listen(0, host);
  await once(server, "listening");
  const { port } = server.address() as net.AddressInfo;
  const urlHost = host.includes(":") ? `[${host}]` : host;
  return {
    url: `http://${urlHost}:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function bodyOf(response: http.IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of response) body += chunk;
  return body;
}

describe("the loopback-only guard", () => {
  it("runs before every test file", () => {
    expect(viteConfig.test?.setupFiles).toEqual(["./vitest.setup.ts"]);
  });

  it("fails fetch to another address or name", async () => {
    const toAddress = await fetch(`http://${TEST_NET_ADDRESS}/`).catch((error: Error) => error);
    const toName = await fetch(`https://${INVALID_NAME}/`).catch((error: Error) => error);
    expectRefused((toAddress as Error).cause);
    expectRefused((toName as Error).cause);
    expectBlocked(`a connection to ${TEST_NET_ADDRESS}`, `a connection to ${INVALID_NAME}`);
  });

  it("fails happy-dom's fetch to another address", async () => {
    await withHappyDomWindow("http://localhost:3000/", async (window) => {
      await expect(window.fetch(`http://${TEST_NET_ADDRESS}/`)).rejects.toThrow(BLOCKED);
    });
    expectBlocked(`a connection to ${TEST_NET_ADDRESS}`);
  });

  it("fails node:http and node:https requests to another address or name", async () => {
    expectRefused(await errorFrom(http.get(`http://${TEST_NET_ADDRESS}/`)));
    expectRefused(await errorFrom(http.get(`http://${INVALID_NAME}/`)));
    expectRefused(await errorFrom(https.get(`https://${TEST_NET_ADDRESS}/`)));
    expectBlocked(
      `a connection to ${TEST_NET_ADDRESS}`,
      `a connection to ${INVALID_NAME}`,
      `a connection to ${TEST_NET_ADDRESS}`,
    );
  });

  it("fails node:net and node:tls connections to another address or name", async () => {
    expectRefused(await errorFrom(net.connect(80, TEST_NET_ADDRESS)));
    expectRefused(await errorFrom(net.connect({ host: INVALID_NAME, port: 80 })));
    expectRefused(await errorFrom(net.connect({ path: "", host: TEST_NET_ADDRESS, port: 80 })));
    expectRefused(await errorFrom(tls.connect({ host: TEST_NET_ADDRESS, port: 443 })));
    expectBlocked(
      `a connection to ${TEST_NET_ADDRESS}`,
      `a connection to ${INVALID_NAME}`,
      `a connection to ${TEST_NET_ADDRESS}`,
      `a connection to ${TEST_NET_ADDRESS}`,
    );
  });

  it("fails a DNS lookup of another name", async () => {
    expectNotFound(await dnsCallbackError((callback) => dns.lookup(INVALID_NAME, callback)));
    expectNotFound(await dns.promises.lookup(INVALID_NAME).catch((error: unknown) => error));
    expectBlocked(`a DNS lookup of ${INVALID_NAME}`, `a DNS lookup of ${INVALID_NAME}`);
  });

  it("fails every query to a nameserver, even for localhost", async () => {
    expectNotFound(await dnsCallbackError((callback) => dns.resolve4("localhost", callback)));
    expectNotFound(await dns.promises.resolve4(INVALID_NAME).catch((error: unknown) => error));
    expectNotFound(await new dns.promises.Resolver().resolve4("localhost").catch((error: unknown) => error));
    expectNotFound(await dns.promises.reverse("127.0.0.1").catch((error: unknown) => error));
    expectBlocked(
      "a DNS resolve4 of localhost",
      `a DNS resolve4 of ${INVALID_NAME}`,
      "a DNS resolve4 of localhost",
      "a DNS reverse of 127.0.0.1",
    );
  });

  it("fails the test even when the code under test swallows the error", async () => {
    await fetch(`http://${TEST_NET_ADDRESS}/`).catch(() => {});
    expectBlocked(`a connection to ${TEST_NET_ADDRESS}`);
  });

  it("lets every path reach a server on 127.0.0.1", async () => {
    const server = await startServer("127.0.0.1");
    try {
      expect(await (await fetch(server.url)).text()).toBe("ok");
      const happyDomBody = await withHappyDomWindow(server.url, async (window) => (await window.fetch(server.url)).text());
      expect(happyDomBody).toBe("ok");
      const [response] = await once(http.get(server.url), "response");
      expect(await bodyOf(response)).toBe("ok");
      const socket = net.connect(Number(new URL(server.url).port), "127.0.0.1");
      await once(socket, "connect");
      socket.destroy();
    } finally {
      await server.close();
    }
  });

  it("lets localhost and ::1 through", async () => {
    const ipv6 = await startServer("::1");
    const ipv4 = await startServer("127.0.0.1");
    try {
      expect(await (await fetch(ipv4.url.replace("127.0.0.1", "localhost"))).text()).toBe("ok");
      expect(await (await fetch(ipv6.url)).text()).toBe("ok");
      expect(await dns.promises.lookup("localhost")).toMatchObject({ address: expect.any(String) });
      expect(await dns.promises.lookupService("127.0.0.1", 80)).toMatchObject({ hostname: expect.any(String) });
    } finally {
      await Promise.all([ipv4.close(), ipv6.close()]);
    }
  });
});
