import { isDeepStrictEqual } from "node:util";
import type { StoredChapter, StoredManual, StoredSection } from "./types.ts";

/** A manual's, chapter's or section's id: lower-case words joined by hyphens. */
export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Whether the stored manual is this one, as a store keeps it (no undefined values). A create that
 * finds its own manual already stored answers "created": a retried create, or a second identical
 * one, replaces nothing.
 */
export function isSameManual(stored: StoredManual | undefined, manual: StoredManual): boolean {
  return isDeepStrictEqual(stored, JSON.parse(JSON.stringify(manual)));
}

export function chaptersInReadingOrder(manual: StoredManual): StoredChapter[] {
  return [...manual.chapters, ...manual.appendices];
}

export function sectionsInReadingOrder(manual: StoredManual): StoredSection[] {
  return chaptersInReadingOrder(manual).flatMap((chapter) => chapter.sections);
}
