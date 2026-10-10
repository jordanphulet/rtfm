import type { Ref } from "react";
import type { LibraryManual } from "../library";
import "./library-head.css";

interface LibraryHeadProps {
  manuals: LibraryManual[];
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

function summary(manuals: LibraryManual[]): string {
  if (manuals.length === 0) return "No manuals";
  const written = sum(manuals.map((manual) => manual.writtenCount));
  const sections = sum(manuals.map((manual) => manual.sectionCount));
  const count = manuals.length === 1 ? "1 manual" : `${manuals.length} manuals`;
  return `${count} · ${written} of ${sections} sections written`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
