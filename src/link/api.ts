import { apiFetch } from "../reportErrors";

const LINK_URL = "/api/link";
const ANSWER_TIMEOUT_MS = 10_000;

export type LinkAnswer = "opened" | "closed" | "unanswered";

/**
 * Posts a link's secret; when its link is open, the server sets the library's cookie. Plain
 * `fetch`, since a 401 here means the link is closed, not that a passcode is missing.
 */
export async function openLibrary(secret: string): Promise<LinkAnswer> {
  try {
    const response = await fetch(LINK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret }),
      signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    });
    if (response.ok) return "opened";
    return response.status === 401 ? "closed" : "unanswered";
  } catch {
    return "unanswered";
  }
}

/**
 * Clears the library's cookie, so the browser is back in the admin's library or at the passcode
 * screen. It settles either way: a server that doesn't answer is the landing page's to show.
 */
export async function leaveLibrary(): Promise<void> {
  await apiFetch(LINK_URL, { method: "DELETE", signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS) }).catch(() => {});
}
