import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useNavigationType } from "react-router";
import { useLibrarian, type ConversationMessage, type LibrarianAction, type UseLibrarianResult } from "../librarian";
import { refreshLibrary, useLibrary, type ManualSummary } from "../library";
import "../ui";
import { STARTER_PROMPT } from "./cuePrompts";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { Ledger } from "./Ledger";
import { LibrarianPanel } from "./LibrarianPanel";
import type { LibrarianSideProps } from "./librarianSide";
import { LibraryErrorBoundary } from "./LibraryErrorBoundary";
import { LibraryHead } from "./LibraryHead";
import { flash } from "./motion";
import { PhoneLibrarian } from "./PhoneLibrarian";
import { namedManuals, namedWhenSent } from "./references";
import { replyFailureWords } from "./replyFailure";
import { useDeleteFlow } from "./useDeleteFlow";
import { useFocusShortcut } from "./useFocusShortcut";
import { useMediaQuery } from "./useMediaQuery";
import "./tokens.css";
import "./page.css";

const WIDE = "(min-width: 1024px)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** Set by the first mount, so the conversation sheet opens on load once per page load. */
let homeHasMounted = false;

export default function Home() {
  return (
    <LibraryErrorBoundary>
      <HomePage />
    </LibraryErrorBoundary>
  );
}

function HomePage() {
  const manuals = useLibrary();
  const librarian = useLibrarian();
  const navigate = useNavigate();
  const arrivedBy = useNavigationType();
  const wide = useMediaQuery(WIDE);
  const [sheetOpensOnLoad, setSheetOpensOnLoad] = useState(() => !homeHasMounted && !wide && librarian.messages.length > 0);
  if (wide && sheetOpensOnLoad) setSheetOpensOnLoad(false);
  const [draft, setDraft] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const registerRow = useCallback((id: string, row: HTMLLIElement | null) => {
    if (row) rows.current.set(id, row);
    else rows.current.delete(id);
  }, []);

  const findRow = useCallback((id: string) => rows.current.get(id) ?? null, []);

  const deletion = useDeleteFlow({
    manuals,
    findRow,
    fieldRef,
    startRef,
    reportDeleteOutcome: librarian.reportDeleteOutcome,
  });

  useFocusShortcut(fieldRef);

  useLayoutEffect(() => {
    if (arrivedBy === "PUSH") window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    homeHasMounted = true;
  }, []);

  useEffect(() => {
    if (window.matchMedia(WIDE).matches && window.matchMedia(FINE_POINTER).matches) {
      fieldRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const lastSent = librarian.messages.findLast((message) => message.role === "user");
  const namedIds = new Set(markedManuals(draft, lastSent, manuals).map((manual) => manual.id));

  const canSend = librarian.status === "idle" && draft.trim() !== "";

  function sendDraft(): boolean {
    if (!canSend) return false;
    librarian.send(draft);
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

  /**
   * Carries out the librarian's action. A created manual is loaded into the library at once. Any
   * other action waits for no confirmation to be open. A proposed delete for a manual the page
   * doesn't list reloads the library once; if it still isn't there, nothing opens, and the
   * librarian's reply has already said what it did.
   */
  async function act(action: LibrarianAction, showLibrary?: () => Promise<void>) {
    if (action.type === "created") {
      void refreshLibrary();
      return;
    }
    if (deletion.toDelete) return;
    if (action.type === "open") {
      navigate(`/read/${encodeURIComponent(action.manualId)}`);
      return;
    }
    const listed = (list: ManualSummary[]) => list.find((each) => each.id === action.manualId);
    const manual = listed(manuals) ?? listed(await refreshLibrary());
    if (!manual) return;
    await showLibrary?.();
    findRow(manual.id)?.scrollIntoView({ block: "nearest", behavior: "instant" });
    deletion.askToDelete(manual, true);
  }

  function skipToLibrarian(event: MouseEvent) {
    event.preventDefault();
    fieldRef.current?.focus();
  }

  const side: LibrarianSideProps = {
    librarian,
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
        {deletion.notice}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {librarianNotice(librarian)}
      </p>
      <div className="page" inert={deletion.toDelete !== null}>
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
              liftedId={deletion.toDelete?.id ?? null}
              onDelete={deletion.askToDelete}
              registerRow={registerRow}
              onStartNewManual={startNewManual}
              onAskLibrarian={focusField}
            />
          </div>
        </main>
        {wide ? (
          <LibrarianPanel {...side} />
        ) : (
          <PhoneLibrarian {...side} openOnMount={sheetOpensOnLoad} />
        )}
      </div>
      <DeleteConfirmation
        manual={deletion.toDelete}
        stage={deletion.stage}
        findRow={findRow}
        onKeep={deletion.keep}
        onDelete={deletion.confirm}
      />
    </div>
  );
}

/** The manuals named by the draft, or else by the latest message sent. */
function markedManuals(
  draft: string,
  lastSent: ConversationMessage | undefined,
  manuals: ManualSummary[],
): ManualSummary[] {
  if (draft.trim()) return namedManuals(draft, manuals);
  if (lastSent) return namedWhenSent(lastSent, manuals);
  return [];
}

function librarianNotice({ messages, status, activity }: UseLibrarianResult): string {
  if (status === "thinking") return activity.replace(/…$/, "");
  if (status === "streaming") return "";
  const last = messages.at(-1);
  if (last?.role !== "agent") return "";
  const failure = last.failure ? replyFailureWords(last.failure) : null;
  return [last.text.replaceAll(/[*_`]/g, ""), failure?.title, failure?.text].filter(Boolean).join(" ");
}
