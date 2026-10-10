import { Link } from "react-router";
import type { Chapter, Section } from "../manual";
import { StatusRing } from "../ui";
import { TITLE_ID } from "./ArticleHead";
import type { Heading } from "./markdownScan";
import { chapterAnchor, sectionPath } from "./manualParts";
import "./outline.css";

interface OutlineListProps {
  sectionLabel: string;
  title: string;
  headings: Heading[];
  activeId?: string;
  isWriting: boolean;
}

export function OutlineList({ sectionLabel, title, headings, activeId, isWriting }: OutlineListProps) {
  return (
    <ol className="outline-list" data-writing={isWriting || undefined}>
      <OutlineItem id={TITLE_ID} level={2} number={sectionLabel} isActive={activeId === undefined}>
        {title}
      </OutlineItem>
      {headings.filter(isOutlineLevel).map((heading, index) => (
        <OutlineItem
          key={index}
          id={heading.id}
          level={heading.level}
          number={heading.clause ? `${sectionLabel}.${heading.clause}` : undefined}
          isActive={heading.id === activeId}
        >
          {heading.text}
        </OutlineItem>
      ))}
      {isWriting && headings.length === 0 && (
        <li className="outline-hint">Headings appear as they’re written.</li>
      )}
    </ol>
  );
}

export function isOutlineLevel(heading: Heading): boolean {
  return heading.level <= 3;
}

interface OutlineItemProps {
  id: string;
  level: Heading["level"];
  number?: string;
  isActive: boolean;
  children: string;
}

function OutlineItem({ id, level, number, isActive, children }: OutlineItemProps) {
  return (
    <li data-level={level}>
      <a href={`#${id}`} aria-current={isActive ? "location" : undefined}>
        {number && <span className="outline-number">{number}</span>}
        {children}
      </a>
    </li>
  );
}

export function ReferencedSections({ sections }: { sections: Section[] }) {
  if (sections.length === 0) return null;
  return (
    <>
      <h2 className="outline-label outline-label-refs">Referenced here</h2>
      <ul className="outline-refs">
        {sections.map((section) => (
          <li key={section.id}>
            <Link to={sectionPath(section.id)} data-status={section.status}>
              <span className="outline-ref-label">{section.label}</span>
              <span className="outline-ref-title">{section.title}</span>
              <StatusRing status={section.status} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ManualOutline({ chapters }: { chapters: Chapter[] }) {
  return (
    <>
      <h2 className="outline-label">In this manual</h2>
      <ol className="outline-list">
        {chapters.map((chapter) => (
          <li key={chapter.id} data-level={2}>
            <a href={`#${chapterAnchor(chapter)}`}>
              <span className="outline-number outline-chapter-number">{chapter.label}</span>
              {chapter.title}
            </a>
          </li>
        ))}
      </ol>
    </>
  );
}
