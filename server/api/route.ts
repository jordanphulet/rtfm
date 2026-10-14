import type { Gateway } from "../gateway/gateway.ts";
import type { ActivityCounter } from "../storage/library-links.ts";
import type { LibraryScope, Runs } from "../writer/runs.ts";

/**
 * The library a request is in, as the gate gives it: its id, manuals, leases and section writer,
 * the server's runs bound to it, the gateway its librarian and planner call, and its activity. A
 * handler reaches manuals, runs and models only through it.
 */
export interface Library extends LibraryScope {
  runs: Runs;
  gateway: Gateway;
  activity: Activity;
}

/**
 * What a recipient's library records of its use (`server/api/README.md` › Activity); the admin's
 * records nothing. A write that fails is logged, and never fails the request.
 */
export interface Activity {
  /** Adds one to the counter, without holding the request up. */
  count(counter: ActivityCounter): void;
  /** Moves the last use forward, at most once a minute per environment, without holding the request up. */
  used(): void;
  /** Counts a link opened, and keeps the first one's time. */
  opened(): Promise<void>;
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
  /** The API's cookies to set, each its own `Set-Cookie` header, with the attributes the adapter adds. */
  cookies?: Cookie[];
}

/** One of the API's cookies: without `maxAgeSeconds` the browser keeps it for its session, and 0 clears it. */
export interface Cookie {
  name: string;
  value: string;
  maxAgeSeconds?: number;
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

/**
 * A route every request reaches without the gate, and so without a library: entering the passcode,
 * and opening or leaving a library. It sees only the body.
 */
export interface UngatedRoute {
  method: "POST" | "DELETE";
  pattern: string;
  handle(request: { body: unknown }): Promise<JsonResponse>;
}

export const notFound: JsonResponse = { status: 404, body: { error: "Not found" } };
export const noContent: JsonResponse = { status: 204, body: undefined };
export const badRequest: JsonResponse = { status: 400, body: { error: "Bad request" } };
