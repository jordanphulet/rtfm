import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "../logging/logger.ts";
import { readAppFile, type AppFile } from "./app-files.ts";
import type { Gate } from "./gate.ts";
import { badRequest, notFound, type Cookie, type EventStream, type JsonResponse, type Route } from "./route.ts";

const MAX_BODY_CHARACTERS = 256 * 1024;
const MAX_LOGGED_CHARACTERS = 300;
export const LOOPBACK_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
export const LOOPBACK_ORIGINS = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const EVENT_STREAM_HEARTBEAT = ": heartbeat\n\n";

/** What the adapter checks and serves besides the routes. */
export interface AdapterConfig {
  /** The `Host`s the server answers: its own names (`server/api/README.md` › Only the app's own pages). */
  allowedHosts: RegExp;
  /** The `Origin`s the server answers when a request sends one: the app's own pages. */
  allowedOrigins: RegExp;
  /** The built app (`dist/`) to serve beside the API; undefined when Vite serves it. */
  appDir: string | undefined;
  /** How often an event stream sends a comment, so no proxy in front of the server sees it fall silent. */
  eventStreamHeartbeatMs: number;
}

type RequestFields = { requestId: string; method: string | undefined; path: string; libraryId?: string };

const hostNotAllowed: JsonResponse = { status: 403, body: { error: "Host not allowed" } };
const originNotAllowed: JsonResponse = { status: 403, body: { error: "Origin not allowed" } };
const notJson: JsonResponse = { status: 415, body: { error: "Body must be application/json" } };

class Refused extends Error {
  readonly response: JsonResponse;

  constructor(response: JsonResponse) {
    super((response.body as { error: string }).error);
    this.response = response;
  }
}

/**
 * Checks each request, and answers it with the route it matches: one of the gate's own, or, once
 * the gate has let it into its library, one of `routes`.
 */
export function createRequestHandler(routes: Route[], logger: Logger, config: AdapterConfig, gate: Gate) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const startedAt = performance.now();
    const logged: RequestFields = { requestId: randomUUID(), method: request.method, path: pathOf(request) };
    const controller = new AbortController();
    response.on("close", () => {
      controller.abort();
      logRequest(logger, response, logged, startedAt);
    });
    try {
      refuseOtherSites(request, config);
      const url = new URL(request.url ?? "/", "http://localhost");
      if (config.appDir !== undefined && !isApiPath(url.pathname)) {
        return writeAppFile(response, request.method, await readAppFile(config.appDir, url.pathname));
      }
      const ungated = matchRoute(gate.routes, request.method, url.pathname);
      if (ungated) {
        const answer = await ungated.route.handle({ body: await readJsonBody(request) });
        return writeJson(response, answer, request.headers.host);
      }

      const admission = await gate.admit(request);
      if ("refusal" in admission) throw new Refused(admission.refusal);
      const { library, renewal } = admission;
      logged.libraryId = library.libraryId;
      if (renewal) setCookies(response, [renewal], request.headers.host);
      const body = await readJsonBody(request);
      const match = matchRoute(routes, request.method, url.pathname);
      if (!match) return writeJson(response, notFound);

      const result = await match.route.handle({
        params: match.params,
        query: url.searchParams,
        body,
        signal: controller.signal,
        library,
      });
      if (typeof result === "function") await writeEvents(response, result, config.eventStreamHeartbeatMs);
      else writeJson(response, result, request.headers.host);
    } catch (error) {
      if (error instanceof Refused) {
        const fields = { ...logged, status: error.response.status, ...headersOf(request) };
        logger.warn("request.refused", error.message, fields);
        return writeJson(response, error.response);
      }
      logger.error("request.failed", `${logged.method} ${logged.path} failed`, logged, error);
      if (response.headersSent) response.end();
      else writeJson(response, { status: 500, body: { error: "Internal error" } });
    }
  };
}

/** The path without its query, which is never logged. */
function pathOf(request: IncomingMessage): string {
  return (request.url ?? "/").split("?")[0].slice(0, MAX_LOGGED_CHARACTERS);
}

