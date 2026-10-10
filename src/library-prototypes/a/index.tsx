import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useAgent, type AgentMessage, type AgentStatus } from "../../agent";
import { deleteManual, useLibrary, type LibraryManual } from "../../library";
import "../../ui";
import type { AgentSideProps } from "./agentSide";
import { STARTER_PROMPT } from "./cuePrompts";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { Ledger } from "./Ledger";
import { LibrarianPanel } from "./LibrarianPanel";
import { LibraryHead } from "./LibraryHead";
import { collapse, flash } from "./motion";
import { PhoneAgent } from "./PhoneAgent";
import { namedManuals } from "./references";
import { useFocusShortcut } from "./useFocusShortcut";
import { useMediaQuery } from "./useMediaQuery";
import "./tokens.css";
import "./page.css";

const WIDE = "(min-width: 1024px)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

export default function Library() {
  const manuals = useLibrary();
  const agent = useAgent();
  const wide = useMediaQuery(WIDE);
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<LibraryManual | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const focusAfterKeep = useRef<HTMLElement | null>(null);

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

  const lastSent = agent.messages.findLast((message) => message.role === "user")?.text ?? "";
  const namedIds = new Set(
    namedManuals(draft.trim() ? draft : lastSent, manuals).map((manual) => manual.id),
  );

  function sendDraft(): boolean {
    if (agent.status !== "idle" || draft.trim() === "") return false;
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

  function keep() {
    if (toDelete) focusAfterKeep.current = findRow(toDelete.id)?.querySelector(".row-delete") ?? null;
    setToDelete(null);
  }

  async function confirmDelete(manual: LibraryManual) {
    const index = manuals.findIndex((each) => each.id === manual.id);
    const neighbour = manuals[index + 1] ?? manuals[index - 1];
    const row = findRow(manual.id);
    setToDelete(null);
    if (row) await collapse(row);
    deleteManual(manual.id);
    setDeletedNotice(`Deleted ${manual.title}.`);
    requestAnimationFrame(() => {
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
    composer: { draft, onDraftChange: setDraft, onSend: sendDraft, fieldRef },
    onJump: jumpToManual,
    onHover: setHoveredId,
    onCue: loadPrompt,
  };

  return (
    <div className="ui library-a">
      <p className="visually-hidden" aria-live="polite">
        {deletedNotice}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {agentNotice(agent.messages, agent.status)}
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
              onDelete={setToDelete}
              registerRow={registerRow}
            />
          </div>
        </main>
        {wide ? <LibrarianPanel {...side} /> : <PhoneAgent {...side} />}
      </div>
      <DeleteConfirmation manual={toDelete} findRow={findRow} onKeep={keep} onDelete={confirmDelete} />
    </div>
  );
}

function agentNotice(messages: AgentMessage[], status: AgentStatus): string {
  if (status === "thinking") return "Thinking";
  if (status === "streaming") return "";
  const last = messages.at(-1);
  return last?.role === "agent" ? last.text.replaceAll(/[*_`]/g, "") : "";
}
