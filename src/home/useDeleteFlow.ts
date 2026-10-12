import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { DeleteOutcome } from "../agent";
import { deleteManual, removeFromLibrary, type ManualSummary } from "../library";
import { failureText, type DeleteStage } from "./DeleteConfirmation";
import { deleteOutcomeForLibrarian } from "./deleteOutcome";
import { collapse } from "./motion";

interface DeleteFlowOptions {
  manuals: ManualSummary[];
  findRow: (id: string) => HTMLElement | null;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  startRef: RefObject<HTMLButtonElement | null>;
  reportDeleteOutcome: (outcome: DeleteOutcome) => void;
}

export interface DeleteFlow {
  toDelete: ManualSummary | null;
  stage: DeleteStage;
  /** What the polite live region says about the latest delete. */
  notice: string;
  askToDelete: (manual: ManualSummary, byLibrarian?: boolean) => void;
  keep: () => void;
  confirm: (manual: ManualSummary) => Promise<void>;
}

/**
 * The delete confirmation's steps: the manual it asks about, how far the delete has got, the
 * notice, telling the librarian how a delete it proposed ended, and where focus goes afterwards
 * (the field for a delete the librarian proposed, else the row's Delete after a keep, or the
 * next row after a delete).
 */
export function useDeleteFlow({ manuals, findRow, fieldRef, startRef, reportDeleteOutcome }: DeleteFlowOptions): DeleteFlow {
  const [toDelete, setToDelete] = useState<ManualSummary | null>(null);
  const [stage, setStage] = useState<DeleteStage>("confirming");
  const [notice, setNotice] = useState("");
  const proposedByLibrarian = useRef(false);
  const focusAfterKeep = useRef<HTMLElement | null>(null);
  const currentManuals = useRef(manuals);

  useLayoutEffect(() => {
    currentManuals.current = manuals;
  });

  useEffect(() => {
    if (toDelete !== null) return;
    focusAfterKeep.current?.focus();
    focusAfterKeep.current = null;
  }, [toDelete]);

  function askToDelete(manual: ManualSummary, byLibrarian = false) {
    proposedByLibrarian.current = byLibrarian;
    setStage("confirming");
    setToDelete(manual);
  }

  function keep() {
    if (stage === "deleting" || !toDelete) return;
    tellLibrarian("keep");
    focusAfterKeep.current = proposedByLibrarian.current ? fieldRef.current : rowDelete(toDelete.id);
    setToDelete(null);
  }

  function tellLibrarian(closedBy: "keep" | "delete") {
    const outcome = deleteOutcomeForLibrarian(closedBy, stage, proposedByLibrarian.current);
    if (outcome) reportDeleteOutcome(outcome);
  }

  function rowDelete(id: string): HTMLElement | null {
    return findRow(id)?.querySelector(".row-delete") ?? null;
  }

  async function confirm(manual: ManualSummary) {
    const position = currentManuals.current.findIndex((each) => each.id === manual.id);
    setStage("deleting");
    setNotice("");
    const result = await deleteManual(manual.id);
    if (result !== "deleted") {
      setStage(result);
      setNotice(`Couldn’t delete ${manual.title}. ${failureText(result)}`);
      return;
    }

    tellLibrarian("delete");
    const row = findRow(manual.id);
    setToDelete(null);
    if (row) await collapse(row);
    const neighbour = neighbourOf(manual.id, position, currentManuals.current);
    removeFromLibrary(manual.id);
    setNotice(`Deleted ${manual.title}.`);
    requestAnimationFrame(() => {
      if (proposedByLibrarian.current) return fieldRef.current?.focus();
      const next = neighbour && findRow(neighbour.id)?.querySelector<HTMLElement>(".row-title");
      (next ?? startRef.current)?.focus();
    });
  }

  return { toDelete, stage, notice, askToDelete, keep, confirm };
}

/**
 * The manual after this one in the list, else the one before it. If the list no longer has it (a
 * refresh already left it out), the manual now at its old position, else the one just before it.
 */
function neighbourOf(id: string, position: number, manuals: ManualSummary[]): ManualSummary | undefined {
  const index = manuals.findIndex((each) => each.id === id);
  if (index === -1) return manuals[position] ?? manuals[position - 1];
  return manuals[index + 1] ?? manuals[index - 1];
}
