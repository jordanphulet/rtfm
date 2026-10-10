import { useState } from "react";
import type { LibraryManual } from "../../library";
import { Sheet } from "../../ui";
import "./delete-confirmation.css";

export const CONFIRMATION_ID = "delete-confirmation";

interface DeleteConfirmationProps {
  manual: LibraryManual | null;
  onKeep: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmation({ manual, onKeep, onConfirm }: DeleteConfirmationProps) {
  const [shown, setShown] = useState(manual);
  if (manual && manual !== shown) setShown(manual);
  const open = manual !== null;

  return (
    <>
      <div className="scrim" data-open={open || undefined} onClick={onKeep} aria-hidden="true" />
      <Sheet
        id={CONFIRMATION_ID}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-text"
        open={open}
        onClose={onKeep}
        focusOnOpen={(sheet) => sheet.querySelector<HTMLElement>("[data-keep]")}
        className="confirm"
      >
        <div className="page-grid">
          <div className="confirm-body">
            <h2 id="delete-title" className="confirm-title">
              Delete “{shown?.title}”?
            </h2>
            <p id="delete-text" className="confirm-text">
              {shown && consequence(shown)}
            </p>
            <div className="confirm-actions">
              <button type="button" className="confirm-delete" onClick={onConfirm}>
                Delete manual
              </button>
              <button type="button" className="text-button confirm-keep" data-keep onClick={onKeep}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function consequence({ writtenCount, sectionCount }: LibraryManual): string {
  if (writtenCount === 0) {
    return `It leaves your library. None of its ${sectionCount} sections are written yet.`;
  }
  const written = writtenCount === 1 ? "the 1 section" : `the ${writtenCount} sections`;
  return `It leaves your library, with ${written} written so far. This can’t be undone.`;
}
