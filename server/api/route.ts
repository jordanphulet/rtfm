export interface ApiRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  signal: AbortSignal;
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
