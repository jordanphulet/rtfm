import type { Ref } from "react";
import { Plus } from "lucide-react";
import type { ManualSummary } from "../library";
import { Icon } from "../ui";
import { Wordmark } from "./Wordmark";
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
      <Wordmark />
      <p className="library-intro">
        Writes manuals on any subject, in any voice. Tell the librarian what you’d like to read
        and who you’d like it to sound like, and each section is written the first time you open it.
      </p>
      <p className="library-meta">{summary(manuals)}</p>
      <button type="button" ref={startRef} className="start-button" onClick={onStartNewManual}>
        <Icon of={Plus} />
        Start a new manual
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
