import { useLayoutEffect, useRef, useState } from "react";
import type { DeleteResult, ManualSummary } from "../library";
import { Sheet } from "../ui";
import "./delete-confirmation.css";

const GAP_PX = 8;
const EDGE_PX = 16;
const MIN_WIDTH_PX = 360;

export type DeleteStage = "confirming" | "deleting" | Exclude<DeleteResult, "deleted">;

interface DeleteConfirmationProps {
  manual: ManualSummary | null;
  stage: DeleteStage;
  findRow: (id: string) => HTMLElement | null;
  onKeep: () => void;
  onDelete: (manual: ManualSummary) => void;
}

export function DeleteConfirmation({ manual, stage, findRow, onKeep, onDelete }: DeleteConfirmationProps) {
  const [shown, setShown] = useState(manual);
  if (manual && manual !== shown) setShown(manual);

  const anchorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const row = manual && findRow(manual.id);
    if (anchor && row) placeUnderRow(anchor, row);
  }, [manual, stage, findRow]);

  const open = manual !== null;
  const deleting = stage === "deleting";
  const failed = stage === "being-written" || stage === "failed";

  return (
    <>
      <div className="scrim" data-open={open || undefined} onClick={onKeep} aria-hidden="true" />
      <div className="confirm-anchor" ref={anchorRef}>
        <Sheet
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          aria-describedby="delete-body"
          className="confirm"
          open={open}
          onClose={onKeep}
          focusOnOpen={(sheet) => sheet.querySelector<HTMLElement>("[data-keep]")}
        >
          <h2 id="delete-title" className="confirm-title">
            {failed ? `Couldn’t delete “${shown?.title}”` : `Delete “${shown?.title}”?`}
          </h2>
          <p id="delete-body" className="confirm-body">
            {failed ? failureText(stage) : warningText(shown?.writtenCount ?? 0)}
          </p>
          <div className="confirm-actions">
            <button
              type="button"
              className="confirm-delete"
              data-shot="confirm-delete"
              aria-disabled={deleting || undefined}
              onClick={() => shown && !deleting && onDelete(shown)}
            >
              {deleteLabel(stage)}
            </button>
            <button
              type="button"
              className="text-button confirm-keep"
              data-keep
              aria-disabled={deleting || undefined}
              onClick={onKeep}
            >
              Keep it
            </button>
          </div>
        </Sheet>
      </div>
    </>
  );
}

function warningText(written: number): string {
  if (written === 0) return "It leaves your library. This can’t be undone.";
  const sections = written === 1 ? "section" : "sections";
  return `It leaves your library with its ${written} written ${sections}. This can’t be undone.`;
}

export function failureText(stage: DeleteStage): string {
  return stage === "being-written"
    ? "One of its sections is being written right now, so it stays in your library. Try again once that section is finished."
    : "Your library didn’t confirm the delete. Try again in a moment.";
}

function deleteLabel(stage: DeleteStage): string {
  if (stage === "deleting") return "Deleting…";
  if (stage === "confirming") return "Delete manual";
  return "Try again";
}

/**
 * Below the row (or above it if it doesn't fit), right-aligned with it, with the text starting
 * on the Written column's line. The width is set first, so the height read after it is final.
 */
function placeUnderRow(anchor: HTMLDivElement, row: HTMLElement) {
  const rowBox = row.getBoundingClientRect();
  const writtenLeft = row.querySelector(".row-written")?.getBoundingClientRect().left ?? rowBox.left;
  const left = Math.min(writtenLeft - textInset(anchor), rowBox.right - MIN_WIDTH_PX);
  anchor.style.setProperty("--confirm-left", `${left}px`);
  anchor.style.setProperty("--confirm-width", `${rowBox.right - left}px`);

  const height = anchor.offsetHeight;
  const fitsBelow = rowBox.bottom + GAP_PX + height <= window.innerHeight - EDGE_PX;
  const top = fitsBelow ? rowBox.bottom + GAP_PX : rowBox.top - GAP_PX - height;
  anchor.style.setProperty("--confirm-top", `${top}px`);
}

function textInset(anchor: HTMLDivElement): number {
  const panel = anchor.firstElementChild;
  if (!panel) return 0;
  const style = getComputedStyle(panel);
  return parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
}
