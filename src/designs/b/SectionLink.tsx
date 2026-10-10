import { useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { chapterOf, useManual, type Section, type SectionLinkProps } from "../../shared";
import { chapterLine, sectionPath } from "./book";
import { Leaf } from "./drawings";

const PREVIEW_ROOM_BELOW = 220;

const PREVIEW_STATE: Record<Section["status"], string> = {
  written: "Written",
  writing: "Being written now",
  unwritten: "Not yet written. Opening it starts the writing.",
};

interface Anchor {
  top: number;
  left: number;
  above: boolean;
  immediate: boolean;
}

export function SectionLink({ section, children }: SectionLinkProps) {
  const previewId = useId();
  const [anchor, setAnchor] = useState<Anchor>();

  function show(link: HTMLElement, immediate: boolean) {
    const rect = link.getBoundingClientRect();
    const above = rect.bottom + PREVIEW_ROOM_BELOW > window.innerHeight;
    setAnchor({ top: (above ? rect.top - 8 : rect.bottom + 8) + window.scrollY, left: rect.left, above, immediate });
  }

  const hide = () => setAnchor(undefined);

  useEffect(() => {
    if (!anchor) return;
    const hideOnEscape = (event: KeyboardEvent) => event.key === "Escape" && hide();
    window.addEventListener("keydown", hideOnEscape);
    return () => window.removeEventListener("keydown", hideOnEscape);
  }, [anchor]);

  const root = document.querySelector(".design-b");

  return (
    <>
      <Link
        className="xref"
        to={sectionPath(section.id)}
        data-status={section.status}
        aria-describedby={anchor ? previewId : undefined}
        onPointerEnter={(event) => event.pointerType === "mouse" && show(event.currentTarget, false)}
        onPointerLeave={hide}
        onFocus={(event) => show(event.currentTarget, true)}
        onBlur={hide}
      >
        {children}
        <span className="xref-label">
          §{section.label}
          {section.status === "writing" && <Leaf status="writing" />}
        </span>
      </Link>
      {anchor && root && createPortal(<Preview id={previewId} section={section} anchor={anchor} />, root)}
    </>
  );
}

function Preview({ id, section, anchor }: { id: string; section: Section; anchor: Anchor }) {
  const manual = useManual();
  const chapter = chapterOf(manual, section.id);
  const position = { "--anchor-top": `${anchor.top}px`, "--anchor-left": `${anchor.left}px` } as CSSProperties;

  return (
    <span
      id={id}
      role="tooltip"
      className="preview"
      data-above={anchor.above || undefined}
      data-immediate={anchor.immediate || undefined}
      style={position}
    >
      {chapter && <span className="preview-chapter">{chapterLine(manual, chapter)}</span>}
      <span className="preview-title">
        <span className="preview-label">{section.label}</span> {section.title}
      </span>
      <span className="preview-summary">{section.summary}</span>
      <span className="preview-state" data-status={section.status}>
        <Leaf status={section.status} />
        {PREVIEW_STATE[section.status]}
      </span>
    </span>
  );
}
