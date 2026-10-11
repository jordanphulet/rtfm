import type { IncomingMessage, ServerResponse } from "node:http";
import { notFound, type EventStream, type JsonResponse, type Route } from "./route.ts";

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
        signal: controller.signal,
      });
      if (typeof result === "function") await writeEvents(response, result);
      else writeJson(response, result);
    } catch (error) {
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
