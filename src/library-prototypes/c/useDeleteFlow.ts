import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { deleteManual, type LibraryManual } from "../../library";
import { CONFIRMATION_ID } from "./DeleteConfirmation";
import { deleteButtonId, manualLinkId, manualRowId } from "./ManualRow";
import { START_NEW_EMPTY_ID } from "./LibraryPlate";
import { recordDeletion } from "./stageDirections";

const ROW_CLEARANCE = 24;

export interface DeleteFlow {
  confirming: LibraryManual | null;
  leavingId: string | null;
  announcement: string;
  request: (manual: LibraryManual) => void;
  keep: () => void;
  confirm: () => void;
}

export function useDeleteFlow(manuals: LibraryManual[], exchangeCount: number): DeleteFlow {
  const [confirming, setConfirming] = useState<LibraryManual | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const focusEmptyState = useRef(false);

  useLayoutEffect(() => {
    if (confirming) keepRowAboveConfirmation(confirming.id);
  }, [confirming]);

  useEffect(() => {
    if (!leavingId) return;
    const index = manuals.findIndex((manual) => manual.id === leavingId);
    const neighbour = manuals[index + 1] ?? manuals[index - 1];
    if (neighbour) document.getElementById(manualLinkId(neighbour.id))?.focus();

    collapseRow(leavingId).then(() => {
      focusEmptyState.current = !neighbour;
      deleteManual(leavingId);
      setLeavingId(null);
    });
  }, [leavingId]);

  useEffect(() => {
    if (manuals.length > 0 || !focusEmptyState.current) return;
    focusEmptyState.current = false;
    document.getElementById(START_NEW_EMPTY_ID)?.focus();
  }, [manuals.length]);

  function keep() {
    if (!confirming) return;
    const { id } = confirming;
    setConfirming(null);
    requestAnimationFrame(() => document.getElementById(deleteButtonId(id))?.focus());
  }

  function confirm() {
    if (!confirming) return;
    recordDeletion(confirming.title, exchangeCount);
    setAnnouncement(`Deleted ${confirming.title}`);
    setLeavingId(confirming.id);
    setConfirming(null);
  }

  return { confirming, leavingId, announcement, request: setConfirming, keep, confirm };
}

function keepRowAboveConfirmation(id: string) {
  const row = document.getElementById(manualRowId(id));
  const confirmation = document.getElementById(CONFIRMATION_ID);
  if (!row || !confirmation) return;
  const limit = window.innerHeight - confirmation.offsetHeight - ROW_CLEARANCE;
  const overlap = row.getBoundingClientRect().bottom - limit;
  if (overlap > 0) window.scrollBy({ top: overlap, behavior: "instant" });
}

async function collapseRow(id: string) {
  const row = document.getElementById(manualRowId(id));
  if (!row) return;
  const style = getComputedStyle(row);
  row.style.overflow = "hidden";
  const collapse = row.animate(
    [
      { height: `${row.offsetHeight}px`, opacity: 1 },
      { height: "0px", opacity: 0 },
    ],
    {
      duration: milliseconds(style.getPropertyValue("--dur-settle")),
      easing: style.getPropertyValue("--ease-in-out").trim() || "ease",
      fill: "forwards",
    },
  );
  await collapse.finished;
}

function milliseconds(cssTime: string): number {
  const value = parseFloat(cssTime);
  if (Number.isNaN(value)) return 0;
  return cssTime.trim().endsWith("ms") ? value : value * 1000;
}
