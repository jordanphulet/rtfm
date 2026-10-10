import type { Chapter, Section } from "../../shared";
import { stateWord } from "./manualParts";
import { WindowMark } from "./WindowMark";

interface SectionHeadProps {
  section: Section;
  chapter: Chapter;
  chapterName: string;
}

export function SectionHead({ section, chapter, chapterName }: SectionHeadProps) {
  const shownStatus = section.status === "unwritten" ? "writing" : section.status;
  return (
    <header className="c-head">
      <p className="c-meta">
        <span className="c-meta-place">
          <span className="c-meta-number">{section.label}</span> · {chapterName} · {chapter.title}
        </span>
        <span className="c-meta-state" data-status={shownStatus}>
          <WindowMark status={shownStatus} spoken={false} />
          {stateWord[shownStatus]}
        </span>
      </p>
      <h1 className="c-title">{section.title}</h1>
      <p className="c-summary">{section.summary}</p>
    </header>
  );
}
