import { Link } from "react-router";
import type { Chapter, Section } from "../manual";
import { StatusRing, type RingStatus } from "../ui";
import { chapterPath, sectionPath } from "./manualParts";
import "./article-head.css";

export const TITLE_ID = "section-title";

interface ArticleHeadProps {
  section: Section;
  chapter: Chapter;
  chapterName: string;
  previous?: Section;
  next?: Section;
  ringStatus: RingStatus;
  statusText: string;
}

export function ArticleHead({
  section,
  chapter,
  chapterName,
  previous,
  next,
  ringStatus,
  statusText,
}: ArticleHeadProps) {
  return (
    <header className="article-head">
      <div className="eyebrow">
        <Link to={chapterPath(chapter)} className="eyebrow-chapter">
          {chapterName} · {chapter.title}
        </Link>
        <nav className="eyebrow-steps" aria-label="Previous and next section">
          {previous && (
            <Link to={sectionPath(previous.id)} aria-label={`Previous: ${previous.label} ${previous.title}`}>
              ‹ {previous.label}
            </Link>
          )}
          {next && (
            <Link to={sectionPath(next.id)} aria-label={`Next: ${next.label} ${next.title}`}>
              {next.label} ›
            </Link>
          )}
        </nav>
      </div>
      <h1 id={TITLE_ID} tabIndex={-1}>
        <span className="title-label">{section.label}</span> {section.title}
      </h1>
      <p className="summary">{section.summary}</p>
      <p className="status-line">
        <StatusRing status={ringStatus} />
        {statusText}
      </p>
      <div className="head-rule" />
    </header>
  );
}
