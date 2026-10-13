const PASSCODE_URL = "/api/passcode";
const CHECK_TIMEOUT_MS = 10_000;

export type PasscodeAnswer = "accepted" | "wrong" | "unanswered";

/**
 * Sends the passcode; when it is right, the server sets the cookie every other request carries. A
 * 404 means the server no longer has a passcode at all, so the page can open too.
 */
export async function enterPasscode(passcode: string): Promise<PasscodeAnswer> {
  try {
    const response = await fetch(PASSCODE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (response.ok || response.status === 404) return "accepted";
    return response.status === 401 ? "wrong" : "unanswered";
  } catch {
    return "unanswered";
  }
}