/** One line per request once its response closes; `clientClosed` when the client left before it ended. */
function logRequest(logger: Logger, response: ServerResponse, logged: RequestFields, startedAt: number) {
  const status = response.headersSent ? response.statusCode : undefined;
  const log = status !== undefined && status >= 500 ? logger.warn : logger.info;
  log("request", `${logged.method} ${logged.path} ${status ?? "closed"}`, {
    ...logged,
    status,
    durationMs: Math.round(performance.now() - startedAt),
    clientClosed: response.writableFinished ? undefined : true,
  });
}

/** The refused request's Host and Origin, cut short: they name a site, never a secret. */
function headersOf(request: IncomingMessage) {
  const { host, origin } = request.headers;
  return { host: host?.slice(0, MAX_LOGGED_CHARACTERS), origin: origin?.slice(0, MAX_LOGGED_CHARACTERS) };
}

/**
 * Only the app's own pages may use the server: the Host must be one of the server's own names,
 * which stops DNS rebinding, and an Origin, when the browser sends one, must be one of the app's.
 */
function refuseOtherSites(request: IncomingMessage, { allowedHosts, allowedOrigins }: AdapterConfig) {
  const { host, origin } = request.headers;
  if (!host || !allowedHosts.test(host)) throw new Refused(hostNotAllowed);
  if (origin !== undefined && !allowedOrigins.test(origin)) throw new Refused(originNotAllowed);
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** An API cookie: script can't read it, other sites never send it, only `/api` gets it, and off this machine only HTTPS. */
export function setCookieHeader({ name, value, maxAgeSeconds }: Cookie, host: string | undefined): string {
  const maxAge = maxAgeSeconds === undefined ? "" : `; Max-Age=${maxAgeSeconds}`;
  const secure = LOOPBACK_HOSTS.test(host ?? "") ? "" : "; Secure";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/api${maxAge}${secure}`;
}

/** Each cookie as its own `Set-Cookie` header. */
function setCookies(response: ServerResponse, cookies: Cookie[], host: string | undefined) {
  response.setHeader("set-cookie", cookies.map((cookie) => setCookieHeader(cookie, host)));
}

function matchRoute<R extends { method: string; pattern: string }>(routes: R[], method: string | undefined, pathname: string) {
  const pathParts = pathname.split("/");
  for (const route of routes) {
    if (route.method !== method) continue;
    const patternParts = route.pattern.split("/");
    if (patternParts.length !== pathParts.length) continue;
    const params: Record<string, string> = {};
    const matches = patternParts.every((part, index) => {
      if (!part.startsWith(":")) return part === pathParts[index];
      const value = decodedOrUndefined(pathParts[index]);
      if (value !== undefined) params[part.slice(1)] = value;
      return value !== undefined;
    });
    if (matches) return { route, params };
  }
  return undefined;
}

/**
 * The request's JSON body, or undefined when it has none. A body must be sent as
 * application/json, which a page on another site can't send without a CORS preflight.
 */
async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request.setEncoding("utf8")) {
    text += chunk;
    if (text.length > MAX_BODY_CHARACTERS) throw new Refused(badRequest);
  }
  if (text === "") return undefined;
  if (!isJson(request.headers["content-type"])) throw new Refused(notJson);
  try {
    return JSON.parse(text);
  } catch {
    throw new Refused(badRequest);
  }
}

function isJson(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  return mediaType === "application/json";
}

function decodedOrUndefined(pathPart: string): string | undefined {
  try {
    return decodeURIComponent(pathPart);
  } catch {
    return undefined;
  }
}

function writeJson(response: ServerResponse, { status, body, cookies }: JsonResponse, host?: string) {
  if (cookies) setCookies(response, cookies, host);
  if (body === undefined) {
    response.writeHead(status);
    response.end();
    return;
  }
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function writeEvents(response: ServerResponse, stream: EventStream, heartbeatMs: number) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  response.flushHeaders();
  const heartbeat = setInterval(() => response.write(EVENT_STREAM_HEARTBEAT), heartbeatMs);
  try {
    await stream({
      send: (event, data) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    });
  } finally {
    clearInterval(heartbeat);
  }
  response.end();
}

/** A file of the built app, to `GET` or `HEAD` only; anything else gets `404`. */
function writeAppFile(response: ServerResponse, method: string | undefined, file: AppFile | undefined) {
  if (!file || (method !== "GET" && method !== "HEAD")) return writeJson(response, notFound);
  response.writeHead(200, { "content-type": file.contentType, "cache-control": file.cacheControl });
  response.end(method === "HEAD" ? undefined : file.body);
}
