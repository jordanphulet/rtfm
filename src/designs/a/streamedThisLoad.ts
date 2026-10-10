import type { Manual, Section } from "../../shared";
import { allSections } from "./manualParts";

const streamedThisLoad = new Set<string>();

export function rememberStreamingSections(manual: Manual) {
  for (const section of allSections(manual)) {
    if (section.status === "writing") streamedThisLoad.add(section.id);
  }
}

export function loadedAlreadyWritten(section: Section): boolean {
  return section.status === "written" && !streamedThisLoad.has(section.id);
}
