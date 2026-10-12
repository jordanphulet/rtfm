import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { useAgent, type AgentAction, type AgentMessage, type UseAgentResult } from "../agent";
import { deleteManual, refreshLibrary, removeFromLibrary, useLibrary, type ManualSummary } from "../library";
import "../ui";
import type { AgentSideProps } from "./agentSide";
import { STARTER_PROMPT } from "./cuePrompts";
import { DeleteConfirmation, failureText, type DeleteStage } from "./DeleteConfirmation";
import { Ledger } from "./Ledger";
import { LibrarianPanel } from "./LibrarianPanel";
import { LibraryErrorBoundary } from "./LibraryErrorBoundary";
import { LibraryHead } from "./LibraryHead";
import { collapse, flash } from "./motion";
import { PhoneAgent } from "./PhoneAgent";
import { namedManuals, namedWhenSent } from "./references";
import { replyFailureWords } from "./replyFailure";
import { useFocusShortcut } from "./useFocusShortcut";
import { useMediaQuery } from "./useMediaQuery";
import "./tokens.css";
import "./page.css";

const WIDE = "(min-width: 1024px)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

export default function Home() {
  return (
    <LibraryErrorBoundary>
      <HomePage />
    </LibraryErrorBoundary>
  );
}

function HomePage() {
  const manuals = useLibrary();
  const agent = useAgent();
  const navigate = useNavigate();
  const wide = useMediaQuery(WIDE);
  const [loadedWithConversation] = useState(() => agent.messages.length > 0);
  const [hasBeenWide, setHasBeenWide] = useState(wide);
  if (wide && !hasBeenWide) setHasBeenWide(true);
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<ManualSummary | null>(null);
  const [deleteStage, setDeleteStage] = useState<DeleteStage>("confirming");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const focusAfterKeep = useRef<HTMLElement | null>(null);
  const proposedByLibrarian = useRef(false);

  useFocusShortcut(fieldRef);

  useEffect(() => {
    if (window.matchMedia(WIDE).matches && window.matchMedia(FINE_POINTER).matches) {
      fieldRef.current?.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (toDelete !== null) return;
    focusAfterKeep.current?.focus();
    focusAfterKeep.current = null;
  }, [toDelete]);

  const registerRow = useCallback((id: string, row: HTMLLIElement | null) => {
    if (row) rows.current.set(id, row);
    else rows.current.delete(id);
  }, []);

  const findRow = useCallback((id: string) => rows.current.get(id) ?? null, []);

  const lastSent = agent.messages.findLast((message) => message.role === "user");
  const namedIds = new Set(markedManuals(draft, lastSent, manuals).map((manual) => manual.id));

  const canSend = agent.status === "idle" && draft.trim() !== "";

  function sendDraft(): boolean {
    if (!canSend) return false;
    agent.send(draft);
    setDraft("");
    return true;
  }

  function focusField() {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    flash(field);
  }

  function loadPrompt(prompt: string) {
    flushSync(() => setDraft(prompt));
    focusField();
  }

  function startNewManual() {
    if (draft.trim() === "") loadPrompt(STARTER_PROMPT);
    else focusField();
  }

  function jumpToManual(id: string) {
    const row = findRow(id);
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: "instant" });
    row.querySelector<HTMLElement>(".row-title")?.focus({ preventScroll: true });
    flash(row);
  }

  function askToDelete(manual: ManualSummary, byLibrarian = false) {
    proposedByLibrarian.current = byLibrarian;
    setDeleteStage("confirming");
    setToDelete(manual);
  }

  /**
   * Carries out the librarian's action. A created manual is loaded into the library at once. Any
   * other action waits for no confirmation to be open. A proposed delete for a manual the page
   * doesn't list reloads the library once; if it still isn't there, nothing opens, and the
   * librarian's reply has already said what it did.
   */
  async function act(action: AgentAction, showLibrary?: () => Promise<void>) {
    if (action.type === "created") {
      void refreshLibrary();
      return;
    }
    if (toDelete) return;
    if (action.type === "open") {
      navigate(`/read/${encodeURIComponent(action.manualId)}`);
      return;
    }
    const listed = (list: ManualSummary[]) => list.find((each) => each.id === action.manualId);
    const manual = listed(manuals) ?? listed(await refreshLibrary());
    if (!manual) return;
    await showLibrary?.();
    findRow(manual.id)?.scrollIntoView({ block: "nearest", behavior: "instant" });
    askToDelete(manual, true);
  }

  function keep() {
    if (deleteStage === "deleting") return;
    if (toDelete) focusAfterKeep.current = proposedByLibrarian.current ? fieldRef.current : rowDelete(toDelete.id);
    setToDelete(null);
  }

  function rowDelete(id: string): HTMLElement | null {
    return findRow(id)?.querySelector(".row-delete") ?? null;
  }

  async function confirmDelete(manual: ManualSummary) {
    setDeleteStage("deleting");
    setDeleteNotice("");
    const result = await deleteManual(manual.id);
    if (result !== "deleted") {
      setDeleteStage(result);
      setDeleteNotice(`Couldn’t delete ${manual.title}. ${failureText(result)}`);
      return;
    }

    const index = manuals.findIndex((each) => each.id === manual.id);
    const neighbour = manuals[index + 1] ?? manuals[index - 1];
    const row = findRow(manual.id);
    setToDelete(null);
    if (row) await collapse(row);
    removeFromLibrary(manual.id);
    setDeleteNotice(`Deleted ${manual.title}.`);
    requestAnimationFrame(() => {
      if (proposedByLibrarian.current) return fieldRef.current?.focus();
      const next = neighbour && findRow(neighbour.id)?.querySelector<HTMLElement>(".row-title");
      (next ?? startRef.current)?.focus();
    });
  }

  function skipToLibrarian(event: MouseEvent) {
    event.preventDefault();
    fieldRef.current?.focus();
  }

  const side: AgentSideProps = {
    agent,
    manuals,
    composer: { draft, onDraftChange: setDraft, onSend: sendDraft, canSend, fieldRef },
    onJump: jumpToManual,
    onHover: setHoveredId,
    onCue: loadPrompt,
    onAction: act,
  };

  return (
    <div className="ui home">
      <p className="visually-hidden" aria-live="polite">
        {deleteNotice}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {agentNotice(agent)}
      </p>
      <div className="page" inert={toDelete !== null}>
        <a className="skip-link" href="#librarian-field" onClick={skipToLibrarian}>
          Skip to the librarian
        </a>
        <main className="library">
          <div className="library-inner">
            <LibraryHead manuals={manuals} onStartNewManual={startNewManual} startRef={startRef} />
            <Ledger
              manuals={manuals}
              namedIds={namedIds}
              hoveredId={hoveredId}
              liftedId={toDelete?.id ?? null}
              onDelete={askToDelete}
              registerRow={registerRow}
              onStartNewManual={startNewManual}
              onAskLibrarian={focusField}
            />
          </div>
        </main>
        {wide ? (
          <LibrarianPanel {...side} />
        ) : (
          <PhoneAgent {...side} openOnMount={loadedWithConversation && !hasBeenWide} />
        )}
      </div>
      <DeleteConfirmation
        manual={toDelete}
        stage={deleteStage}
        findRow={findRow}
        onKeep={keep}
        onDelete={confirmDelete}
      />
    </div>
  );
}

/** The manuals named by the draft, or else by the latest message sent. */
function markedManuals(
  draft: string,
  lastSent: AgentMessage | undefined,
  manuals: ManualSummary[],
): ManualSummary[] {
  if (draft.trim()) return namedManuals(draft, manuals);
  if (lastSent) return namedWhenSent(lastSent, manuals);
  return [];
}

function agentNotice({ messages, status, activity }: UseAgentResult): string {
  if (status === "thinking") return activity.replace(/…$/, "");
  if (status === "streaming") return "";
  const last = messages.at(-1);
  if (last?.role !== "agent") return "";
  const failure = last.failure ? replyFailureWords(last.failure) : null;
  return [last.text.replaceAll(/[*_`]/g, ""), failure?.title, failure?.text].filter(Boolean).join(" ");
}
