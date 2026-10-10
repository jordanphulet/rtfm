import type { Section } from "../../shared";
import { HeadRule, Leaf } from "./drawings";

interface OpenerProps {
  section: Section;
  wordCount: number;
  progress: number;
}

export function Opener({ section, wordCount, progress }: OpenerProps) {
  return (
    <header className="opener">
      <p className="section-label" aria-hidden="true">
        {section.label}
      </p>
      <h1 className="section-title">
        <span className="sr-only">{section.label} </span>
        {section.title}
      </h1>
      <p className="section-summary">{section.summary}</p>
      <StatusLine status={section.status} wordCount={wordCount} progress={progress} />
      <HeadRule />
    </header>
  );
}

function StatusLine({ status, wordCount, progress }: { status: Section["status"]; wordCount: number; progress: number }) {
  const isWritten = status === "written";
  return (
    <p className="status-line" data-status={status}>
      <Leaf status={isWritten ? "written" : "writing"} />
      <span aria-live="polite">{isWritten ? "Written" : "Being written"}</span>
      <span aria-hidden="true">{statusDetail(isWritten, wordCount, progress)}</span>
    </p>
  );
}

function statusDetail(isWritten: boolean, wordCount: number, progress: number): string {
  if (isWritten) return `\u00a0· about ${Math.max(10, Math.round(wordCount / 10) * 10)} words`;
  if (progress > 0) return `\u00a0· ${Math.round(progress * 100)}%`;
  return "";
}
