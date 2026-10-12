import type { IncomingMessage, ServerResponse } from "node:http";
import { badRequest, notFound, type EventStream, type JsonResponse, type Route } from "./route.ts";

const MAX_BODY_CHARACTERS = 256 * 1024;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const hostNotAllowed: JsonResponse = { status: 403, body: { error: "Host not allowed" } };
const originNotAllowed: JsonResponse = { status: 403, body: { error: "Origin not allowed" } };
const notJson: JsonResponse = { status: 415, body: { error: "Body must be application/json" } };

class Refused extends Error {
  readonly response: JsonResponse;

  constructor(response: JsonResponse) {
    super(`Refused with ${response.status}`);
    this.response = response;
  }
}

export function createRequestHandler(routes: Route[]) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const controller = new AbortController();
    response.on("close", () => controller.abort());
    try {
      refuseOtherSites(request);
      const body = await readJsonBody(request);
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = matchRoute(routes, request.method, url.pathname);
      if (!match) return writeJson(response, notFound);

      const result = await match.route.handle({
        params: match.params,
        query: url.searchParams,
        body,
        signal: controller.signal,
      });
      if (typeof result === "function") await writeEvents(response, result);
      else writeJson(response, result);
    } catch (error) {
      if (error instanceof Refused) return writeJson(response, error.response);
      console.error(`${request.method} ${request.url} failed:`, error);
      if (response.headersSent) response.end();
      else writeJson(response, { status: 500, body: { error: "Internal error" } });
    }
  };
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

function writeJson(response: ServerResponse, { status, body }: JsonResponse) {
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
