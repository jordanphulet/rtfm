import type { Section } from "../../shared";
import { stateWord } from "./book";
import { Leaf } from "./drawings";

interface FolioBarProps {
  section: Section;
  onOpenContents: () => void;
}

export function FolioBar({ section, onOpenContents }: FolioBarProps) {
  return (
    <nav className="folio-bar" aria-label="Contents">
      <button type="button" className="folio-contents" data-shot="toc-toggle" onClick={onOpenContents}>
        Contents
      </button>
      <span className="folio-place">
        {section.label}
        <Leaf status={section.status} />
        <span className="sr-only">{stateWord(section.status)}</span>
      </span>
    </nav>
  );
}
