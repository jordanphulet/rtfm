import { useLayoutEffect, useRef, useState } from "react";
import { deleteManual, useLibrary, type LibraryManual } from "../../library";
import { CueLine, type CueLineHandle } from "./CueLine";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { Shelf } from "./Shelf";
import "../../ui";
import "./tokens.css";
import "./page.css";

type FocusAfterDelete = { manualId: string } | "empty-state";

export default function Library() {
  const manuals = useLibrary();
  const [toDelete, setToDelete] = useState<LibraryManual | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const cueLineRef = useRef<CueLineHandle>(null);
  const emptyStartRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const focusAfterDeleteRef = useRef<FocusAfterDelete | null>(null);

  useLayoutEffect(() => {
    if (toDelete !== null || !openerRef.current) return;
    openerRef.current.focus();
    openerRef.current = null;
  }, [toDelete]);

  useLayoutEffect(() => {
    const target = focusAfterDeleteRef.current;
    if (!target) return;
    focusAfterDeleteRef.current = null;
    if (target === "empty-state") emptyStartRef.current?.focus();
    else rootRef.current?.querySelector<HTMLElement>(`[data-manual-id="${target.manualId}"] .row-link`)?.focus();
  }, [manuals]);

  function askToDelete(manual: LibraryManual, opener: HTMLElement) {
    openerRef.current = opener;
    setToDelete(manual);
  }

  function confirmDelete() {
    if (!toDelete) return;
    const index = manuals.indexOf(toDelete);
    const neighbour = manuals[index + 1] ?? manuals[index - 1];
    focusAfterDeleteRef.current = neighbour ? { manualId: neighbour.id } : "empty-state";
    openerRef.current = null;
    setToDelete(null);
    setLeavingId(toDelete.id);
  }

  function finishDelete(manual: LibraryManual) {
    deleteManual(manual.id);
    setLeavingId(null);
    setAnnouncement(`Deleted “${manual.title}”. ${manualsLeft(manuals.length - 1)}`);
  }

  return (
    <div ref={rootRef} className="ui library-b">
      <div className="page" inert={toDelete !== null}>
        <CueLine ref={cueLineRef} libraryIsEmpty={manuals.length === 0} />
        <Shelf
          manuals={manuals}
          leavingId={leavingId}
          confirmingId={toDelete?.id ?? null}
          emptyStartRef={emptyStartRef}
          onDelete={askToDelete}
          onCollapsed={finishDelete}
          onStartNewManual={() => cueLineRef.current?.startNewManual()}
        />
      </div>
      <DeleteConfirmation manual={toDelete} onKeep={() => setToDelete(null)} onDelete={confirmDelete} />
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function manualsLeft(count: number): string {
  if (count === 0) return "No manuals left.";
  return count === 1 ? "1 manual left." : `${count} manuals left.`;
}
