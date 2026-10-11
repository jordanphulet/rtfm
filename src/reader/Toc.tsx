import type { ReactNode } from "react";
import { Link } from "react-router";
import { useManual, type Chapter, type Section } from "../manual";
import { StatusRing } from "../ui";
import { allSections, contentsPath, sectionPath } from "./manualParts";
import { StatusLegend } from "./StatusLegend";
import { STATUS_WORDS } from "./statusWords";
import { useManualId } from "./useManualId";
import "./toc.css";

interface TocProps {
  currentId?: string;
  currentOutline?: ReactNode;
}

export function Toc({ currentId, currentOutline }: TocProps) {
  const manual = useManual(useManualId());
  const sections = allSections(manual);
  const writtenCount = sections.filter((section) => section.status === "written").length;

  return (
    <nav className="toc" aria-label="Contents">
      <div className="toc-masthead">
        <Link to="/" className="toc-library">
          Library
        </Link>
        <Link to={contentsPath(manual.id)} className="toc-manual-title" aria-current={currentId ? undefined : "page"}>
          {manual.title}
        </Link>
        <p className="toc-count">
          {writtenCount} of {sections.length} sections written
        </p>
        <StatusLegend />
      </div>
      <ChapterList chapters={manual.chapters} currentId={currentId} currentOutline={currentOutline} />
      {manual.appendices.length > 0 && (
        <div className="toc-appendices">
          <p className="toc-group-label">Appendices</p>
          <ChapterList chapters={manual.appendices} currentId={currentId} currentOutline={currentOutline} />
        </div>
      )}
    </nav>
  );
}

function ChapterList({ chapters, currentId, currentOutline }: TocProps & { chapters: Chapter[] }) {
  return (
    <ol className="toc-chapters">
      {chapters.map((chapter) => (
        <li key={chapter.id} className="toc-chapter">
          <p className="toc-chapter-title">
            <span className="toc-label">{chapter.label}</span>
            {chapter.title}
          </p>
          <ol className="toc-sections">
            {chapter.sections.map((section) => (
              <li key={section.id}>
                <TocRow section={section} isCurrent={section.id === currentId} />
                {section.id === currentId && currentOutline}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function TocRow({ section, isCurrent }: { section: Section; isCurrent: boolean }) {
  const manualId = useManualId();
  return (
    <Link
      to={sectionPath(manualId, section.id)}
      className="toc-row"
      data-status={section.status}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={`${section.label} ${section.title}, ${STATUS_WORDS[section.status].toLowerCase()}`}
    >
      <span className="toc-label">{section.label}</span>
      <span className="toc-row-title">{section.title}</span>
      <StatusRing status={section.status} />
    </Link>
  );
}
