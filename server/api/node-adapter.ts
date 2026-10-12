import type { IncomingMessage, ServerResponse } from "node:http";
import { badRequest, notFound, type EventStream, type JsonResponse, type Route } from "./route.ts";

const MAX_BODY_CHARACTERS = 256 * 1024;

class UnreadableBody extends Error {}

export function createRequestHandler(routes: Route[]) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const controller = new AbortController();
    response.on("close", () => controller.abort());
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = matchRoute(routes, request.method, url.pathname);
      if (!match) return writeJson(response, notFound);

      const result = await match.route.handle({
        params: match.params,
        query: url.searchParams,
        body: await readJsonBody(request),
        signal: controller.signal,
      });
      if (typeof result === "function") await writeEvents(response, result);
      else writeJson(response, result);
    } catch (error) {
      if (error instanceof UnreadableBody) return writeJson(response, badRequest);
      console.error(`${request.method} ${request.url} failed:`, error);
      if (response.headersSent) response.end();
      else writeJson(response, { status: 500, body: { error: "Internal error" } });
    }
  };
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

/** The request's JSON body, or undefined when it has none. */
async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request.setEncoding("utf8")) {
    text += chunk;
    if (text.length > MAX_BODY_CHARACTERS) throw new UnreadableBody();
  }
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new UnreadableBody();
  }
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
