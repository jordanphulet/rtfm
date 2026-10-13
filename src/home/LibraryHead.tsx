import type { Ref } from "react";
import type { ManualSummary } from "../library";
import { manualCount } from "./manualCount";
import "./LibraryHead.css";

interface LibraryHeadProps {
  manuals: ManualSummary[];
  onStartNewManual: () => void;
  startRef: Ref<HTMLButtonElement>;
}

export function LibraryHead({ manuals, onStartNewManual, startRef }: LibraryHeadProps) {
  return (
    <header className="library-head">
      <h1 className="library-title">Library</h1>
      <p className="library-meta">{summary(manuals)}</p>
      <button type="button" ref={startRef} className="link start-link" onClick={onStartNewManual}>
        Start a new manual ›
      </button>
    </header>
  );
}

function summary(manuals: ManualSummary[]): string {
  const count = manualCount(manuals.length);
  if (manuals.length === 0) return count;
  const written = sum(manuals.map((manual) => manual.writtenCount));
  const sections = sum(manuals.map((manual) => manual.sectionCount));
  return `${count} · ${written} of ${sections} sections written`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
