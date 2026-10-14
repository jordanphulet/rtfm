import type { Gateway } from "../gateway/gateway.ts";
import type { LibraryScope, Runs } from "../writer/runs.ts";

/**
 * The library a request is in, as the gate gives it: its id, manuals, leases and section writer,
 * the server's runs bound to it, and the gateway its librarian and planner call. A handler reaches
 * manuals, runs and models only through it.
 */
export interface Library extends LibraryScope {
  runs: Runs;
  gateway: Gateway;
}

export interface ApiRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  signal: AbortSignal;
  library: Library;
}

export interface JsonResponse {
  status: number;
  body: unknown;
  /** The API's cookie to set: the adapter adds its attributes (`server/api/README.md` › The passcode). */
  cookie?: { name: string; value: string };
}

export interface EventSink {
  send(event: string, data: unknown): void;
}

export type EventStream = (sink: EventSink) => Promise<void>;

export interface Route {
  method: "GET" | "POST" | "DELETE";
  pattern: string;
  handle(request: ApiRequest): Promise<JsonResponse | EventStream>;
}

export const notFound: JsonResponse = { status: 404, body: { error: "Not found" } };
export const noContent: JsonResponse = { status: 204, body: undefined };
export const badRequest: JsonResponse = { status: 400, body: { error: "Bad request" } };
