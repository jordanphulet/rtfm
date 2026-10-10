import { Fragment, type RefObject } from "react";
import type { LibraryManual } from "../../library";
import "../../ui";
import { LIBRARY_TITLE_ID } from "./jump";
import { ManualRow } from "./ManualRow";
import "./library-plate.css";

export const START_NEW_EMPTY_ID = "start-new-empty";

interface LibraryPlateProps {
  manuals: LibraryManual[];
  confirmingId: string | null;
  leavingId: string | null;
  headRef: RefObject<HTMLElement | null>;
  onDelete: (manual: LibraryManual) => void;
  onStartNew: () => void;
}

export function LibraryPlate({ manuals, confirmingId, leavingId, headRef, onDelete, onStartNew }: LibraryPlateProps) {
  const empty = manuals.length === 0;

  return (
    <section className="plate" id="library" aria-labelledby={LIBRARY_TITLE_ID}>
      <header className="plate-head" ref={headRef}>
        <h1 id={LIBRARY_TITLE_ID} className="plate-title" tabIndex={-1}>
          Library
        </h1>
        <p className="plate-meta">
          {libraryMeta(manuals).map((part, index) => (
            <Fragment key={part}>
              {index > 0 && " · "}
              <span className="plate-meta-part">{part}</span>
            </Fragment>
          ))}
        </p>
        {!empty && <StartNewManual onStartNew={onStartNew} />}
      </header>

      {empty ? (
        <div className="plate-empty">
          <p className="plate-empty-title">Nothing on the shelf.</p>
          <p className="plate-empty-text">
            Manuals you start are kept here, with how much of each is written and when you last opened it.
          </p>
          <StartNewManual id={START_NEW_EMPTY_ID} onStartNew={onStartNew} />
        </div>
      ) : (
        <>
          <div className="plate-columns" aria-hidden="true">
            <span>Manual</span>
            <span>Written</span>
            <span>Last opened</span>
          </div>
          <ul className="plate-list">
            {manuals.map((manual) => (
              <ManualRow
                key={manual.id}
                manual={manual}
                confirming={manual.id === confirmingId}
                leaving={manual.id === leavingId}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function StartNewManual({ id, onStartNew }: { id?: string; onStartNew: () => void }) {
  return (
    <button type="button" id={id} className="start-new" onClick={onStartNew}>
      Start a new manual ›
    </button>
  );
}

function libraryMeta(manuals: LibraryManual[]): string[] {
  if (manuals.length === 0) return ["No manuals"];
  const written = sum(manuals.map((manual) => manual.writtenCount));
  const sections = sum(manuals.map((manual) => manual.sectionCount));
  const count = manuals.length === 1 ? "1 manual" : `${manuals.length} manuals`;
  return [count, `${written} of ${sections} sections written`, "most recent first"];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
