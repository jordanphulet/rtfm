import { spawnSync } from "node:child_process";
import dns from "node:dns";
import { once } from "node:events";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { installLoopbackOnly, takeBlockedTargets } from "./loopback-only.ts";

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

/** A socket's `lookup` option that answers every name with `address`, in either shape Node asks for. */
function lookupAnswering(address: string): net.LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
}

/** Node refuses to connect to these addresses itself, so a test sends nothing even if the guard fails. */
function neverConnectingTo(address: string): net.BlockList {
  const blockList = new net.BlockList();
  blockList.addAddress(address);
  return blockList;
}

/** Runs an ES module in a child Node process, which inherits the test's NODE_OPTIONS. */
function runNode(source: string) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], { encoding: "utf8" });
}

describe("the loopback-only guard", () => {
  it("fails fetch to another address or name", async () => {
    const toAddress = await fetch(`http://${TEST_NET_ADDRESS}/`).catch((error: Error) => error);
    const toName = await fetch(`https://${INVALID_NAME}/`).catch((error: Error) => error);
    expectRefused((toAddress as Error).cause);
    expectRefused((toName as Error).cause);
    expect(takeBlockedTargets()).toEqual([`a connection to ${TEST_NET_ADDRESS}`, `a connection to ${INVALID_NAME}`]);
  });

  it("fails happy-dom's fetch to another address", async () => {
    await withHappyDomWindow("http://localhost:3000/", async (window) => {
      await expect(window.fetch(`http://${TEST_NET_ADDRESS}/`)).rejects.toThrow(BLOCKED);
    });
    expect(takeBlockedTargets()).toEqual([`a connection to ${TEST_NET_ADDRESS}`]);
  });

  it("fails node:http and node:https requests to another address or name", async () => {
    expectRefused(await errorFrom(http.get(`http://${TEST_NET_ADDRESS}/`)));
    expectRefused(await errorFrom(http.get(`http://${INVALID_NAME}/`)));
    expectRefused(await errorFrom(https.get(`https://${TEST_NET_ADDRESS}/`)));
    expect(takeBlockedTargets()).toEqual([
      `a connection to ${TEST_NET_ADDRESS}`,
      `a connection to ${INVALID_NAME}`,
      `a connection to ${TEST_NET_ADDRESS}`,
    ]);
  });

  it("fails node:net and node:tls connections to another address or name", async () => {
    expectRefused(await errorFrom(net.connect(80, TEST_NET_ADDRESS)));
    expectRefused(await errorFrom(net.connect({ host: INVALID_NAME, port: 80 })));
    expectRefused(await errorFrom(net.connect({ path: "", host: TEST_NET_ADDRESS, port: 80 })));
    expectRefused(await errorFrom(tls.connect({ host: TEST_NET_ADDRESS, port: 443 })));
    expect(takeBlockedTargets()).toEqual([
      `a connection to ${TEST_NET_ADDRESS}`,
      `a connection to ${INVALID_NAME}`,
      `a connection to ${TEST_NET_ADDRESS}`,
      `a connection to ${TEST_NET_ADDRESS}`,
    ]);
  });

  it("fails a connection whose own lookup answers localhost with another address", async () => {
    const options = {
      host: "localhost",
      lookup: lookupAnswering(TEST_NET_ADDRESS),
      blockList: neverConnectingTo(TEST_NET_ADDRESS),
    };
    expectRefused(await errorFrom(net.connect({ ...options, port: 80 })));
    expectRefused(await errorFrom(net.connect({ ...options, port: 80, autoSelectFamily: false })));
    expect(takeBlockedTargets()).toEqual(Array(2).fill(`a connection to ${TEST_NET_ADDRESS}, looked up for localhost`));
  });

  it("lets a connection to localhost through, with or without its own lookup", async () => {
    const server = await startServer("127.0.0.1");
    const port = Number(new URL(server.url).port);
    try {
      for (const lookup of [undefined, lookupAnswering("127.0.0.1")]) {
        const socket = net.connect({ host: "localhost", port, lookup });
        await once(socket, "connect");
        socket.destroy();
      }
    } finally {
      await server.close();
    }
  });

  it("fails a DNS lookup of another name", async () => {
    expectNotFound(await dnsCallbackError((callback) => dns.lookup(INVALID_NAME, callback)));
    expectNotFound(await dns.promises.lookup(INVALID_NAME).catch((error: unknown) => error));
    expect(takeBlockedTargets()).toEqual([`a DNS lookup of ${INVALID_NAME}`, `a DNS lookup of ${INVALID_NAME}`]);
  });

  it("fails every query to a nameserver, even for localhost", async () => {
    expectNotFound(await dnsCallbackError((callback) => dns.resolve4("localhost", callback)));
    expectNotFound(await dns.promises.resolve4(INVALID_NAME).catch((error: unknown) => error));
    expectNotFound(await new dns.promises.Resolver().resolve4("localhost").catch((error: unknown) => error));
    expectNotFound(await dns.promises.reverse("127.0.0.1").catch((error: unknown) => error));
    expect(takeBlockedTargets()).toEqual([
      "a DNS resolve4 of localhost",
      `a DNS resolve4 of ${INVALID_NAME}`,
      "a DNS resolve4 of localhost",
      "a DNS reverse of 127.0.0.1",
    ]);
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

  it("lets a lookup of an address through, since no nameserver answers it", async () => {
    expect(await dns.promises.lookup("0.0.0.0")).toEqual({ address: "0.0.0.0", family: 4 });
    expect(await dns.promises.lookup("::")).toEqual({ address: "::", family: 6 });
    expect(await dns.promises.lookup(TEST_NET_ADDRESS)).toEqual({ address: TEST_NET_ADDRESS, family: 4 });
    expectRefused(await errorFrom(net.connect(80, TEST_NET_ADDRESS)));
    expect(takeBlockedTargets()).toEqual([`a connection to ${TEST_NET_ADDRESS}`]);
  });

  it("installs once, however many times it is loaded or installed", () => {
    expect(process.env.NODE_OPTIONS).toContain(`--import=${new URL("./loopback-only.ts", import.meta.url).href}`);
    const connect = net.Socket.prototype.connect;
    const lookup = dns.lookup;
    const exitListeners = process.listenerCount("exit");
    installLoopbackOnly();
    expect(net.Socket.prototype.connect).toBe(connect);
    expect(dns.lookup).toBe(lookup);
    expect(process.listenerCount("exit")).toBe(exitListeners);
  });
});

describe("the loopback-only guard in a child Node process", () => {
  it("refuses a connection beyond this machine, names it on stderr, and exits with code 1", () => {
    const child = runNode(`
      import net from "node:net";
      net.connect(80, "${TEST_NET_ADDRESS}").on("error", (error) => console.log(error.code));
    `);
    expect(child.stdout).toBe("ECONNREFUSED\n");
    const escapedAddress = TEST_NET_ADDRESS.replaceAll(".", "\\.");
    expect(child.stderr).toMatch(new RegExp(`^Blocked a connection to ${escapedAddress}: tests may reach only loopback`));
    expect(child.status).toBe(1);
  });

  it("refuses a DNS lookup through node:dns's named exports", () => {
    const child = runNode(`
      import { lookup } from "node:dns/promises";
      await lookup("${INVALID_NAME}").catch((error) => console.log(error.code));
    `);
    expect(child.stdout).toBe("ENOTFOUND\n");
    expect(child.stderr).toContain(`Blocked a DNS lookup of ${INVALID_NAME}`);
    expect(child.status).toBe(1);
  });

  it("exits with code 1 even when the child swallows the error and exits with 0", () => {
    const child = runNode(`
      import net from "node:net";
      net.connect(80, "${TEST_NET_ADDRESS}").on("error", () => process.exit(0));
    `);
    expect(child.stderr).toContain(`Blocked a connection to ${TEST_NET_ADDRESS}`);
    expect(child.status).toBe(1);
  });

  it("lets a child reach loopback, with nothing on stderr and exit code 0", () => {
    const child = runNode(`
      import http from "node:http";
      const server = http.createServer((_request, response) => response.end("ok")).listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const response = await fetch(\`http://localhost:\${server.address().port}/\`);
      console.log(await response.text());
      server.close();
      server.closeAllConnections();
    `);
    expect(child).toMatchObject({ stdout: "ok\n", stderr: "", status: 0 });
  });
});
