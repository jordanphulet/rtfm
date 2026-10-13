import { useLayoutEffect, useRef, useState } from "react";
import type { DeleteResult, ManualSummary } from "../library";
import { Sheet } from "../ui";
import { useMediaQuery } from "./useMediaQuery";
import "./DeleteConfirmation.css";

const GAP_PX = 8;
const EDGE_PX = 16;
const MIN_WIDTH_PX = 360;
const PHONE = "(max-width: 767px)";
const CONFIRM_HEIGHT = "--confirm-height";

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
  const phone = useMediaQuery(PHONE);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const row = manual && findRow(manual.id);
    if (!anchor || !row) return;
    if (phone) scrollRowAbove(anchor, row);
    else placeByRow(anchor, row);
    return () => {
      document.documentElement.style.removeProperty(CONFIRM_HEIGHT);
    };
  }, [manual, stage, findRow, phone]);

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
          {shown && (
            <h2 id="delete-title" className="confirm-title">
              {failed ? `Couldn’t delete “${shown.title}”` : `Delete “${shown.title}”?`}
            </h2>
          )}
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
 * Below the row, else above it, right-aligned with it, with the text starting on the Written
 * column's line. The width is set first, so the height read after it is final. In a window too
 * short for either, it sits 16px above the bottom edge and the page scrolls until the row ends 8px
 * above it, with `--confirm-height` giving the library room below its last row to scroll that far.
 */
function placeByRow(anchor: HTMLDivElement, row: HTMLElement) {
  const rowBox = row.getBoundingClientRect();
  const writtenLeft = row.querySelector(".row-written")?.getBoundingClientRect().left ?? rowBox.left;
  const left = Math.min(writtenLeft - textInset(anchor), rowBox.right - MIN_WIDTH_PX);
  anchor.style.setProperty("--confirm-left", `${left}px`);
  anchor.style.setProperty("--confirm-width", `${rowBox.right - left}px`);

  const height = anchor.offsetHeight;
  const below = rowBox.bottom + GAP_PX;
  const above = rowBox.top - GAP_PX - height;
  const lowest = window.innerHeight - EDGE_PX - height;
  if (below <= lowest) {
    anchor.style.setProperty("--confirm-top", `${below}px`);
  } else if (above >= EDGE_PX) {
    anchor.style.setProperty("--confirm-top", `${above}px`);
  } else {
    anchor.style.setProperty("--confirm-top", `${lowest}px`);
    document.documentElement.style.setProperty(CONFIRM_HEIGHT, `${height}px`);
    window.scrollBy({ top: below - lowest, behavior: "instant" });
  }
}

/**
 * On phone the confirmation is fixed to the bottom edge, so the page scrolls until the row ends
 * 8px above it. `--confirm-height`, on `<html>` while it is open, gives the library room below its
 * last row to scroll that far.
 */
function scrollRowAbove(anchor: HTMLDivElement, row: HTMLElement) {
  document.documentElement.style.setProperty(CONFIRM_HEIGHT, `${anchor.offsetHeight}px`);
  const overlap = row.getBoundingClientRect().bottom + GAP_PX - anchor.getBoundingClientRect().top;
  if (overlap > 0) window.scrollBy({ top: overlap, behavior: "instant" });
}

function textInset(anchor: HTMLDivElement): number {
  const panel = anchor.firstElementChild;
  if (!panel) return 0;
  const style = getComputedStyle(panel);
  return parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
}
