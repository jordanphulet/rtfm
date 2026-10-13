import { useLayoutEffect, useRef, useState } from "react";
import { useLibrarianActions } from "../librarian";
import { Sheet } from "../ui";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { LibrarianHead, Separator, StatusDetail } from "./LibrarianHead";
import type { LibrarianSideProps } from "./librarianSide";
import { manualCount } from "./manualCount";
import { NewestButton } from "./NewestButton";
import { useStickToBottom } from "./useStickToBottom";
import "./PhoneLibrarian.css";

type OpenedBy = "load" | "send" | "toggle";

interface PhoneLibrarianProps extends LibrarianSideProps {
  openOnMount: boolean;
}

export function PhoneLibrarian({ librarian, manuals, composer, onJump, onHover, onCue, onAction, openOnMount }: PhoneLibrarianProps) {
  const stick = useStickToBottom();
  const scopeRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(openOnMount);
  const openedBy = useRef<OpenedBy>("load");
  const libraryScroll = useRef<number | null>(null);
  const busy = librarian.status !== "idle";
  useLibrarianActions((action) => onAction(action, closeForConfirmation));

  useLayoutEffect(() => {
    if (open || libraryScroll.current === null) return;
    window.scrollTo(0, libraryScroll.current);
    libraryScroll.current = null;
  }, [open]);

  function openBy(reason: OpenedBy) {
    openedBy.current = reason;
    libraryScroll.current = window.scrollY;
    setOpen(true);
  }

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function send() {
    if (!composer.onSend()) return;
    stick.scrollToBottom();
    if (!open) openBy("send");
  }

  function jump(id: string) {
    setOpen(false);
    requestAnimationFrame(() => onJump(id));
  }

  /** A proposed delete's confirmation opens over the library, so the sheet closes first. */
  function closeForConfirmation(): Promise<void> {
    setOpen(false);
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function focusOnOpen(): HTMLElement | null {
    if (openedBy.current === "send") return composer.fieldRef.current;
    if (openedBy.current === "toggle") return stick.scrollRef.current;
    return focusWhereItIs();
  }

  return (
    <div className="phone-librarian" ref={scopeRef}>
      <Sheet
        id="conversation-sheet"
        className="conversation-sheet"
        role="region"
        aria-labelledby="librarian-title"
        open={open}
        onClose={close}
        focusScope={scopeRef}
        focusOnOpen={focusOnOpen}
      >
        <LibrarianHead
          messageCount={librarian.messages.length}
          status={librarian.status}
          activity={librarian.activity}
          edge={stick.scrolledFromTop}
        />
        <Conversation
          messages={librarian.messages}
          status={librarian.status}
          activity={librarian.activity}
          manuals={manuals}
          stick={stick}
          onJump={jump}
          onHover={onHover}
          onCue={onCue}
        />
        {stick.scrolledUp && (
          <NewestButton replying={busy} onJump={stick.scrollToBottom} className="sheet-newest" />
        )}
      </Sheet>
      <div className="dock">
        <button
          ref={toggleRef}
          type="button"
          className="dock-toggle"
          aria-expanded={open}
          aria-controls="conversation-sheet"
          onClick={() => (open ? close() : openBy("toggle"))}
        >
          {open ? (
            <span className="dock-label" aria-hidden="true">
              <span className="dock-name">Library</span>
              <Separator />
              {manualCount(manuals.length)}
            </span>
          ) : (
            <span className="dock-label">
              <span className="dock-name">Librarian</span>
              <StatusDetail messageCount={librarian.messages.length} status={librarian.status} activity={librarian.activity} />
            </span>
          )}
          <span className="dock-action">{open ? "Hide ↓" : "Show ↑"}</span>
        </button>
        <Composer layout="dock" {...composer} onSend={send} busy={busy} />
      </div>
    </div>
  );
}

/** The automatic open at load moves nothing: focus stays where the page left it. */
function focusWhereItIs(): HTMLElement {
  return document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
}
