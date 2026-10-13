import { apiFetch } from "../reportErrors";
import type { DeleteResult, ManualSummary } from "./types";

const LIBRARY_URL = "/api/manuals";
const DELETE_TIMEOUT_MS = 10_000;

export async function fetchLibrary(): Promise<ManualSummary[]> {
  const url = `${LIBRARY_URL}${previewQuery()}`;
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  return (await response.json()) as ManualSummary[];
}

export async function deleteManual(id: string): Promise<DeleteResult> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), DELETE_TIMEOUT_MS);
  try {
    const response = await apiFetch(`${LIBRARY_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: timeout.signal,
    });
    if (response.ok || response.status === 404) return "deleted";
    if (response.status === 409) return "being-written";
    return "failed";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

function previewQuery(): string {
  const wantsEmpty = new URLSearchParams(window.location.search).get("library") === "empty";
  return wantsEmpty ? "?library=empty" : "";
}
