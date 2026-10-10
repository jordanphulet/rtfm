import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useManual } from "../../shared";
import { ContentsList } from "./ContentsList";
import { Glyph } from "./Glyph";
import { allSections, startPath, writtenCount } from "./manualParts";
import { WindowMark } from "./WindowMark";
import "./drawer.css";

interface ContentsDrawerProps {
  open: boolean;
  currentId?: string;
  onClose: () => void;
}

export function ContentsDrawer({ open, currentId, onClose }: ContentsDrawerProps) {
  const manual = useManual();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !panel.current) return;
    const current = panel.current.querySelector<HTMLElement>("[aria-current='page']");
    const target = current ?? panel.current.querySelector<HTMLElement>("button");
    target?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  return (
    <div className="c-drawer" data-open={open || undefined} inert={!open}>
      <div className="c-scrim" onClick={onClose} />
      <div
        ref={panel}
        className="c-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="c-drawer-title"
        tabIndex={-1}
      >
        <header className="c-drawer-head">
          <p className="c-eyebrow">Contents</p>
          <h2 id="c-drawer-title" className="c-drawer-title">
            <Link to={startPath} onClick={onClose}>
              {manual.title}
            </Link>
          </h2>
          <p className="c-lamp-count">
            <WindowMark status="written" spoken={false} />
            {writtenCount(manual)} of {allSections(manual).length} rooms lit
          </p>
          <button type="button" className="c-drawer-close" aria-label="Close contents" onClick={onClose}>
            <Glyph name="close" size="ui" />
          </button>
        </header>
        <ContentsList variant="drawer" currentId={currentId} onNavigate={onClose} />
        <p className="c-legend">
          <span>
            <WindowMark status="written" spoken={false} /> written
          </span>
          <span>
            <WindowMark status="unwritten" spoken={false} /> not yet written
          </span>
          <span>
            <WindowMark status="writing" spoken={false} /> being written
          </span>
        </p>
      </div>
    </div>
  );
}
