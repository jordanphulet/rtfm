import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Link } from "react-router";
import { chapterOf, useManual, type SectionLinkProps } from "../manual";
import { StatusRing } from "../ui";
import { chapterName, sectionPath } from "./manualParts";
import { STATUS_WORDS } from "./statusWords";
import { useManualId } from "./useManualId";
import "./section-link.css";

const OPENING_NOTE = " — opening it starts the writing.";

export function SectionLink({ section, children }: SectionLinkProps) {
  const manual = useManual(useManualId());
  const chapter = chapterOf(manual, section.id);
  const id = useId();
  const anchorName = `--xref-${id}`;
  const previewId = `xref-preview-${id}`;
  const xrefRef = useRef<HTMLSpanElement>(null);
  const { isDismissed, undismiss } = useDismissOnEscape(xrefRef);

  return (
    <span
      ref={xrefRef}
      className="xref"
      data-dismissed={isDismissed || undefined}
      onMouseLeave={undismiss}
      onBlur={undismiss}
    >
      <Link
        to={sectionPath(manual.id, section.id)}
        className="link xref-link"
        data-status={section.status}
        aria-describedby={previewId}
        style={{ anchorName }}
      >
        {children}
        {section.status !== "written" && <StatusRing status={section.status} />}
      </Link>
      <span role="tooltip" id={previewId} className="xref-preview" style={{ positionAnchor: anchorName }}>
        <span className="xref-preview-card">
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
    </span>
  );
}

function useDismissOnEscape(xrefRef: RefObject<HTMLElement | null>) {
  const [isDismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const xref = xrefRef.current;
      if (event.key !== "Escape" || !xref) return;
      if (xref.matches(":hover") || xref.contains(document.activeElement)) setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [xrefRef]);

  return { isDismissed, undismiss: () => setDismissed(false) };
}
