import type { RefObject } from "react";
import type { LibraryManual } from "../../library";
import { ManualRow } from "./ManualRow";
import "../../ui";
import "./shelf.css";

interface ShelfProps {
  manuals: LibraryManual[];
  leavingId: string | null;
  confirmingId: string | null;
  emptyStartRef: RefObject<HTMLButtonElement | null>;
  onDelete: (manual: LibraryManual, opener: HTMLElement) => void;
  onCollapsed: (manual: LibraryManual) => void;
  onStartNewManual: () => void;
}

export function Shelf({
  manuals,
  leavingId,
  confirmingId,
  emptyStartRef,
  onDelete,
  onCollapsed,
  onStartNewManual,
}: ShelfProps) {
  const isEmpty = manuals.length === 0;

  return (
    <main className="shelf">
      <div className="shelf-head">
        <h1 className="shelf-title">Library</h1>
        {!isEmpty && (
          <>
            <button type="button" className="text-button shelf-new" onClick={onStartNewManual}>
              Start a new manual
            </button>
            <p className="shelf-meta">{metaFor(manuals)}</p>
          </>
        )}
      </div>
      <hr className="shelf-rule" />
      {isEmpty ? (
        <div className="shelf-empty">
          <h2 className="shelf-empty-title">No manuals yet</h2>
          <p className="shelf-empty-text">
            Start one and it’s kept here, with how much of it is written and when you last opened it.
          </p>
          <button ref={emptyStartRef} type="button" className="shelf-empty-start" onClick={onStartNewManual}>
            Start a new manual ›
          </button>
        </div>
      ) : (
        <ul className="rows">
          {manuals.map((manual) => (
            <ManualRow
              key={manual.id}
              manual={manual}
              leaving={manual.id === leavingId}
              confirming={manual.id === confirmingId}
              onDelete={onDelete}
              onCollapsed={onCollapsed}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function metaFor(manuals: LibraryManual[]): string {
  const written = manuals.reduce((sum, manual) => sum + manual.writtenCount, 0);
  const sections = manuals.reduce((sum, manual) => sum + manual.sectionCount, 0);
  const count = manuals.length === 1 ? "1 manual" : `${manuals.length} manuals`;
  return `${count} · ${written} of ${sections} sections written`;
}
