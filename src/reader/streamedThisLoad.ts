import type { Manual, Section } from "../manual";
import { allSections } from "./manualParts";

const streamedThisLoad = new Set<string>();

const keyOf = (manualId: string, sectionId: string) => `${manualId}/${sectionId}`;

export function rememberStreamingSections(manual: Manual) {
  for (const section of allSections(manual)) {
    if (section.status === "writing") streamedThisLoad.add(keyOf(manual.id, section.id));
  }
}

export function loadedAlreadyWritten(manualId: string, section: Section): boolean {
  return section.status === "written" && !streamedThisLoad.has(keyOf(manualId, section.id));
}
