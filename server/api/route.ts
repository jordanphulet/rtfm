export interface ApiRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  signal: AbortSignal;
}

export interface JsonResponse {
  status: number;
  body: unknown;
}

export interface EventSink {
  send(event: string, data: unknown): void;
}

export type EventStream = (sink: EventSink) => Promise<void>;

export interface Route {
  method: "GET" | "DELETE";
  pattern: string;
  handle(request: ApiRequest): Promise<JsonResponse | EventStream>;
}

export const notFound: JsonResponse = { status: 404, body: { error: "Not found" } };
export const noContent: JsonResponse = { status: 204, body: undefined };
