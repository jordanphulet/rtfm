import { apiFetch } from "../reportErrors";
import type { Manual, SectionEvent, SectionState } from "./types";

export type StreamEvent = SectionEvent | { event: "error" };

const SECTION_EVENTS = ["append", "written", "frozen", "failed"] as const;
const PREVIEW_OPTIONS = ["freeze", "fail"];

export function fetchManual(manualId: string): Promise<Manual> {
  return fetchJson(manualUrl(manualId));
}

export function fetchSectionState(manualId: string, sectionId: string): Promise<SectionState> {
  return fetchJson(sectionUrl(manualId, sectionId));
}

export function streamSection(
  manualId: string,
  sectionId: string,
  onEvent: (event: StreamEvent) => void,
): () => void {
  const source = new EventSource(`${sectionUrl(manualId, sectionId)}/stream${previewQuery()}`);
  const handle = (event: StreamEvent) => {
    if (event.event !== "append") source.close();
    onEvent(event);
  };
  for (const name of SECTION_EVENTS) {
    source.addEventListener(name, (message) => handle({ event: name, data: JSON.parse(message.data) } as SectionEvent));
  }
  source.addEventListener("error", () => {
    source.close();
    void askSectionAfterStreamError(manualId, sectionId).then(() => onEvent({ event: "error" }));
  });
  return () => source.close();
}

/**
 * An `EventSource` error hides the answer's status, so the section's own URL is asked once:
 * `apiFetch` shows the passcode screen on a 401 and never settles, so the error is never handed on.
 */
async function askSectionAfterStreamError(manualId: string, sectionId: string): Promise<void> {
  await apiFetch(sectionUrl(manualId, sectionId)).catch(() => undefined);
}

function manualUrl(manualId: string): string {
  return `/api/manuals/${encodeURIComponent(manualId)}`;
}

function sectionUrl(manualId: string, sectionId: string): string {
  return `${manualUrl(manualId)}/sections/${encodeURIComponent(sectionId)}`;
}

function previewQuery(): string {
  const page = new URLSearchParams(window.location.search);
  const preview = new URLSearchParams();
  for (const option of PREVIEW_OPTIONS) {
    const value = page.get(option);
    if (value !== null) preview.set(option, value);
  }
  return preview.size > 0 ? `?${preview}` : "";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  return (await response.json()) as T;
}
