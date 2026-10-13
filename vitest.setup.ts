import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import { afterAll, afterEach } from "vitest";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DNS_FUNCTION = /^(lookup|resolve|reverse)/;
const HOSTS_FILE_FUNCTION = /^lookup/;

const blockedTargets: string[] = [];
const restorers: (() => void)[] = [];

function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

function block(target: string, code: "ECONNREFUSED" | "ENOTFOUND"): Error {
  blockedTargets.push(target);
  const message = `Blocked ${target}: tests may reach only loopback (127.0.0.1, ::1, localhost).`;
  return Object.assign(new Error(message), { code });
}

export function throwIfTestReachedOutside(): void {
  const targets = blockedTargets.splice(0);
  if (targets.length === 0) return;
  throw new Error(
    `This test tried to reach beyond this machine: ${targets.join(", ")}. ` +
      "Tests may reach only loopback (server/README.md › Tests).",
  );
}

function replace<T extends object, K extends keyof T>(owner: T, key: K, replacement: T[K]): void {
  const original = owner[key];
  owner[key] = replacement;
  restorers.push(() => {
    owner[key] = original;
  });
}

function remoteHost(connectArgs: unknown[]): string | undefined {
  const [first, second] = connectArgs;
  const options = Array.isArray(first) ? first[0] : first;
  if (typeof options === "object" && options !== null) {
    const { host, path } = options as { host?: string; path?: string };
    return path ? undefined : host || "localhost";
  }
  const isPort = typeof options === "number" || (typeof options === "string" && /^\d+$/.test(options));
  if (!isPort) return undefined;
  return typeof second === "string" ? second : "localhost";
}

function failWhileConnecting(socket: net.Socket, error: Error): net.Socket {
  // A connecting socket holds writes until it connects, so the caller sees this error, not a write's.
  (socket as { connecting: boolean }).connecting = true;
  setImmediate(() => socket.destroy(error));
  return socket;
}

function guardSockets(): void {
  const connect = net.Socket.prototype.connect;
  replace(net.Socket.prototype, "connect", function (this: net.Socket, ...args: unknown[]) {
    const host = remoteHost(args);
    if (host === undefined || isLoopback(host)) return Reflect.apply(connect, this, args);
    return failWhileConnecting(this, block(`a connection to ${host}`, "ECONNREFUSED"));
  } as typeof connect);
}

function guardDns(api: object): void {
  const functions = api as Record<string, (...args: unknown[]) => unknown>;
  for (const name of Object.getOwnPropertyNames(api).filter((key) => DNS_FUNCTION.test(key))) {
    const original = functions[name];
    replace(functions, name, function (this: unknown, ...args: unknown[]) {
      const [hostname] = args;
      const readsHostsFile = HOSTS_FILE_FUNCTION.test(name);
      if (readsHostsFile && typeof hostname === "string" && isLoopback(hostname)) {
        return Reflect.apply(original, this, args);
      }
      const error = block(`a DNS ${name} of ${String(hostname)}`, "ENOTFOUND");
      const callback = args.at(-1);
      if (typeof callback === "function") return void process.nextTick(callback, error);
      return Promise.reject(error);
    });
  }
}

guardSockets();
for (const api of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) guardDns(api);
syncBuiltinESMExports();

afterEach(throwIfTestReachedOutside);

afterAll(() => {
  for (const restore of restorers.splice(0).reverse()) restore();
  syncBuiltinESMExports();
  throwIfTestReachedOutside();
});
