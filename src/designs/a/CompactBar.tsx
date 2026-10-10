import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import type { Section } from "../../shared";
import { sectionPath } from "./manualParts";
import { StatusRing } from "./StatusRing";
import { Toc } from "./Toc";
import "./compact-bar.css";

const FOCUSABLE = "a[href], button:not([disabled])";

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
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const currentRow = sheet?.querySelector<HTMLElement>(".toc-row[aria-current='page']");
    if (sheet && currentRow) sheet.scrollTop = currentRow.offsetTop - sheet.clientHeight / 3;
    (currentRow ?? sheet?.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
  }, [open]);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const closeAfterChoosingALink = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === "Escape") close();
    if (event.key === "Tab") keepFocusInside(event, barRef.current);
  };

  return (
    <div ref={barRef} className="compact-bar" onKeyDown={onKeyDown}>
      <header className="compact-header">
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
      <div
        ref={sheetRef}
        id="contents-sheet"
        className="sheet"
        data-open={open || undefined}
        inert={!open}
        onClick={closeAfterChoosingALink}
      >
        <Toc currentId={current?.id} currentOutline={currentOutline} />
      </div>
    </div>
  );
}

function StepLink({ section, direction }: { section?: Section; direction: "Previous" | "Next" }) {
  if (!section) return null;
  const glyph = direction === "Previous" ? "‹" : "›";
  return (
    <Link
      to={sectionPath(section.id)}
      className="step"
      aria-label={`${direction}: ${section.label} ${section.title}`}
    >
      {glyph}
    </Link>
  );
}

function keepFocusInside(event: KeyboardEvent, container: HTMLElement | null) {
  const focusable = [...(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
