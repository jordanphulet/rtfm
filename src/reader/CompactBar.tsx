import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import type { Section } from "../manual";
import { Sheet, StatusRing } from "../ui";
import { sectionPath } from "./manualParts";
import { Toc } from "./Toc";
import { useManualId } from "./useManualId";
import "./compact-bar.css";

interface CompactBarProps {
  current?: Section;
  previous?: Section;
  next?: Section;
  currentOutline?: ReactNode;
}

export function CompactBar({ current, previous, next, currentOutline }: CompactBarProps) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const closeAfterChoosingALink = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
  };

  return (
    <div ref={barRef} className="compact-bar">
      <header className="compact-header">
        <Link to="/" className="library-link">
          Library
        </Link>
        <button
          ref={toggleRef}
          type="button"
          className="location"
          data-shot="toc-toggle"
          aria-expanded={open}
          aria-controls="contents-sheet"
          onClick={() => setOpen(!open)}
        >
          {current ? (
            <>
              <StatusRing status={current.status} />
              <span className="location-label">{current.label}</span>
              <span className="location-title">{current.title}</span>
            </>
          ) : (
            <span className="location-title">Contents</span>
          )}
          <span className="chevron" aria-hidden="true" />
          <span className="visually-hidden">{open ? " (close contents)" : " (open contents)"}</span>
        </button>
        <StepLink section={previous} direction="Previous" />
        <StepLink section={next} direction="Next" />
      </header>
      <Sheet
        id="contents-sheet"
        open={open}
        onClose={close}
        focusScope={barRef}
        focusOnOpen={scrollToCurrentRow}
        onClick={closeAfterChoosingALink}
      >
        <Toc currentId={current?.id} currentOutline={currentOutline} />
      </Sheet>
    </div>
  );
}

function StepLink({ section, direction }: { section?: Section; direction: "Previous" | "Next" }) {
  const manualId = useManualId();
  if (!section) return null;
  const glyph = direction === "Previous" ? "‹" : "›";
  return (
    <Link
      to={sectionPath(manualId, section.id)}
      className="step"
      aria-label={`${direction}: ${section.label} ${section.title}`}
    >
      {glyph}
    </Link>
  );
}

function scrollToCurrentRow(sheet: HTMLElement): HTMLElement | null {
  const currentRow = sheet.querySelector<HTMLElement>(".toc-row[aria-current='page']");
  if (currentRow) sheet.scrollTop = currentRow.offsetTop - sheet.clientHeight / 3;
  return currentRow;
}
