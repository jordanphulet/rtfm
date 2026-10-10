import { useId } from "react";
import { Link } from "react-router";
import { chapterOf, useManual, type SectionLinkProps } from "../../shared";
import { chapterName, sectionPath } from "./manualParts";
import { STATUS_WORDS, StatusRing } from "./StatusRing";
import "./section-link.css";

const OPENING_NOTE = " — opening it starts the writing.";

export function SectionLink({ section, children }: SectionLinkProps) {
  const manual = useManual();
  const chapter = chapterOf(manual, section.id);
  const id = useId();
  const anchorName = `--xref-${id}`;
  const previewId = `xref-preview-${id}`;

  return (
    <span className="xref">
      <Link
        to={sectionPath(section.id)}
        className="xref-link"
        data-status={section.status}
        aria-describedby={previewId}
        style={{ anchorName }}
      >
        {children}
        {section.status !== "written" && <StatusRing status={section.status} />}
      </Link>
      <span role="tooltip" id={previewId} className="xref-preview" style={{ positionAnchor: anchorName }}>
        <span className="xref-preview-meta">
          {section.label}
          {chapter && ` · ${chapterName(manual, chapter)}`}
        </span>
        <span className="xref-preview-title">{section.title}</span>
        <span className="xref-preview-summary">{section.summary}</span>
        <span className="xref-preview-status">
          <StatusRing status={section.status} />
          {STATUS_WORDS[section.status]}
          {section.status === "unwritten" && OPENING_NOTE}
        </span>
      </span>
    </span>
  );
}
