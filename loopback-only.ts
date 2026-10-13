import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DNS_FUNCTION = /^(lookup|resolve|reverse)/;
const HOSTS_FILE_FUNCTION = /^lookup/;
const GUARD = Symbol.for("rtfm.loopback-only");

type Reporting = "process" | "tests";

interface Guard {
  reporting: Reporting;
  blockedTargets: string[];
}

// One guard per process, on globalThis, because a Vitest worker loads this module twice: once
// preloaded through NODE_OPTIONS, and once as Vitest's own copy for vitest.setup.ts.
const shared = globalThis as { [GUARD]?: Guard };

function guard(): Guard {
  return shared[GUARD]!;
}

function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

function block(target: string, code: "ECONNREFUSED" | "ENOTFOUND"): Error {
  const message = `Blocked ${target}: tests may reach only loopback (127.0.0.1, ::1, localhost).`;
  const { reporting, blockedTargets } = guard();
  blockedTargets.push(target);
  if (reporting === "process") process.stderr.write(`${message}\n`);
  return Object.assign(new Error(message), { code });
}

/** `connect`'s options and callback, or its port and host. Node's own callers pass them as one array. */
function connectArguments(connectArgs: unknown[]): unknown[] {
  const [first] = connectArgs;
  return Array.isArray(first) ? first : connectArgs;
}

function remoteHost(connectArgs: unknown[]): string | undefined {
  const [options, hostAfterPort] = connectArguments(connectArgs);
  if (typeof options === "object" && options !== null) {
    const { host, path } = options as net.TcpNetConnectOpts & net.IpcNetConnectOpts;
    return path ? undefined : host || "localhost";
  }
  const isPort = typeof options === "number" || (typeof options === "string" && /^\d+$/.test(options));
  if (!isPort) return undefined;
  return typeof hostAfterPort === "string" ? hostAfterPort : "localhost";
}

function failWhileConnecting(socket: net.Socket, error: Error): net.Socket {
  // A connecting socket holds writes until it connects, so the caller sees this error, not a write's.
  (socket as { connecting: boolean }).connecting = true;
  setImmediate(() => socket.destroy(error));
  return socket;
}

/** Fails a lookup that answers with an address beyond loopback, so Node connects to nothing. */
function loopbackOnlyLookup(lookup: net.LookupFunction): net.LookupFunction {
  return (hostname, options, callback) =>
    lookup(hostname, options, (error, answer, family) => {
      const addresses = Array.isArray(answer) ? answer.map(({ address }) => address) : [answer];
      const beyondLoopback = addresses.find((address) => typeof address === "string" && !isLoopback(address));
      if (error || beyondLoopback === undefined) return callback(error, answer, family);
      callback(block(`a connection to ${beyondLoopback}, looked up for ${hostname}`, "ECONNREFUSED"), []);
    });
}

/** A socket's own `lookup` (from `net`, `tls` or undici's `connect`) skips the guarded `dns.lookup`. */
function withLoopbackOnlyLookup(connectArgs: unknown[]): unknown[] {
  const [options, callback] = connectArguments(connectArgs);
  const lookup = (options as net.TcpNetConnectOpts | undefined)?.lookup;
  if (typeof lookup !== "function") return connectArgs;
  return [{ ...(options as object), lookup: loopbackOnlyLookup(lookup) }, callback];
}

function guardSockets(): void {
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const host = remoteHost(args);
    if (host === undefined || isLoopback(host)) return Reflect.apply(connect, this, withLoopbackOnlyLookup(args));
    return failWhileConnecting(this, block(`a connection to ${host}`, "ECONNREFUSED"));
  } as typeof connect;
}

/** A `lookup` of an address returns the address itself, as when a server listens on `0.0.0.0`. */
function answersWithoutNameserver(dnsFunction: string, hostname: unknown): boolean {
  if (typeof hostname !== "string") return false;
  if (dnsFunction === "lookup" && net.isIP(hostname) !== 0) return true;
  return HOSTS_FILE_FUNCTION.test(dnsFunction) && isLoopback(hostname);
}

function guardDns(api: object): void {
  const functions = api as Record<string, (...args: unknown[]) => unknown>;
  for (const name of Object.getOwnPropertyNames(api).filter((key) => DNS_FUNCTION.test(key))) {
    const original = functions[name];
    functions[name] = function (this: unknown, ...args: unknown[]) {
      const [hostname] = args;
      if (answersWithoutNameserver(name, hostname)) return Reflect.apply(original, this, args);
      const error = block(`a DNS ${name} of ${String(hostname)}`, "ENOTFOUND");
      const callback = args.at(-1);
      if (typeof callback === "function") return void process.nextTick(callback, error);
      return Promise.reject(error);
    };
  }
}

function failExitIfBlocked(): void {
  if (guard().blockedTargets.length > 0 && !process.exitCode) process.exitCode = 1;
}

/** Blocks every connection and DNS query beyond this machine, for the rest of the process. */
export function installLoopbackOnly(): void {
  if (shared[GUARD]) return;
  shared[GUARD] = { reporting: "process", blockedTargets: [] };
  guardSockets();
  for (const api of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) guardDns(api);
  syncBuiltinESMExports();
  process.on("exit", failExitIfBlocked);
}

export function reportBlockedTo(reporting: Reporting): void {
  guard().reporting = reporting;
}

/** The targets blocked since the last call, which are then no longer counted against the process. */
export function takeBlockedTargets(): string[] {
  return guard().blockedTargets.splice(0);
}

installLoopbackOnly();
