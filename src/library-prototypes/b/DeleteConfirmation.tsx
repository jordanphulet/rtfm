import { useState } from "react";
import type { LibraryManual } from "../../library";
import { Sheet } from "../../ui";
import "./delete-confirmation.css";

interface DeleteConfirmationProps {
  manual: LibraryManual | null;
  onKeep: () => void;
  onDelete: () => void;
}

export function DeleteConfirmation({ manual, onKeep, onDelete }: DeleteConfirmationProps) {
  const [shown, setShown] = useState(manual);
  if (manual && manual !== shown) setShown(manual);
  const open = manual !== null;

  return (
    <>
      <div className="scrim" data-open={open || undefined} aria-hidden="true" onClick={onKeep} />
      <Sheet
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-body"
        open={open}
        onClose={onKeep}
        className="confirm"
        focusOnOpen={(sheet) => sheet.querySelector<HTMLElement>(".confirm-keep")}
      >
        <h2 id="delete-title" className="confirm-title">
          Delete “{shown?.title}”?
        </h2>
        <p id="delete-body" className="confirm-body">
          {shown && consequenceOf(shown)}
        </p>
        <div className="confirm-actions">
          <button type="button" className="text-button confirm-keep" onClick={onKeep}>
            Keep it
          </button>
          <button type="button" className="confirm-delete" onClick={onDelete}>
            Delete manual
          </button>
        </div>
      </Sheet>
    </>
  );
}

function consequenceOf(manual: LibraryManual): string {
  if (manual.writtenCount === 0) {
    return "It leaves your library. None of its sections have been written yet.";
  }
  const sections = manual.writtenCount === 1 ? "section" : "sections";
  return `It leaves your library, along with its ${manual.writtenCount} written ${sections}. This can’t be undone.`;
}
