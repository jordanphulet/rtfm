import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "../logging/logger.ts";
import { isPasscode, PASSCODE_COOKIE, PASSCODE_PATH, passcodeRequired } from "./passcode.ts";
import { badRequest, notFound, type EventStream, type JsonResponse, type Route } from "./route.ts";

const MAX_BODY_CHARACTERS = 256 * 1024;
const MAX_LOGGED_CHARACTERS = 300;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

type RequestFields = { requestId: string; method: string | undefined; path: string };

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

/** With a `passcode`, every request but `POST /api/passcode` must carry it in its cookie. */
export function createRequestHandler(routes: Route[], logger: Logger, passcode?: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const startedAt = performance.now();
    const logged: RequestFields = { requestId: randomUUID(), method: request.method, path: pathOf(request) };
    const controller = new AbortController();
    response.on("close", () => {
      controller.abort();
      logRequest(logger, response, logged, startedAt);
    });
    try {
      refuseOtherSites(request);
      const url = new URL(request.url ?? "/", "http://localhost");
      if (passcode !== undefined) refuseWithoutPasscode(request, url.pathname, passcode);
      const body = await readJsonBody(request);
      const match = matchRoute(routes, request.method, url.pathname);
      if (!match) return writeJson(response, notFound);

      const result = await match.route.handle({
        params: match.params,
        query: url.searchParams,
        body,
        signal: controller.signal,
      });
      if (typeof result === "function") await writeEvents(response, result);
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
 * Only this machine's own pages may use the API: the Host must name this machine, which stops DNS
 * rebinding, and an Origin, when the browser sends one, must be a page served from this machine.
 */
function refuseOtherSites(request: IncomingMessage) {
  const { host, origin } = request.headers;
  if (!host || !LOCAL_HOST.test(host)) throw new Refused(hostNotAllowed);
  if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) throw new Refused(originNotAllowed);
}

function refuseWithoutPasscode(request: IncomingMessage, pathname: string, passcode: string) {
  if (request.method === "POST" && pathname === PASSCODE_PATH) return;
  const given = cookieValue(request.headers.cookie, PASSCODE_COOKIE);
  if (given === undefined || !isPasscode(given, passcode)) throw new Refused(passcodeRequired);
}

/** The value of the first cookie with this name in a `Cookie` header, decoded. */
function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const pair of header?.split(";") ?? []) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodedOrUndefined(value.join("="));
  }
  return undefined;
}

/** The API's one cookie: script can't read it, other sites never send it, and only `/api` gets it. */
export function setCookieHeader({ name, value }: { name: string; value: string }, host: string | undefined): string {
  const secure = LOCAL_HOST.test(host ?? "") ? "" : "; Secure";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/api${secure}`;
}

function matchRoute(routes: Route[], method: string | undefined, pathname: string) {
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

function writeJson(response: ServerResponse, { status, body, cookie }: JsonResponse, host?: string) {
  if (cookie) response.setHeader("set-cookie", setCookieHeader(cookie, host));
  if (body === undefined) {
    response.writeHead(status);
    response.end();
    return;
  }
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function writeEvents(response: ServerResponse, stream: EventStream) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  response.flushHeaders();
  await stream({
    send: (event, data) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  });
  response.end();
}
