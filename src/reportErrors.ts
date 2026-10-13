import type { ClientError, ClientErrorReport } from "../server/api/types";
import { requirePasscode } from "./passcode/required";

const REPORT_URL = "/api/client-errors";
/** Reports one page load may send, so a page that fails in a loop stops reporting. */
const MAX_REPORTS = 20;

let reportsLeft = 0;

/** What `apiFetch` answers a 401 with: the passcode screen replaces the page, and entering it reloads. */
const untilReload = new Promise<never>(() => {});

/**
 * Reports uncaught errors and unhandled rejections to the server's log from now on, and turns on
 * `apiFetch`'s reports of failed requests. Until it is called (in tests, say) nothing is sent.
 */
export function startReportingErrors() {
  reportsLeft = MAX_REPORTS;
  window.addEventListener("error", (event) => reportError("error", event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError("rejection", event.reason));
}

/**
 * `fetch`, reporting a request that gets no answer or a server error (5xx). A 401 shows the
 * passcode screen and never settles, so no page shows it as a failure.
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    reportFailedRequest(method, url);
    throw error;
  }
  if (response.status === 401) {
    requirePasscode();
    return untilReload;
  }
  if (response.status >= 500) reportFailedRequest(method, url, response.status);
  return response;
}

function reportFailedRequest(method: string, path: string, status?: number) {
  send({ kind: "request", method, path, status });
}

function reportError(kind: "error" | "rejection", error: unknown) {
  if (error instanceof Error) send({ kind, name: error.name, message: error.message, stack: error.stack });
  else send({ kind, message: String(error) });
}

/** Sends a report and forgets it: a report that fails is never reported. */
function send(error: ClientError) {
  if (reportsLeft === 0) return;
  reportsLeft--;
  const body: ClientErrorReport = { ...error, page: window.location.pathname };
  fetch(REPORT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
